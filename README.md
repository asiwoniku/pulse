# Pulse

Delivery and moving control plane for small logistics businesses: a Postgres
control plane (Supabase), separate partner and Pulse-admin web apps, and a Flutter
mobile client.

```
supabase/migrations/   schema, marketplace, shipments, events, RBAC, RLS (0001–0026)
supabase/README.md     apply order, invariants, verification queries, no-seed policy
partner-web/           React + TypeScript partner operations workspace (Vite)
admin-web/             isolated Pulse platform administration app (Vite)
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
5. `docs/deployment.md` — the one-origin image, and what you must supply to deploy it.
6. `mobile/README.md` — how to open and run the Flutter preview.
7. `admin-web/README.md` — platform admin boundary and setup.

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
| Schema, state machine, marketplace, shipment events, RBAC, RLS, storage, realtime | written as migrations `0001`–`0026`; `0022`–`0024` are verified against the live project, later migrations still need deployment |
| Partner web (React + TypeScript) | multi-page operations workspace in `partner-web/`; Overview, Shipments, Shipment Passport, Create, Dispatch, Drivers, Fleet, Customers, Exceptions, Integrations and Settings read live data |
| Pulse platform admin (React + TypeScript) | separate `admin-web/`; profile-only organisation review, account status, and platform audit RPCs; no partner-work routes |
| Service + dispatcher portal | Python service and portal run locally; Shipment Passports, manual event capture, and vendor carrier requests are implemented |
| Flutter mobile app | offline sample workflows implemented in `mobile/`; live authentication and Supabase data access are not connected |
| Kotlin Android prototype | retained under `android/` as an earlier implementation, not the active mobile app |
| iOS client | not started |
| Providers (payments, push, maps, WhatsApp) | no credentials exist yet, so no code pretends to call them |

The marketplace milestone currently adds provider discovery/offers (`0017`–`0021`)
and a canonical shipment identity plus source-aware event history (`0022`). The
platform admin surface adds manual organization review controls (`0026`), while
customer-side booking, verification evidence submission, shipment documents /
inspections, and trusted provider webhook processing remain future work.

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
