# Pulse service — start here

This folder holds the Pulse backend and the dispatcher web portal. It is written
against the Python standard library only, so "nothing is configured" is a state
you can open in a browser and look at, not an error screen.

## Run it

You need Python 3.10 or newer. On a fresh Windows machine, install it from
<https://www.python.org/downloads/windows/> and tick *Add python.exe to PATH*,
then open a new terminal and confirm:

```powershell
python --version          # Python 3.10.0 or higher
```

No virtualenv and no `pip install` step is required for the portal or for
Supabase. From this directory:

```powershell
cd C:\Users\ireol\OneDrive\Documents\Pulse\pulse\services
Copy-Item .env.example .env    # optional: fill in credentials as you get them
python run.py
```

Open <http://127.0.0.1:8000/>. The public landing page explains Pulse to
customers and logistics partners; web account creation is explicitly for
partners. The startup lines tell you which providers were picked up, and the
portal shows the same checklist with what each one unlocks.

If `python` is not found, try `py -3 run.py`, which uses the Windows launcher
that the installer always registers.

## Supabase Auth must be configured before sign-up works

The schema is not enough; two project settings live in the Supabase dashboard
and cannot be set from SQL or from `.env`.

**Email confirmation.** By default a project requires it. Nothing here sends
mail until `SMTP_*` is configured, so with confirmation left on a new account
is created and can never be signed into — the service answers with
`needs_confirmation: true` and stops. For local work either

* turn off *Confirm email* under Authentication → Sign In / Providers → Email, or
* add `SMTP_*` so the real message is delivered.

**Redirect URLs.** Add the site origin, `http://127.0.0.1:8000/`, under
Authentication → URL Configuration → Redirect URLs, or social sign-in and
confirmation links bounce back to the wrong place.

`0023` and `0024` in `supabase/migrations/` must also be applied — `0023`
restores the sign-up trigger that provisions `public.profiles`, without which a
real sign-up yields an account that cannot pass RLS.

## What works with no credentials at all

* the public product landing page and partner sign-in/onboarding screens;
* email/password sign-in and account creation, which answer plainly that
  Supabase is not configured instead of appearing to succeed;
* WhatsApp text parsing (`/api/imports/whatsapp`): a customer message becomes a
  prefilled draft, entirely offline;
* the state-machine mirror, so the board shows which moves *would* be allowed.

What cannot work without credentials is anything that needs real rows. Live
operational views say so and stay empty rather than inventing a delivery. An
explicitly labeled browser-only workflow preview is available separately to
demonstrate partner application review and onboarding; its fictional data and
decisions are not Supabase records or production verification.

With Supabase configured, the partner portal now includes:

* a logistics-focused public landing page, partner-only web registration, and
  carrier/vendor business onboarding after account authentication;
* Google and Microsoft (Azure) OAuth entry points. Enable each provider in
  Supabase Authentication → Sign In / Providers before using it. Add the
  website origin (for local development, `http://127.0.0.1:8000/`) to
  Authentication → URL Configuration → Redirect URLs. Configure the
  corresponding Google OAuth client or Microsoft Entra application in the
  provider dashboard and register the Supabase callback URL shown there. The
  app does not imply a provider is configured; Supabase returns the actual
  provider setup error if it is not. Microsoft sign-in requests the `email`
  scope. The Supabase anon key used to start OAuth is a public client key, not
  the service-role key.
* a Shipment Passports view with Pulse shipment ID search, status filtering,
  pagination, compact order context, and a source/verification-aware event
  timeline;
* workspace-scoped customer search and pagination, plus fleet records and vehicle
  registration forwarded under the signed-in user's token for Postgres/RLS to
  authorize;
* manual event capture with a stable idempotency key, attributed to the signed-in
  user and kept pending review by the database;
* the existing vendor-only carrier directory and delivery-offer workflow, now
  surfaced together in Requests.

Shipment reads still use the user's bearer token and database RLS. Shipment
tables and the `record_shipment_event` RPC require migration `0022` to be
applied. No provider/facility integration is simulated in the portal.

## Isolated workflow preview

The landing page offers an explicitly labeled sample application and an
already-approved partner account preview. The partner preview opens Dispatch, Orders, Shipments, Drivers, Customers, Fleet,
Requests, Team, and Settings, with local-only sample workflows for order
creation/status progression, proof-of-delivery picker feedback, driver availability,
vehicle registration, delivery-request responses, team entries, and business profile
settings. It uses fictional records in browser storage under `pulse.partner-demo`,
separate from the real `pulse.session` state, and does not call business, order, or
verification APIs. The file-picker progress is illustrative: selected bytes are not
uploaded or stored. Demo approval is not a real verification decision, and sample
orders are not operational. Clear that browser storage key to reset the preview.

There is no admin console in the partner portal, and no partner-facing navigation or
link to admin functionality. Do not expose admin review until a separate admin
application has server-enforced authentication and role authorization. Hiding a
client-side page or relying on a demo passcode would not be an adequate security
boundary.
Screen changes, sample activity, chart bars, and the simulated file-picker progress
have lightweight motion and respect the reduced-motion accessibility preference.

Production verification is not implemented by the preview. Before enabling live
partner access, applications, evidence storage, reviewer authorization/audit, appeal
handling, a persisted decision, and a server-enforced gate on workspace APIs still
need to be designed and implemented.

Outside this preview, the portal shows only rows Postgres actually returned under the
signed-in user's token. An empty live board stays empty; it does not fall back to demo
fixtures. This separation prevents a populated mock workspace from hiding broken RLS
or an unconfigured project.

## Minimum to see your own data

Put these two in `pulse/services/.env` (same values the Android app was given)
and restart:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=paste-anon-key
```

Sign in with the same email you used in the app. Your token is forwarded to
Postgres, which is what actually decides whether a given order or assignment is
visible — the portal's scoping switch reflects what the database returned, and
falls back to "filter locally, tell the user why" when RLS cannot be relied on.

The board reads direct rows (`orders`, `assignments`, `order_status_history`,
`delivery_facts`) and shows the 50 most recent orders for the workspace. When a
workspace holds more than that, the response carries `truncated: true` and the portal
renders a `truncated: 50 most recent` chip, so a short list is never mistaken for the
whole workload. `/api/orders/rich` is the RPC-shaped replacement the mobile client can
move to when a window is not enough.

## Everything else is opt-in, one section at a time

`.env.example` documents each variable and the portal renders the same list with
its `unlocks` line. Roughly:

| Section | Unlocks |
| --- | --- |
| `MAPS_*` | address → coordinates, distance and ETA on the route check card |
| `PAYSTACK_SECRET_KEY` / `FLUTTERWAVE_SECRET_KEY` | checking somebody's payment claim before a human records it |
| `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` | outbound job updates; `WHATSAPP_APP_SECRET` additionally lets the inbound webhook verify Meta's signature instead of refusing it |
| `SMTP_*` | invitation codes emailed instead of read out loud — the code is created in the database either way |
| `FCM_PROJECT_ID` + `FIREBASE_SERVICE_ACCOUNT_FILE` | push to registered devices |
| `REALTIME_ENABLED` | push-on-change board, once migration `0016` is applied |

Push is the one provider with an external dependency: an FCM v1 OAuth2 token
needs an RS256 signature, which the standard library cannot produce. Install
`google-auth` (`pip install google-auth`) or leave devices registered and silent;
the checklist reports which of those states you are in.

## Verification status

The service and portal have been exercised locally with Python 3.14.7. The
focused route checks can be run from this folder:

```powershell
python -m unittest discover -s tests -v
```

They cover workspace filters, escaped shipment search, ID validation,
participant-token forwarding, and chronological ordering/capping of the latest
500 events. A local browser smoke test also exercised the passport/timeline,
manual-event, carrier-search, and offer-submission UI with intercepted fixture
responses. It did not sign in to Supabase or validate deployed RLS, actual event
insertion, or provider integrations.

The static checks worth repeating are:

* every DOM id referenced by `portal/app.js` resolves — either it is in
  `portal/index.html`, or `offerWorkspaceCreation()` builds it at runtime;
* every route the portal calls matches a handler in `pulse_service/api.py`;
* every name in `ALLOWED_RPC` exists as a function in `supabase/migrations/`, so the
  allow-list cannot name something the database does not have;
* the RPC parameters the portal sends match the workspace, marketplace, and
  shipment signatures in migrations `0010`, `0020`, and `0022`.

Two defects found by those checks were fixed: the board silently truncated to 50
orders while claiming it never would, and the payment provider notes pointed staff at
a `mark_payment_paid()` RPC that does not exist in any migration (recording a payment
is a guarded `UPDATE` of `orders.payment_status`, see `0013` and `0015`).

Postgres migration `0022` and all live Supabase network paths remain unverified
against a real project. Start the server with `python run.py` and authenticate
with a real account only when a configured project is intentionally being tested.
