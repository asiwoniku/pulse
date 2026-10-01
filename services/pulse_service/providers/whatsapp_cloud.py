"""WhatsApp Cloud API: signed webhook verification and outbound templates.

Inbound handling is deliberately split from parsing: `parse_inbound` only extracts
what Meta delivered, and `whatsapp.parse` turns that text into a draft. Nothing in
this module creates an order, and nothing trusts an inbound body whose signature
cannot be checked.
"""
from __future__ import annotations

from typing import Any

from ..config import Config
from ..support import ServiceError, http_json, message_from, signature_matches, unconfigured

GRAPH = "https://graph.facebook.com/v21.0"


def verify_webhook(cfg: Config, raw_body: bytes, signature_header: str) -> dict[str, Any]:
    """Meta signs the exact raw bytes with the app secret. No secret, no trust."""
    secret = cfg.get("WHATSAPP_APP_SECRET")
    if not secret:
        raise ServiceError(
            "WHATSAPP_APP_SECRET is not set, so an inbound webhook cannot be "
            "verified. The payload was discarded rather than trusted.",
            status=503,
            source="whatsapp:cloud",
        )
    if not signature_matches(secret, raw_body, signature_header):
        raise ServiceError(
            "Webhook signature does not match the payload.",
            status=401,
            source="whatsapp:cloud",
        )
    return {"verified": True}


def parse_inbound(payload: Any) -> list[dict[str, Any]]:
    """Flatten Meta's nested webhook shape into (contact, text) pairs."""
    messages: list[dict[str, Any]] = []
    for change in ((payload or {}).get("entry") or [{}]):
        for value in change.get("changes") or []:
            data = value.get("value") or {}
            contacts = {
                c.get("wa_id"): (c.get("profile") or {}).get("name")
                for c in data.get("contacts") or []
            }
            for message in data.get("messages") or []:
                messages.append(
                    {
                        "from": message.get("from"),
                        "contact_name": contacts.get(message.get("from")),
                        "type": message.get("type"),
                        "text": ((message.get("text") or {}).get("body"))
                        or ((message.get("interactive") or {}).get("list_reply", {}).get("title")),
                        "message_id": message.get("id"),
                    }
                )
    return messages


def send_text(cfg: Config, to_e164: str, body: str) -> dict[str, Any]:
    token = cfg.get("WHATSAPP_ACCESS_TOKEN")
    phone_id = cfg.get("WHATSAPP_PHONE_NUMBER_ID")
    if not token or not phone_id:
        raise unconfigured(
            "whatsapp:cloud", ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]
        )
    status, response = http_json(
        "POST",
        f"{GRAPH}/{phone_id}/messages",
        provider="whatsapp:cloud",
        headers={"Authorization": f"Bearer {token}"},
        payload={
            "messaging_product": "whatsapp",
            "to": to_e164.lstrip("+"),
            "type": "text",
            "text": {"body": body[:1024]},
        },
    )
    if status >= 300:
        raise ServiceError(
            message_from(response) or f"WhatsApp rejected the message (status {status}).",
            status=502,
            source="whatsapp:cloud",
        )
    return {
        "provider": "whatsapp:cloud",
        "sent": True,
        "provider_message_ids": [m.get("id") for m in (response or {}).get("messages", [])],
        "note": "Delivery is asynchronous; Pulse does not mark anything delivered "
        "because an API accepted a message.",
    }
