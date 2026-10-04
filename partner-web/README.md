# Pulse Partner Web

The React + TypeScript partner operations workspace. It is a genuine multi-page
application — every work area has its own URL — built on top of the existing
Pulse Python service, which remains the only thing that talks to Supabase.

```
pulse/partner-web/     this app (React 18 + TypeScript + Vite)
pulse/services/        the API it calls (Python, stdlib only)
pulse/supabase/        migrations; the database is the authority
```

## Running it

The service must be running first, because this app has no data of its own.

```powershell
cd pulse\services
python run.py                 # http://127.0.0.1:8000

cd ..\partner-web
npm install
npm run dev                   # http://127.0.0.1:5173
```

Vite proxies `/api` to `127.0.0.1:8000`, so the browser stays same-origin and no
CORS configuration is needed. `npm run build` produces a static bundle in
`dist/`; `npm run typecheck` runs `tsc --noEmit`.

## The one rule this codebase follows

**Nothing is invented.** The service forwards *your own* bearer token to
Postgres, so row-level security decides what comes back. Consequences that run
through every file:

* an empty list is a real answer and is rendered as an empty state that explains
  what to do next — never padded with sample records;
* a failed request is an `ApiError` with the service's own message and a retry,
  never a silent `[]`, because "no data" and "request failed" look identical on
  screen and mean opposite things;
* money renders only when the backend supplied an amount, with no placeholder;
* integration state comes from `/api/status`, so a provider is shown as
  unconfigured until it genuinely is configured;
* where no endpoint or table exists yet, the route exists and says so, naming
  the reason. A missing link would be worse; fake rows would be worse still.

## Structure

| Path | Purpose |
|---|---|
| `src/lib/api.ts` | The only module that calls `fetch`. Typed, one `ApiError` type. |
| `src/state/session.tsx` | Signed-in user and the active workspace. Tenant scoping lives here. |
| `src/state/useQuery.ts` | One hook keeping `loading` / `error` / `data` strictly separate. |
| `src/styles/tokens.css` | Design tokens: colour, 4px spacing scale, type, motion. |
| `src/styles/app.css` | Composition only; no raw values. |
| `src/components/shell.tsx` | Sidebar, top bar, mobile drawer. |
| `src/components/ui.tsx` | PageHeader, Panel, EmptyState, ErrorState, Skeleton, Banner. |
| `src/components/domain.tsx` | StatusBadge, VerificationBadge, Money, dates, Metric. |
| `src/nav/navConfig.ts` | The route map, in one place. |
| `src/pages/` | One file per work area. |

## What works against live data today

Overview, All shipments, Shipment detail + Shipment Passport, Create shipment,
Dispatch, Drivers, Fleet, Customers, Carrier directory, Exceptions, Integrations,
Settings. Everything else is routed and states its blocker plainly.

## Accessibility notes

Active navigation is signalled by an accent marker, weight **and** colour, never
colour alone. Status badges always carry a text label. The mobile drawer closes
on `Escape`. `prefers-reduced-motion` disables the skeleton shimmer and all
transitions. Every table has a caption, every input a label, and every icon is
decorative with the meaning carried by adjacent text.

## Known gaps

* Global search and notifications are present but disabled — no index or feed
  exists yet.
* Warehouse, Moving, International, Documents, Audit, Payments, Reputation,
  Reports, Team, Verification and Help are honest placeholders (see `NOT_BUILT`
  in `src/App.tsx` for the specific reason for each).
* Creating a shipment does not yet emit a first tracking event; Postgres creates
  the shipment identity automatically when the order row is written.