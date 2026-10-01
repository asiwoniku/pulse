# ADR-001: Native Android and iOS clients instead of Flutter

- Status: accepted
- Date: 2026-09-30
- Context: specification, `pulse-logistics-platform-spec.txt` section on tech stack

## Decision

Clients are written natively: Kotlin with Jetpack Compose on Android, Swift with
SwiftUI on iOS. The specification preferred Flutter. This is a deliberate
departure, recorded here rather than buried in a commit message.

## Why

The specification's own constraints push against a single shared UI layer:

1. **Three different operator surfaces, not one app.** Dispatch, driver, and
   customer flows have different lifecycles and different background work. On
   Android the driver app needs a foreground service for location and delivery
   attempts; Flutter would shell out to platform channels for it anyway, so the
   "one codebase" saving never materialises where it matters.
2. **Offline-first dispatch.** Order status changes must survive a dropped
   connection and replay in order. Room/SQLDelight on Android and GRDB/Core Data
   on iOS are mature and debuggable; a cross-platform DB abstraction is where
   ordering bugs and lost writes hide.
3. **Notification and provider boundaries.** FCM/APNs, the WhatsApp deep link
   boundary, and any payment sheet are platform SDKs. Native clients keep those
   calls direct and let the business rules stay in Postgres, where both platforms
   share them through RPCs.
4. **Maps.** Route and geocoding SDKs are platform-first; native integration
   avoids a channel layer per map interaction.

What is shared is the part that must not drift: the schema, the state machine,
RBAC, and the RPC contracts. Both clients consume the same PostgREST surface and
neither re-implements a business rule.

## Cost we accepted

- Two UI codebases, two release trains, roughly 1.6x UI effort.
- A discipline requirement: the API contract has to be written down (see
  `docs/api.md`) or the two clients drift. That document is now load-bearing.
- No hot-update path. Flutter would have offered one; we consider OTA UI updates
  inappropriate for a system whose audit trail is the product.

## Revisit when

A third platform (web dispatch console) is prioritised over native polish on the
mobile apps — then a shared TypeScript/React web console is cheaper than a third
native client, and this ADR does not block it.
