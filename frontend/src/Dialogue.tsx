import { useEffect, useRef, useState } from "react";

export type Speaker = "doctor" | "patient";
export type Turn = { speaker: Speaker; text: string };

const LABEL: Record<Speaker, string> = { doctor: "Врач", patient: "Пациент" };

export const turnsToText = (turns: Turn[]) =>
  turns
    .filter((t) => t.text.trim())
    .map((t) => `${LABEL[t.speaker]}: ${t.text.trim()}`)
    .join("\n");

// Синтетический демо-диалог (вымышленный пациент)
const SAMPLE: Turn[] = [
  { speaker: "doctor", text: "Добрый день. Что вас беспокоит?" },
  { speaker: "patient", text: "Последние полгода вижу хуже, всё как в тумане, особенно вечером и за рулём. Левый глаз хуже. Боли нет, покраснения нет." },
  { speaker: "doctor", text: "Аллергии есть? Что-то принимаете?" },
  { speaker: "patient", text: "Аллергии нет. Давление повышенное, пью таблетки. Раньше глаза не лечил." },
  { speaker: "doctor", text: "Острота зрения справа 0,4, слева 0,2. Внутриглазное давление справа 16, слева 17. Хрусталик мутный с обеих сторон, больше слева." },
];

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const SR: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

type Props = {
  turns: Turn[];
  onChange: (t: Turn[]) => void;
  /** диалог готов (роли определены) — можно собирать анамнез */
  onReady: (t: Turn[]) => void;
  backendUrl: string;
};

export default function Dialogue({ turns, onChange, onReady, backendUrl }: Props) {
  const [recording, setRecording] = useState(false);
  const [labeling, setLabeling] = useState(false);
  const [lang, setLang] = useState("ru-RU");
  const [live, setLive] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const recRef = useRef<any>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  const segmentsRef = useRef<string[]>([]);
  const finishedRef = useRef(true);

  // Роли определяет ИИ по смыслу разговора (браузер говорящих не различает)
  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (!segmentsRef.current.length) {
      setError("Речь не распознана. Проверьте микрофон (кнопка «Проверить микрофон») или вставьте текст разговора ниже.");
      return;
    }
    label(segmentsRef.current);
  };

  const label = async (segments: string[]) => {
    setLabeling(true);
    try {
      const res = await fetch(`${backendUrl}/api/dialogue/diarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "ошибка");
      onChange(body.turns);
      onReady(body.turns);
    } catch (e: any) {
      // запасной вариант: реплики по очереди, врач может поправить роль кнопкой ⇄
      const fallback: Turn[] = segments.map((text, i) => ({ speaker: i % 2 ? "patient" : "doctor", text }));
      onChange(fallback);
      setError(`Роли не удалось определить автоматически (${e.message}). Проверьте роли кнопкой ⇄.`);
    } finally {
      setLabeling(false);
    }
  };

  const start = async () => {
    setError("");
    if (!SR) {
      setError("Распознавание речи не поддерживается этим браузером. Откройте в Chrome или Edge либо загрузите пример.");
      return;
    }
    stopMeter(); // проверка микрофона не должна удерживать устройство
    onChange([]);
    setAudioUrl("");
    segmentsRef.current = [];
    setLive([]);
    finishedRef.current = false;

    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) {
            segmentsRef.current.push(text);
            setLive([...segmentsRef.current]);
          }
        } else partial += r[0].transcript;
      }
      setInterim(partial);
    };
    rec.onerror = (e: any) => {
      const hints: Record<string, string> = {
        "not-allowed": "Доступ к микрофону запрещён: нажмите на замок рядом с адресом → Микрофон → Разрешить.",
        "service-not-allowed": "Доступ к микрофону запрещён: нажмите на замок рядом с адресом → Микрофон → Разрешить.",
        "audio-capture": "Микрофон не найден или занят другой программой. Закройте Zoom/Teams и проверьте микрофон в Windows.",
        network: "Нет связи с сервисом распознавания речи (нужен интернет).",
      };
      if (e.error !== "no-speech" && e.error !== "aborted") setError(hints[e.error] ?? `Ошибка распознавания: ${e.error}`);
    };
    rec.onend = () => {
      setInterim("");
      if (activeRef.current) {
        // Chrome сам останавливает распознавание после паузы — продолжаем, пока идёт запись
        try { rec.start(); } catch { /* уже запущено */ }
      } else {
        finish();
      }
    };
    recRef.current = rec;
    activeRef.current = true;
    rec.start();
    setRecording(true);
  };

  const stop = () => {
    activeRef.current = false;
    recRef.current?.stop();
    setRecording(false);
  };

  // ---------- проверка микрофона: индикатор уровня (отдельно от записи) ----------
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const meterRef = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);

  const stopMeter = () => {
    const m = meterRef.current;
    if (m) {
      cancelAnimationFrame(m.raf);
      m.stream.getTracks().forEach((t) => t.stop());
      m.ctx.close().catch(() => {});
    }
    meterRef.current = null;
    setTesting(false);
    setLevel(0);
  };

  const toggleMeter = async () => {
    if (testing) return stopMeter();
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const state = { stream, ctx, raf: 0 };
      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
        state.raf = requestAnimationFrame(loop);
      };
      loop();
      meterRef.current = state;
      setTesting(true);
    } catch {
      setError("Нет доступа к микрофону. Разрешите его в браузере (замок рядом с адресом) и проверьте микрофон в Windows.");
    }
  };

  useEffect(() => () => {
    activeRef.current = false;
    recRef.current?.abort?.();
    stopMeter();
  }, []);

  // ---------- запасной вариант: вставить или надиктовать текст (Win+H) ----------
  const [pasted, setPasted] = useState("");
  const submitText = () => {
    // абзацы/строки/предложения -> сегменты; роли расставит ИИ
    const segments = pasted.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return;
    setError("");
    label(segments);
  };

  const update = (i: number, text: string) => onChange(turns.map((t, j) => (j === i ? { ...t, text } : t)));
  const swap = (i: number) =>
    onChange(turns.map((t, j) => (j === i ? { ...t, speaker: t.speaker === "doctor" ? "patient" : "doctor" } : t)));
  const remove = (i: number) => onChange(turns.filter((_, j) => j !== i));
  const busy = recording || labeling;

  return (
    <div>
      <div className={`recorder${recording ? " recording" : ""}`}>
        <div className="waveform">
          {Array.from({ length: 28 }, (_, i) => <i key={i} />)}
        </div>
        <div className="record-time">{fmt(seconds)}</div>
        <p>
          {recording
            ? "Идёт запись. Говорите как обычно — роли врач/пациент определятся автоматически после остановки."
            : "Нажмите «Начать запись»: ИИ расставит роли, соберёт анамнез и подготовит документ."}
        </p>
        <div className="row">
          {!recording ? (
            <button type="button" className="btn btn-rec btn-lg" onClick={start} disabled={labeling}>🎙 Начать запись</button>
          ) : (
            <button type="button" className="btn btn-stop btn-lg" onClick={stop}>⏹ Остановить и обработать</button>
          )}
          <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy}>
            <option value="ru-RU">Русский</option>
            <option value="kk-KZ">Қазақша</option>
          </select>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => { setError(""); setAudioUrl(""); onChange(SAMPLE); onReady(SAMPLE); }}
            disabled={busy}
          >
            Загрузить пример
          </button>
          {turns.length > 0 && !busy && (
            <button type="button" className="btn" onClick={() => { onChange([]); setAudioUrl(""); setError(""); }}>Очистить</button>
          )}
        </div>
        {!recording && (
          <div className="row" style={{ marginTop: 10, width: "100%", maxWidth: 460 }}>
            <button type="button" className="btn" onClick={toggleMeter} disabled={labeling}>
              {testing ? "Выключить проверку" : "🎚 Проверить микрофон"}
            </button>
            <div className="meter" style={{ flex: 1, minWidth: 120 }}>
              <div className={`meter-bar${level > 0.85 ? " hot" : ""}`} style={{ width: `${level * 100}%` }} />
            </div>
          </div>
        )}
      </div>
      {labeling && <div className="busy"><span className="spinner" /> ИИ определяет, кто говорит — врач или пациент…</div>}
      {error && <div className="err">{error}</div>}

      {!recording && (
        <details className="paste-box" open={Boolean(error)}>
          <summary>Не слышит микрофон? Вставьте или надиктуйте текст разговора (Win+H)</summary>
          <textarea
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Например: Что вас беспокоит? Последние полгода вижу хуже, особенно вечером… (можно продиктовать голосом Windows: клавиши Win+H). Роли врач/пациент расставит ИИ."
          />
          <button type="button" className="btn btn-primary" style={{ marginTop: 6 }} onClick={submitText} disabled={labeling || !pasted.trim()}>
            Определить роли и собрать анамнез
          </button>
        </details>
      )}

      <div className="chat">
        {recording ? (
          <>
            {live.map((s, i) => (
              <div key={i} className="turn raw"><div className="bubble">{s}</div></div>
            ))}
            {interim && <div className="live">{interim}…</div>}
            {!live.length && !interim && <div className="chat-empty">Слушаю…</div>}
          </>
        ) : turns.length === 0 ? (
          <div className="chat-empty">
            Здесь появится диалог врача и пациента. Нажмите «Начать запись» — роли расставятся автоматически.
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} className={`turn ${t.speaker}`}>
              <div className="bubble">
                <div className="bubble-head">
                  <span>{t.speaker === "doctor" ? "🩺 Врач" : "🧑 Пациент"}</span>
                  <span>
                    <button type="button" title="Поменять роль" onClick={() => swap(i)}>⇄</button>
                    <button type="button" title="Удалить реплику" onClick={() => remove(i)}>✕</button>
                  </span>
                </div>
                <textarea
                  value={t.text}
                  rows={Math.max(1, Math.ceil(t.text.length / 62))}
                  onChange={(e) => update(i, e.target.value)}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {audioUrl && (
        <div>
          <div className="muted">Аудиозапись консультации</div>
          <audio controls src={audioUrl} style={{ width: "100%" }} />
        </div>
      )}
    </div>
  );
}
