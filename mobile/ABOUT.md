# Pulse mobile — Android Studio project brief

Open the **`mobile` folder** in Android Studio with the Flutter plugin installed.
This is the active Flutter application for Pulse. It is currently an offline,
interactive product preview and is not connected to Supabase or real accounts.

## What the preview demonstrates

* Operations dashboard with sample order and shipment summaries.
* Searchable and filterable orders, with an order details sheet.
* Shipment passports with a source-aware event timeline.
* A sample carrier directory and a partner-request preview.
* Driver task, availability, and delivery-progress screens.
* Responsive bottom navigation on phones and a navigation rail on wider screens.

Every operational record is invented. Actions such as adding a shipment update,
requesting a carrier, or changing a driver task are local preview interactions:
they do not send network requests and are not persisted to a live workspace.
The app visibly labels this boundary.

## Run and test

From PowerShell in this folder:

```powershell
flutter pub get
flutter run
flutter analyze
flutter test
flutter build apk --debug
```

`flutter run` starts the debug preview. The resulting APK is written to
`build/app/outputs/flutter-apk/app-debug.apk`.

Release builds show a configuration gate instead of the sample workflows. Do
not publish a release until authentication, live data access, authorization, and
production error states have been implemented and reviewed.

## Code map

```text
lib/main.dart                  Material 3 app shell and adaptive navigation
lib/demo_data.dart             Explicitly fictional offline example records
lib/screens/                   Dashboard, orders, shipments, network, driver
lib/widgets.dart               Shared cards, status, route and preview UI
test/widget_test.dart          Core flow and phone/tablet layout tests
```

## Next integration work

Supabase project configuration is intentionally deferred. Before production
operations are enabled, add sign-in/session handling, workspace and role
selection, RLS-backed reads, authorized RPC mutations, shipment pagination, and
real loading/error/empty states. Never ship service-role credentials in a
mobile app. The database remains the authority for access, state transitions,
canonical status, and event verification.

Customer-side booking and tracking, provider verification, secure document
storage, webhook ingestion, payments, maps, notifications, and messaging also
remain unconfigured external/product work. This preview does not simulate their
live behavior.

The earlier native Kotlin prototype remains in `../android`; it is not the
canonical Android app now that the Flutter project exists.
