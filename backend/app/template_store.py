import json
from pathlib import Path

TEMPLATES_DIR = Path(__file__).parent / "templates"


def _load() -> dict[str, dict]:
    common = json.loads((TEMPLATES_DIR / "common.json").read_text(encoding="utf-8"))
    anchor = common["insert_extra_before"]
    templates: dict[str, dict] = {}
    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        if path.name == "common.json":
            continue
        spec = json.loads(path.read_text(encoding="utf-8"))
        fields: list[dict] = []
        for field in common["fields"]:
            if field["name"] == anchor:
                fields.extend(spec["extra_fields"])
            fields.append(field)
        templates[spec["id"]] = {
            "id": spec["id"],
            "specialty": spec["specialty"],
            "title": spec["title"],
            "fields": fields,
        }
    return templates


TEMPLATES = _load()
