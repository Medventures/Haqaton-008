import uuid

from fastapi import FastAPI, HTTPException

app = FastAPI(title="MIS Mock")

received: list[dict] = []


@app.get("/health")
def health():
    return {"status": "ok", "service": "mis-mock"}


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
