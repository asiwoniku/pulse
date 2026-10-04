# Deployment

How Pulse is deployed, and what a person has to supply before a deploy can succeed.

## Topology: one origin, deliberately

```
                     https://staging.pulse…  (one host, TLS at the edge)
                     ┌────────────────────────────────────────┐
  browser ─────────▶│  /            built partner-web (SPA)  │
                     │  /api/*       pulse_service JSON API   │
                     └───────────────────────┬────────────────┘
                                             │ caller's own bearer token
                                  ┌──────────▼──────────┐
                                  │  Supabase (PostgREST, Auth) │
                                  │  Postgres + RLS owns the rules │
                                  └─────────────────────────────┘
```

`partner-web` calls **relative** `/api/...` paths (`partner-web/src/lib/api.ts`) and
routes with `BrowserRouter`. That is a decision, not an accident: `vite.config.ts`
proxies `/api` in development "so the browser never needs to know the service's host
and CORS stays same-origin … exactly as it is behind one reverse proxy later." So in
production the client and the API live on one host, and there is no `VITE_API_BASE`,
no CORS configuration, and nothing to re-point per environment.

Postgres still decides everything. Per `docs/adr/0002-supabase-first.md`, the server
owns transport only — it forwards the caller's token so RLS applies — and stays
deletable without changing behaviour.

## The image

`Dockerfile` at the repository root builds both halves into one image: Node builds
the client, `python:3.12-slim` runs it. There is **no `pip install` step** because
`pulse_service` is standard-library only; that property is preserved on purpose.

```bash
docker build -t pulse .
docker run --rm -p 8000:8000 \
  -e PULSE_HOST=0.0.0.0 -e PORT=8000 \
  -e SUPABASE_URL=https://<project-ref>.supabase.co \
  -e SUPABASE_ANON_KEY=<publishable key> \
  pulse
```

Then open <http://127.0.0.1:8000/>.

`.dockerignore` is load-bearing, not cosmetic: the Dockerfile copies the whole
`services/` tree, and a developer's `services/.env` holds
`SUPABASE_SERVICE_ROLE_KEY`. Without that file, `docker push` publishes the key.

### Environment variables

`PULSE_WEB_ROOT` is set to `/srv/web` in the image, which is what puts the React
client at `/`. Unset, the service serves the older dispatcher portal from
`pulse_service/portal/` — that is the local `python run.py` behaviour, unchanged.

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
## What you need to provide

### 1. A hosting target (not yet chosen)

Nothing in the repo names a platform. The `Dockerfile` is portable, so any of these
works without code changes:

| Platform | Notes |
|---|---|
| Fly.io | `fly launch`; the free allowance covers one small service |
| Render | free web service; the static-site option is unnecessary here |
| Railway | simplest environment-variable UI |
| Cloud Run | needs its own CORS/origin treatment for browser calls |

Tell me which, and I will add the matching `fly.toml` / `render.yaml`.

Also worth deciding: whether the platform terminates TLS in front of this, or whether
it exposes the Python process directly. See the warning below.

### 2. Supabase environments — **currently blocked**

Creating `pulse-staging` and `pulse-production` failed:

> The following organization members have reached their maximum limits for the
> number of active free projects … (2 project limit). To continue, these users will
> need to either delete, pause or upgrade one or more of these projects.

Org **Das** is on the `free` plan, whose cap is 2 active projects, and both are used:
`Pulse` (`jqzsylkegjawhvlqaizj`, the current dev database) and `Literally`
(`fsdllpodfshugwebekiy`, unrelated). Options, in the order I would pick them:

1. **Pause `Literally`** → frees one slot for `pulse-staging`. `pause_project` keeps
   all data and `restore_project` reverses it, so this is reversible.
2. **Upgrade the org to Pro** → more project slots, keeping dev, staging and
   production at once. The only option that yields all three environments.
3. **Promote the existing `Pulse` project to production** and add only staging.
   Convenient, but the dev database then holds whatever production sees, which the
   "no fabricated work in live workspaces" rule argues against.
4. **A Supabase branch as staging** — `$0.01344/hr` (~$9.76/mo), created from the
   current project with migrations applied automatically. Cheaper than a project, but
   Supabase positions branches as development rather than production, so this only
   makes sense for staging.

Whichever you choose, each environment needs migrations `0001`–`0024` applied in
order (`supabase link --project-ref <ref> && supabase db push`) and then the
verification queries in `supabase/README.md`. I can apply those for you once a slot
exists.

### 3. Per-environment auth settings

These live in the dashboard and **cannot** be set from SQL or `.env`:
## A warning about running this process directly

`run.py` serves through `wsgiref`, the standard library's development server. It is
**not hardened or benchmarked for hostile internet traffic** — it exists so the portal
runs on a bare machine with nothing installed. Deploying it behind a TLS-terminating
platform edge or a reverse proxy is fine. Exposing the container's port directly to
the public internet is not.

The `application` object is a plain WSGI callable, so putting gunicorn or uWSGI in
front is a one-line change if you want a hardened server without touching a single
handler. Per ADR-002 it stays transport-only either way.

## Verified

Checked by driving the real WSGI callable, not by inspection:

| Request | Result |
|---|---|
| `GET /` | 200, `index.html`, `Cache-Control: no-store` |
| `GET /shipments`, `GET /fleet/vehicles` | 200, SPA shell, `no-store` |
| `GET /assets/index-*.js` | 200, `text/javascript`, `max-age=31536000, immutable` |
| `GET /assets/index-*.css` | 200, `text/css`, `immutable` |
| `GET /assets/missing.js` | **404**, not HTML |
| `POST /shipments` | 404 — only GETs are rewritten |
| `GET /../../etc/passwd` | 200 `index.html`, nothing read off disk |
| `PULSE_WEB_ROOT` unset, `GET /` | dispatcher portal, as before |

`npm run build` (`tsc -b && vite build`) is clean and all 19 service tests pass.

- **Site URL** — `https://<your-host>/`
- **Redirect URLs** — the same origin, plus any OAuth callback origins you add
- **Confirm email** — leave it *on* and configure SMTP, or new accounts are created
  but can never sign in, and the service answers `needs_confirmation: true`
- **SMTP** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`
  if invitations should be delivered rather than shown on screen

### 4. Optional provider credentials

Payments (Paystack/Flutterwave), the WhatsApp Cloud API, FCM, and a maps key
(Google or Mapbox — the `nominatim` and `osrm` defaults are explicitly marked
unacceptable in production). Each is optional and each has a real unconfigured state.
| `SUPABASE_ANON_KEY` | yes | the **publishable** key only |
| `SUPABASE_SERVICE_ROLE_KEY` | no | admin tasks only; never forwarded on portal requests |
| `PULSE_HOST` | in Docker | must be `0.0.0.0`; the `127.0.0.1` default answers connection-refused from outside the container and looks like a broken deploy |
| `PORT` | in Docker | set by Fly/Render/Railway/Cloud Run; `PULSE_PORT` still works locally |
| `PULSE_WEB_ROOT` | no | where the built client lives; unset serves the dispatcher portal |
| `MAPS_*`, `PAYSTACK_*`, `FLUTTERWAVE_*`, `WHATSAPP_*`, `FCM_*`, `SMTP_*` | no | each stays in its honest "not configured" state until set |

An unconfigured provider is not an error. `/api/status` reports which ones are live,
and the UI renders what is missing instead of inventing data.