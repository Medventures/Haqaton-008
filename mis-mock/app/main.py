import uuid

from fastapi import FastAPI, HTTPException

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
    received.append({"id": record_id, **consultation})
    return {"status": "accepted", "id": record_id}


@app.get("/api/consultations")
def list_consultations():
    return received
