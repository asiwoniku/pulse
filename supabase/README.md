# Supabase schema

Twenty-two migrations build the control plane: schema, the order state machine,
marketplace offers, canonical shipment identities and event history, RBAC, and
row level security. Nothing in here contains demo data.

## Applying

```bash
supabase link --project-ref <ref>
supabase db push            # applies migrations in filename order
```

Or through the dashboard SQL editor, running each file top to bottom in numeric
order. Migrations are strictly ordered: later files call helpers defined in
earlier ones, and `0014` revokes the privileges that `0016` re-grants before
later migrations explicitly add their required grants.

There is no `seed.sql` and no demo data (see below), so `supabase db reset`
leaves an empty but fully functional database. That is the intended state.

## Migration map

| File | Responsibility |
|---|---|
| 0001 | extensions, every enum, `set_updated_at`, `forbid_mutation` |
| 0002 | `profiles`, signup trigger, `current_user_id`, `current_user_is_platform_admin` |
| 0003 | businesses, memberships, invitations, `member_role`, `is_business_member`, `has_business_role`, `can_operate`, `shares_business_with`, `current_business_ids` |
| 0004 | customers, drivers, vehicles, locations, devices + business-consistency trigger |
| 0005 | orders, `order_status_history`, per-business yearly reference sequences |
| 0006 | the state machine: legal transitions, driver vs staff stage rules, history writer |
| 0007 | `driver_assignments`, `assignment_events`, `driver_has_current_assignment` |
| 0008 | `assign_driver`, `cancel_assignment` |
| 0009 | `create_delivery_order`, `respond_to_assignment`, `record_delivery_attempt`, `capture_proof_of_delivery`, `set_driver_availability`, `register_device` |
| 0010 | `create_business`, `invite_worker`, `accept_invitation`, `current_user_email` |
| 0011 | notifications, payment attempts, moving requests and items |
| 0012 | feedback (completed orders only), `audit_logs`, rating refresh |
| 0013 | column guards, `is_order_participant`, `is_moving_participant`, `active_business_id` |
| 0014 | enable RLS everywhere, revoke defaults, identity/business/people policies |
| 0015 | policies for orders, assignments, notifications, payments, moving, feedback, audit |
| 0016 | grants, realtime publication, `proofs` storage bucket and its policies |
| 0017 | `business_kind` (carrier \| vendor), vendor phone requirement, `create_business` gains `p_kind`/`p_phone_e164` |
| 0018 | `delivery_offers`, `offer_events`, one-pending-per-pair index, `expire_stale_offers` |
| 0019 | `orders.originator_business_id`, offer policies, `guard_offer_transition` |
| 0020 | `browse_carriers` (directory read), `create_delivery_offer` |
| 0021 | `respond_to_offer` (offer → order), `withdraw_offer`, counterparty read policy |
| 0022 | one-to-one Pulse shipment identity for each order, append-only source-aware event history, verification state, idempotent event RPC, participant RLS and realtime |
| 0023 | re-creates the `on_auth_user_created` sign-up trigger and revokes execute on the internal functions from `PUBLIC` as well as `authenticated` |
| 0024 | closes every application RPC to `PUBLIC`/`anon`, then re-grants the client-facing set to `authenticated` |

## The marketplace in one paragraph

A business is a `carrier` (fulfils deliveries, employs drivers) or a `vendor`
(originates jobs and hands them to carriers) — `0017`. A vendor browses carriers with
`browse_carriers()` and sends one `create_delivery_offer()`; the carrier answers with
`respond_to_offer()`. On **accept** the offer becomes an ordinary order in the
*carrier's* business, with the vendor recorded as that carrier's customer (a carrier
invoices the vendor that sent it the job) and `originator_business_id` linking back —
`0019`, `0021`. That is why no second fulfilment path exists: the state machine,
one-live-assignment, the column guards and the status history all apply unchanged.

Migration `0022` gives each order an immutable `PLS-<country>-<sequence>` shipment
identifier and mirrors its real status history into `pulse_shipment_events`.
Events retain their source, occurrence/receipt times, verification level,
optional location/evidence, actor and idempotency key. Order-driven events are
verified first-party records; partner-submitted events remain provider-reported
or pending review and do not silently change the order status. Shipment and event
reads follow the same customer, carrier and vendor visibility as the linked order.
This is the data foundation only: public tracking links, document/inspection
workflows, provider integrations and the Shipment Passport UI are not included.

`browse_carriers()` is deliberately a `SECURITY DEFINER` function and not a policy.
Discovery means reading businesses you do not belong to, and RLS is row-level, so any
policy wide enough to expose a carrier row would expose every column of it. The
function returns exactly the directory columns and nothing else. Ratings are aggregated
live from real feedback, never denormalised, so a carrier with no completed work shows
no rating rather than an invented one.

## Why there is no seed data

The product rule is that the platform must never show fabricated work. Demo
orders would leak into metrics, driver ratings, and dispatch decisions, and a
dispatch team cannot tell invented rows from real ones after a week of use. So:

- no `seed.sql`, no fixture scripts, no `insert` of business rows anywhere;
- customers appear only when a real order is created or a real number is
  imported (`customers.source` records which happened);
- `average_rating` and `completed_order_count` stay NULL/0 until real feedback
  or real completions exist (`0012`, `on_order_completed`);
- payment, notification, and WhatsApp integrations keep `status = 'skipped'`
  plus a `failure_reason` naming what is missing — an empty integration reads
  as empty in the UI instead of pretending to work.

For local exploration, create your own first workspace through the app: sign up,
call `create_business`, then `invite_worker`. Those rows are yours and disappear
with your project.

## Security model in one paragraph

Every authorization helper is `SECURITY DEFINER` with `search_path` pinned, so
policies can ask membership questions without recursing into their own table's
RLS. Policies grant reads by membership or participation and grant writes only to
`can_operate(business_id)`; the writes that must be atomic or role-checked are
`SECURITY DEFINER` RPCs, and their tables expose no INSERT policy at all. `0016`
revokes execute on `write_audit`, `next_order_reference`,
`refresh_driver_rating`, and `handle_new_auth_user` because those are internal.

**When you add an RPC, add its grant.** `0016` grants execute to `authenticated`
for the functions that existed when it was written; a new function is not
callable from the apps until it is granted (or `0016` is re-run). `0024` then
closes everything to `PUBLIC`, so a new RPC is unreachable by both `anon` and
`authenticated` until it appears in `0024`'s client list — that is deliberate,
because Postgres' default is the opposite (execute granted to `PUBLIC`).

## Two defects found against a live project

Both were invisible while the database was empty and both broke authentication
outright. `0023` and `0024` are the fix; they are idempotent, so a fresh
`db push` and this project end in the same state.

**The sign-up trigger never existed (`0002`).** The trigger was guarded by

```sql
if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'auth' and p.proname = 'users') then
```

`pg_proc` holds functions. `auth.users` is a *table*, so the guard was always
false and `on_auth_user_created` was never created. Every real sign-up produced
an auth user with no `public.profiles` row, which left the profile read empty
and made the `current_user_id()`-scoped RLS policies unable to match the caller.
`0023` uses `to_regclass('auth.users')`, which resolves relations, and verifies
with `pg_trigger`.

**Internal functions stayed callable (`0016`).** `0016` revokes execute from
`authenticated`, but Postgres grants execute to `PUBLIC` on every new function
and `authenticated` holds it through `PUBLIC`. Revoking from a named role cannot
remove a privilege that role holds via `PUBLIC`, so `refresh_driver_rating(uuid)`
remained callable by any client with a key. `0023` revokes `PUBLIC` too.

The same mistake applied more widely to the client RPCs: because `PUBLIC` was
never revoked, all 25 `SECURITY DEFINER` functions were reachable at
`/rest/v1/rpc/<name>` with the publishable anon key and no session. `0024` brings
that to zero:

```sql
-- must be 0
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'execute');
```

## Verifying a fresh project

Run these after `db push`; each returns what the comment expects.

```sql
-- any hit = a table with RLS still off
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname <> 'spatial_ref_sys'
  and c.relrowsecurity is false;

select count(*) as policies from pg_policies where schemaname = 'public';  -- > 30

select tablename from pg_publication_tables
where pubname = 'supabase_realtime';  -- orders, driver_assignments,
                                     -- assignment_events, notifications

-- all four must be false
select proname,
       has_function_privilege('authenticated', p.oid, 'execute') as can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('write_audit','next_order_reference',
                  'refresh_driver_rating','handle_new_auth_user');

-- New shipment tables must have RLS enabled.
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('pulse_shipments','pulse_shipment_events')
  and c.relrowsecurity is false;

-- The event writer is available to signed-in clients; direct event-table writes are not.
select has_function_privilege(
         'authenticated',
         'public.record_shipment_event(text,text,text,text,text,timestamptz,text,numeric,numeric,jsonb,jsonb)',
         'execute'
       ) as can_record_shipment_event;

select has_table_privilege('authenticated', 'public.pulse_shipment_events', 'insert')
       as can_insert_shipment_events; -- must be false

-- Sign-up must provision a profile (0023). Without this trigger every account has
-- an auth user and no profile, and the RLS policies below cannot match anyone.
select exists (
  select 1 from pg_trigger
  where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
) as signup_trigger_present; -- must be true

-- No application RPC may be reachable without a session (0024).
select count(*) as anon_callable_rpcs
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'execute'); -- must be 0

-- Every existing order must have exactly one shipment, and mirrored status must agree.
select count(*) as orders_without_shipment
from public.orders o
left join public.pulse_shipments s on s.order_id = o.id
where s.id is null; -- 0

select count(*) as shipment_status_mismatches
from public.orders o
join public.pulse_shipments s on s.order_id = o.id
where s.current_status is distinct from o.status; -- 0

-- the real proof: the schema must be empty of business data
select (select count(*) from orders)      + (select count(*) from customers)
     + (select count(*) from drivers)     + (select count(*) from businesses) as seeded_rows;
```

If a policy helper is renamed, `create policy` fails loudly at migration time —
that is the intended failure mode, not a silent fallthrough to permissive.

## Invariants the database enforces


- **Status transitions** (`0006`): `guard_order_status_change` rejects illegal
  transitions and enforces driver-only stages (`arrived`,
  `delivery_attempt_failed`) versus staff-only stages; re-applying the current
  status is a no-op so retries are safe.
- **Append-only history** (`0005`, `0006`, `0012`, `0018`, `0022`):
  `order_status_history`, `assignment_events`, `audit_logs`, `order_feedback`,
  `offer_events`, and `pulse_shipment_events` reject UPDATE/DELETE through
  `forbid_mutation`.
- **One live assignment per order** (`0007`): partial unique index on
  `driver_assignments (order_id) where is_current`.
- **Driver/business consistency** (`0004`): a `drivers` row cannot pair someone
  else's profile with a business they do not belong to.
- **Column guards** (`0013`): a driver cannot edit price, payment state, their own
  rating, counters, or ownership links.
- **No client-side references** (`0005`): `ORD-YYYY-NNNNN` comes from locked
  per-business-per-year sequences, and `next_order_reference` is not executable by
  `authenticated`.
