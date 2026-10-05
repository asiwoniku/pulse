"""Small helpers shared by providers and the HTTP layer.

Everything here is stdlib on purpose. The one rule that matters: an upstream
failure is reported with the provider name, the status code, and the provider's own
message — never flattened into "something went wrong", and never replaced by a
plausible-looking fallback.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

USER_AGENT = "pulse-local/0.1 (partner portal + integration service)"
E164 = re.compile(r"^\+[1-9]\d{7,14}$")


class ServiceError(Exception):
    """A failure that should reach the client as a JSON error body."""

    def __init__(
        self,
        message: str,
        status: int = 400,
        *,
        source: str = "pulse",
        detail: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.source = source
        self.detail = detail

    def to_body(self) -> dict[str, Any]:
        return {
            "error": {
                "message": self.message,
                "status": self.status,
                "source": self.source,
                "detail": self.detail,
            }
        }


def unconfigured(provider: str, missing: list[str]) -> ServiceError:
    names = ", ".join(missing) or provider
    return ServiceError(
        f"{provider} is not configured: set {names}. The request was not attempted.",
        status=503,
        source=provider,
        detail={"missing_env": missing},
    )


def http_json(
    method: str,
    url: str,
    *,
    provider: str,
    headers: dict[str, str] | None = None,
    payload: Any | None = None,
    query: dict[str, Any] | None = None,
    timeout: float = 15.0,
    raw: bool = False,
) -> tuple[int, Any]:
    """Call an HTTP JSON API and return (status, decoded body).

    Non-2xx is returned, not raised, so callers can distinguish 'the provider said
    no' from 'the provider is unreachable' — the second one is a transport failure
    and raises ServiceError with the provider's name attached.

    `raw=True` sends `payload` as bytes instead of JSON-encoding it. That exists for
    the storage upload, where the body *is* the image; everything else speaks JSON
    and should leave it alone."""
    if query:
        pairs = {
            key: value
            if isinstance(value, str)
            else json.dumps(value)
            for key, value in query.items()
            if value is not None
        }
        url = f"{url}{'&' if '?' in url else '?'}{urllib.parse.urlencode(pairs)}"

    data: bytes | None = None
    request_headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    request_headers.update(headers or {})
    if payload is not None:
        if raw:
            data = payload if isinstance(payload, bytes) else str(payload).encode("utf-8")
        else:
            data = json.dumps(payload).encode("utf-8")
            request_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, _decode(response.read())
    except urllib.error.HTTPError as error:
        body = _decode(error.read())
        return error.code, body
    except (urllib.error.URLError, TimeoutError) as error:
        reason = getattr(error, "reason", error)
        raise ServiceError(
            f"{provider} could not be reached: {reason}",
            status=502,
            source=provider,
            detail={"url": url},
        ) from error


def _decode(raw: bytes) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {"raw": raw.decode("utf-8", "replace")[:2000]}


def message_from(body: Any) -> str | None:
    """Best-effort extraction of a provider's human message, without inventing one."""
    if isinstance(body, str):
        return body[:500]
    if isinstance(body, dict):
        for key in ("message", "error_description", "msg", "detail"):
            value = body.get(key)
            if isinstance(value, str):
                return value
        error = body.get("error")
        if isinstance(error, dict):
            return message_from(error)
        if isinstance(error, str):
            return error
    return None


def signature_matches(secret: str, raw_body: bytes, header_value: str) -> bool:
    """sha256=… style HMAC comparison, constant time."""
    if not header_value:
        return False
    supplied = header_value.split("=", 1)[-1].strip().lower()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(supplied, expected)


def normalise_phone(raw: str) -> str | None:
    """Nigerian-friendly E.164 normalisation. Returns None when the number cannot be
    made international, instead of guessing a country code silently."""
    digits = re.sub(r"[^\d+]", "", raw or "")
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if digits.startswith("+"):
        return digits if E164.match(digits) else None
    if digits.startswith("234") and E164.match(f"+{digits}"):
        return f"+{digits}"
    if digits.startswith("0") and digits[1:].isdigit():
        candidate = f"+234{digits[1:]}"
        return candidate if E164.match(candidate) else None
    if digits.isdigit() and E164.match(f"+234{digits}"):
        return f"+234{digits}"
    return None
