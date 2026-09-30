import json
import math
import re
from collections import Counter
from pathlib import Path

DIR = Path(__file__).parent / "protocols"

# специальность шаблона -> специальности в индексе протоколов
SPECIALTY_MAP = {
    "therapist": {"Терапия"},
    "ophthalmologist": {"Офтальмология"},
    "neurologist": {"Неврология"},
}

PROTOCOLS: dict[str, dict] = {
    p["id"]: p for p in json.loads((DIR / "index.json").read_text(encoding="utf-8"))["protocols"]
}
_CHUNKS = json.loads((DIR / "chunks.json").read_text(encoding="utf-8"))
_RULES = json.loads((DIR / "red_flags.json").read_text(encoding="utf-8"))["rules"]

# только сигналы, определяемые по тексту консультации (без проверок заполненности полей)
_FLAG_RULES = [
    r for r in _RULES
    if r["severity"] in ("critical", "urgent")
    and ("any_concept" in r["match"] or "all_concepts" in r["match"])
]
FLAG_CONCEPTS = sorted(
    {c for r in _FLAG_RULES for key in ("any_concept", "all_concepts", "supporting_any") for c in r["match"].get(key, [])}
)


def _stems(text: str) -> list[str]:
    # грубый «стемминг» по первым 5 буквам, чтобы «кашель/кашля» совпадали
    return [w[:5] for w in re.findall(r"[а-яёa-z0-9]{4,}", text.lower())]


_TOKENS = [Counter(_stems(c["text"])) for c in _CHUNKS]
_DF: Counter = Counter()
for _t in _TOKENS:
    _DF.update(_t.keys())


def retrieve(specialty: str, query: str, k: int = 5) -> list[dict]:
    """Топ-k страниц протоколов по специальности, ранжирование TF-IDF."""
    allowed = SPECIALTY_MAP.get(specialty, set())
    q = Counter(_stems(query))
    n = len(_CHUNKS)
    scored = []
    for chunk, tokens in zip(_CHUNKS, _TOKENS):
        proto = PROTOCOLS[chunk["protocol_id"]]
        if not allowed.intersection(proto["specialty"]):
            continue
        score = sum(
            (1 + math.log(tokens[s])) * math.log(1 + n / _DF[s])
            for s in q
            if s in tokens
        )
        if score > 0:
            scored.append((score, chunk))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:k]]


def reference(chunk: dict) -> dict:
    p = PROTOCOLS[chunk["protocol_id"]]
    return {
        "protocol_id": p["id"],
        "title": p["title"],
        "number": p["protocol_number"],
        "page": chunk["page"],
    }


def evaluate_red_flags(concepts: set[str]) -> list[dict]:
    flags = []
    for r in _FLAG_RULES:
        m = r["match"]
        hit = bool(set(m.get("any_concept", [])) & concepts) if "any_concept" in m else False
        if "all_concepts" in m and set(m["all_concepts"]) <= concepts:
            hit = True
        if hit:
            flags.append({"id": r["id"], "severity": r["severity"], "message": r["message_ru"]})
    return flags
