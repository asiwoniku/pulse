# Pulse Platform Admin

`admin-web/` is the standalone Pulse-owned platform control plane. It is not a
partner portal and has no route or API for shipments, orders, drivers, customers,
dispatch, or partner evidence.

## Platform capabilities

- View an aggregate count of organisation accounts and verification states.
- Review organisation profile data, verification method/source/limitations, and
  account standing.
- Suspend or reactivate a platform account. Suspended organisations cannot make
  operational changes through the database `can_operate` gate.
- Read the append-only audit history of platform review actions.

The console does not expose partner work. Its Supabase RPCs check the trusted
`app_metadata.platform_admin` claim, return only platform-level organisation
metadata, and write to a separate platform audit table. Platform-admin claims
must be assigned by a trusted server-side operator; never from a browser or
user-editable metadata. A platform-admin claim does not grant partner workspace
membership or bypass partner row-level security.

Verification decisions are manual records, not external certification. Marking an
organisation verified requires the reviewer to record the method, source, and
limitations. Evidence storage and business application submission remain future
work; this page does not claim that verification data exists when it does not.

## Configure and run

Copy `.env.example` to `.env.local` and set the public Supabase URL and
publishable/anon key:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>
```

Never put a service-role key in the browser app.

```powershell
cd admin-web
npm install
npm run dev
npm run build
```

The app signs in through Supabase Auth and immediately checks the protected
`platform_admin_overview` RPC. A normal partner login is rejected. Apply database
migrations through `0026` before using the platform review functions.

## Provision an administrator

Create the Auth user through the trusted account-provisioning process, then set
`app_metadata.platform_admin` with the Supabase Auth Admin API from a private
server environment:

```ts
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { platform_admin: true },
})
```

The Admin API/service-role credential must never be shipped to this frontend.
Remove the claim server-side to revoke platform access; the user's next refreshed
JWT will no longer pass the protected RPC check.
