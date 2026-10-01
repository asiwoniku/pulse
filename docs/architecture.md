# Pulse architecture

Pulse is a delivery and moving control plane for small logistics businesses. The
product premise is that a dispatch team trusts what they see enough to act on it,
so the system is built around two rules: **the database is the only source of
truth**, and **an unconfigured integration is shown as unconfigured**.

## Shape

```
Android (Kotlin/Compose)      iOS (Swift/SwiftUI)
        |        dispatch · driver · customer links
        +----------------+-------------------------+
                         |  HTTPS / WebSocket
              Supabase  (PostgREST · Auth ·
                         Realtime · Storage)
                         |
              Postgres: schema · RLS · triggers · RPCs
                  state machine · RBAC · history
```

There is intentionally nothing between the clients and Postgres (ADR-002). What
the clients send is a request to do something; what decides whether it may happen
is a trigger or a `SECURITY DEFINER` function.

## Layers, and what each one is allowed to know

**Postgres** owns every business rule: the order state machine (`0006`), role
capabilities (`0003` `can_operate`), one-live-assignment (`0007`), reference
allocation (`0005`), rating and workload recalculation (`0012`), and the
append-only trail that makes an incident reconstructable.

**RPCs** are the verbs the apps use: `create_delivery_order`, `assign_driver`,
`respond_to_assignment`, `record_delivery_attempt`,
`capture_proof_of_delivery`, `cancel_assignment`, `set_driver_availability`,
`create_business`, `invite_worker`, `accept_invitation`, `register_device`. Each
is atomic and re-derives the caller's role from membership rows, never from a
client-supplied role.

**Clients** own presentation, input validation, offline queues, and navigation.
A client may compute a *preview* of an allowed transition to grey out a button,
but it must expect the server to say no, and it renders that no verbatim. A
client never computes a price total from a rate table, a driver rating, or an ETA
that the database does not have.

## Roles and capability

`owner > admin > dispatcher > ops > driver`, always scoped to one business. A
person can hold different roles in different businesses, and the UI is generated
from `member_role(business_id)` plus the RPC errors that come back — not from a
role string cached in a local file. Drivers act on orders only through
assignments; `guard_order_columns` (`0013`) makes it structurally impossible for
a driver to touch price or payment state.

## Order lifecycle

The canonical chain is `requested → under_review → quoted →
awaiting_customer_approval → accepted → assigned → driver_accepted →
driver_arrived → at_pickup → picked_up → in_transit → arrival_attempted →
delivered → completed`, and every shorter path that `0006` allows is legal (a
parcel delivery can go `requested → assigned` straight away). `cancelled` and
`failed` are real states, not toasts, and `pickup_attempt_failed` /
`arrival_attempted` exist so a failed attempt does not destroy the primary
status. `delivered` requires captured proof (recipient name, a photo or
signature URL, and the OTP when the business asked for one). `completed` is a business decision made by staff, and it is the event
that moves a driver's real workload counter. Every move writes an
`order_status_history` row inside the same transaction, so the trail cannot miss.

## Unconfigured boundaries

Each external boundary is a column set plus an honest state, and each stays empty
until someone provisions the real thing:

| Boundary | Where it lives | Until configured |
|---|---|---|
| WhatsApp | `customers.whatsapp_jid`, contact import | no JIDs, "not connected" in UI |
| Payments | `payment_attempts.provider/_reference/_payload/status` | `pending_confirmation`, provider `manual` |
| Push | `devices.push_token`, `notifications.status` | token registered, delivery `skipped` + reason |
| Maps | `locations`, route/ETA fields | manual address text, no ETAs shown |

No boundary is faked, and none is hidden: the app renders "not configured" with
what is missing, because a silent placeholder is the failure mode that destroys
trust in the dispatch board.

## Offline and retries

The driver client queues attempted transitions locally and replays them in
order. Re-applying the status an order already has is a legal no-op (`0006`), so
a replayed request after a dropped connection converges instead of erroring.
Illegal replay is rejected by the guard and surfaced as a conflict the dispatcher
resolves, not as a silently discarded action.

## Where the app server would go

See `docs/adr/0002-supabase-first.md`: FastAPI returns when a provider webhook or
a scheduled job exists, and it owns only transport — signature verification,
retries, idempotency keys. Business rules stay in Postgres, so the server must
remain deletable without changing behaviour.
