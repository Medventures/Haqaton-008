import json
import os
import urllib.error
import urllib.request

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .template_store import TEMPLATES

MIS_URL = os.getenv("MIS_URL", "http://localhost:8001")

app = FastAPI(title="Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Тестовый профиль врача (вымышленные данные)
TEST_DOCTOR = {
    "id": "doctor-test-1",
    "name": "Тестовый Врач",
    "specialty": "ophthalmologist",
    "template_id": "ophthalmologist_v1",
}


class Submission(BaseModel):
    template_id: str
    data: dict


@app.get("/health")
def health():
    return {"status": "ok", "service": "backend"}


@app.get("/api/doctor/profile")
def doctor_profile():
    return TEST_DOCTOR


@app.get("/api/templates")
def list_templates():
    return [
        {"id": t["id"], "specialty": t["specialty"], "title": t["title"]}
        for t in TEMPLATES.values()
    ]


@app.get("/api/templates/{template_id}")
def get_template(template_id: str):
    template = TEMPLATES.get(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    return template


@app.post("/api/consultations/submit")
def submit_to_mis(submission: Submission):
    template = TEMPLATES.get(submission.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if submission.data.get("doctor_approved") is not True:
        raise HTTPException(status_code=403, detail="Отправка в МИС запрещена: форма не подтверждена врачом")

    allowed = {f["name"] for f in template["fields"]}
    payload = {k: v for k, v in submission.data.items() if k in allowed}
    body = json.dumps({"template_id": template["id"], "data": payload}).encode("utf-8")
    req = urllib.request.Request(
        f"{MIS_URL}/api/consultations",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError):
        raise HTTPException(status_code=502, detail="МИС недоступна")
