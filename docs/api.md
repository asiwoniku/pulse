# Pulse RPC and read contract

Both clients consume the same Supabase surface. This table is the shared
contract: the parameter names and types below are literally the Postgres
signatures in `supabase/migrations`, so a client that matches this file matches
the database. Anything a client is tempted to compute itself is listed at the
bottom as **server-derived** — do not reimplement it.

Calling convention: `POST {SUPABASE_URL}/rest/v1/rpc/<name>` with the user's
`Authorization: Bearer <access_token>`, `apikey`, `Content-Type: application/json`,
and a JSON body whose keys are the `p_*` parameter names. Reads are
`GET {SUPABASE_URL}/rest/v1/<table>?<filters>&select=<columns>`; RLS decides which
rows come back, so an empty list is a legitimate answer, never a reason to fall
back to bundled data.

## Identity and workspace

| RPC | Parameters | Returns | Fails when |
|---|---|---|---|
| `create_business` | `p_name text`, `p_city?`, `p_country_code?`, `p_timezone?`, `p_currency?` | `businesses` | name shorter than 2 chars; unauthenticated |
| `invite_worker` | `p_business_id uuid`, `p_email text`, `p_role business_role`, `p_display_name?`, `p_phone_e164?` | `business_invitations` | caller cannot operate; inviting `owner`; non-owner inviting `admin`; malformed email |
| `accept_invitation` | `p_code text` | `business_members` | code unknown; already consumed; expired; issued to a different email/phone |
| `current_business_ids` | – | set of uuid | – |
| `register_device` | `p_push_token text`, `p_platform text`, `p_app_version?` | `devices` | unauthenticated |

Reads: `businesses`, `business_members`, `business_invitations` (staff only),
`profiles`.

## Orders

| RPC | Parameters | Returns | Fails when |
|---|---|---|---|
| `create_delivery_order` | `p_business_id`, `p_customer_name`, `p_customer_phone`, `p_pickup_text`, `p_destination_text`, `p_description?`, `p_parcel_details?`, `p_service_type?`, `p_price_amount?`, `p_payment_method?`, `p_scheduled_at?` | `orders` | caller cannot operate; phone not E.164; pickup or destination under 3 chars |
| `assign_driver` | `p_order_id`, `p_driver_id`, `p_assignment_type?`, `p_scheduled_start?`, `p_notes?` | `driver_assignments` | caller cannot operate; order not assignable; driver outside this business |
| `cancel_assignment` | `p_assignment_id`, `p_reason?` | `void` | caller cannot operate; assignment no longer current |
| `respond_to_assignment` | `p_assignment_id`, `p_accept boolean`, `p_reason?` | `driver_assignments` | caller is not that driver |
| `record_delivery_attempt` | `p_order_id`, `p_event delivery_event`, `p_note?` | `void` | neither the assigned driver nor staff |
| `capture_proof_of_delivery` | `p_order_id`, `p_delivered_to_name`, `p_signature_url?`, `p_photo_url?`, `p_otp_code?` | `orders` | not assigned driver; no artefact captured; OTP missing or wrong when required |
| `set_driver_availability` | `p_status driver_status`, `p_driver_id?` | `drivers` | driver changing someone else's status; staff without rights; no driver profile linked to account |

Reads: `orders` (embedded `customers`, `locations`, `driver_assignments`),
`order_status_history` (append-only, ordered by `occurred_at`),
`driver_assignments`, `assignment_events`, `drivers`, `customers`, `vehicles`,
`locations`.

## Status transitions (server-derived)

Legal edges are exactly `public.order_transition_edges()` (migration `0006`):

- `draft → requested | cancelled`
- `requested → under_review | assigned | cancelled`
- `under_review → quoted | accepted | assigned | cancelled`
- `quoted → awaiting_customer_approval | accepted | assigned | cancelled`
- `awaiting_customer_approval → accepted | cancelled`
- `accepted → assigned | cancelled`
- `assigned → driver_accepted | under_review (reassignment) | cancelled`
- `driver_accepted → driver_arrived | at_pickup | under_review | cancelled`
- `driver_arrived → at_pickup | pickup_attempt_failed | cancelled`
- `at_pickup → picked_up | pickup_attempt_failed | cancelled`
- `pickup_attempt_failed → driver_arrived | at_pickup | failed | cancelled`
- `picked_up → in_transit | cancelled`
- `in_transit → arrival_attempted | delivered | failed | cancelled`
- `arrival_attempted → delivered | in_transit | failed | cancelled`
- `delivered → completed`
- `completed`, `cancelled`, `failed` are terminal.

Division of labour (`status_requires_driver()` + `guard_order_status_change`):

- Execution stages (`driver_accepted`, `driver_arrived`, `at_pickup`,
  `pickup_attempt_failed`, `picked_up`, `in_transit`, `arrival_attempted`,
  `delivered`) require the **assigned** driver when the caller is a driver.
- Dispatch and commercial stages (`requested`, `under_review`, `quoted`,
  `accepted`, `assigned`, `cancelled`, `completed`) are staff-only: a driver
  calling them is refused with `42501`.
- Re-applying the status an order already has succeeds as a **no-op**, which is
  what makes an offline replay safe.
- Any other request returns `45000` with a sentence written for operators
  (`illegal order transition in_transit -> completed`) — render it, do not retry
  blindly.

## Money, ratings, references (never client-computed)

- `order_reference`: allocated by locked per-business-per-year sequences, format
  `ORD-YYYY-00001`.
- `average_rating`, `completed_order_count`: recomputed by triggers from real
  feedback and real completions; NULL/0 until such events exist.
- `payment_attempts.status`: only moves on a real provider response or an
  explicit staff confirmation of cash/bank transfer; `provider` stays `manual`
  until a provider is wired.
- `notifications.status`: `skipped` with `failure_reason` while no provider
  credential exists.

## Realtime

Subscribed tables: `orders`, `driver_assignments`, `assignment_events`,
`notifications`. Filter by `business_id` client-side for display; RLS already
limits what the socket can deliver.

## Error rendering

Supabase returns `{"code": "...", "message": "..."}`. The `message` is authored
for humans in the migrations, so show it. Never substitute a generic failure
string for a specific one the database already explained.
