# Pulse Android

Kotlin + Jetpack Compose client for dispatch, driver, workspace, and shipment
passport workflows. Every business rule is enforced in `supabase/migrations`;
the live app only asks for things and renders what comes back.

For the full product scope, architecture, Android Studio setup, and demo-data
boundary, start with [ABOUT.md](./ABOUT.md).

## Configure before building

The live app has no fake backend. An unconfigured build shows an amber
"not configured" banner and refuses to make requests. Debug builds additionally
offer a separate, read-only mock-data preview; its fixtures are kept under
`app/src/debug/` and are not used by authenticated operations. Release builds
disable that entry point.

Create `android/local.properties`:

```properties
pulse.supabase.url=https://YOUR-PROJECT-REF.supabase.co
pulse.anon.key=YOUR-SUPABASE-PUBLISHED-ANON-KEY
```

They are read by `app/build.gradle.kts` into `BuildConfig.SUPABASE_URL` /
`SUPABASE_ANON_KEY` (`pulseProp()` in that file). Passing `-Ppulse.supabase.url=…`
works too. `local.properties` is git-ignored by the Android Studio template; the
anon key is a public client key — authorization comes from RLS, never from it.

Then:

```bash
cd android
./gradlew :app:assembleDebug        # needs JDK 17+ and an Android SDK (36)
./gradlew :app:testDebugUnitTest
```

On Windows PowerShell, use `.\gradlew.bat` instead of `./gradlew`.

## Layout

```
app/src/main/java/com/pulse/logistics/
  MainActivity.kt                Compose host, PulseTheme
  core/designsystem/Theme.kt     Pulse Blue, status colour scale
  core/model/                    enums mirroring Postgres types, row DTOs, mappings
  core/network/SupabaseClient.kt PostgREST + GoTrue calls, error mapping
  core/network/SessionStore.kt   DataStore session, active workspace
  data/                          AuthApi, WorkspaceApi, OrdersApi, OperationsApi
  data/ShipmentsApi.kt           RLS-filtered passport reads and manual events
  ui/                            PulseViewModel(+Actions), PulseApp, Components
app/src/debug/                    Isolated offline fixtures and preview
app/src/release/                  No-fixtures preview stub
```

## Deliberate client rules

- **The status mirror is advisory.** `core/model/PulseEnums.kt` copies
  `order_transition_edges()` so buttons can be dimmed; the database still decides,
  and its message is displayed verbatim (`SupabaseApiException.message`).
- **No retry on writes.** Re-applying the current status is a legal no-op in the
  guard, so a manual replay is safe; automatic retry loops are not.
- **No optimistic status.** A board that lies about a stage is worse than a slow one.
- **Unknown enum text decodes to null** and is printed raw rather than mapped to a
  guess, so a column or value added by a later migration cannot be silently mislabelled.
- **Empty live data is rendered as empty.** `No orders yet in this workspace.` is a
  real state of the system. Debug examples require explicitly opening the separate
  offline preview and carry a persistent sample-data label on every item.

## What is still unconfigured (and shown as such)

| Capability | Client status |
|---|---|
| FCM push delivery | token registration only (`register_device`); no notification fan-out |
| Payment providers | no SDK; `payment_status` renders whatever the database holds |
| Maps / geocoding / ETA | manual address text; no ETA is computed client-side |
| WhatsApp deep link | not implemented; import paths live server-side |
| Proof photo upload | text field path only; Storage bucket `proofs` policies exist server-side |

Each of those needs a real credential or SDK before it can exist. Until then the UI
says what is missing instead of faking a result.

## Verified / not verified

The project requests JDK 17 and Android SDK Platform 36. Build and test results
are tracked in [ABOUT.md](./ABOUT.md) and should be repeated after changing the
Compose UI or Supabase contract. A local build can validate compilation but does
not verify a deployed Supabase project, migration `0022`, real RLS membership, or
provider integrations.
