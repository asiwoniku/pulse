# Database reference

The schema itself is documented where it is written: `supabase/README.md` carries the
migration map, the invariants, the security model, and the verification queries. This
file records only what must outlive a single migration: the growth path that migration
`0001` promises so nobody re-litigates it later.

## Enum families that already anticipate growth

- `order_status` covers the delivery and moving lifecycles in one enum, including the
  quoting stages (`quoted`, `awaiting_customer_approval`) a moving job needs. Delivery
  milestones stay in `delivery_event` so a failed attempt never destroys the primary
  status.
- `moving_status` carries the survey path (`awaiting_survey`, `survey_scheduled`,
  `survey_complete`) used by `moving_requests` (`0011`).
- `boolean_request` (`unset | yes | no`) exists so a survey answer that was never
  asked is distinguishable from a "no". Never replace it with `boolean`.
- `payment_status` includes `pending_confirmation` — the honest state while no payment
  provider is configured.
- `actor_type` and `business_role` are the vocabulary of the audit trail and RBAC;
  new capabilities extend `can_operate()`, they do not add a parallel permission table.

## Marketplace and shipment layer

Migrations `0017`–`0022` establish business kinds, carrier discovery, vendor
delivery offers, and a canonical Pulse shipment identity for each accepted order.
`pulse_shipment_events` preserves the real event source, verification state,
timestamps, optional location/evidence, actor, and idempotency key. The event
timeline is append-only; partner-submitted events do not update the order's
authoritative status.

| Area | Tables intended | Blocked on |
|---|---|---|
| Internationalisation | `i18n_strings`, `locale_overrides` | a second language with real translated copy, not machine strings |
| Provider integrations | provider-specific webhook/event persistence and retry processing | selected providers, credentials and the transport tier (ADR-002) |
| Shipment operations | documents, inspections, claims/disputes, customs/custody records | agreed workflows, retention rules and partner requirements |
| Multi-leg movements | shipment legs, hand-offs and per-provider custody | carrier integration and multi-provider workflow design |
| Customer marketplace | customer discovery/booking and public shipment passport | customer app and product/API decisions |
| Price books | `rate_cards`, `zone_fares` | a business that has written its rates down |

Adding any of them means a new migration, policies in the same PR, and explicit
grants; do not widen access to make a client work.

## Column-level rules worth remembering

- `orders.reference` is allocated by locked per-business-per-year sequences; it is
  never client-supplied and never reused after a cancel.
- `customers.phone_e164` is the identity anchor; `profile_user_id` links a customer to
  a login only when that person really registered.
- `drivers.average_rating` and `completed_order_count` are derived columns written only
  by triggers (`0012`, `on_order_completed`) from real feedback and real completions.
- `order_status_history`, `assignment_events`, `audit_logs`, `order_feedback`,
  `offer_events`, and `pulse_shipment_events` are append-only:
  `forbid_mutation` rejects UPDATE and DELETE at the trigger level.
