-- 0011: notifications, payment attempts, moving workflow.
-- Every table here records only events that genuinely happened. Provider
-- columns stay NULL until a provider is wired up, and a 'skipped' notification
-- with a failure_reason is how an unconfigured integration is represented.

create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  order_id           uuid references public.orders (id) on delete cascade,
  recipient_user_id  uuid references public.profiles (id) on delete cascade,
  channel            public.notification_channel not null,
  template_key       text not null,
  title              text not null,
  body               text not null,
  status             public.notification_status not null default 'pending',
  provider_message_id text,
  failure_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  sent_at            timestamptz
);

-- A payment attempt records what was really asked of a provider. Cash and bank
-- transfer confirmations are staff actions, so provider stays 'manual'.
create table public.payment_attempts (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  order_id           uuid not null references public.orders (id) on delete cascade,
  provider           text not null default 'manual',
  provider_reference text,
  amount             numeric(14,2) not null check (amount >= 0),
  currency           char(3) not null,
  status             public.payment_status not null default 'pending_confirmation',
  provider_payload   jsonb,
  failure_reason     text,
  initiated_by       uuid references public.profiles (id) on delete set null,
  confirmed_by       uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  confirmed_at       timestamptz
);

create table public.moving_requests (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  order_id               uuid unique references public.orders (id) on delete cascade,
  customer_id            uuid references public.customers (id) on delete set null,
  status                 public.moving_status not null default 'request_submitted',
  origin_text            text not null check (char_length(trim(origin_text)) >= 3),
  destination_text       text not null check (char_length(trim(destination_text)) >= 3),
  preferred_date         date,
  survey_note            text,
  requires_survey        public.boolean_request not null default 'unset',
  requires_packing       public.boolean_request not null default 'unset',
  requires_unpacking     public.boolean_request not null default 'unset',
  requires_crate_storage public.boolean_request not null default 'unset',
  has_stairs             public.boolean_request not null default 'unset',
  has_elevator           public.boolean_request not null default 'unset',
  quote_amount           numeric(14,2) check (quote_amount is null or quote_amount >= 0),
  currency               char(3) not null default 'NGN',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Real captured inventory: quantities and conditions come from a survey, never
-- from a generator.
create table public.moving_items (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses (id) on delete cascade,
  moving_request_id    uuid not null references public.moving_requests (id) on delete cascade,
  name                 text not null check (char_length(trim(name)) between 2 and 120),
  quantity             integer not null default 1 check (quantity > 0),
  condition_note       text,
  handling_instruction text,
  captured_by          uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger trg_notifications_updated   before update on public.notifications    for each row execute function public.set_updated_at();
create trigger trg_payment_attempts_upd    before update on public.payment_attempts for each row execute function public.set_updated_at();
create trigger trg_moving_requests_upd     before update on public.moving_requests  for each row execute function public.set_updated_at();
create trigger trg_moving_items_upd        before update on public.moving_items     for each row execute function public.set_updated_at();

create index idx_notifications_recipient on public.notifications (recipient_user_id, created_at desc);
create index idx_notifications_business  on public.notifications (business_id, created_at desc);
create index idx_payment_attempts_order  on public.payment_attempts (order_id, created_at desc);
create index idx_moving_business_status  on public.moving_requests (business_id, status);
create index idx_moving_items_request    on public.moving_items (moving_request_id);
