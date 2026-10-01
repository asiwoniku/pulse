# Pulse

Delivery and moving control plane for small logistics businesses: a Postgres
control plane (Supabase) with native Android and iOS clients on top.

```
supabase/migrations/   schema, enums, state machine, RBAC, RLS, grants (0001–0016)
supabase/README.md     apply order, invariants, verification queries, no-seed policy
android/               Kotlin + Compose client (dispatch, driver, workspace)
ios/                   Swift + SwiftUI client (not started)
services/              stdlib-only Python service + dispatcher partner portal
docs/                  architecture, RPC contract, ADRs
```

## Read in this order

1. `docs/architecture.md` — what each layer is allowed to know, and how an
   unconfigured integration is displayed.
2. `supabase/README.md` — migration map and the invariants the database enforces.
3. `docs/api.md` — the RPC and read contract both mobile clients implement.
4. `docs/adr/0001-native-clients.md`, `docs/adr/0002-supabase-first.md` — the two
   decisions that depart from the original specification, and their costs.
5. `android/README.md` — how to configure and build the client.

## Two rules the codebase is built around

**The database is the only source of truth.** Status transitions, role
capabilities, one-live-assignment, human order references, driver ratings and
workload, and the append-only trail are enforced by Postgres functions and
triggers. A client may mirror them to dim a button; it may not decide them.

**No fabricated work, ever.** There is no seed data and no fake provider responses.
Integrations that are not configured report `skipped` / `pending_confirmation` with a
reason, and the apps render that state instead of hiding it. An empty board is a real
state of the system. The single exception is the portal's design preview, which is
switched off unless you ask for it, labels itself permanently, and cannot write to
anything — see `services/README.md`.

## Current state

| Area | State |
|---|---|
| Schema, state machine, RBAC, RLS, storage, realtime | written as migrations `0001`–`0016`; **not yet applied** to a project (needs `supabase link` + `db push` with credentials) |
| Service + partner portal | written; **not yet executed** (no Python in the authoring environment). `?preview=1` renders synthetic fixtures so the UI can be reviewed without a database — see `services/README.md` |
| Android client | source written; **not compiled** here (no Android SDK/Gradle in this workspace) |
| iOS client | not started |
| Providers (payments, push, maps, WhatsApp) | no credentials exist yet, so no code pretends to call them |

## Getting a working project

```bash
cd pulse
supabase link --project-ref <ref>
supabase db push                     # then run the verification queries in supabase/README.md
cp .env.example .env                 # fill real values; nothing ships a key
cd android && ./gradlew :app:assembleDebug
```

Nothing is seeded: after `db push` the database is empty and fully functional. The
first workspace is created by a real sign-up through `create_business`.
