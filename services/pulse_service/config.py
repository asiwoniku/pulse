"""Configuration and the provider registry.

Two rules drive this file. First: a provider is `configured` only when every
variable it actually needs is present and non-placeholder — an empty string or the
literal `changeme` is not a credential. Second: the service never infers that a
provider works because a request succeeded somewhere else; `configured` is derived
from configuration, and every response that depends on it says which mode produced
it.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PLACEHOLDERS = {"", "changeme", "your-key", "todo", "none", "null", "x"}


def _real(value: str | None) -> bool:
    return bool(value) and value.strip().lower() not in PLACEHOLDERS


def load_dotenv(*paths: Path) -> list[str]:
    """Populate os.environ from the first existing .env files. Existing real
    environment variables always win, so a deployment can override the file."""
    loaded: list[str] = []
    for path in paths:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
                loaded.append(key)
    return loaded


@dataclass(frozen=True)
class Provider:
    """One integration, described the same way in code, in /api/status, and in the
    portal checklist, so those three can never disagree."""

    key: str
    title: str
    unlocks: str
    requires: tuple[str, ...]
    docs: str
    optional: tuple[str, ...] = ()
    needs_dependency: tuple[str, ...] = ()
    offline_note: str = ""

    def missing(self, env: dict[str, str]) -> list[str]:
        return [name for name in self.requires if not _real(env.get(name))]

    def status(self, env: dict[str, str]) -> dict[str, Any]:
        missing = self.missing(env)
        provider = env.get("MAPS_PROVIDER", "").strip().lower()
        # Maps keys are provider-specific; the generic MAPS_API_KEY also counts.
        if self.key.startswith("maps:") and provider and provider in self.key:
            missing = [
                name
                for name in missing
                if not (name.endswith("_API_KEY") and _real(env.get("MAPS_API_KEY")))
            ]
        configured = not missing
        state = "live" if configured else "unconfigured"
        if not configured and self.needs_dependency:
            state = "needs_dependency"
        return {
            "key": self.key,
            "title": self.title,
            "unlocks": self.unlocks,
            "state": state,
            "configured": configured,
            "missing_env": missing,
            "optional_env": [n for n in self.optional if _real(env.get(n))],
            "needs_dependency": list(self.needs_dependency),
            "offline_note": self.offline_note,
            "docs": self.docs,
        }


PROVIDERS: tuple[Provider, ...] = (
    Provider(
        key="supabase",
        title="Supabase project (Postgres + auth)",
        unlocks="every read and every RPC: orders, assignments, transitions, RLS",
        requires=("SUPABASE_URL", "SUPABASE_ANON_KEY"),
        docs="supabase/README.md",
        optional=("SUPABASE_SERVICE_ROLE_KEY",),
        offline_note="Nothing works without this. The portal shows an empty board "
        "rather than sample orders.",
    ),
    Provider(
        key="maps:nominatim",
        title="OpenStreetMap Nominatim geocoder",
        unlocks="address text -> coordinates for pickup and destination",
        requires=("NOMINATIM_USER_AGENT",),
        docs="https://nominatim.org/release-docs/latest/api/Search/",
        optional=("GEO_COUNTRY_CODES",),
        offline_note="Free and keyless, but the usage policy requires a real "
        "identifying User-Agent and no more than one request per second.",
    ),
    Provider(
        key="maps:mapbox",
        title="Mapbox geocoding + directions",
        unlocks="coordinates, distance, and drive-time ETA for a route",
        requires=("MAPBOX_ACCESS_TOKEN",),
        docs="https://docs.mapbox.com/api/navigation/directions/",
        optional=("MAPS_API_KEY",),
        offline_note="Set MAPS_PROVIDER=mapbox to select it as the active provider.",
    ),
    Provider(
        key="maps:google",
        title="Google Maps Routes + Geocoding",
        unlocks="coordinates, distance, traffic-aware ETA",
        requires=("GOOGLE_MAPS_API_KEY",),
        docs="https://developers.google.com/maps/documentation/routes",
        optional=("MAPS_API_KEY",),
        offline_note="Set MAPS_PROVIDER=google. Needs a billing account, so the free "
        "monthly credit is a limit worth watching.",
    ),
    Provider(
        key="maps:osrm",
        title="Self-hosted or demo OSRM",
        unlocks="distance and ETA with no key at all",
        requires=("OSRM_BASE_URL",),
        docs="http://project-osrm.org/docs/v5.24.0/api/",
        offline_note="Set MAPS_PROVIDER=osrm. The public demo server is fine for "
        "development and unacceptable in production.",
    ),
    Provider(
        key="payments:paystack",
        title="Paystack transaction verification",
        unlocks="checking a payment reference before a human marks it paid",
        requires=("PAYSTACK_SECRET_KEY",),
        docs="https://paystack.com/docs/api/transaction/#verify",
        optional=("PAYSTACK_WEBHOOK_SECRET",),
        offline_note="The database still records payment through "
        "mark_payment_paid() by staff; this only verifies somebody's claim.",
    ),
    Provider(
        key="payments:flutterwave",
        title="Flutterwave transaction verification",
        unlocks="checking a transaction id or tx_ref against the provider",
        requires=("FLUTTERWAVE_SECRET_KEY",),
        docs="https://developer.flutterwave.com/reference/api-verification",
        offline_note="Same as Paystack: verification informs a human, it does not "
        "silently move payment_status.",
    ),
    Provider(
        key="whatsapp:parse",
        title="WhatsApp order text parser",
        unlocks="a customer message becomes an order draft, entirely offline",
        requires=(),
        docs="docs/api.md",
        offline_note="Runs on this machine: E.164 phone detection, pickup and "
        "destination, item hints. Output is a draft, never a created order.",
    ),
    Provider(
        key="whatsapp:cloud",
        title="WhatsApp Cloud API (outbound + webhook)",
        unlocks="sending job updates and receiving inbound messages signed by Meta",
        requires=("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"),
        docs="https://developers.facebook.com/docs/whatsapp/cloud-api",
        optional=("WHATSAPP_APP_SECRET",),
        offline_note="Without WHATSAPP_APP_SECRET the webhook cannot verify Meta's "
        "signature, so inbound deliveries are refused rather than trusted.",
    ),
    Provider(
        key="push:fcm",
        title="Firebase Cloud Messaging v1",
        unlocks="driver and dispatcher notifications on the Android app",
        requires=("FCM_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_FILE"),
        docs="https://firebase.google.com/docs/cloud-messaging/http-server-protocol",
        needs_dependency=("google-auth",),
        offline_note="An OAuth2 access token needs an RS256 signature, which the "
        "standard library cannot produce. Install google-auth, or keep devices "
        "registered and silent.",
    ),
    Provider(
        key="mail:smtp",
        title="SMTP for worker invitations",
        unlocks="invitation codes reach the worker instead of being read aloud",
        requires=("SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD", "MAIL_FROM"),
        docs="https://docs.python.org/3/library/smtplib.html",
        optional=("SMTP_PORT", "MAIL_INVITE_URL"),
        offline_note="Codes are always created in the database first. Without SMTP "
        "the portal displays the code for hand-off and says delivery is manual.",
    ),
    Provider(
        key="realtime",
        title="Supabase realtime publication",
        unlocks="push-on-change board instead of a 20 second poll",
        requires=("SUPABASE_URL", "SUPABASE_ANON_KEY", "REALTIME_ENABLED"),
        docs="supabase/migrations/0016_privileges_realtime_storage.sql",
        offline_note="Until 0016 is applied and the publication lists the watched "
        "tables, the portal polls and labels itself polling.",
    ),
)


@dataclass
class Config:
    env: dict[str, str]
    dotenv_keys: tuple[str, ...] = ()

    def get(self, name: str, default: str = "") -> str:
        return (self.env.get(name) or default).strip()

    def has(self, name: str) -> bool:
        return _real(self.env.get(name))

    @property
    def supabase_url(self) -> str:
        return self.get("SUPABASE_URL").rstrip("/")

    @property
    def anon_key(self) -> str:
        return self.get("SUPABASE_ANON_KEY")

    @property
    def service_role_key(self) -> str:
        return self.get("SUPABASE_SERVICE_ROLE_KEY")

    @property
    def maps_provider(self) -> str:
        return (self.get("MAPS_PROVIDER") or "nominatim").lower()

    def provider_status(self) -> list[dict[str, Any]]:
        return [provider.status(self.env) for provider in PROVIDERS]

    def is_live(self, key: str) -> bool:
        return any(p.key == key and not p.missing(self.env) for p in PROVIDERS)

    def public_status(self) -> dict[str, Any]:
        """What /api/status returns. Never contains a secret: only variable names
        and presence, which is exactly the checklist the portal renders."""
        providers = self.provider_status()
        return {
            "service": "pulse-local",
            "supabase_configured": self.is_live("supabase"),
            "supabase_url_present": bool(self.supabase_url),
            "using_service_role": self.has("SUPABASE_SERVICE_ROLE_KEY"),
            "active_maps_provider": self.maps_provider,
            "providers": providers,
            "live": sorted(p["key"] for p in providers if p["configured"]),
            "missing": sorted(p["key"] for p in providers if not p["configured"]),
            "dotenv_keys_loaded": list(self.dotenv_keys),
        }


def load(root: Path | None = None) -> Config:
    here = root or Path(__file__).resolve().parents[1]
    repo_root = here.parent
    keys = tuple(load_dotenv(here / ".env", repo_root / ".env", Path.cwd() / ".env"))
    return Config(env=dict(os.environ), dotenv_keys=keys)
