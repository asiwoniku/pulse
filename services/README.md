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

Open <http://127.0.0.1:8000/>. The startup lines tell you which providers were
picked up, and the page itself shows the same checklist with what each one
unlocks.

If `python` is not found, try `py -3 run.py`, which uses the Windows launcher
that the installer always registers.

## What works with no credentials at all

* the portal shell, the board layout, the status legend, and the setup checklist;
* Sign in / Create account — which answers plainly that Supabase is not
  configured, instead of appearing to succeed;
* WhatsApp text parsing (`/api/imports/whatsapp`): a customer message becomes a
  prefilled draft, entirely offline;
* the state-machine mirror, so the board shows which moves *would* be allowed.

What cannot work without credentials is anything that needs real rows. The
portal says so and stays empty rather than inventing a delivery.

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

Nothing in this folder has been executed — the machine this was written on has no
Python. The checks that ran are static, and they are the ones worth repeating:

* every DOM id referenced by `portal/app.js` resolves — either it is in
  `portal/index.html`, or `offerWorkspaceCreation()` builds it at runtime;
* every route the portal calls matches a handler in `pulse_service/api.py`;
* every name in `ALLOWED_RPC` exists as a function in `supabase/migrations/`, so the
  allow-list cannot name something the database does not have;
* the RPC parameters the portal sends (`p_name`, `p_city`, `p_currency`,
  `p_business_id`, `p_email`, `p_role`, `p_display_name`) match the signatures in
  `0010_workspace_lifecycle.sql`.

Two defects found by those checks were fixed: the board silently truncated to 50
orders while claiming it never would, and the payment provider notes pointed staff at
a `mark_payment_paid()` RPC that does not exist in any migration (recording a payment
is a guarded `UPDATE` of `orders.payment_status`, see `0013` and `0015`).

Start the server and expect the first run to surface anything a static read cannot
see — in particular, every network path here has never been called.
