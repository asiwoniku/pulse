# Pulse

Delivery and moving control plane for small logistics businesses: a Postgres
control plane (Supabase), a partner web portal, and a Flutter mobile client.

```
supabase/migrations/   schema, marketplace, shipments, events, RBAC, RLS (0001–0024)
supabase/README.md     apply order, invariants, verification queries, no-seed policy
partner-web/           React + TypeScript partner operations workspace (Vite)
services/              stdlib-only Python API + dispatcher portal
mobile/                Flutter Android app (offline, interactive product preview)
android/               earlier Kotlin + Compose prototype
ios/                   Swift + SwiftUI client (not started)
docs/                  architecture, RPC contract, ADRs
```

## Read in this order

1. `docs/architecture.md` — what each layer is allowed to know, and how an
   unconfigured integration is displayed.
2. `supabase/README.md` — migration map and the invariants the database enforces.
3. `docs/api.md` — the shared RPC and read contract for future live clients.
4. `docs/adr/0001-native-clients.md`, `docs/adr/0002-supabase-first.md` — the two
   decisions that depart from the original specification, and their costs.
5. `mobile/README.md` — how to open and run the Flutter preview.

## Two rules the codebase is built around

**The database is the only source of truth.** Status transitions, role
capabilities, one-live-assignment, human order references, driver ratings and
workload, and the append-only trail are enforced by Postgres functions and
triggers. A client may mirror them to dim a button; it may not decide them.

**No fabricated work in live workspaces.** Operational screens use database rows and
real provider responses; they do not silently fill empty states with fixtures. The
partner portal also has an explicitly labeled, browser-only workflow preview with
fictional data, stored separately from the real session and never sent to Supabase.
Its application decisions and orders are not real or authoritative. Integrations that
are not configured report `skipped` / `pending_confirmation` with a reason, and the
apps render that state instead of hiding it. An empty live board is a real state of
the system.

## Current state

| Area | State |
|---|---|
| Schema, state machine, marketplace, shipment events, RBAC, RLS, storage, realtime | written as migrations `0001`–`0024`; `0022`–`0024` applied and verified against the live project |
| Partner web (React + TypeScript) | multi-page operations workspace in `partner-web/`; Overview, Shipments, Shipment Passport, Create, Dispatch, Drivers, Fleet, Customers, Exceptions, Integrations and Settings read live data |
| Service + dispatcher portal | Python service and portal run locally; Shipment Passports, manual event capture, and vendor carrier requests are implemented |
| Flutter mobile app | offline sample workflows implemented in `mobile/`; live authentication and Supabase data access are not connected |
| Kotlin Android prototype | retained under `android/` as an earlier implementation, not the active mobile app |
| iOS client | not started |
| Providers (payments, push, maps, WhatsApp) | no credentials exist yet, so no code pretends to call them |

The marketplace milestone currently adds provider discovery/offers (`0017`–`0021`)
and a canonical shipment identity plus source-aware event history (`0022`). The
partner portal now surfaces vendor carrier discovery/offers and the Shipment
Passport timeline. Customer-side booking, provider verification, shipment
documents/inspections, and trusted provider webhook processing remain future work.

## Getting a working project

```bash
cd pulse
supabase link --project-ref <ref>
supabase db push                     # then run the verification queries in supabase/README.md
cp .env.example .env                 # fill real values; nothing ships a key
cd mobile && flutter pub get && flutter run
```

Nothing is seeded: after `db push` the database is empty and fully functional. The
first workspace is created by a real sign-up through `create_business`.
