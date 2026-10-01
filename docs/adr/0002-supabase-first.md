# ADR-002: Supabase-first control plane, no application server in phase 1

- Status: accepted
- Date: 2026-09-30
- Context: specification preferred a Python/Node API tier in front of Postgres

## Decision

Phase 1 has no application server. Mobile clients talk to Supabase directly:
PostgREST for reads and simple writes, `SECURITY DEFINER` Postgres functions for
every operation with a rule attached, Realtime for status changes, Storage for
proof-of-delivery media, and Auth for identity. A FastAPI tier is deferred to the
phase where provider webhooks and long-lived jobs exist.

## Why

- **Rules must not be duplicated.** The state machine, RBAC, the one-live-
  assignment rule, and append-only history are enforced in Postgres (migrations
  `0005`–`0016`). Any app server that re-implemented them would be a second
  source of truth, and the second source is the one that goes stale.
- **Nothing to host yet.** No payment provider, no map provider, no WhatsApp
  Business account, no FCM key is configured. An app server today would be a
  deployment pipeline in search of a job, and every integration question would
  be answered with a stub.
- **RLS is the authorization layer.** Because clients are untrusted, row level
  security decides reads and writes. A thin server in front of RLS adds a hop
  without adding a guarantee.
- **Atomicity where it matters.** `create_delivery_order` allocates a human
  reference, discovers or creates the customer, and writes the order plus its
  first history row in one transaction. Over HTTP that is a saga; in Postgres it
  is a function.

## What we gave up, honestly

- No provider webhook receiver yet: payments stay `pending_confirmation` and
  notifications stay `skipped` with a reason until a provider exists.
- No server-side scheduled jobs (e.g. auto-expiring invitations). Invitations
  carry `expires_at` and `accept_invitation` refuses an expired code, so the
  rule is enforced at read/accept time instead of on a timer. A pg_cron job is
  the first candidate.
- No response caching or CDN; reads are per-user and RLS-scoped, so caching is
  mostly wrong anyway.
- Client libraries must be re-verified per platform when a breaking PostgREST
  change lands.

## Migration path to FastAPI

When a webhook or a queue is needed: keep the RPC signatures as the contract,
mount FastAPI as another PostgREST-style client of the same functions, and let it
own only transport (signature verification, retries, idempotency keys). Business
rules stay in Postgres, so the app server can be deleted without changing
behaviour — that is the test this design has to keep passing.
