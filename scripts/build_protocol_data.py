"""Разовая подготовка данных протоколов (dev-скрипт, в рантайме backend не нужен).

Использование:
    pip install pypdf
    python scripts/build_protocol_data.py <папка_с_распакованными_архивами>

Из PDF извлекает текст постранично в backend/app/protocols/chunks.json,
собирает общий index.json и копирует PDF в backend/app/protocols/pdf/.
"""
import glob
import json
import os
import shutil
import sys

from pypdf import PdfReader

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "..", "backend", "app", "protocols")
os.makedirs(os.path.join(out, "pdf"), exist_ok=True)

indexes = [json.load(open(p, encoding="utf-8")) for p in glob.glob(f"{src}/**/protocol_index.json", recursive=True)]
protocols = []
for idx in indexes:
    for p in idx["protocols"]:
        p = dict(p)
        # в пакете офтальмологии поле специальности отсутствует
        if "specialty" not in p:
            p["specialty"] = ["Офтальмология"]
        p["title"] = p.pop("title_ru", p.get("title"))
        protocols.append(p)

chunks = []
for p in protocols:
    matches = glob.glob(f"{src}/**/{p['file']}", recursive=True)
    if not matches:
        raise SystemExit(f"PDF не найден: {p['file']}")
    shutil.copy(matches[0], os.path.join(out, "pdf", p["file"]))
    for n, page in enumerate(PdfReader(matches[0]).pages, start=1):
        text = " ".join((page.extract_text() or "").split())
        if len(text) > 80:
            chunks.append({"protocol_id": p["id"], "page": n, "text": text})

json.dump({"protocols": protocols}, open(os.path.join(out, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(chunks, open(os.path.join(out, "chunks.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(len(protocols), "protocols,", len(chunks), "pages")
