"""Supabase gateway: the only place that talks to PostgREST and GoTrue.

The service is a *pass-through with a view*, not a privilege. Requests carry the
caller's own bearer token whenever one exists, so RLS decides what the portal can
see — exactly like the Android client. The service-role key is used only for
explicitly server-side jobs (sign-up side effects, mail fan-out) and its use is
reported in /api/status so nobody has to guess whether the portal is bypassing RLS.
"""
from __future__ import annotations

from typing import Any

from .config import Config
from .support import ServiceError, http_json, message_from


class Supabase:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    @property
    def configured(self) -> bool:
        return bool(self.cfg.supabase_url) and self.cfg.has("SUPABASE_ANON_KEY")

    def _headers(self, token: str | None, *, service: bool = False) -> dict[str, str]:
        if not self.configured:
            raise ServiceError(
                "No Supabase project is configured. Set SUPABASE_URL and "
                "SUPABASE_ANON_KEY; the portal shows an empty board rather than "
                "inventing one.",
                status=503,
                source="supabase",
            )
        key = self.cfg.service_role_key if (service and self.cfg.service_role_key) else self.cfg.anon_key
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {token or key}",
            "Content-Type": "application/json",
        }
        return headers

    def _require(self, token: str | None) -> str:
        if not token:
            raise ServiceError(
                "Sign in first: this request needs your access token so row-level "
                "security can decide what you may see.",
                status=401,
                source="supabase",
            )
        return token

    def rpc(
        self, name: str, payload: dict[str, Any], token: str | None, *, service: bool = False
    ) -> Any:
        status, body = http_json(
            "POST",
            f"{self.cfg.supabase_url}/rest/v1/rpc/{name}",
            provider="supabase",
            headers=self._headers(token, service=service),
            payload=payload,
        )
        return self._unwrap(status, body, f"rpc {name}")

    def select(
        self, table: str, query: str, token: str | None, *, service: bool = False
    ) -> Any:
        status, body = http_json(
            "GET",
            f"{self.cfg.supabase_url}/rest/v1/{table}?{query}",
            provider="supabase",
            headers=self._headers(token, service=service),
        )
        return self._unwrap(status, body, f"select {table}")

    def insert_row(
        self, table: str, payload: dict[str, Any], token: str | None
    ) -> Any:
        headers = self._headers(token)
        headers["Prefer"] = "return=representation"
        status, body = http_json(
            "POST",
            f"{self.cfg.supabase_url}/rest/v1/{table}",
            provider="supabase",
            headers=headers,
            payload=payload,
        )
        return self._unwrap(status, body, f"insert {table}")

    def sign_in(self, email: str, password: str) -> dict[str, Any]:
        status, body = http_json(
            "POST",
            f"{self.cfg.supabase_url}/auth/v1/token?grant_type=password",
            provider="supabase-auth",
            headers=self._headers(None),
            payload={"email": email, "password": password},
        )
        if status != 200 or not isinstance(body, dict) or "access_token" not in body:
            raise ServiceError(
                message_from(body) or f"Sign-in was rejected (status {status}).",
                status=401,
                source="supabase-auth",
            )
        return {
            "access_token": body["access_token"],
            "refresh_token": body.get("refresh_token"),
            "expires_in": body.get("expires_in"),
            "user_id": (body.get("user") or {}).get("id"),
            "email": (body.get("user") or {}).get("email"),
        }

    def sign_up(self, email: str, password: str) -> dict[str, Any]:
        status, body = http_json(
            "POST",
            f"{self.cfg.supabase_url}/auth/v1/signup",
            provider="supabase-auth",
            headers=self._headers(None),
            payload={"email": email, "password": password},
        )
        if status not in (200, 201) or not isinstance(body, dict):
            raise ServiceError(
                message_from(body) or f"Sign-up was rejected (status {status}).",
                status=400,
                source="supabase-auth",
            )
        if "access_token" in body:
            return {
                "access_token": body["access_token"],
                "refresh_token": body.get("refresh_token"),
                "user_id": (body.get("user") or {}).get("id"),
                "email": (body.get("user") or {}).get("email") or body.get("email"),
                "needs_confirmation": False,
            }
        return {
            "access_token": None,
            "user_id": (body.get("user") or {}).get("id"),
            "email": (body.get("user") or {}).get("email"),
            "needs_confirmation": True,
            "note": "The project requires email confirmation: verify the message, "
            "then sign in.",
        }

    def patch_row(
        self, table: str, filter_query: str, payload: dict[str, Any], token: str | None
    ) -> Any:
        """PATCH with Prefer: return=representation, so the caller sees what Postgres
        finally kept — the guards may legitimately reject or rewrite a column."""
        headers = self._headers(token)
        headers["Prefer"] = "return=representation"
        status, body = http_json(
            "PATCH",
            f"{self.cfg.supabase_url}/rest/v1/{table}?{filter_query}",
            provider="supabase",
            headers=headers,
            payload=payload,
        )
        return self._unwrap(status, body, f"update {table}")

    def _unwrap(self, status: int, body: Any, label: str) -> Any:
        if 200 <= status < 300:
            return body
        message = message_from(body) or f"Supabase refused {label} (status {status})."
        # PostgREST nests the useful text under error.message; keep the code too.
        code = None
        if isinstance(body, dict) and isinstance(body.get("error"), dict):
            code = body["error"].get("code")
        raise ServiceError(
            message,
            status=502 if status >= 500 else status,
            source="supabase",
            detail={"rpc": label, "code": code, "http_status": status},
        )
