from datetime import datetime, timezone


def build_document(template: dict, data: dict, doctor: dict, patient: dict | None) -> dict:
    """Итоговый документ консультации, который уходит в МИС вместе с диалогом."""
    sections = [
        {
            "name": f["name"],
            "label": f["label"],
            "value": str(data.get(f["name"], "") or "").strip(),
            "ai_suggestion": bool(f.get("ai_suggestion")),
        }
        for f in template["fields"]
        if f["type"] != "checkbox"
    ]
    return {
        "title": f"Лист консультации — {template['title']}",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "doctor": {"name": doctor["name"], "specialty": template["title"]},
        "patient": patient,
        "sections": sections,
        "approved_by_doctor": data.get("doctor_approved") is True,
        "ai_notice": "Поля, помеченные как предложение ИИ, подтверждены врачом перед отправкой.",
    }
