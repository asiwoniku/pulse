"""Payment *verification*, never payment *recording*.

The database owns `payment_status`. There is no `mark_payment_paid()` RPC: recording a
payment is a plain UPDATE of `orders.payment_status`, and the database is what
refuses it — `guard_order_columns()` (migration 0013) rejects commercial columns from
anyone whose `member_role` is `driver`, and the `orders_update_staff_or_driver` policy
(0015) allows the update only when `can_operate()` holds or the caller is the assigned
driver, who is then stopped by the column guard. What this module adds is the ability
to check somebody's claim against the provider *before* that human decision, and to
refuse politely when no provider is configured. It deliberately does not write to
Pulse.
"""
from __future__ import annotations

from typing import Any

from ..config import Config
from ..support import ServiceError, http_json, unconfigured

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
            "note": "Informational. This does not move payment_status. A staff "
            "member records a payment by updating orders.payment_status, which "
            "guard_order_columns() (0013) and the orders_update_staff_or_driver "
            "policy (0015) decide.",
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
            "note": "Informational. This does not move payment_status. A staff "
            "member records a payment by updating orders.payment_status, which "
            "guard_order_columns() (0013) and the orders_update_staff_or_driver "
            "policy (0015) decide.",
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
            # Nothing was called, so there is no provider message to report. Say
            # so explicitly instead of carrying a field that is always null.
            "attempted": False,
        },
    )
