# Deployment

How Pulse is deployed, and what a person must supply before a deploy can succeed.

## Topology: one origin, deliberately

```
            https://pulse-…vercel.app        (one domain, TLS at the edge)
            ┌──────────────────────────────────────────────┐
 browser ──▶│  /        partner-web, Vite SPA (static CDN)  │
            │  /api/*   pulse_service WSGI function         │
            └───────────────────────┬──────────────────────┘
                                    │ caller's own bearer token
                         ┌──────────▼──────────────────────┐
                         │  Supabase  jqzsylkegjawhvlqaizj  │
                         │  PostgREST · Auth · Realtime     │
                         │  Postgres + RLS owns the rules  │
                         └─────────────────────────────────┘
```

`partner-web` calls **relative** `/api/...` paths (`partner-web/src/lib/api.ts`) and
routes with `BrowserRouter`. That is a decision, not an accident: `vite.config.ts`
proxies `/api` in development "so the browser never needs to know the service's host
and CORS stays same-origin … exactly as it is behind one reverse proxy later." So both
halves live on one domain, and there is no `VITE_API_BASE`, no CORS configuration, and
nothing to re-point per environment.

Postgres still decides everything. Per `docs/adr/0002-supabase-first.md`, the server
owns transport only — it forwards the caller's token so RLS applies — and stays
deletable without changing behaviour.

## Deploying to Vercel

`vercel.json` at the repository root uses Vercel **Services**, which is built for
exactly this shape: "a JavaScript frontend and a Python backend in the same repository
that you want to deploy as one project."

```json
{
  "services": {
    "web": { "root": "partner-web/" },
    "api": { "root": "services/", "entrypoint": "wsgi:application" }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": { "service": "api" } },
    { "source": "/:path*",      "destination": { "service": "web" } }
  ]
}
```

Three details that matter:

- **Rewrite order is significant.** Vercel evaluates top-level rewrites in order and
  routes to the first match, so `/api/:path*` must precede the catch-all or the API
  would be swallowed by the SPA.
- **The service receives the original request path.** `/api/users` arrives as
  `PATH_INFO=/api/users`, not `/users`, so the existing routing in
  `pulse_service.app.application` works with no adapter and no path rewriting.
- **`entrypoint` is `file:variable`.** `services/wsgi.py` re-exports the same
  `application` object `python run.py` serves. `serve()` is never called: a serverless
  host invokes the WSGI callable once per request, so `wsgiref`'s socket and threading
  model are not involved.

There is no `requirements.txt`, because `pulse_service` is standard-library only and
that property is worth keeping. `services/.python-version` pins `3.12`.

```bash
cd pulse
vercel link                       # or: vercel --prod
vercel env add SUPABASE_URL SUPABASE_ANON_KEY
vercel deploy --prod
```

Use `vercel dev` to run both services locally exactly as production routes them.

## The container image (alternative)

`Dockerfile` at the repository root builds both halves into one image: Node builds the
client, `python:3.12-slim` runs it. This is not what Vercel uses — Vercel builds each
service itself — but it is how the same topology runs on Fly.io, Render, Railway,
Cloud Run or a plain VM, and it is the fastest way to reproduce production locally.

```bash
docker build -t pulse .
docker run --rm -p 8000:8000 \
  -e PULSE_HOST=0.0.0.0 -e PORT=8000 \
  -e SUPABASE_URL=https://jqzsylkegjawhvlqaizj.supabase.co \
  -e SUPABASE_ANON_KEY=sb_publishable_… \
  pulse
```

Then open <http://127.0.0.1:8000/>. `.dockerignore` is load-bearing, not cosmetic: the
Dockerfile copies the whole `services/` tree, and a developer's `services/.env` holds
`SUPABASE_SERVICE_ROLE_KEY`. Without that file, `docker push` publishes the key.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | `https://jqzsylkegjawhvlqaizj.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | the **publishable** key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | no | admin tasks only; never forwarded on portal requests |
| `PULSE_HOST` | in Docker | must be `0.0.0.0`; the `127.0.0.1` default binds loopback inside the container and answers connection-refused to everything outside |
| `PORT` | in Docker | set by Fly/Render/Railway/Cloud Run; `PULSE_PORT` still works locally |
| `PULSE_WEB_ROOT` | no | Docker sets it to `/srv/web` to put the React client at `/`. **Leave it unset on Vercel**: there the CDN serves the client and the function only ever receives `/api/*`. Unset, the service serves the older dispatcher portal from `pulse_service/portal/`, which is the local `python run.py` behaviour |
| `MAPS_*`, `PAYSTACK_*`, `FLUTTERWAVE_*`, `WHATSAPP_*`, `FCM_*`, `SMTP_*` | no | each stays in its honest "not configured" state until set |

An unconfigured provider is not an error. `/api/status` reports which ones are live,
and the UI renders what is missing instead of inventing data.

## What you need to provide

### 1. Vercel environment variables

Two, and only two are required. Set them per environment in the dashboard or with
`vercel env add`:

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://jqzsylkegjawhvlqaizj.supabase.co` |
| `SUPABASE_ANON_KEY` | the publishable key `sb_publishable_hx7_k2pa5FUS4-aCyG7Mdg_CsHEWcpm` |

The publishable key is safe in a server environment variable, and it is the only
credential this deployment needs: the service forwards the caller's own bearer token so
RLS decides access. **`SUPABASE_SERVICE_ROLE_KEY` is not needed** and should not be set
here — it bypasses RLS, and the portal never uses it (see `services/.env.example`).

Optional provider keys (`MAPS_*`, `PAYSTACK_SECRET_KEY`, `WHATSAPP_*`, `FCM_*`,
`SMTP_*`) can be added later; each has a real "not configured" state meanwhile.

### 2. Supabase auth settings

These live in the dashboard and **cannot** be set from SQL or `.env`:

- **Site URL** — `https://<your-vercel-domain>/`
- **Redirect URLs** — the same origin, plus any OAuth callback origins you add
- **Confirm email** — leave it *on* and configure SMTP, or new accounts are created but
  can never sign in, and the service answers `needs_confirmation: true`
- **SMTP** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM` if
  invitations should be delivered rather than shown on screen

### 3. Migrations

The database already has `0001`–`0024` applied (verified against the live project). If
you ever reset it:

```bash
supabase link --project-ref jqzsylkegjawhvlqaizj
supabase db push
```

then run the verification queries in `supabase/README.md`.

## Caveats worth knowing

- **One Supabase project serves both dev and production.** The free plan caps the
  organisation at 2 active projects and both are used (`Pulse` and `Literally`), so
  there is no separate staging database today. Vercel Preview deployments will share
  the same Supabase project — useful for UI review, but a Preview that writes rows
  writes them to the same database production reads. Point previews at a branch
  (`~$0.0134/hr`) if that matters.
- **Vercel Services is Beta** on all plans. The configuration follows the documented
  shape, but beta surfaces do change.
- **Cold starts.** The API is a function, so the first request after an idle period
  pays an initialisation cost. The board polls, so this is visible in practice; Fluid
  compute (the default for Services) keeps a warm instance available.
- **`wsgiref` is not exposed on Vercel.** The dev server is never bound to a socket
  there, only the WSGI callable is invoked. When running the container on a plain VM
  instead, put gunicorn or uWSGI in front before exposing it — `application` is a plain
  WSGI callable, so that is a one-line change.

## Verified

Driving the real WSGI callable, not by inspection:

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

`services/wsgi.py` resolves to `pulse_service.app.application` with signature
`(environ, start_response)` — the entrypoint Vercel loads, checked by importing it the
way the runtime would. `npm run build` (`tsc -b && vite build`) is clean and all 19
service tests pass.

Not yet verified: an actual `vercel deploy`. The routing rules are taken from Vercel's
documented behaviour, but the first real deploy is what will confirm them.