-- 0018: delivery offers — a vendor asking a named carrier to take one job.
--
-- An offer is not an order. It is a request that has not been accepted, carries no
-- driver, no status machine and no history obligations, and it disappears by
-- expiring. Only when a carrier accepts does it become a real order (0019/0020),
-- which is why nothing here touches the state machine or the assignment rules.

create type public.offer_status as enum
  ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

create table public.delivery_offers (
  id                  uuid primary key default gen_random_uuid(),
  vendor_business_id  uuid not null references public.businesses (id) on delete cascade,
  carrier_business_id uuid not null references public.businesses (id) on delete cascade,
  status              public.offer_status not null default 'pending',
  created_by          uuid references public.profiles (id) on delete set null,
  pickup_text         text not null check (char_length(trim(pickup_text)) >= 3),
  destination_text    text not null check (char_length(trim(destination_text)) >= 3),
  description         text check (description is null or char_length(description) <= 4000),
  parcel_details      jsonb not null default '{}'::jsonb,
  service_type        text not null default 'delivery'
                        check (service_type in ('delivery', 'moving', 'errand', 'freight')),
  -- What the vendor is willing to pay. NULL means "not stated", never zero:
  -- a zero quote would read as free, which is a different claim.
  proposed_price      numeric(14,2) check (proposed_price is null or proposed_price >= 0),
  currency            char(3) not null default 'NGN',
  scheduled_at        timestamptz,
  -- Set when a carrier accepts: the order this became.
  order_id            uuid references public.orders (id) on delete set null,
  decline_reason      text,
  responded_at        timestamptz,
  expires_at          timestamptz not null default now() + interval '72 hours',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A vendor cannot hand an offer to itself, which would be a bypass of the
  -- carrier role entirely.
  constraint offer_not_self check (vendor_business_id <> carrier_business_id)
);

-- Append-only, same pattern as assignment_events and order_status_history.
create table public.offer_events (
  id            bigint generated always as identity primary key,
  offer_id      uuid not null references public.delivery_offers (id) on delete cascade,
  from_status   public.offer_status,
  to_status     public.offer_status not null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_role    public.business_role,
  note          text,
  occurred_at   timestamptz not null default now()
);

create trigger trg_offers_updated     before update on public.delivery_offers for each row execute function public.set_updated_at();
create trigger trg_offer_events_frozen before update or delete on public.offer_events for each row execute function public.forbid_mutation();

-- Only one live offer from a vendor to a carrier per job; answered and withdrawn
-- offers are kept, so this is a partial unique index rather than a constraint.
create unique index idx_offer_one_pending
  on public.delivery_offers (vendor_business_id, carrier_business_id)
  where status = 'pending';

create index idx_offers_carrier  on public.delivery_offers (carrier_business_id, status, created_at desc);
create index idx_offers_vendor   on public.delivery_offers (vendor_business_id, created_at desc);
create index idx_offer_events    on public.offer_events (offer_id, occurred_at);

-- Mark stale offers expired. Runs lazily on read rather than by a scheduled job,
-- because there is no job runner yet and an expired offer must not look actionable.
create or replace function public.expire_stale_offers()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.delivery_offers
     set status = 'expired'
   where status = 'pending' and expires_at < now();
  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.offer_events (offer_id, from_status, to_status, note)
    select id, 'pending', 'expired', 'offer expired unanswered'
      from public.delivery_offers
     where status = 'expired'
       and expires_at < now()
       and not exists (
         select 1 from public.offer_events e
          where e.offer_id = public.delivery_offers.id and e.to_status = 'expired'
       );
  end if;
  return v_count;
end;
$$;