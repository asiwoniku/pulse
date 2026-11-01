# Pulse Flutter apps

The active Android clients live in this folder:

- **Pulse** is the partner workspace.
- **Pulser** is the driver app, built from `lib/main_pulser.dart`.

Both use Supabase Auth and the signed-in user's access token. Postgres RLS and
RPCs remain the authority for reads and mutations. A missing Supabase
configuration opens a setup screen; it never falls back to sample data. The
fictional offline preview is an explicit option in debug builds only.

## Run locally

From PowerShell in this folder, provide a Supabase project URL and publishable
(or legacy anon) key. Never put a service-role key in the app.

```powershell
flutter pub get
flutter run -t lib/main.dart `
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co `
  --dart-define=SUPABASE_ANON_KEY=<publishable-key>
```

Pulser uses a distinct entry point:

```powershell
flutter run -t lib/main_pulser.dart `
  --dart-define=PULSE_APP=pulser `
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co `
  --dart-define=SUPABASE_ANON_KEY=<publishable-key>
```

The Android flavors currently declared in `android/app/build.gradle.kts` are
`plsAcme`, `plsAcmePulser`, `plsDemo`, and `plsDemoPulser`. Release builds need
the corresponding flavor, entry point, configuration, and a production signing
key. Do not distribute a build until the database migrations are deployed and
the live project and authentication settings have been verified.

## Live workflows

Pulse supports email authentication, workspace creation and invitation
acceptance, and RLS-backed shipment/order reads. Pulser supports driver account
verification, assignment accept/decline, delivery-attempt capture, proof of
delivery, and availability updates. Errors from the database are shown rather
than presented as successful actions.

Customer-side booking and tracking, partner operations beyond these mobile
surfaces, account provisioning, provider webhooks, payments, maps, notifications,
and messaging remain incomplete or unconfigured. The customer flow must not be
simulated as a live feature.

## Validate

```powershell
flutter analyze
flutter test
flutter build apk --debug
```

See [ABOUT.md](./ABOUT.md) for the application boundary and feature map.
