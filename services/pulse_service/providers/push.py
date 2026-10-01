"""Push notifications via FCM HTTP v1.

The v1 protocol requires an OAuth2 access token signed RS256 with a service account
key. The standard library has no RSA signer, so this module reports precisely that
instead of pretending, and only attempts a send when `google-auth` is importable.
Devices remain registered in `devices` either way — the app keeps working, it just
stays silent, and the board keeps polling.
"""
from __future__ import annotations

from typing import Any

from ..config import Config
from ..support import ServiceError, http_json, message_from, unconfigured

FCM_SEND = "https://fcm.googleapis.com/v1/projects/{project}/messages:send"


def _access_token(cfg: Config) -> str:
    try:  # pragma: no cover - depends on an optional dependency
        from google.oauth2 import service_account  # type: ignore
    except ImportError as error:
        raise ServiceError(
            "Push needs the google-auth package to sign an FCM v1 access token. "
            "Install it with `pip install google-auth`, or leave devices registered "
            "and silent.",
            status=501,
            source="push:fcm",
            detail={"missing_dependency": "google-auth"},
        ) from error

    path = cfg.get("FIREBASE_SERVICE_ACCOUNT_FILE")
    if not path:
        raise unconfigured("push:fcm", ["FIREBASE_SERVICE_ACCOUNT_FILE"])
    account = service_account.Credentials.from_service_account_file(
        path, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
    )
    from google.auth.transport.requests import Request  # local import, optional dep

    account.refresh(Request())
    token = getattr(account, "token", None)
    if not token:
        raise ServiceError(
            "The service account produced no access token.", status=502, source="push:fcm"
        )
    return token


def send(cfg: Config, push_token: str, title: str, body: str) -> dict[str, Any]:
    project = cfg.get("FCM_PROJECT_ID")
    if not project:
        raise unconfigured("push:fcm", ["FCM_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_FILE"])
    access = _access_token(cfg)
    status, response = http_json(
        "POST",
        FCM_SEND.format(project=project),
        provider="push:fcm",
        headers={"Authorization": f"Bearer {access}"},
        payload={
            "message": {
                "token": push_token,
                "notification": {"title": title, "body": body},
                "data": {"source": "pulse-local"},
            }
        },
    )
    if status >= 300:
        raise ServiceError(
            message_from(response) or f"FCM rejected the message (status {status}).",
            status=502,
            source="push:fcm",
        )
    return {"provider": "push:fcm", "sent": True, "name": (response or {}).get("name")}
