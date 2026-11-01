# Pulse mobile — Android project brief

The active mobile clients are Flutter apps under `mobile/`. Pulse is the partner
workspace; Pulser is a separate driver app using `lib/main_pulser.dart`.

With Supabase URL and publishable/anon key supplied at build time, the clients
use Supabase Auth and the signed-in user's token for PostgREST/RPC access. The
database remains responsible for authorization, order state transitions, and
the shipment event trail. Without configuration the app shows a setup screen.
Only debug builds can explicitly open the fictional, device-only preview.

## Live capabilities

- Pulse: email sign-in/sign-up, workspace creation and invitation acceptance,
  live shipment passports, and live order lists.
- Pulser: driver account verification, assigned jobs, accept/decline, delivery
  attempts, proof of delivery, and availability.

The apps do not include customer booking/tracking, account provisioning,
provider webhook ingestion, or live payments/maps/notifications/messaging yet.
Never use a service-role key in either client. A release must be configured
against a deployed database and signed with a production key before distribution.

## Build and test

See [README.md](./README.md) for run commands and flavor names.

```powershell
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

The earlier Kotlin/Compose prototype remains in `../android`; it is not the
canonical mobile implementation.
