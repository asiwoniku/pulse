-- 0005: orders + append-only status history + database-enforced state machine.
--
-- Reconciliation note: section 9 of the Master Engineering Specification names
-- a "ready for assignment" stage; the canonical enum in section 10 does not
-- include it. Assignment is therefore permitted from `under_review` and
-- `accepted`, which is where a dispatcher would have found it. Documented in
-- docs/database.md.

create table public.order_references (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  period       text not null,
  last_value   integer not null default 0,
  primary key (business_id, period)
);

-- Monotonic, gap-tolerant-per-period human reference, e.g. ORD-2026-00042.
-- Locked per business+period so concurrent inserts cannot collide.
create or replace function public.next_order_reference(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period text := to_char(now() at time zone 'utc', 'YYYY');
  v_next   integer;
begin
  insert into public.order_references as seq (business_id, period, last_value)
  values (p_business_id, v_period, 1)
  on conflict (business_id, period)
    do update set last_value = seq.last_value + 1
  returning seq.last_value into v_next;
  return 'ORD-' || v_period || '-' || lpad(v_next::text, 5, '0');
end;
$$;

create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  customer_id            uuid references public.customers (id) on delete set null,
  reference              text not null,
  status                 public.order_status not null default 'requested',
  source                 text not null default 'owner_app'
                           check (source in ('owner_app', 'whatsapp', 'customer_link', 'import', 'api', 'driver_app')),
  service_type           text not null default 'delivery'
                           check (service_type in ('delivery', 'moving', 'errand', 'freight')),
  description            text check (description is null or char_length(description) <= 4000),
  -- Real, typed parcel data. NULL means "the business did not capture it".
  parcel_details         jsonb not null default '{}'::jsonb,
  pickup_text            text not null check (char_length(trim(pickup_text)) >= 3),
  destination_text       text not null check (char_length(trim(destination_text)) >= 3),
  pickup_location_id     uuid references public.locations (id) on delete set null,
  destination_location_id uuid references public.locations (id) on delete set null,
  requested_at           timestamptz not null default now(),
  scheduled_at           timestamptz,
  promised_at            timestamptz,
  -- Commercial data is only what the business actually entered. No invented
  -- pricing, and provider fields stay NULL until a provider really exists.
  price_amount           numeric(14,2) check (price_amount is null or price_amount >= 0),
  currency               char(3) not null default 'NGN',
  payment_status         public.payment_status not null default 'unpaid',
  payment_method         public.payment_method,
  payment_provider       text,
  provider_payment_id    text,
  -- Proof of delivery artefacts. NULL until the driver really captures them.
  delivered_to_name      text,
  signature_url          text,
  delivery_photo_url     text,
  delivery_otp_required  boolean not null default false,
  delivery_otp_hash      text,
  delivery_otp_verified  boolean,
  internal_notes         text check (internal_notes is null or char_length(internal_notes) <= 4000),
  cancel_reason          text,
  cancelled_by           uuid references public.profiles (id) on delete set null,
  cancelled_at           timestamptz,
  failure_reason         text,
  -- Token for a future customer tracking link. Issued, never displayed as data.
  tracking_token         uuid not null default gen_random_uuid(),
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  status_changed_at      timestamptz not null default now(),
  unique (business_id, reference),
  unique (tracking_token)
);

-- Append-only. Every status change and every notable delivery event lands here.
create table public.order_status_history (
  id            bigint generated always as identity primary key,
  business_id   uuid not null references public.businesses (id) on delete cascade,
  order_id      uuid not null references public.orders (id) on delete cascade,
  from_status   public.order_status,
  to_status     public.order_status not null,
  delivery_event public.delivery_event,
  note          text,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_role    public.business_role,
  actor_kind    public.actor_type not null default 'staff',
  occurred_at   timestamptz not null default now()
);

create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();
create trigger trg_history_no_update before update or delete on public.order_status_history
  for each row execute function public.forbid_mutation();

create unique index idx_orders_active_per_customer
  on public.orders (business_id, customer_id)
  where status not in ('completed', 'cancelled', 'failed');
create index idx_orders_business_status on public.orders (business_id, status, requested_at desc);
create index idx_orders_customer        on public.orders (customer_id, requested_at desc);
create index idx_orders_tracking_token  on public.orders (tracking_token);
create index idx_history_order_time     on public.order_status_history (order_id, occurred_at);
