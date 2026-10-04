"""HTTP API. Handlers are plain functions: (cfg, request) -> (status, json).

Design: the portal speaks the same contract as the Android client. Writes are either
an allow-listed Postgres RPC or a column-restricted PATCH, both forwarded with the
caller's own bearer token, so the database — not this service — decides permission.
Anything computed here (joins, geocoding, parsing) is labelled with the provider or
`mode` that produced it.
"""
from __future__ import annotations

import json
import re
import urllib.parse
from dataclasses import dataclass, field
from typing import Any, Callable

from .config import Config
from .supabase import Supabase
from .support import ServiceError
from .providers import mailer, maps, payments, push, whatsapp, whatsapp_cloud

# Transitions only, for dimming buttons. The database remains the authority:
# migration 0006's guard_order_status_change() rejects anything illegal, and this
# table is a mirror, not a check. order_transition_edges() is preferred when live.
MIRROR_EDGES: dict[str, list[str]] = {
    "requested": ["under_review", "quoted", "accepted", "assigned", "cancelled", "failed"],
    "under_review": ["quoted", "cancelled", "failed"],
    "quoted": ["awaiting_customer_approval", "accepted", "cancelled", "failed"],
    "awaiting_customer_approval": ["accepted", "cancelled", "failed"],
    "accepted": ["assigned", "cancelled", "failed"],
    "assigned": ["driver_accepted", "cancelled", "failed"],
    "driver_accepted": ["driver_arrived", "at_pickup", "cancelled", "failed"],
    "driver_arrived": ["at_pickup", "pickup_attempt_failed", "cancelled", "failed"],
    "at_pickup": ["picked_up", "pickup_attempt_failed", "cancelled", "failed"],
    "picked_up": ["in_transit", "cancelled", "failed"],
    "in_transit": ["arrival_attempted", "delivered", "cancelled", "failed"],
    "arrival_attempted": ["in_transit", "delivered", "failed", "cancelled"],
    "pickup_attempt_failed": ["requested", "assigned", "cancelled", "failed"],
    "delivered": ["completed"],
    "completed": [],
    "cancelled": [],
    "failed": [],
}
DRIVER_STAGES = {
    "assigned", "driver_accepted", "driver_arrived", "at_pickup", "picked_up",
    "in_transit", "arrival_attempted", "delivered",
}
ALLOWED_RPC = {
    "create_business",
    "invite_worker",
    "accept_invitation",
    "register_device",
    "create_delivery_order",
    "assign_driver",
    "cancel_assignment",
    "respond_to_assignment",
    "record_delivery_attempt",
    "capture_proof_of_delivery",
    "set_driver_availability",
    # Marketplace and shipment RPCs (0017-0022). browse_carriers is a directory read, not a proxy:
    # it returns named columns only and is the sole way one business can see
    # another. create_business now also takes p_kind / p_phone_e164.
    "browse_carriers",
    "create_delivery_offer",
    "respond_to_offer",
    "withdraw_offer",
    "expire_stale_offers",
    "record_shipment_event",
}
PATCHABLE_COLUMNS = {
    "status",
    "price_amount",
    "currency",
    "payment_status",
    "payment_method",
    "scheduled_at",
    "promised_at",
    "internal_notes",
    "cancel_reason",
}


@dataclass
class Request:
    cfg: Config
    method: str
    path: str
    query: dict[str, str] = field(default_factory=dict)
    body: dict[str, Any] = field(default_factory=dict)
    raw: bytes = b""
    token: str | None = None
    headers: dict[str, str] = field(default_factory=dict)
    params: dict[str, str] = field(default_factory=dict)

    def need_token(self) -> str:
        if not self.token:
            raise ServiceError(
                "Sign in first: this request is answered by Postgres under "
                "row-level security, using your own token.",
                status=401,
                source="pulse",
            )
        return self.token

    def db(self) -> Supabase:
        return Supabase(self.cfg)


Handler = Callable[[Request], tuple[int, Any]]
_ROUTES: list[tuple[str, re.Pattern[str], Handler]] = []


def route(spec: str) -> Callable[[Handler], Handler]:
    method, _, pattern = spec.partition(" ")

    def register(handler: Handler) -> Handler:
        regex = re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern) + "$")
        _ROUTES.append((method.upper(), regex, handler))
        return handler

    return register


def handle(
    cfg: Config,
    method: str,
    path: str,
    *,
    query: str = "",
    body: dict[str, Any] | None = None,
    raw: bytes = b"",
    token: str | None = None,
    headers: dict[str, str] | None = None,
    user_agent: str = "",
) -> tuple[int, Any]:
    parsed = {
        key: values[0]
        for key, values in urllib.parse.parse_qs(query, keep_blank_values=True).items()
    }
    for registered_method, regex, handler in _ROUTES:
        match = regex.match(path)
        if not match:
            continue
        if registered_method != method.upper():
            raise ServiceError(
                f"{path} only accepts {registered_method}.", status=405, source="pulse"
            )
        request = Request(
            cfg=cfg,
            method=method.upper(),
            path=path,
            query=parsed,
            body=body or {},
            raw=raw,
            token=token,
            headers=headers or {},
            params=match.groupdict(),
        )
        return handler(request)

    if path == "/api":
        return 200, {"service": "pulse-local", "hint": "GET /api/status"}
    raise ServiceError(f"No such endpoint: {method} {path}", status=404, source="pulse")


@route("GET /api/health")
def _health(request: Request) -> tuple[int, Any]:
    return 200, {"ok": True, "supabase": request.cfg.supabase_url or None}


@route("GET /api/status")
def _status(request: Request) -> tuple[int, Any]:
    status = request.cfg.public_status()
    status["transitions"] = {
        "source": "mirror of migration 0006 / order_transition_edges()",
        "authority": "Postgres guard_order_status_change()",
        "edges": MIRROR_EDGES,
        "driver_stages": sorted(DRIVER_STAGES),
    }
    status["allowed_rpc"] = sorted(ALLOWED_RPC)
    status["patchable_columns"] = sorted(PATCHABLE_COLUMNS)
    return 200, status


@route("POST /api/graph/transitions")
def _graph(request: Request) -> tuple[int, Any]:
    """Authoritative edges when the project is reachable, mirror otherwise."""
    try:
        rows = request.db().rpc("order_transition_edges", {}, request.token)
        if isinstance(rows, list) and rows:
            edges: dict[str, list[str]] = {}
            for row in rows:
                edges.setdefault(str(row.get("from_status")), []).append(
                    str(row.get("to_status"))
                )
            return 200, {"source": "order_transition_edges()", "edges": edges}
    except ServiceError as error:
        return 200, {
            "source": "mirror (function not reachable for this caller)",
            "edges": MIRROR_EDGES,
            "why": error.message,
        }
    return 200, {"source": "mirror", "edges": MIRROR_EDGES}


@route("POST /api/imports/whatsapp")
def _parse_whatsapp(request: Request) -> tuple[int, Any]:
    return 200, whatsapp.parse(
        str(request.body.get("text") or ""),
        default_phone=str(request.body.get("default_phone") or "") or None,
    )


@route("POST /api/geo/geocode")
def _geocode(request: Request) -> tuple[int, Any]:
    return 200, maps.geocode(request.cfg, str(request.body.get("text") or ""))


@route("POST /api/geo/route")
def _route_eta(request: Request) -> tuple[int, Any]:
    cfg = request.cfg
    origin = request.body.get("origin")
    destination = request.body.get("destination")
    if not isinstance(origin, str) or not isinstance(destination, str):
        raise ServiceError(
            "Send origin and destination as address strings; each is geocoded first.",
            source="maps",
        )
    origin_point = maps.geocode(cfg, origin)
    destination_point = maps.geocode(cfg, destination)
    result = maps.route(cfg, origin_point, destination_point)
    return 200, {**result, "origin": origin_point, "destination": destination_point}


@route("POST /api/payments/verify")
def _verify_payment(request: Request) -> tuple[int, Any]:
    return 200, payments.verify(
        request.cfg,
        reference=str(request.body.get("reference") or ""),
        transaction_id=str(request.body.get("transaction_id") or ""),
    )


@route("POST /api/messaging/whatsapp")
def _send_whatsapp(request: Request) -> tuple[int, Any]:
    request.need_token()  # an open mail/SMS relay on a laptop would be a liability
    return 200, whatsapp_cloud.send_text(
        request.cfg,
        str(request.body.get("to") or ""),
        str(request.body.get("body") or ""),
    )


@route("POST /api/messaging/push")
def _send_push(request: Request) -> tuple[int, Any]:
    request.need_token()
    return 200, push.send(
        request.cfg,
        str(request.body.get("push_token") or ""),
        str(request.body.get("title") or "Pulse"),
        str(request.body.get("body") or ""),
    )


@route("POST /api/webhooks/whatsapp")
def _whatsapp_webhook(request: Request) -> tuple[int, Any]:
    """Verify Meta's signature, parse the text, and return the draft. Nothing here
    writes: inbound messages become suggestions a dispatcher accepts or ignores."""
    signature = request.headers.get("HTTP_X_HUB_SIGNATURE_256", "")
    whatsapp_cloud.verify_webhook(request.cfg, request.raw, signature)
    payload = json.loads(request.raw.decode("utf-8")) if request.raw else {}
    messages = whatsapp_cloud.parse_inbound(payload)
    drafts = [
        {
            "from": message.get("from"),
            "contact_name": message.get("contact_name"),
            "parsed": whatsapp.parse(str(message.get("text") or "")),
        }
        for message in messages
    ]
    return 200, {"verified": True, "drafts": drafts, "persisted": False}


ORDER_COLUMNS = (
    "id,business_id,reference,status,source,service_type,description,parcel_details,"
    "pickup_text,destination_text,pickup_location_id,destination_location_id,"
    "requested_at,scheduled_at,promised_at,price_amount,currency,payment_status,"
    "payment_method,customer_id,tracking_token,created_at,status_changed_at"
)
# The board renders the most recent orders for one workspace. It is a window, not
# the whole truth, so the response has to say so whenever the window is short.
BOARD_LIMIT = 50


def _in_filter(values: list[str]) -> str:
    return "in.(" + ",".join(str(value) for value in values) + ")"


def _edges_for(request: Request) -> dict[str, list[str]]:
    """Prefer the database's own edge list; fall back to the mirror, and say which."""
    try:
        rows = request.db().rpc("order_transition_edges", {}, request.token)
        if isinstance(rows, list) and rows:
            edges: dict[str, list[str]] = {}
            for row in rows:
                edges.setdefault(str(row.get("from_status")), []).append(
                    str(row.get("to_status"))
                )
            return edges
    except ServiceError:
        pass
    return MIRROR_EDGES


@route("POST /api/auth/signin")
def _signin(request: Request) -> tuple[int, Any]:
    return 200, request.db().sign_in(
        str(request.body.get("email") or ""), str(request.body.get("password") or "")
    )


@route("POST /api/auth/oauth/{provider}")
def _oauth_start(request: Request) -> tuple[int, Any]:
    provider = request.params["provider"].strip().lower()
    supabase_provider = {"google": "google", "microsoft": "azure"}.get(provider)
    if not supabase_provider:
        raise ServiceError("Choose Google or Microsoft to continue.", source="pulse")
    if not request.cfg.is_live("supabase"):
        raise ServiceError(
            "Social sign-in is unavailable until SUPABASE_URL and SUPABASE_ANON_KEY are configured.",
            status=503,
            source="supabase-auth",
        )

    origin = request.headers.get("HTTP_ORIGIN", "").rstrip("/")
    host = request.headers.get("HTTP_HOST", "").strip()
    parsed_origin = urllib.parse.urlsplit(origin)
    local_hosts = {"localhost", "127.0.0.1", "::1"}
    local_origin = (parsed_origin.hostname or "").lower() in local_hosts
    if (
        not origin
        or not host
        or parsed_origin.netloc.lower() != host.lower()
        or parsed_origin.scheme not in ({"http", "https"} if local_origin else {"https"})
        or parsed_origin.username
        or parsed_origin.password
    ):
        raise ServiceError(
            "Social sign-in must be started from this secure Pulse website.",
            status=400,
            source="supabase-auth",
        )

    query_values = {
        "provider": supabase_provider,
        "redirect_to": f"{origin}/",
        "apikey": request.cfg.anon_key,
    }
    if supabase_provider == "azure":
        query_values["scopes"] = "email"
    query = urllib.parse.urlencode(query_values)
    return 200, {
        "authorization_url": f"{request.cfg.supabase_url}/auth/v1/authorize?{query}",
        "provider": provider,
        "note": (
            "This provider must be enabled in Supabase Auth, and this site's redirect "
            "URL must be allowed in the Supabase URL configuration."
        ),
    }


@route("POST /api/auth/signup")
def _signup(request: Request) -> tuple[int, Any]:
    return 201, request.db().sign_up(
        str(request.body.get("email") or ""), str(request.body.get("password") or "")
    )


@route("GET /api/businesses")
def _businesses(request: Request) -> tuple[int, Any]:
    token = request.need_token()
    db = request.db()
    ids = db.rpc("current_business_ids", {}, token) or []
    if not isinstance(ids, list) or not ids:
        return 200, {
            "businesses": [],
            "note": "This account belongs to no workspace yet. Create one with the "
            "form; create_business() is the only way a business row exists.",
        }
    rows = db.select(
        "businesses",
        f"select=id,name,phone_e164,email,city,country_code,timezone,currency,"
        f"service_areas,kind,is_active"
        f"&id={_in_filter(ids)}&order=name.asc",
        token,
    )
    members = db.select(
        "business_members",
        f"select=business_id,role,is_active,joined_at&business_id={_in_filter(ids)}",
        token,
    )
    roles = {row["business_id"]: row["role"] for row in members or []}
    for row in rows or []:
        row["my_role"] = roles.get(row["id"])
    return 200, {"businesses": rows or [], "source": "supabase"}


@route("GET /api/board")
def _board(request: Request) -> tuple[int, Any]:
    """Orders for one workspace, joined in Python from separate RLS-filtered reads.

    Four small selects instead of one embedded query keeps this readable, and every
    row still came from Postgres under the caller's token — an empty board is a real
    answer, never a cue to show sample data.
    """
    token = request.need_token()
    db = request.db()
    business_id = request.query.get("business_id", "").strip()
    if not business_id:
        raise ServiceError("business_id is required.", source="pulse")

    # One row beyond the window is fetched purely to detect truncation. A board that
    # quietly shows 50 of 300 orders is indistinguishable from a workspace holding 50
    # orders, and a dispatcher would act on the short list as if it were everything.
    fetched = db.select(
        "orders",
        f"select={ORDER_COLUMNS}&business_id=eq.{business_id}"
        f"&order=created_at.desc&limit={BOARD_LIMIT + 1}",
        token,
    ) or []
    truncated = len(fetched) > BOARD_LIMIT
    orders = fetched[:BOARD_LIMIT]

    customer_ids = sorted({o["customer_id"] for o in orders if o.get("customer_id")})
    order_ids = [o["id"] for o in orders]

    customers = (
        db.select(
            "customers",
            f"select=id,display_name,phone_e164,city&id={_in_filter(customer_ids)}",
            token,
        )
        if customer_ids
        else []
    )
    # Saved places are few per workspace, so read them all rather than build a huge
    # in.() list; RLS still decides which ones come back.
    locations = (
        db.select(
            "locations",
            f"select=id,label,address_line,city,lat,lng&business_id=eq.{business_id}"
            f"&order=label.asc&limit=200",
            token,
        )
        if orders
        else []
    )
    assignments = (
        db.select(
            "driver_assignments",
            f"select=id,order_id,driver_id,status,assignment_type,is_current,scheduled_start"
            f"&order_id={_in_filter(order_ids)}&is_current=is.true",
            token,
        )
        if order_ids
        else []
    )
    driver_ids = sorted({a["driver_id"] for a in assignments or [] if a.get("driver_id")})
    drivers = (
        db.select(
            "drivers",
            f"select=id,full_name,status,phone_e164,average_rating&id={_in_filter(driver_ids)}",
            token,
        )
        if driver_ids
        else []
    )

    by_customer = {row["id"]: row for row in customers or []}
    by_location = {row["id"]: row for row in locations or []}
    by_driver = {row["id"]: row for row in drivers or []}
    by_order: dict[str, list[dict[str, Any]]] = {}
    for assignment in assignments or []:
        by_order.setdefault(assignment["order_id"], []).append(assignment)

    edges = _edges_for(request)
    counts: dict[str, int] = {}
    rows: list[dict[str, Any]] = []
    for order in orders:
        status = str(order.get("status"))
        counts[status] = counts.get(status, 0) + 1
        order["customer"] = by_customer.get(order.get("customer_id") or "")
        order["pickup_location"] = by_location.get(order.get("pickup_location_id") or "")
        order["destination_location"] = by_location.get(
            order.get("destination_location_id") or ""
        )
        order["current_assignments"] = by_order.get(order["id"], [])
        order["driver_names"] = sorted(
            {
                by_driver.get(item.get("driver_id"), {}).get("full_name")
                for item in order["current_assignments"]
            }
            - {None}
        )
        order["allowed_next"] = edges.get(status, [])
        order["driver_stage"] = status in DRIVER_STAGES
        rows.append(order)

    return 200, {
        "business_id": business_id,
        "orders": rows,
        "counts": counts,
        "limit": BOARD_LIMIT,
        "truncated": truncated,
        "transition_source": (
            "order_transition_edges()" if edges is not MIRROR_EDGES else "mirror"
        ),
        "drivers_available": db.select(
            "drivers",
            f"select=id,full_name,status,phone_e164&business_id=eq.{business_id}"
            f"&is_active=is.true&order=full_name.asc",
            token,
        )
        or [],
        "note": (
            f"Only the {BOARD_LIMIT} most recent orders are shown and this workspace has "
            "more, so these counts are not the workspace totals. RLS filtered every "
            "read with your token; assignments are the current ones only."
            if truncated
            else "RLS filtered every read with your token. Assignments are the current "
            "ones only."
        ),
    }


@route("GET /api/orders")
def _orders_list(request: Request) -> tuple[int, Any]:
    """Searchable, paginated order list. The board is a 50-row window of recent work;
    this is everything, so a dispatcher can find an order from last month."""
    token = request.need_token()
    business_id = str(request.query.get("business_id") or "").strip()
    if not business_id:
        raise ServiceError("business_id is required.", source="pulse")

    limit = max(1, min(int(request.query.get("limit") or 25), 100))
    offset = max(0, int(request.query.get("offset") or 0))
    search = str(request.query.get("q") or "").strip()
    status = str(request.query.get("status") or "").strip()

    clauses = [f"business_id=eq.{business_id}"]
    if status:
        clauses.append(f"status=eq.{status}")
    query = (
        f"select={ORDER_COLUMNS}&" + "&".join(clauses)
        + "&order=requested_at.desc,created_at.desc"
        # One row past the page proves whether another page exists, which is how the
        # client knows to offer "load more" without guessing.
        + f"&limit={limit + 1}&offset={offset}"
    )
    if search:
        # Reference, description and address text are matched in Postgres so the
        # filter runs there instead of downloading the whole workspace.
        needle = urllib.parse.quote(f"%{search}%")
        query += (
            f"&or=(reference.ilike.{needle},description.ilike.{needle}"
            f",pickup_text.ilike.{needle},destination_text.ilike.{needle})"
        )

    rows = request.db().select("orders", query, token) or []
    has_more = len(rows) > limit
    return 200, {
        "orders": rows[:limit],
        "limit": limit,
        "offset": offset,
        "has_more": has_more,
        "note": "RLS filtered every read with your token.",
    }


@route("GET /api/businesses/{business_id}/members")
def _members(request: Request) -> tuple[int, Any]:
    """The operator roster. RLS already limits this to a member of the business, and
    roles come from business_members rather than from anything the client sent."""
    token = request.need_token()
    business_id = request.params["business_id"]
    members = request.db().select(
        "business_members",
        f"select=id,business_id,user_id,role,is_active,joined_at"
        f"&business_id=eq.{business_id}&order=joined_at.asc&limit=200",
        token,
    ) or []
    ids = [str(row.get("user_id")) for row in members if row.get("user_id")]
    profiles: dict[str, Any] = {}
    if ids:
        found = request.db().select(
            "profiles",
            f"select=id,full_name,phone_e164,avatar_url&id={_in_filter(ids)}",
            token,
        ) or []
        profiles = {str(row.get("id")): row for row in found}
    invitations = request.db().select(
        "business_invitations",
        f"select=id,email,role,status,expires_at"
        f"&business_id=eq.{business_id}&status=eq.pending&order=created_at.desc",
        token,
    ) or []
    return 200, {
        "members": [
            {**row, "profile": profiles.get(str(row.get("user_id")))} for row in members
        ],
        "pending_invitations": invitations,
        "note": "Roles are read back from business_members; the database decides.",
    }


def _workspace_query(request: Request) -> tuple[str, str]:
    token = request.need_token()
    business_id = str(request.query.get("business_id") or "").strip()
    if not re.fullmatch(
        r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}",
        business_id,
    ):
        raise ServiceError("business_id must be a UUID.", source="pulse")
    return token, business_id


@route("GET /api/moving-requests")
def _moving_requests(request: Request) -> tuple[int, Any]:
    token, business_id = _workspace_query(request)
    db = request.db()
    rows = db.select(
        "moving_requests",
        "select=id,business_id,order_id,customer_id,status,origin_text,"
        "destination_text,preferred_date,survey_note,requires_survey,"
        "requires_packing,requires_unpacking,requires_crate_storage,has_stairs,"
        "has_elevator,quote_amount,currency,created_at,updated_at"
        f"&business_id=eq.{business_id}&order=created_at.desc&limit=101",
        token,
    ) or []
    has_more = len(rows) > 100
    rows = rows[:100]
    request_ids = [str(row["id"]) for row in rows]
    items = (
        db.select(
            "moving_items",
            "select=id,moving_request_id,name,quantity,condition_note,"
            f"handling_instruction,created_at&moving_request_id={_in_filter(request_ids)}"
            "&order=created_at.asc&limit=500",
            token,
        )
        if request_ids
        else []
    ) or []
    by_request: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        by_request.setdefault(str(item["moving_request_id"]), []).append(item)
    for row in rows:
        row["items"] = by_request.get(str(row["id"]), [])
    return 200, {
        "moving_requests": rows,
        "has_more": has_more,
        "note": "Moving requests and captured inventory are read under workspace RLS.",
    }


@route("POST /api/moving-requests")
def _moving_request_create(request: Request) -> tuple[int, Any]:
    token = request.need_token()
    body = request.body
    business_id = str(body.get("business_id") or "").strip()
    if not re.fullmatch(
        r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}",
        business_id,
    ):
        raise ServiceError("business_id must be a UUID.", source="pulse")
    origin = str(body.get("origin_text") or "").strip()
    destination = str(body.get("destination_text") or "").strip()
    if len(origin) < 3 or len(origin) > 500:
        raise ServiceError("Origin must be between 3 and 500 characters.", source="pulse")
    if len(destination) < 3 or len(destination) > 500:
        raise ServiceError(
            "Destination must be between 3 and 500 characters.", source="pulse"
        )

    payload: dict[str, Any] = {
        "business_id": business_id,
        "origin_text": origin,
        "destination_text": destination,
    }
    preferred_date = str(body.get("preferred_date") or "").strip()
    if preferred_date:
        try:
            from datetime import date
            date.fromisoformat(preferred_date)
        except ValueError as error:
            raise ServiceError("preferred_date must be an ISO date.", source="pulse") from error
        payload["preferred_date"] = preferred_date
    for key in (
        "requires_survey", "requires_packing", "requires_unpacking",
        "requires_crate_storage", "has_stairs", "has_elevator",
    ):
        value = body.get(key)
        if value is not None:
            if not isinstance(value, str) or value not in ("unset", "yes", "no"):
                raise ServiceError(f"{key} must be unset, yes, or no.", source="pulse")
            payload[key] = value
    currency = str(body.get("currency") or "NGN").strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", currency):
        raise ServiceError("currency must be a three-letter code.", source="pulse")
    payload["currency"] = currency

    rows = request.db().insert_row("moving_requests", payload, token) or []
    if not rows or not isinstance(rows[0], dict) or not rows[0].get("id"):
        raise ServiceError(
            "The database did not return the created moving request.",
            status=502,
            source="supabase",
        )
    return 201, {"moving_request": rows[0]}


@route("GET /api/payment-attempts")
def _payment_attempts(request: Request) -> tuple[int, Any]:
    token, business_id = _workspace_query(request)
    db = request.db()
    attempts = db.select(
        "payment_attempts",
        "select=id,business_id,order_id,provider,provider_reference,amount,currency,"
        "status,failure_reason,initiated_by,confirmed_by,created_at,updated_at,confirmed_at"
        f"&business_id=eq.{business_id}&order=created_at.desc&limit=101",
        token,
    ) or []
    has_more = len(attempts) > 100
    attempts = attempts[:100]
    order_ids = sorted({str(row["order_id"]) for row in attempts if row.get("order_id")})
    orders = (
        db.select(
            "orders",
            f"select=id,reference,status,payment_status&id={_in_filter(order_ids)}",
            token,
        )
        if order_ids
        else []
    ) or []
    order_map = {str(row["id"]): row for row in orders}
    for row in attempts:
        row["order"] = order_map.get(str(row.get("order_id")))
    return 200, {
        "payment_attempts": attempts,
        "has_more": has_more,
        "note": "These are recorded attempts only. No payment provider is configured.",
    }


@route("GET /api/notifications")
def _notifications(request: Request) -> tuple[int, Any]:
    token, business_id = _workspace_query(request)
    rows = request.db().select(
        "notifications",
        "select=id,order_id,channel,template_key,title,body,status,failure_reason,"
        f"created_at,sent_at&business_id=eq.{business_id}"
        "&order=created_at.desc&limit=50",
        token,
    ) or []
    return 200, {
        "notifications": rows,
        "note": "Delivery status is reported by the configured provider, if any.",
    }


@route("GET /api/audit-logs")
def _audit_logs(request: Request) -> tuple[int, Any]:
    token, business_id = _workspace_query(request)
    rows = request.db().select(
        "audit_logs",
        "select=id,actor_user_id,actor_kind,action,target_table,target_id,summary,"
        f"metadata,occurred_at&business_id=eq.{business_id}"
        "&order=occurred_at.desc&limit=100",
        token,
    ) or []
    return 200, {
        "audit_logs": rows,
        "note": "Audit history is append-only and limited to rows visible to your role.",
    }


@route("GET /api/order-feedback")
def _order_feedback(request: Request) -> tuple[int, Any]:
    token, business_id = _workspace_query(request)
    db = request.db()
    feedback = db.select(
        "order_feedback",
        "select=id,order_id,customer_id,driver_id,rating,comment,created_at"
        f"&business_id=eq.{business_id}&order=created_at.desc&limit=101",
        token,
    ) or []
    has_more = len(feedback) > 100
    feedback = feedback[:100]
    order_ids = sorted({str(row["order_id"]) for row in feedback if row.get("order_id")})
    orders = (
        db.select(
            "orders",
            f"select=id,reference,status&id={_in_filter(order_ids)}",
            token,
        )
        if order_ids
        else []
    ) or []
    order_map = {str(row["id"]): row for row in orders}
    for row in feedback:
        row["order"] = order_map.get(str(row.get("order_id")))
    return 200, {
        "feedback": feedback,
        "has_more": has_more,
        "note": "Ratings are derived only from feedback on completed orders.",
    }


@route("GET /api/documents")
def _documents(request: Request) -> tuple[int, Any]:
    token, business_id = _workspace_query(request)
    db = request.db()
    shipments = db.select(
        "pulse_shipments",
        "select=id,pulse_shipment_id,order_id,business_id,originator_business_id,"
        f"created_at&or=(business_id.eq.{business_id},originator_business_id.eq.{business_id})"
        "&order=created_at.desc&limit=101",
        token,
    ) or []
    has_more = len(shipments) > 100
    shipments = shipments[:100]
    shipment_ids = [str(row["id"]) for row in shipments]
    events = (
        db.select(
            "pulse_shipment_events",
            "select=event_id,shipment_id,event_type,source_type,occurred_at,received_at,"
            "location,verification_status"
            f"&shipment_id={_in_filter(shipment_ids)}"
            "&event_type=eq.proof_of_delivery_uploaded&order=occurred_at.desc&limit=500",
            token,
        )
        if shipment_ids
        else []
    ) or []
    shipment_map = {str(row["id"]): row for row in shipments}
    documents = [
        {**event, "shipment": shipment_map.get(str(event["shipment_id"]))}
        for event in events
        if event.get("shipment_id") in shipment_map
    ]
    return 200, {
        "documents": documents,
        "shipments_scanned": len(shipments),
        "has_more": has_more,
        "note": "This index lists recorded proof-of-delivery events; it does not expose private file contents.",
    }


@route("PATCH /api/businesses/{business_id}")
def _patch_business(request: Request) -> tuple[int, Any]:
    """Company profile edit. Only the columns a business may set about itself; kind,
    role and membership are structural and cannot be changed from here."""
    token = request.need_token()
    business_id = request.params["business_id"]
    editable = {
        "name", "phone_e164", "email", "city", "country_code",
        "timezone", "currency", "service_areas", "is_active",
    }
    payload = {key: value for key, value in request.body.items() if key in editable}
    dropped = sorted(set(request.body) - set(payload))
    if not payload:
        raise ServiceError(
            "Nothing to update.", source="pulse", detail={"editable": sorted(editable)}
        )
    if "name" in payload and len(str(payload["name"]).strip()) < 2:
        raise ServiceError("A business name of at least 2 characters is required.", source="pulse")
    if "service_areas" in payload and not isinstance(payload["service_areas"], list):
        raise ServiceError("service_areas must be a list of text.", source="pulse")

    rows = request.db().patch_row("businesses", f"id=eq.{business_id}", payload, token)
    return 200, {
        "businesses": rows,
        "ignored_columns": dropped,
        "note": "businesses_update_owner (0014) decided whether this was allowed.",
    }


@route("GET /api/drivers")
def _drivers_list(request: Request) -> tuple[int, Any]:
    token = request.need_token()
    business_id = str(request.query.get("business_id") or "").strip()
    if not business_id:
        raise ServiceError("business_id is required.", source="pulse")
    rows = request.db().select(
        "drivers",
        f"select=id,full_name,phone_e164,status,vehicle_type,home_base,service_areas,"
        f"average_rating,completed_order_count,is_active,created_at"
        f"&business_id=eq.{business_id}&order=full_name.asc&limit=200",
        token,
    ) or []
    return 200, {
        "drivers": rows,
        "note": "Ratings stay NULL until real feedback exists; that is shown, not hidden.",
    }


@route("GET /api/customers")
def _customers_list(request: Request) -> tuple[int, Any]:
    token = request.need_token()
    business_id = str(request.query.get("business_id") or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}", business_id):
        raise ServiceError("business_id must be a UUID.", source="pulse")

    limit = max(1, _positive_int(request.query.get("limit"), "limit", 50, 100))
    offset = _positive_int(request.query.get("offset"), "offset", 0, 1000000)
    query = (
        "select=id,display_name,phone_e164,email,city,source,created_at"
        f"&business_id=eq.{business_id}&order=display_name.asc,created_at.desc"
        f"&limit={limit + 1}&offset={offset}"
    )
    search = str(request.query.get("q") or "").strip()
    if search:
        if len(search) > 80:
            raise ServiceError("Search must be 80 characters or fewer.", source="pulse")
        needle = urllib.parse.quote(f"*{search}*", safe="")
        query += (
            "&or=(display_name.ilike."
            f"{needle},phone_e164.ilike.{needle},email.ilike.{needle})"
        )

    rows = request.db().select("customers", query, token) or []
    has_more = len(rows) > limit
    return 200, {
        "customers": rows[:limit],
        "limit": limit,
        "offset": offset,
        "has_more": has_more,
        "note": "Customer visibility is enforced by Postgres row-level security.",
    }


@route("GET /api/vehicles")
def _vehicles_list(request: Request) -> tuple[int, Any]:
    token = request.need_token()
    business_id = str(request.query.get("business_id") or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}", business_id):
        raise ServiceError("business_id must be a UUID.", source="pulse")
    rows = request.db().select(
        "vehicles",
        "select=id,business_id,driver_id,label,registration,type,capacity_note,"
        f"is_active,created_at&business_id=eq.{business_id}&order=label.asc&limit=200",
        token,
    ) or []
    return 200, {
        "vehicles": rows,
        "note": "Vehicle visibility is enforced by Postgres row-level security.",
    }


@route("POST /api/vehicles")
def _vehicle_create(request: Request) -> tuple[int, Any]:
    token = request.need_token()
    body = request.body
    allowed = {"business_id", "label", "registration", "type", "capacity_note"}
    unknown = sorted(set(body) - allowed)
    if unknown:
        raise ServiceError(
            "Unsupported vehicle fields.",
            source="pulse",
            detail={"unsupported_fields": unknown},
        )

    business_id = str(body.get("business_id") or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}", business_id):
        raise ServiceError("business_id must be a UUID.", source="pulse")
    label = str(body.get("label") or "").strip()
    if not 2 <= len(label) <= 80:
        raise ServiceError("Vehicle label must be between 2 and 80 characters.", source="pulse")
    vehicle_type = str(body.get("type") or "other").strip()
    if vehicle_type not in {"motorbike", "tricycle", "van", "truck", "bicycle", "other"}:
        raise ServiceError("Choose a supported vehicle type.", source="pulse")

    payload: dict[str, Any] = {
        "business_id": business_id,
        "label": label,
        "type": vehicle_type,
    }
    for field_name, maximum in (("registration", 64), ("capacity_note", 200)):
        value = str(body.get(field_name) or "").strip()
        if len(value) > maximum:
            raise ServiceError(
                f"{field_name.replace('_', ' ').capitalize()} must be {maximum} characters or fewer.",
                source="pulse",
            )
        if value:
            payload[field_name] = value

    rows = request.db().insert_row("vehicles", payload, token) or []
    if not rows:
        raise ServiceError("The vehicle was not returned after saving.", status=502, source="supabase")
    return 201, {
        "vehicle": rows[0],
        "note": "The database's vehicle write policy decided whether this was allowed.",
    }


@route("GET /api/carriers")
def _carriers(request: Request) -> tuple[int, Any]:
    """Carrier directory for vendors. Runs entirely inside Postgres via
    browse_carriers(), which returns directory columns only, so no policy is widened
    and no private column of another business becomes reachable."""
    token = request.need_token()
    payload = {
        key: request.query.get(key) or None
        for key in ("p_search", "p_city", "p_service_area", "p_min_rating")
    }
    return 200, {
        "carriers": request.db().rpc("browse_carriers", payload, token) or [],
        "note": "Ratings are live aggregates of real feedback; no rating means no history yet.",
    }


@route("GET /api/offers")
def _offers(request: Request) -> tuple[int, Any]:
    """Offers sent or received by the given workspace, determined by membership."""
    token = request.need_token()
    business_id = str(request.query.get("business_id") or "").strip()
    if not business_id:
        raise ServiceError("business_id is required.", source="pulse")
    rows = request.db().select(
        "delivery_offers",
        f"select=id,vendor_business_id,carrier_business_id,status,pickup_text,"
        f"destination_text,description,service_type,proposed_price,currency,"
        f"scheduled_at,order_id,decline_reason,expires_at,created_at"
        f"&or=(vendor_business_id.eq.{business_id},carrier_business_id.eq.{business_id})"
        f"&order=created_at.desc&limit=100",
        token,
    ) or []
    return 200, {"offers": rows, "note": "Only the two parties to an offer can see it."}


SHIPMENT_COLUMNS = (
    "id,pulse_shipment_id,order_id,business_id,originator_business_id,current_status,"
    "last_verified_event_at,last_verified_location,last_event_received_at,created_at,updated_at"
)
SHIPMENT_EVENT_COLUMNS = (
    "event_id,shipment_id,event_type,source_type,"
    "occurred_at,received_at,location,latitude,longitude,verification_status,"
    "order_status_from,order_status_to,metadata"
)
SHIPMENT_ORDER_COLUMNS = (
    "id,reference,status,service_type,pickup_text,destination_text,requested_at,"
    "scheduled_at,price_amount,currency"
)


def _positive_int(value: str | None, label: str, default: int, maximum: int) -> int:
    try:
        number = int(value or default)
    except (TypeError, ValueError) as error:
        raise ServiceError(f"{label} must be a whole number.", source="pulse") from error
    return max(0, min(number, maximum))


@route("GET /api/shipments")
def _shipments(request: Request) -> tuple[int, Any]:
    """List shipments visible to the current workspace through shipment RLS."""
    token = request.need_token()
    business_id = str(request.query.get("business_id") or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", business_id):
        raise ServiceError("business_id must be a UUID.", source="pulse")

    limit = max(1, _positive_int(request.query.get("limit"), "limit", 25, 100))
    offset = _positive_int(request.query.get("offset"), "offset", 0, 1000000)
    query = (
        f"select={SHIPMENT_COLUMNS}"
        f"&or=(business_id.eq.{business_id},originator_business_id.eq.{business_id})"
        f"&order=created_at.desc&limit={limit + 1}&offset={offset}"
    )
    status = str(request.query.get("status") or "").strip()
    if status:
        if not re.fullmatch(r"[a-z_]{1,48}", status):
            raise ServiceError("status contains unsupported characters.", source="pulse")
        query += f"&current_status=eq.{status}"
    search = str(request.query.get("q") or "").strip()
    if search:
        if len(search) > 80:
            raise ServiceError("Search must be 80 characters or fewer.", source="pulse")
        encoded = urllib.parse.quote(f"*{search}*", safe="")
        query += f"&pulse_shipment_id=ilike.{encoded}"

    rows = request.db().select("pulse_shipments", query, token) or []
    has_more = len(rows) > limit
    shipments = rows[:limit]
    order_ids = sorted({str(row["order_id"]) for row in shipments if row.get("order_id")})
    orders = (
        request.db().select(
            "orders",
            f"select={SHIPMENT_ORDER_COLUMNS}"
            f"&id={_in_filter(order_ids)}",
            token,
        )
        if order_ids
        else []
    )
    orders_by_id = {str(row["id"]): row for row in orders or []}
    for shipment in shipments:
        shipment["order"] = orders_by_id.get(str(shipment.get("order_id")))

    return 200, {
        "shipments": shipments,
        "limit": limit,
        "offset": offset,
        "has_more": has_more,
        "note": "Shipment visibility is enforced by Postgres row-level security.",
    }


@route("GET /api/shipments/{shipment_id}")
def _shipment_detail(request: Request) -> tuple[int, Any]:
    """Shipment Passport read model. RLS controls both shipment and event visibility."""
    token = request.need_token()
    shipment_id = request.params["shipment_id"]
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", shipment_id):
        raise ServiceError("shipment_id must be a UUID.", source="pulse")
    rows = request.db().select(
        "pulse_shipments",
        f"select={SHIPMENT_COLUMNS}&id=eq.{shipment_id}&limit=1",
        token,
    ) or []
    if not rows:
        raise ServiceError(
            "No such shipment for this account: row-level security returned nothing, "
            "so it is either missing or not yours.",
            status=404,
            source="supabase",
        )

    shipment = rows[0]
    order_rows = request.db().select(
        "orders",
        f"select={SHIPMENT_ORDER_COLUMNS}&id=eq.{shipment['order_id']}&limit=1",
        token,
    ) or []
    events = request.db().select(
        "pulse_shipment_events",
        f"select={SHIPMENT_EVENT_COLUMNS}&shipment_id=eq.{shipment['id']}"
        "&order=occurred_at.desc,received_at.desc&limit=501",
        token,
    ) or []
    events_truncated = len(events) > 500
    events = events[:500]
    events.reverse()
    return 200, {
        "shipment": shipment,
        "order": order_rows[0] if order_rows else None,
        "events": events,
        "events_truncated": events_truncated,
        "note": "Only shipment participants and the originating vendor can read this passport.",
    }


@route("GET /api/orders/{order_id}")
def _order_detail(request: Request) -> tuple[int, Any]:
    token = request.need_token()
    db = request.db()
    order_id = request.params["order_id"]
    rows = db.select("orders", f"select={ORDER_COLUMNS}&id=eq.{order_id}&limit=1", token)
    if not rows:
        raise ServiceError(
            "No such order for this account: row-level security returned nothing, so "
            "it is either missing or not yours.",
            status=404,
            source="supabase",
        )
    history = db.select(
        "order_status_history",
        f"select=from_status,to_status,delivery_event,note,actor_role,occurred_at"
        f"&order_id=eq.{order_id}&order=occurred_at.asc",
        token,
    ) or []
    assignments = db.select(
        "driver_assignments",
        f"select=id,driver_id,status,assignment_type,is_current,assigned_at,accepted_at,"
        f"declined_at,notes&order_id=eq.{order_id}&order=assigned_at.desc",
        token,
    ) or []
    return 200, {
        "order": rows[0],
        "history": history,
        "assignments": assignments,
        "allowed_next": _edges_for(request).get(str(rows[0].get("status")), []),
    }


@route("POST /api/rpc/{name}")
def _rpc(request: Request) -> tuple[int, Any]:
    """Forward an allow-listed RPC with the caller's token. Not a proxy for anything:
    a portal that can call arbitrary functions turns a browser into a superuser."""
    name = request.params["name"]
    if name not in ALLOWED_RPC:
        raise ServiceError(
            f"{name} is not exposed by this portal.",
            status=403,
            source="pulse",
            detail={"allowed": sorted(ALLOWED_RPC)},
        )
    return 201, request.db().rpc(name, request.body, request.need_token())


@route("PATCH /api/orders/{order_id}")
def _patch_order(request: Request) -> tuple[int, Any]:
    """Status and money columns go to Postgres as an update; the 0006/0010 triggers
    still decide whether the change is legal. Columns outside the allow-list are not
    even sent, and the response says which ones were dropped."""
    token = request.need_token()
    allowed = {
        key: value for key, value in request.body.items() if key in PATCHABLE_COLUMNS
    }
    dropped = sorted(set(request.body) - set(allowed))
    if not allowed:
        raise ServiceError(
            "Nothing to update.",
            source="pulse",
            detail={"allowed": sorted(PATCHABLE_COLUMNS)},
        )
    rows = request.db().patch_row(
        "orders", f"id=eq.{request.params['order_id']}", allowed, token
    )
    return 200, {
        "orders": rows,
        "ignored_columns": dropped,
        "note": "Postgres validated the transition; this service only forwarded it.",
    }


@route("POST /api/mail/invitation")
def _mail_invitation(request: Request) -> tuple[int, Any]:
    token = request.need_token()
    try:
        result = mailer.send_invitation(
            request.cfg,
            to_email=str(request.body.get("email") or ""),
            code=str(request.body.get("code") or ""),
            business_name=str(request.body.get("business_name") or "Pulse"),
            role=str(request.body.get("role") or "staff"),
            inviter=str(request.body.get("inviter") or "A workspace owner"),
        )
        return 200, {**result, "manual_handoff": False}
    except ServiceError as error:
        if error.source != "mail:smtp":
            raise
        return 200, {
            "delivered": False,
            "manual_handoff": True,
            "reason": error.message,
            "code": str(request.body.get("code") or ""),
            "note": "The invitation already exists in the database; only the email "
            "did not go out.",
        }
