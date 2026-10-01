"""Invitation mail over SMTP.

The invitation code is created in Postgres by `invite_worker`; this only carries the
code to a person. If SMTP is not configured the caller still gets the code back and
the portal shows it with the reason delivery was manual — a missing mail server must
never turn into a silently dropped invitation.
"""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from typing import Any

from ..config import Config
from ..support import ServiceError, unconfigured


def send_invitation(
    cfg: Config, *, to_email: str, code: str, business_name: str, role: str, inviter: str
) -> dict[str, Any]:
    host = cfg.get("SMTP_HOST")
    username = cfg.get("SMTP_USERNAME")
    password = cfg.get("SMTP_PASSWORD")
    sender = cfg.get("MAIL_FROM")
    if not (host and username and password and sender):
        raise unconfigured(
            "mail:smtp", ["SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD", "MAIL_FROM"]
        )

    base = cfg.get("MAIL_INVITE_URL") or "http://127.0.0.1:8000/#join"
    link = f"{base}?code={code}"
    message = EmailMessage()
    message["Subject"] = f"You have been invited to {business_name} on Pulse"
    message["From"] = sender
    message["To"] = to_email
    message.set_content(
        f"{inviter} invited you to join {business_name} as {role}.\n\n"
        f"Accept the invitation: {link}\n\n"
        f"Or enter this code in the Pulse app: {code}\n\n"
        "If you did not expect this, ignore the message — nothing happens unless "
        "the code is used.\n"
    )

    port = int(cfg.get("SMTP_PORT") or "587")
    try:
        # 465 is implicit TLS: there is no STARTTLS to issue on that port.
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=20)
        else:
            server = smtplib.SMTP(host, port, timeout=20)
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
        with server:
            server.login(username, password)
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as error:
        raise ServiceError(
            f"SMTP delivery to {to_email} failed: {error}",
            status=502,
            source="mail:smtp",
            detail={"code_still_valid": True, "code": code},
        ) from error

    return {
        "provider": "mail:smtp",
        "delivered_to": to_email,
        "note": "Invitation code remains valid in the database regardless of this "
        "message.",
    }
