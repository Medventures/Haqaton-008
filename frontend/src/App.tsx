import { useEffect, useState } from "react";
import Dialogue, { Turn, turnsToText } from "./Dialogue";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";
const MIS_URL = import.meta.env.VITE_MIS_URL ?? "http://localhost:8001";

type Field = {
  name: string;
  label: string;
  type: "text" | "textarea" | "checkbox";
  ai_suggestion?: boolean;
};
type TemplateInfo = { id: string; specialty: string; title: string };
type Template = TemplateInfo & { fields: Field[] };
type Doctor = { name: string; specialty: string; template_id: string };
type Values = Record<string, string | boolean>;
type Reference = { protocol_id: string; title: string; number: string; page: number };
type RedFlag = { id: string; severity: "critical" | "urgent"; message: string };
type Appointment = {
  id: string;
  time: string;
  reason: string;
  patient: { id: string; name: string; birth_year: number; sex: string };
};
type MisRecord = {
  id: string;
  received_at: string;
  dialogue: Turn[];
  document: { title: string; sections: { label: string; value: string }[] };
};

export default function App() {
  const [backend, setBackend] = useState<"..." | "ok" | "down">("...");
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [values, setValues] = useState<Values>({});
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentId, setAppointmentId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);

  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  const [references, setReferences] = useState<Reference[]>([]);
  const [redFlags, setRedFlags] = useState<RedFlag[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [flagsAck, setFlagsAck] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<MisRecord | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((r) => r.json())
      .then(() => setBackend("ok"))
      .catch(() => setBackend("down"));
    fetch(`${BACKEND_URL}/api/appointments`)
      .then((r) => r.json())
      .then(setAppointments)
      .catch(() => setAppointments([]));
    Promise.all([
      fetch(`${BACKEND_URL}/api/doctor/profile`).then((r) => r.json()),
      fetch(`${BACKEND_URL}/api/templates`).then((r) => r.json()),
    ])
      .then(([d, t]) => {
        setDoctor(d);
        setTemplates(t);
        setTemplateId(d.template_id); // специальность из профиля врача
      })
      .catch(() => setBackend("down"));
  }, []);

  useEffect(() => {
    if (!templateId) return;
    fetch(`${BACKEND_URL}/api/templates/${templateId}`)
      .then((r) => r.json())
      .then(setTemplate);
    setReferences([]);
    setRedFlags([]);
    setMissing([]);
    setFlagsAck(false);
    setSent(null);
  }, [templateId]);

  // Врач начал приём — в МИС создаётся пустая карточка консультации
  useEffect(() => {
    if (!appointmentId || !templateId) return;
    setSent(null);
    fetch(`${BACKEND_URL}/api/consultations/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId, appointment_id: appointmentId }),
    }).catch(() => {});
  }, [appointmentId, templateId]);

  const set = (name: string, v: string | boolean) => setValues((prev) => ({ ...prev, [name]: v }));
  const appointment = appointments.find((a) => a.id === appointmentId);
  // пока врач не ознакомился с красными флагами, подтвердить форму нельзя
  const needsAck = redFlags.length > 0 && !flagsAck;
  const approved = values.doctor_approved === true && !needsAck;

  // Собирает анамнез и заполняет форму по диалогу
  const draft = async (source: Turn[] = turns) => {
    const transcript = turnsToText(source);
    if (!template || !transcript) return;
    setDrafting(true);
    setDraftMsg("");
    setSent(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/consultations/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: template.id, transcript, appointment_id: appointmentId || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setDraftMsg(`Ошибка: ${body.detail}`);
        return;
      }
      setValues((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(body.fields as Record<string, string>)) {
          if (v.trim()) next[k] = v;
        }
        next.doctor_approved = false; // после ИИ врач должен проверить форму заново
        return next;
      });
      setReferences(body.references ?? []);
      setRedFlags(body.red_flags ?? []);
      setMissing(body.missing_information ?? []);
      setFlagsAck(false);
      setDraftMsg("Анамнез собран и документ сформирован. Проверьте и при необходимости отредактируйте.");
    } catch {
      setDraftMsg("Ошибка: backend недоступен");
    } finally {
      setDrafting(false);
    }
  };

  const submit = async () => {
    if (!template || !approved) return;
    setSending(true);
    setError("");
    const data: Values = {};
    template.fields.forEach((f) => (data[f.name] = values[f.name] ?? (f.type === "checkbox" ? false : "")));
    try {
      const res = await fetch(`${BACKEND_URL}/api/consultations/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: template.id,
          appointment_id: appointmentId || null,
          transcript: turnsToText(turns),
          turns,
          data,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(`Ошибка: ${body.detail}`);
        return;
      }
      // показываем, что именно получила МИС
      const rec = await fetch(`${BACKEND_URL}/api/mis/consultations/${body.id}`).then((r) => r.json());
      setSent(rec);
    } catch {
      setError("Ошибка: backend недоступен");
    } finally {
      setSending(false);
    }
  };

  const docFields = template?.fields.filter((f) => f.type !== "checkbox") ?? [];

  // текущий этап для полосы прогресса
  const drafted = missing.length > 0 || references.length > 0 || Boolean(values.complaints);
  const stage = sent ? 4 : drafted ? 2 : turns.length ? 1 : 0;

  // Сохранение документа в файл: HTML с расширением .doc открывается в Word
  const saveDocument = () => {
    if (!template) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const patient = appointment ? `${appointment.patient.name}, ${appointment.patient.birth_year} г.р.` : "не выбран";
    const sections = docFields
      .map((f) => {
        const v = ((values[f.name] as string) ?? "").trim();
        return `<p><b>${esc(f.label)}</b><br>${v ? esc(v).replace(/\n/g, "<br>") : "<i>не указано</i>"}</p>`;
      })
      .join("");
    const dialogue = turns
      .map((t) => `<p><b>${t.speaker === "doctor" ? "Врач" : "Пациент"}:</b> ${esc(t.text)}</p>`)
      .join("");
    const html =
      `<html><head><meta charset="utf-8"><title>Лист консультации</title></head><body style="font-family:Calibri,Arial,sans-serif">` +
      `<h2>Лист консультации — ${esc(template.title)}</h2>` +
      `<p>Пациент: ${esc(patient)}<br>Врач: ${esc(doctor?.name ?? "")}<br>Дата: ${new Date().toLocaleDateString("ru-RU")}</p><hr>` +
      sections +
      (dialogue ? `<hr><h3>Запись диалога</h3>${dialogue}` : "") +
      `<hr><p><small>Данные вымышленные. Поля, помеченные как предложение ИИ, вступают в силу после подтверждения врачом.</small></p></body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
    a.download = `konsultatsiya_${appointmentId || "bez_priema"}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <img src="/aibolit-mark-128.png" alt="AiBolit" width={46} height={46} />
          <div>
            <strong>AiBolit Consult</strong>
            <span>AI-ассистент врача</span>
          </div>
        </div>
        <div className="topbar-badges">
          <span className="pill secure">🔒 Синтетические данные</span>
          <span className="pill proto">Протоколы МЗ РК</span>
          <span className="pill proto">
            <span className={`dot ${backend === "ok" ? "ok" : backend === "down" ? "bad" : ""}`} />
            сервер {backend === "ok" ? "на связи" : backend === "down" ? "недоступен" : "…"}
          </span>
        </div>
        {doctor && (
          <div className="doctor-chip">
            <div className="avatar">{doctor.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</div>
            <div>
              <strong>{doctor.name}</strong>
              <span>тестовый профиль</span>
            </div>
          </div>
        )}
      </header>

      <div className="page">
        <section className="hero-strip">
          <div>
            <div className="eyebrow">Безопасный AI-ассистент врача</div>
            <h1>Консультация</h1>
            <p>Запись разговора → анамнез → документ → МИС. Диагноз и лечение подтверждает только врач.</p>
          </div>
          <div className="workflow">
            {["Запись", "Анамнез", "Документ", "МИС"].map((name, i) => (
              <div key={name} className={`workflow-step${i === stage ? " active" : i < stage ? " done" : ""}`}>
                <span>{i + 1}</span>
                {name}
              </div>
            ))}
          </div>
        </section>
        <div className="grid">
          {/* ---------- левая колонка: приём и запись ---------- */}
          <div className="col">
            <section className="card">
              <div className="card-head"><div><span className="step-kicker">ШАГ 1</span><h2>Пациент и приём</h2></div></div>
              <label className="lbl" htmlFor="apt">Приём</label>
              <select id="apt" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} style={{ width: "100%" }}>
                <option value="">— выберите пациента —</option>
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>{a.time} · {a.patient.name} ({a.patient.birth_year})</option>
                ))}
              </select>
              {appointment && <div className="muted" style={{ marginTop: 8 }}>Повод обращения: <b>{appointment.reason}</b></div>}
              <div style={{ marginTop: 12 }}>
                <label className="lbl" htmlFor="spec">Специальность</label>
                <select id="spec" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
                {doctor && templateId !== doctor.template_id && <span className="muted" style={{ marginLeft: 8 }}>изменено вручную</span>}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div><span className="step-kicker">ШАГ 2</span><h2>Запись консультации</h2></div>
                <span className="hint">роли врач / пациент — автоматически</span>
              </div>
              <Dialogue turns={turns} onChange={setTurns} onReady={(t) => draft(t)} backendUrl={BACKEND_URL} />

              <div className="row" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-primary" onClick={() => draft()} disabled={drafting || !turns.length || !template}>
                  {turns.length && template && (values.complaints || missing.length) ? "↻ Пересобрать анамнез" : "Собрать анамнез и документ"}
                </button>
                {drafting && <span className="busy"><span className="spinner" /> ИИ собирает полный анамнез…</span>}
              </div>
              {draftMsg && <div className={draftMsg.startsWith("Ошибка") ? "err" : "ok-msg"} style={{ marginTop: 8 }}>{draftMsg}</div>}

              {redFlags.length > 0 && (
                <div className="flags">
                  <b>⚠ Красные флаги — требуют внимания врача</b>
                  <ul>
                    {redFlags.map((f) => (
                      <li key={f.id}><b>{f.severity === "critical" ? "КРИТИЧНО" : "Срочно"}:</b> {f.message}</li>
                    ))}
                  </ul>
                  <label>
                    <input type="checkbox" checked={flagsAck} onChange={(e) => setFlagsAck(e.target.checked)} /> Я ознакомился(ась) с красными флагами
                  </label>
                </div>
              )}

              {missing.length > 0 && (
                <div className="panel warn">
                  <h4>Уточнить у пациента для полного анамнеза</h4>
                  <ul>{missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
              )}

              {references.length > 0 && (
                <div className="panel info">
                  <h4>Использованные страницы протоколов МЗ РК</h4>
                  <ul>
                    {references.map((r) => (
                      <li key={`${r.protocol_id}-${r.page}`}>
                        <a href={`${BACKEND_URL}/api/protocols/${r.protocol_id}/pdf#page=${r.page}`} target="_blank" rel="noreferrer">
                          {r.title} (протокол №{r.number}), стр. {r.page}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          {/* ---------- правая колонка: анамнез ---------- */}
          <div className="col">
            <section className="card">
              <div className="card-head">
                <div><span className="step-kicker">ШАГ 3</span><h2>Анамнез и форма осмотра</h2></div>
                <span className="hint">{template?.title}</span>
              </div>
              {!template && <div className="muted">Загрузка шаблона…</div>}
              {template && (
                <form onSubmit={(e) => e.preventDefault()}>
                  {template.fields.filter((f) => f.type !== "checkbox").map((f) => (
                    <div key={f.name} className={`field${f.ai_suggestion ? " ai" : ""}`}>
                      <label className="lbl" htmlFor={f.name}>
                        {f.label}
                        {f.ai_suggestion && <span className="ai-badge">🤖 Предложение ИИ — требует проверки врачом</span>}
                      </label>
                      {f.type === "textarea" ? (
                        <textarea id={f.name} rows={3} value={(values[f.name] as string) ?? ""} onChange={(e) => set(f.name, e.target.value)} />
                      ) : (
                        <input id={f.name} type="text" value={(values[f.name] as string) ?? ""} onChange={(e) => set(f.name, e.target.value)} />
                      )}
                    </div>
                  ))}
                </form>
              )}
            </section>
          </div>
        </div>

        {/* ---------- документ и МИС ---------- */}
        <div className="grid" style={{ marginTop: 20 }}>
          <section className="card">
            <div className="card-head">
              <div><span className="step-kicker">ШАГ 4</span><h2>Документ консультации</h2></div>
              <span className="row" style={{ marginLeft: "auto" }}>
                <button type="button" className="btn" onClick={saveDocument} disabled={!template}>💾 Сохранить документ</button>
                <button type="button" className="btn" onClick={() => window.print()}>🖨 Печать / PDF</button>
              </span>
            </div>
            {template && (
              <article className="doc">
                <h3>Лист консультации — {template.title}</h3>
                <div className="doc-meta">
                  Пациент: {appointment ? `${appointment.patient.name}, ${appointment.patient.birth_year} г.р.` : "не выбран"} · Врач: {doctor?.name} ·{" "}
                  {new Date().toLocaleDateString("ru-RU")}
                </div>
                {docFields.map((f) => {
                  const v = ((values[f.name] as string) ?? "").trim();
                  return (
                    <div key={f.name} className={`doc-sec${f.ai_suggestion ? " ai" : ""}`}>
                      <b>{f.label}</b>
                      {v ? <span style={{ whiteSpace: "pre-wrap" }}>{v}</span> : <span className="none">не указано</span>}
                    </div>
                  );
                })}
                <div className="doc-foot">
                  Поля, помеченные как предложение ИИ, вступают в силу только после подтверждения врачом. Данные вымышленные.
                </div>
              </article>
            )}
          </section>

          <div className="col">
          <section className="card">
            <div className="card-head"><div><span className="step-kicker">ШАГ 5</span><h2>Отправка в МИС</h2></div></div>
            <p className="muted" style={{ marginTop: 0 }}>
              В МИС уйдёт то же, что вы видите: запись диалога врач—пациент и подписанный документ. Карточка ниже заполнится сама.
            </p>
            <label className="row" style={{ marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={values.doctor_approved === true}
                disabled={needsAck}
                onChange={(e) => set("doctor_approved", e.target.checked)}
              />
              <b>Я проверил(а) и подтверждаю содержимое формы</b>
            </label>
            {needsAck && <div className="err">Сначала ознакомьтесь с красными флагами.</div>}
            <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={!approved || sending || !appointmentId}>
              {sending ? "Отправка…" : "Отправить в МИС"}
            </button>
            {!appointmentId ? (
              <span className="muted" style={{ marginLeft: 10 }}>сначала выберите приём (шаг 1)</span>
            ) : (
              !approved && <span className="muted" style={{ marginLeft: 10 }}>отправка заблокирована, пока врач не подтвердит форму</span>
            )}
            {error && <div className="err">{error}</div>}

            {sent && (
              <div className="sent">
                <b>✅ МИС приняла запись</b>
                <div className="muted">№ <span className="mono">{sent.id}</span> · {sent.received_at}</div>
                <div style={{ margin: "6px 0" }}>
                  Получено: диалог — {sent.dialogue.length} реплик, документ — {sent.document.sections.length} разделов.
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div><span className="step-kicker">ВНЕШНЯЯ СИСТЕМА</span><h2>Карточка пациента в МИС</h2></div>
              <a className="hint" href={appointmentId ? `${MIS_URL}/?apt=${appointmentId}` : MIS_URL} target="_blank" rel="noreferrer">
                открыть в отдельном окне ↗
              </a>
            </div>
            <iframe
              title="МИС"
              src={appointmentId ? `${MIS_URL}/?apt=${appointmentId}` : MIS_URL}
              style={{ width: "100%", height: 620, border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }}
            />
          </section>
          </div>
        </div>
      </div>
    </>
  );
}
