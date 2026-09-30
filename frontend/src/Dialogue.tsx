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

const SR: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

type Props = { turns: Turn[]; onChange: (t: Turn[]) => void };

export default function Dialogue({ turns, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker>("doctor");
  const [lang, setLang] = useState("ru-RU");
  const [interim, setInterim] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");

  const recRef = useRef<any>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  const speakerRef = useRef<Speaker>("doctor");
  const turnsRef = useRef<Turn[]>(turns);
  turnsRef.current = turns;
  speakerRef.current = speaker;

  const append = (text: string) => {
    const cur = turnsRef.current;
    const last = cur[cur.length - 1];
    const next =
      last && last.speaker === speakerRef.current
        ? [...cur.slice(0, -1), { ...last, text: `${last.text} ${text}`.trim() }]
        : [...cur, { speaker: speakerRef.current, text }];
    turnsRef.current = next;
    onChange(next);
  };

  const start = async () => {
    setError("");
    if (!SR) {
      setError("Распознавание речи не поддерживается этим браузером. Откройте в Chrome или Edge либо введите реплики вручную.");
      return;
    }
    try {
      // параллельно пишем аудио, чтобы можно было переслушать консультацию
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => {
        setAudioUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: mr.mimeType })));
      };
      mr.start();
      mediaRef.current = mr;
    } catch {
      setError("Нет доступа к микрофону. Разрешите его в браузере или введите реплики вручную.");
      return;
    }

    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) append(r[0].transcript.trim());
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(`Ошибка распознавания: ${e.error}`);
    };
    // Chrome сам останавливает распознавание после паузы — перезапускаем, пока идёт запись
    rec.onend = () => {
      setInterim("");
      if (activeRef.current) {
        try { rec.start(); } catch { /* уже запущено */ }
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
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setInterim("");
  };

  useEffect(() => () => stop(), []);

  const update = (i: number, text: string) => onChange(turns.map((t, j) => (j === i ? { ...t, text } : t)));
  const remove = (i: number) => onChange(turns.filter((_, j) => j !== i));
  const add = (s: Speaker) => onChange([...turns, { speaker: s, text: "" }]);

  const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer" };
  const spk = (s: Speaker): React.CSSProperties => ({
    ...btn,
    fontWeight: speaker === s ? 700 : 400,
    background: speaker === s ? (s === "doctor" ? "#dbeafe" : "#dcfce7") : "#f3f4f6",
    border: speaker === s ? "2px solid #333" : "1px solid #ccc",
  });

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Запись консультации (диалог врач — пациент)</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
        {!recording ? (
          <button type="button" onClick={start} style={{ ...btn, background: "#fee2e2" }}>🎙 Начать запись</button>
        ) : (
          <button type="button" onClick={stop} style={{ ...btn, background: "#dc2626", color: "#fff" }}>⏹ Остановить запись</button>
        )}
        <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={recording}>
          <option value="ru-RU">Русский</option>
          <option value="kk-KZ">Қазақша</option>
        </select>
        <span>Говорит:</span>
        <button type="button" style={spk("doctor")} onClick={() => setSpeaker("doctor")}>🩺 Врач</button>
        <button type="button" style={spk("patient")} onClick={() => setSpeaker("patient")}>🧑 Пациент</button>
        {recording && <span style={{ color: "#dc2626" }}>● идёт запись</span>}
      </div>
      {error && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>}

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10, background: "#fafafa", minHeight: 60 }}>
        {turns.length === 0 && !interim && (
          <div style={{ color: "#888" }}>
            Реплик пока нет. Нажмите «Начать запись» и переключайте «Врач / Пациент» при смене говорящего, добавьте
            реплики вручную или загрузите пример.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: t.speaker === "doctor" ? "flex-start" : "flex-end", marginBottom: 8 }}>
            <div
              style={{
                maxWidth: "85%",
                width: "85%",
                background: t.speaker === "doctor" ? "#dbeafe" : "#dcfce7",
                borderRadius: 10,
                padding: "6px 10px",
              }}
            >
              <div style={{ fontSize: 12, color: "#555", display: "flex", justifyContent: "space-between" }}>
                <b>{t.speaker === "doctor" ? "🩺 Врач" : "🧑 Пациент"}</b>
                <button type="button" onClick={() => remove(i)} style={{ border: 0, background: "none", cursor: "pointer" }} title="Удалить реплику">✕</button>
              </div>
              <textarea
                value={t.text}
                rows={Math.max(1, Math.ceil(t.text.length / 70))}
                onChange={(e) => update(i, e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", border: 0, background: "transparent", font: "inherit", resize: "vertical" }}
              />
            </div>
          </div>
        ))}
        {interim && (
          <div style={{ color: "#888", fontStyle: "italic", textAlign: speaker === "doctor" ? "left" : "right" }}>{interim}…</div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" }}>
        <button type="button" style={btn} onClick={() => add("doctor")}>+ реплика врача</button>
        <button type="button" style={btn} onClick={() => add("patient")}>+ реплика пациента</button>
        <button type="button" style={btn} onClick={() => onChange(SAMPLE)} disabled={recording}>Загрузить пример диалога</button>
        <button type="button" style={btn} onClick={() => { onChange([]); setAudioUrl(""); }} disabled={recording}>Очистить</button>
      </div>

      {audioUrl && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, color: "#555" }}>Аудиозапись консультации:</div>
          <audio controls src={audioUrl} style={{ width: "100%" }} />
        </div>
      )}
    </div>
  );
}
