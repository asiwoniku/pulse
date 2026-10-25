# Integration analysis — Pulse

Scope and dependency map for the next phase of the Pulse project. The user is
moving the system from a **preview/offline-permissioned** state to a
**live, authenticated, multi-partner test run** (email `siwonikuayomide@gmail.com`)
and wants every remaining "future work" piece to be **commenced now**.

> `live`/`configured` value throughout: `live` = actually connected and real;
> `unconfigured` = boundary exists but is honest about needing setup. Never
> fabricate a live state.

---

## 0. Environment facts (verified against the live project)

| Item | Value |
|---|---|
| Supabase project | `jqzsylkegjawhvlqaizj` (Pulse) |
| Supabase URL | `https://jqzsylkegjawhvlqaizj.supabase.co` |
| Publishable (anon) key | `sb_publishable_hx7_k2pa5FUS4-aCyG7Mdg_CsHEWcpm` |
| Service-role key | **NOT provided** — do not invent it; it bypasses RLS and must never ship in a client. |
| Toolchain | Flutter 3.x, React 18 + TS 5, Vite 5, Python 3.12 stdlib-only |
| DB engine | Postgres 17.6, RLS + triggers + SECURITY DEFINER functions own rules |
| Git | **not a git repository** in this snapshot |

### Live-auth contract for mobile (already in code)
`lib/config.dart` reads Supabase values as `--dart-define` (never committed):
`SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable only), `GOOGLE_CLIENT_ID`.
`lib/data/pulse_data.dart` already implements real email/password auth, staff-ID
resolution, session persistence and refresh. The app ships a **config screen**
that blocks demo data when Supabase is not configured — so mobile is already
positioned to be live.

---

## 1. Integration list

### 1.1 Identity & access (identity plane)
| Item | Why | How / credentials |
|---|---|---|
| **Create auth user** `siwonikuayomide@gmail.com` | The partner test account | Anon-key REST `POST /auth/v1/signup` with `"email_confirm": true` (skips confirmation email). No secret needed — publishable key is enough. |
| **Confirm email** (if not via `email_confirm`) | Required before sign-in | `email_confirm: true` at signup, or `POST /auth/v1/verify`. |
| **Create a business** (carrier or vendor) | Gives the user a workspace | Owner is the signup account. `POST /api/rpc/create_business` (client-facing) or the `create_business` RPC. |
| **Grant owner access** | "Full access of the partner web" | Owner role set at business creation; signup account is the owner. |
| **Enable Google OAuth** | Cleaner login for testers | Supabase Dashboard → Auth → Providers → Google. Need Google OAuth Client ID + secret (Google Cloud console). Set Site URL + Redirect URLs. |

### 1.2 Live authentication (mobile preview → live)
| Item | Why | How / credentials |
|---|---|---|
| **Pass Supabase URL + anon key into Flutter** | Mobile reaches the live project | `--dart-define=SUPABASE_URL=https://...` + `--dart-define=SUPABASE_ANON_KEY=sb_publishable_...` at `flutter run` / `flutter build`. |
| **Google sign-in client ID** | Mobile OAuth (Google) | `GOOGLE_CLIENT_ID` from Google Cloud console (same value used in Supabase providers). |
| **Session refresh + persistence** | Mobile stays logged in | Already implemented (`FlutterSecureStorage` + `autoRefreshToken`). Verify offline-paste works. |
| **Staff-ID sign-in (driver)** | Driver accounts use `staff_id`, not email | Already implemented via `staff_login_email()` SECURITY DEFINER. Requires `drivers.staff_id` + `account_active`. |
| **Config gate** | Never ship demo data as live | `config.dart` returns an honest missing-flags screen; release build shows the gate. Keep it. |

### 1.3 Provider integrations (the "ext" plane)
`list: [payments, push/FCM, maps, WhatsApp, SMTP] — each a separate credential set`
| Item | Unlocks | Credentials required |
|---|---|---|
| **Maps / geocoding + route/ETA** | real ETAs for pickup/destination | `NOMINATIM_USER_AGENT` (OpenStreetMap) — free, no key. Or a paid maps key. |
| **Payments** (PAYSTACK / Stripe-style) | `payment_attempts` go `live` | `PAYSTACK_SECRET_KEY` (or Stripe), `PAYSTACK_PUBLIC_KEY`, webhook secret. |
| **Push / FCM** | driver + dispatcher notifications | `FCM_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_FILE` (JSON). |
| **WhatsApp Cloud API** | inbound messages, notifications | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`. |
| **SMTP / mail** | invitation emails (fallback is manual handoff) | `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`. |

**Order:** maps first (it unblocks geocoding, which the portal already calls),
then push, WhatsApp, payments, then SMTP.


### 1.4 Marketplace & shipment operations (0017–0022 already done; extend)
`list: [documents/inspections, claims/disputes, customs, multi-leg, trusted webhooks]`
| Item | Blocked on | Commence by |
|---|---|---|
| **Shipment documents & inspections** | agreed workflow, retention rules | Add `documents` + `inspections` tables to a new migration; wire the portal read/write + mobile upload. |
| **Claims/disputes** | workflow agreed | New `claims` table + RPC `create_claim` + status machine. |
| **Customs/custody** | carrier agreement | `custody` records + provider event mapping. |
| **Multi-leg movements** | multi-provider workflow design | `shipment_legs` table + per-leg status; hand-off rules. |
| **Trusted provider webhooks** | provider selection + credentials | Implement the transport tier (retry + idempotency) with a **shared-secret** verification stub; mark providers `needs_dependency` until keys added. |

### 1.5 Customer marketplace (whole new read path)
`list: [customer discovery/booking, public shipment passport, customer app]`
| Item | Blocked on | Commence by |
|---|---|---|
| **Customer discovery / booking** | customer-facing product decisions | A `customers` side panel in the portal: browse open offers, accept → creates an order as a **customer** member of the carrier business. Clearest "commence now" item — no new table needed, just new RPCs. |
| **Public shipment passport** | customer app + product API | Public read endpoint for a `PLS-…` passport (no auth). |
| **Customer app** | product API | A first mobile web journey for the customer; outside this test run. |

