import { useEffect, useState } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

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

const box: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, font: "inherit" };

export default function App() {
  const [backend, setBackend] = useState("проверка...");
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [values, setValues] = useState<Values>({});
  const [result, setResult] = useState("");

  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((r) => r.json())
      .then((d) => setBackend(d.status))
      .catch(() => setBackend("недоступен"));
    Promise.all([
      fetch(`${BACKEND_URL}/api/doctor/profile`).then((r) => r.json()),
      fetch(`${BACKEND_URL}/api/templates`).then((r) => r.json()),
    ])
      .then(([d, t]) => {
        setDoctor(d);
        setTemplates(t);
        setTemplateId(d.template_id); // специальность из профиля врача
      })
      .catch(() => setBackend("недоступен"));
  }, []);

  useEffect(() => {
    if (!templateId) return;
    fetch(`${BACKEND_URL}/api/templates/${templateId}`)
      .then((r) => r.json())
      .then(setTemplate);
    setResult("");
  }, [templateId]);

  const set = (name: string, v: string | boolean) => setValues((prev) => ({ ...prev, [name]: v }));
  const approved = values.doctor_approved === true;

  const submit = async () => {
    if (!template || !approved) return;
    const data: Values = {};
    template.fields.forEach((f) => (data[f.name] = values[f.name] ?? (f.type === "checkbox" ? false : "")));
    const res = await fetch(`${BACKEND_URL}/api/consultations/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: template.id, data }),
    });
    const body = await res.json();
    setResult(res.ok ? `Отправлено в МИС, id: ${body.id}` : `Ошибка: ${body.detail}`);
  };

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 760, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Консультация</h1>
      <p>
        Backend: <b>{backend}</b>
        {doctor && <> · Врач: <b>{doctor.name}</b> (тестовый профиль)</>}
      </p>

      <label>
        Специальность:{" "}
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </label>
      {doctor && templateId !== doctor.template_id && (
        <small style={{ marginLeft: 8, color: "#a60" }}>изменено вручную</small>
      )}

      {template && (
        <form onSubmit={(e) => e.preventDefault()} style={{ marginTop: 16 }}>
          {template.fields.map((f) => (
            <div
              key={f.name}
              style={{
                marginBottom: 14,
                ...(f.ai_suggestion && {
                  border: "2px dashed #7a5af8",
                  background: "#f5f2ff",
                  padding: 10,
                  borderRadius: 6,
                }),
              }}
            >
              {f.type === "checkbox" ? (
                <label>
                  <input
                    type="checkbox"
                    checked={values[f.name] === true}
                    onChange={(e) => set(f.name, e.target.checked)}
                  />{" "}
                  <b>{f.label}</b>
                </label>
              ) : (
                <>
                  <label htmlFor={f.name} style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                    {f.label}
                    {f.ai_suggestion && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: "#5b3fd1" }}>
                        🤖 Предложение ИИ — требует проверки врачом
                      </span>
                    )}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={f.name}
                      rows={3}
                      style={box}
                      value={(values[f.name] as string) ?? ""}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  ) : (
                    <input
                      id={f.name}
                      style={box}
                      value={(values[f.name] as string) ?? ""}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  )}
                </>
              )}
            </div>
          ))}

          <button type="button" onClick={submit} disabled={!approved} style={{ padding: "10px 20px" }}>
            Отправить в МИС
          </button>
          {!approved && <small style={{ marginLeft: 8 }}>Сначала подтвердите форму</small>}
          {result && <p>{result}</p>}
        </form>
      )}
    </main>
  );
}
