import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

app = FastAPI(title="MIS Mock")

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

# карточки приёмов в МИС: appointment_id -> запись (пустая или заполненная)
encounters: dict[str, dict] = {}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def find_appointment(apt_id: str) -> dict:
    apt = next((a for a in APPOINTMENTS if a["id"] == apt_id), None)
    if apt is None:
        raise HTTPException(status_code=404, detail="Приём не найден")
    return apt


@app.get("/health")
def health():
    return {"status": "ok", "service": "mis-mock"}


@app.get("/api/appointments")
def list_appointments():
    return APPOINTMENTS


@app.put("/api/encounters/{apt_id}")
def open_encounter(apt_id: str, body: dict):
    """Врач начал приём: в МИС создаётся пустая карточка консультации."""
    find_appointment(apt_id)
    encounters[apt_id] = {
        "status": "open",
        "template_id": body.get("template_id"),
        "document": body.get("document"),
        "dialogue": [],
        "updated_at": now(),
    }
    return {"status": "open"}


@app.get("/api/encounters")
def list_encounters():
    """Все приёмы со статусом карточки — для окна МИС."""
    out = []
    for apt in APPOINTMENTS:
        enc = encounters.get(apt["id"], {"status": "not_opened"})
        out.append({"appointment_id": apt["id"], "time": apt["time"], "reason": apt["reason"],
                    "patient": apt["patient"], **enc})
    return out


@app.post("/api/consultations")
def receive_consultation(consultation: dict):
    if consultation.get("data", {}).get("doctor_approved") is not True:
        raise HTTPException(status_code=422, detail="Консультация не подтверждена врачом")
    apt_id = consultation.get("appointment_id")
    if not apt_id:
        raise HTTPException(status_code=422, detail="Не указан приём")
    find_appointment(apt_id)
    record_id = str(uuid.uuid4())
    received_at = now()
    encounters[apt_id] = {
        "status": "filled",
        "id": record_id,
        "received_at": received_at,
        "updated_at": received_at,
        "template_id": consultation.get("template_id"),
        "document": consultation.get("document"),
        "dialogue": consultation.get("dialogue", []),
        "transcript": consultation.get("transcript", ""),
        "data": consultation.get("data", {}),
    }
    return {"status": "accepted", "id": record_id}


@app.get("/api/consultations/{record_id}")
def get_consultation(record_id: str):
    for enc in encounters.values():
        if enc.get("id") == record_id:
            return enc
    raise HTTPException(status_code=404, detail="Запись не найдена")


@app.get("/api/consultations")
def list_consultations():
    return [e for e in encounters.values() if e["status"] == "filled"]


@app.get("/")
def mis_page():
    return FileResponse(Path(__file__).parent / "page.html", media_type="text/html")
