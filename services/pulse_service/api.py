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
    # Marketplace (0017-0021). browse_carriers is a directory read, not a proxy:
    # it returns named columns only and is the sole way one business can see
    # another. create_business now also takes p_kind / p_phone_e164.
    "browse_carriers",
    "create_delivery_offer",
    "respond_to_offer",
    "withdraw_offer",
    "expire_stale_offers",
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
        f"select=id,name,phone_e164,city,country_code,timezone,currency,is_active"
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
