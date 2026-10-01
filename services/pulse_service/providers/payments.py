"""Payment *verification*, never payment *recording*.

The database owns `payment_status`: migration 0009 only lets staff move it through
`mark_payment_paid()`. What this module adds is the ability to check somebody's claim
against the provider before that human decision, and to refuse politely when no
provider is configured. It deliberately does not write to Pulse.
"""
from __future__ import annotations

from typing import Any

from ..config import Config
from ..support import ServiceError, http_json, message_from, unconfigured

PAYSTACK_VERIFY = "https://api.paystack.co/transaction/verify/{reference}"
FLUTTERWAVE_VERIFY = "https://api.flutterwave.com/v3/transactions/{txn}/verify"


def verify(cfg: Config, *, reference: str = "", transaction_id: str = "") -> dict[str, Any]:
    provider = (cfg.get("PAYMENTS_PROVIDER") or "").lower()

    if provider == "paystack":
        secret = cfg.get("PAYSTACK_SECRET_KEY")
        if not secret:
            raise unconfigured("payments:paystack", ["PAYSTACK_SECRET_KEY"])
        if not reference:
            raise ServiceError("A Paystack reference is required.", source="payments:paystack")
        status, body = http_json(
            "GET",
            PAYSTACK_VERIFY.format(reference=reference),
            provider="payments:paystack",
            headers={"Authorization": f"Bearer {secret}"},
        )
        data = (body or {}).get("data") or {}
        return {
            "provider": "paystack",
            "reference": reference,
            "provider_status": data.get("status"),
            "amount": data.get("amount"),
            "currency": data.get("currency"),
            "customer_email": data.get("customer", {}).get("email"),
            "verified_http_status": status,
            "note": "Informational. A staff member still records the payment with "
            "mark_payment_paid(), which the database authorises.",
        }

    if provider == "flutterwave":
        secret = cfg.get("FLUTTERWAVE_SECRET_KEY")
        if not secret:
            raise unconfigured("payments:flutterwave", ["FLUTTERWAVE_SECRET_KEY"])
        if not transaction_id:
            raise ServiceError(
                "A Flutterwave transaction id is required.", source="payments:flutterwave"
            )
        status, body = http_json(
            "GET",
            FLUTTERWAVE_VERIFY.format(txn=transaction_id),
            provider="payments:flutterwave",
            headers={"Authorization": f"Bearer {secret}"},
        )
        data = (body or {}).get("data") or {}
        return {
            "provider": "flutterwave",
            "transaction_id": transaction_id,
            "provider_status": data.get("status"),
            "amount": data.get("amount"),
            "currency": data.get("currency"),
            "verified_http_status": status,
            "note": "Informational. A staff member still records the payment with "
            "mark_payment_paid(), which the database authorises.",
        }

    raise ServiceError(
        "No payment provider is configured, so a payment claim cannot be verified. "
        "Set PAYMENTS_PROVIDER plus PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY. "
        "Until then payment_status stays pending_confirmation, which is the truth.",
        status=503,
        source="payments",
        detail={
            "reference": reference or None,
            "provider": provider or None,
            "provider_message": message_from(None),
        },
    )
