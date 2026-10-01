"""Turns a WhatsApp order message into a reviewable draft.

This runs with no credentials and no network, which is why it is the most useful
thing in the service on a laptop with nothing configured. It is a *parser*, not an
importer: the output is a draft plus a list of questions a human must still ask. The
order only exists once a person calls `create_delivery_order` with their own token —
a message is not a job, and a regex must never decide that one is.
"""
from __future__ import annotations

import re
from typing import Any

from ..support import normalise_phone

PICKUP_WORDS = r"(?:pick\s*[- ]?up\s*(?:from|at|is)?|pickup|collect\s*(?:from|at)?|from)"
DROP_WORDS = r"(?:to|deliver\s*(?:to|at)?|drop\s*(?:off)?\s*(?:at|to)?|destination|dest|final\s*dest)"
PRICE = re.compile(r"(?:[\u20a6]|naira|ngn|₦)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:[\u20a6]|ngn)", re.I)
ITEM = re.compile(
    r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|dozen)\s+"
    r"(?:x\s*)?([a-z][a-z\s]{2,40}?)(?:\s*(?:,|\.|of|to|from)\b|$)",
    re.I,
)
WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "dozen": 12,
}
SERVICE_HINTS = {
    "moving": "moving",
    "furniture": "moving",
    "sofa": "parcel",
    "carton": "parcel",
    "box": "parcel",
    "documents": "parcel",
    "document": "parcel",
    "trip": "trip",
}
PHONE_IN_TEXT = re.compile(r"(?:\+?\d[\d\s()-]{8,}\d)")


def _first_between(text: str, left: str, right: str | None) -> str | None:
    stop = right or r"$"
    pattern = rf"{left}\s*[:\-]?\s*(.+?)(?=\s+(?:{stop})\b|$|[,;\n])"
    match = re.search(pattern, text, re.I | re.S)
    if not match:
        return None
    value = re.sub(r"\s+", " ", match.group(1)).strip(" .,:-")
    return value or None


def _price(text: str) -> dict[str, Any] | None:
    match = PRICE.search(text)
    if not match:
        return None
    raw = match.group(1) or match.group(2)
    try:
        amount = float(raw.replace(",", ""))
    except (TypeError, ValueError):
        return None
    return {"amount": amount, "currency": "NGN", "source": "mentioned in message"}


def _items(text: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in ITEM.finditer(text):
        count_word = match.group(1).lower()
        name = re.sub(r"\s+", " ", match.group(2)).strip().lower()
        if not name or name in seen or len(name) < 3:
            continue
        if any(word in name.split() for word in ("day", "am", "pm", "hours", "minutes")):
            continue
        seen.add(name)
        found.append(
            {"name": name, "quantity": WORDS.get(count_word, None) or int(count_word)}
        )
    return found[:12]


def _service(text: str, items: list[dict[str, Any]]) -> str:
    lowered = text.lower()
    for word, service in SERVICE_HINTS.items():
        if word in lowered:
            return service
    return "parcel" if items else "trip"


def parse(text: str, *, default_phone: str | None = None) -> dict[str, Any]:
    """Parse one customer message. Nothing here is invented: a field the message
    does not contain is reported as missing, and the `questions` list is the point."""
    body = (text or "").strip()
    if not body:
        return {"draft": None, "questions": ["The message is empty."], "signals": {}}

    phones = PHONE_IN_TEXT.findall(body)
    phone = None
    for candidate in phones:
        phone = normalise_phone(candidate)
        if phone:
            break
    phone = phone or normalise_phone(default_phone or "")

    # A line beginning with an address word is the most common WhatsApp shape.
    pickup = _first_between(body, PICKUP_WORDS, DROP_WORDS)
    destination = _first_between(body, DROP_WORDS, None)
    if not pickup:
        for line in body.splitlines():
            if re.match(rf"^\s*{PICKUP_WORDS}", line, re.I):
                pickup = re.sub(rf"^\s*{PICKUP_WORDS}\s*[:\-]?", "", line, flags=re.I).strip()
                break
    if not destination:
        for line in body.splitlines():
            if re.match(rf"^\s*{DROP_WORDS}", line, re.I):
                destination = re.sub(rf"^\s*{DROP_WORDS}\s*[:\-]?", "", line, flags=re.I).strip()
                break

    items = _items(body)
    price = _price(body)
    draft = {
        "customer_phone": phone,
        "pickup_text": pickup,
        "destination_text": destination,
        "description": body[:500],
        "parcel_details": ", ".join(f"{i['quantity']}x {i['name']}" for i in items) or None,
        "items": items,
        "quoted_price": price,
        "service_type": _service(body, items),
    }

    questions: list[str] = []
    if not phone:
        questions.append("No reachable phone number in the message — ask for one.")
    if not pickup:
        questions.append("Pickup address is missing.")
    if not destination:
        questions.append("Destination address is missing.")
    if not items:
        questions.append("No parcels or items detected — confirm what is moving.")
    if price is None:
        questions.append("No price mentioned — quote it after the route is checked.")
    if pickup and destination:
        questions.append("Geocode both addresses before quoting distance.")

    return {
        "draft": draft,
        "questions": questions,
        "signals": {
            "phones_found": phones,
            "price_mentioned": price is not None,
            "item_count": len(items),
            "parser": "pulse-local whatsapp-text-v1",
        },
        "next_step": "A human reviews this and calls create_delivery_order. This "
        "service never creates an order from an inbound message.",
    }
