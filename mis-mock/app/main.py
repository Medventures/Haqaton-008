import uuid
from datetime import datetime, timezone
from html import escape

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse

app = FastAPI(title="MIS Mock")

received: list[dict] = []

# Вымышленные пациенты и приёмы (реальных персональных данных нет)
APPOINTMENTS = [
    {"id": "apt-1", "time": "09:00", "reason": "Снижение остроты зрения",
     "patient": {"id": "p-1", "name": "Пациент А. Тестов", "birth_year": 1984, "sex": "M"}},
    {"id": "apt-2", "time": "09:30", "reason": "Повышенное внутриглазное давление",
     "patient": {"id": "p-2", "name": "Пациентка Б. Образцова", "birth_year": 1971, "sex": "F"}},
    {"id": "apt-3", "time": "10:00", "reason": "Головная боль, головокружение",
     "patient": {"id": "p-3", "name": "Пациент В. Примеров", "birth_year": 1990, "sex": "M"}},
    {"id": "apt-4", "time": "10:30", "reason": "Кашель, температура 37.8",
     "patient": {"id": "p-4", "name": "Пациентка Г. Демонстрационная", "birth_year": 1965, "sex": "F"}},
    {"id": "apt-5", "time": "11:00", "reason": "Боль в пояснице с иррадиацией в ногу",
     "patient": {"id": "p-5", "name": "Пациент Д. Условный", "birth_year": 1978, "sex": "M"}},
]


@app.get("/health")
def health():
    return {"status": "ok", "service": "mis-mock"}


@app.get("/api/appointments")
def list_appointments():
    return APPOINTMENTS


@app.post("/api/consultations")
def receive_consultation(consultation: dict):
    if consultation.get("data", {}).get("doctor_approved") is not True:
        raise HTTPException(status_code=422, detail="Консультация не подтверждена врачом")
    record_id = str(uuid.uuid4())
    received.append({
        "id": record_id,
        "received_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **consultation,
    })
    return {"status": "accepted", "id": record_id}


@app.get("/api/consultations")
def list_consultations():
    return received


@app.get("/api/consultations/{record_id}")
def get_consultation(record_id: str):
    for r in received:
        if r["id"] == record_id:
            return r
    raise HTTPException(status_code=404, detail="Запись не найдена")


PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>МИС — принятые консультации</title>
<style>
:root{{--bg:#f4f7fa;--ink:#0f2233;--muted:#5b6b7b;--line:#e2e8ee;--pri:#1d4ed8}}
*{{box-sizing:border-box}}body{{margin:0;font-family:Inter,system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--ink)}}
header{{background:#0f2233;color:#fff;padding:14px 24px;font-weight:700;letter-spacing:.3px}}
header small{{opacity:.7;font-weight:400;margin-left:10px}}
main{{max-width:980px;margin:24px auto;padding:0 16px}}
.card{{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:18px}}
.card:target{{outline:3px solid var(--pri)}}
h2{{margin:0 0 4px;font-size:18px}}.meta{{color:var(--muted);font-size:13px;margin-bottom:12px}}
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}@media(max-width:800px){{.cols{{grid-template-columns:1fr}}}}
h3{{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:0 0 8px}}
.b{{border-radius:10px;padding:7px 11px;margin:0 0 7px;font-size:14px;max-width:92%}}
.d{{background:#e6f2ff}}.p{{background:#e8f7ee;margin-left:auto}}.b i{{display:block;font-style:normal;font-size:11px;color:var(--muted)}}
.s{{margin:0 0 10px;font-size:14px}}.s b{{display:block;font-size:12px;color:var(--muted)}}
.ai{{border-left:3px solid #8b6cf0;padding-left:8px;background:#f6f3ff}}
.empty{{color:var(--muted);text-align:center;padding:40px}}
</style></head><body>
<header>МИС (имитация)<small>принятые консультации</small></header>
<main>{body}</main></body></html>"""


def _render(r: dict) -> str:
    doc = r.get("document") or {}
    patient = doc.get("patient") or {}
    turns = "".join(
        f'<div class="b {"d" if t["speaker"] == "doctor" else "p"}"><i>{"Врач" if t["speaker"] == "doctor" else "Пациент"}</i>{escape(t["text"])}</div>'
        for t in r.get("dialogue", [])
    ) or '<div class="meta">Диалог не передан</div>'
    sections = "".join(
        f'<div class="s{" ai" if s.get("ai_suggestion") else ""}"><b>{escape(s["label"])}</b>{escape(s["value"]) or "<i>не указано</i>"}</div>'
        for s in doc.get("sections", [])
    )
    return (
        f'<section class="card" id="{escape(r["id"])}">'
        f'<h2>{escape(doc.get("title", "Консультация"))}</h2>'
        f'<div class="meta">Пациент: {escape(str(patient.get("name", "—")))} · '
        f'Врач: {escape(str((doc.get("doctor") or {}).get("name", "—")))} · '
        f'Получено: {escape(r["received_at"])} · № {escape(r["id"])}</div>'
        f'<div class="cols"><div><h3>Запись диалога</h3>{turns}</div>'
        f'<div><h3>Документ</h3>{sections}</div></div></section>'
    )


@app.get("/", response_class=HTMLResponse)
def mis_page():
    body = "".join(_render(r) for r in reversed(received)) or '<div class="empty">Пока нет принятых консультаций</div>'
    return PAGE.format(body=body)
