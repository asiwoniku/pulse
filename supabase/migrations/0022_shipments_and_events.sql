-- 0022: canonical shipment identity and append-only shipment event timeline.
--
-- A shipment is the provider-neutral identity for an existing order. Orders
-- remain the carrier's operational record; this layer adds the shared tracking
-- identity and records where each shipment event came from and how it was
-- verified.

create sequence public.pulse_shipment_reference_seq as bigint;

create or replace function public.next_pulse_shipment_reference(p_country_code text)
returns text
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select 'PLS-' || upper(btrim(p_country_code)) || '-'
      || lpad(nextval('public.pulse_shipment_reference_seq')::text, 9, '0');
$$;

revoke all on function public.next_pulse_shipment_reference(text)
  from public, anon, authenticated;
revoke all on sequence public.pulse_shipment_reference_seq
  from public, anon, authenticated;

create table public.pulse_shipments (
  id                       uuid primary key default gen_random_uuid(),
  pulse_shipment_id        text not null unique,
  order_id                 uuid not null unique references public.orders (id) on delete cascade,
  business_id              uuid not null references public.businesses (id) on delete cascade,
  originator_business_id   uuid references public.businesses (id) on delete set null,
  current_status           public.order_status not null,
  last_verified_event_at   timestamptz,
  last_verified_location   text,
  last_event_received_at   timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.pulse_shipment_events (
  event_id                  uuid primary key default gen_random_uuid(),
  shipment_id               uuid not null references public.pulse_shipments (id) on delete cascade,
  business_id               uuid not null references public.businesses (id) on delete cascade,
  event_type                text not null check (event_type in (
                              'CREATED', 'QUOTE_REQUESTED', 'QUOTE_ACCEPTED', 'BOOKED',
                              'PICKUP_ASSIGNED', 'PICKED_UP', 'RECEIVED_AT_FACILITY',
                              'INSPECTED', 'DEPARTED_ORIGIN', 'IN_TRANSIT',
                              'ARRIVED_DESTINATION_COUNTRY', 'CUSTOMS_PROCESSING',
                              'CUSTOMS_DOCUMENT_REQUIRED', 'CUSTOMS_CLEARED',
                              'RECEIVED_AT_DESTINATION_FACILITY', 'OUT_FOR_DELIVERY',
                              'DELIVERY_ATTEMPTED', 'DELIVERED', 'EXCEPTION',
                              'CANCELLED', 'RETURNED', 'DRIVER_ACCEPTED',
                              'DRIVER_ARRIVED', 'ARRIVED_AT_PICKUP',
                              'PICKUP_ATTEMPT_FAILED', 'PICKUP_ATTEMPTED',
                              'RECIPIENT_VERIFIED', 'PAYMENT_CONFIRMED',
                              'PROOF_OF_DELIVERY_UPLOADED', 'CUSTOMER_DECLINED',
                              'WRONG_ADDRESS', 'ROAD_DIVERSION',
                              'ORDER_STATUS_CHANGED'
                            )),
  source_type               text not null check (source_type in (
                              'pulse', 'provider_api', 'carrier_api',
                              'provider_webhook', 'provider_app', 'facility_scan',
                              'manual', 'customer_app'
                            )),
  source_reference          text check (
                              source_reference is null
                              or char_length(source_reference) between 1 and 255
                            ),
  occurred_at               timestamptz not null,
  received_at               timestamptz not null default now(),
  location                  text check (location is null or char_length(location) <= 500),
  latitude                  numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude                 numeric(9,6) check (longitude is null or longitude between -180 and 180),
  actor_user_id             uuid references public.profiles (id) on delete set null,
  actor_organisation_id     uuid references public.businesses (id) on delete set null,
  verification_status       text not null check (verification_status in (
                              'verified', 'provider_reported', 'pending_review', 'unverified'
                            )),
  order_status_from         public.order_status,
  order_status_to           public.order_status,
  evidence_refs             jsonb not null default '[]'::jsonb
                              check (jsonb_typeof(evidence_refs) = 'array'),
  idempotency_key           text not null check (char_length(idempotency_key) between 1 and 200),
  metadata                  jsonb not null default '{}'::jsonb
                              check (jsonb_typeof(metadata) = 'object'),
  constraint shipment_event_coordinates_paired
    check ((latitude is null) = (longitude is null)),
  constraint shipment_provider_event_source_reference
    check (source_type not in ('provider_api', 'carrier_api', 'provider_webhook')
           or (source_reference is not null and btrim(source_reference) <> ''))
);

create unique index idx_shipment_event_idempotency
  on public.pulse_shipment_events (shipment_id, source_type, idempotency_key);
create index idx_pulse_shipments_business_status
  on public.pulse_shipments (business_id, current_status, created_at desc);
create index idx_pulse_shipments_originator
  on public.pulse_shipments (originator_business_id, created_at desc)
  where originator_business_id is not null;
create index idx_shipment_events_timeline
  on public.pulse_shipment_events (shipment_id, occurred_at, received_at);
create index idx_shipment_events_business
  on public.pulse_shipment_events (business_id, received_at desc);

create trigger trg_pulse_shipments_updated
  before update on public.pulse_shipments
  for each row execute function public.set_updated_at();
create trigger trg_pulse_shipment_events_frozen
  before update or delete on public.pulse_shipment_events
  for each row execute function public.forbid_mutation();

create or replace function public.order_status_shipment_event_type(
  p_from public.order_status,
  p_to public.order_status
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_from is null then 'CREATED'
    when p_to = 'accepted' then 'BOOKED'
    when p_to = 'assigned' then 'PICKUP_ASSIGNED'
    when p_to = 'driver_accepted' then 'DRIVER_ACCEPTED'
    when p_to = 'driver_arrived' then 'DRIVER_ARRIVED'
    when p_to = 'at_pickup' then 'ARRIVED_AT_PICKUP'
    when p_to = 'pickup_attempt_failed' then 'PICKUP_ATTEMPT_FAILED'
    when p_to = 'picked_up' then 'PICKED_UP'
    when p_to = 'in_transit' then 'IN_TRANSIT'
    when p_to = 'arrival_attempted' then 'DELIVERY_ATTEMPTED'
    when p_to = 'delivered' then 'DELIVERED'
    when p_to = 'cancelled' then 'CANCELLED'
    when p_to = 'failed' then 'EXCEPTION'
    else 'ORDER_STATUS_CHANGED'
  end;
$$;

revoke all on function public.order_status_shipment_event_type(public.order_status, public.order_status)
  from public, anon, authenticated;

create or replace function public.delivery_event_shipment_event_type(
  p_event public.delivery_event
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case p_event
    when 'pickup_attempted' then 'PICKUP_ATTEMPTED'
    when 'delivery_attempted' then 'DELIVERY_ATTEMPTED'
    when 'recipient_verified' then 'RECIPIENT_VERIFIED'
    when 'payment_confirmed' then 'PAYMENT_CONFIRMED'
    when 'proof_of_delivery_uploaded' then 'PROOF_OF_DELIVERY_UPLOADED'
    when 'customer_declined' then 'CUSTOMER_DECLINED'
    when 'wrong_address' then 'WRONG_ADDRESS'
    when 'road_diversion' then 'ROAD_DIVERSION'
    else null
  end;
$$;

revoke all on function public.delivery_event_shipment_event_type(public.delivery_event)
  from public, anon, authenticated;

create or replace function public.update_shipment_event_summary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.pulse_shipments
     set last_event_received_at = greatest(
           coalesce(last_event_received_at, '-infinity'::timestamptz),
           new.received_at
         ),
         last_verified_event_at = case
           when new.verification_status = 'verified'
             then greatest(
               coalesce(last_verified_event_at, '-infinity'::timestamptz),
               new.occurred_at
             )
           else last_verified_event_at
         end,
         last_verified_location = case
           when new.verification_status = 'verified'
             and coalesce(
               new.location,
               case when new.latitude is not null
                    then new.latitude::text || ',' || new.longitude::text end,
               ''
             ) <> ''
             and (last_verified_event_at is null or new.occurred_at >= last_verified_event_at)
             then coalesce(
               new.location,
               new.latitude::text || ',' || new.longitude::text
             )
           else last_verified_location
         end
   where id = new.shipment_id;
  return new;
end;
$$;

create trigger trg_shipment_events_update_summary
  after insert on public.pulse_shipment_events
  for each row execute function public.update_shipment_event_summary();

create or replace function public.create_pulse_shipment_for_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_shipment public.pulse_shipments;
begin
  insert into public.pulse_shipments (
    pulse_shipment_id, order_id, business_id, originator_business_id, current_status
  )
  select public.next_pulse_shipment_reference(b.country_code::text),
         new.id, new.business_id, new.originator_business_id, new.status
    from public.businesses b
   where b.id = new.business_id
  returning * into v_shipment;

  insert into public.pulse_shipment_events (
    shipment_id, business_id, event_type, source_type, source_reference,
    occurred_at, actor_user_id, actor_organisation_id, verification_status,
    order_status_to, idempotency_key, metadata
  )
  values (
    v_shipment.id, new.business_id, 'CREATED', 'pulse', new.id::text,
    new.created_at, new.created_by, new.business_id, 'verified',
    new.status, 'shipment-created:' || new.id::text,
    jsonb_build_object('order_reference', new.reference)
  );
  return new;
end;
$$;

create trigger trg_orders_create_pulse_shipment
  after insert on public.orders
  for each row execute function public.create_pulse_shipment_for_order();

create or replace function public.sync_pulse_shipment_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.pulse_shipments
     set business_id = new.business_id,
         originator_business_id = new.originator_business_id,
         current_status = new.status
   where order_id = new.id;
  return new;
end;
$$;

create trigger trg_orders_sync_pulse_shipment
  after update of business_id, originator_business_id, status on public.orders
  for each row
  when (
    old.business_id is distinct from new.business_id
    or old.originator_business_id is distinct from new.originator_business_id
    or old.status is distinct from new.status
  )
  execute function public.sync_pulse_shipment_order();

create or replace function public.record_pulse_order_history_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_shipment_id uuid;
begin
  if new.from_status is null and new.delivery_event is null then
    return new;
  end if;

  select id into v_shipment_id
    from public.pulse_shipments
   where order_id = new.order_id;

  if v_shipment_id is null then
    raise exception 'shipment record is missing for order %', new.order_id
      using errcode = '23503';
  end if;

  insert into public.pulse_shipment_events (
    shipment_id, business_id, event_type, source_type, source_reference,
    occurred_at, actor_user_id, actor_organisation_id, verification_status,
    order_status_from, order_status_to, idempotency_key, metadata
  )
  values (
    v_shipment_id, new.business_id,
    coalesce(
      public.delivery_event_shipment_event_type(new.delivery_event),
      public.order_status_shipment_event_type(new.from_status, new.to_status)
    ),
    'pulse', 'order-status-history:' || new.id::text,
    new.occurred_at, new.actor_user_id, new.business_id, 'verified',
    new.from_status, new.to_status, 'order-status-history:' || new.id::text,
    jsonb_build_object(
      'actor_role', new.actor_role,
      'actor_kind', new.actor_kind,
      'delivery_event', new.delivery_event,
      'note', new.note
    )
  );
  return new;
end;
$$;

-- Existing orders receive stable shipment identities and their real status
-- history, rather than synthetic tracking events.
insert into public.pulse_shipments (
  pulse_shipment_id, order_id, business_id, originator_business_id, current_status, created_at
)
select public.next_pulse_shipment_reference(b.country_code::text),
       o.id, o.business_id, o.originator_business_id, o.status, o.created_at
  from public.orders o
  join public.businesses b on b.id = o.business_id
 order by o.created_at, o.id;

insert into public.pulse_shipment_events (
  shipment_id, business_id, event_type, source_type, source_reference,
  occurred_at, received_at, actor_user_id, actor_organisation_id,
  verification_status, order_status_from, order_status_to, idempotency_key, metadata
)
select s.id, h.business_id,
       coalesce(
         public.delivery_event_shipment_event_type(h.delivery_event),
         public.order_status_shipment_event_type(h.from_status, h.to_status)
       ),
       'pulse', 'order-status-history:' || h.id::text,
       h.occurred_at, h.occurred_at, h.actor_user_id, h.business_id, 'verified',
       h.from_status, h.to_status, 'order-status-history:' || h.id::text,
       jsonb_build_object(
         'actor_role', h.actor_role,
         'actor_kind', h.actor_kind,
         'delivery_event', h.delivery_event,
         'note', h.note,
         'legacy_received_at_unknown', true
       )
  from public.order_status_history h
  join public.pulse_shipments s on s.order_id = h.order_id
 where h.from_status is not null or h.delivery_event is not null
 order by h.occurred_at, h.id;

insert into public.pulse_shipment_events (
  shipment_id, business_id, event_type, source_type, source_reference,
  occurred_at, received_at, actor_user_id, actor_organisation_id,
  verification_status, order_status_to, idempotency_key, metadata
)
select s.id, o.business_id, 'CREATED', 'pulse', o.id::text,
       o.created_at, now(), o.created_by, o.business_id, 'verified',
       o.status, 'shipment-created:' || o.id::text,
       jsonb_build_object('order_reference', o.reference)
  from public.pulse_shipments s
  join public.orders o on o.id = s.order_id
 where not exists (
   select 1 from public.pulse_shipment_events e
    where e.shipment_id = s.id and e.event_type = 'CREATED'
 );

create trigger trg_order_history_record_shipment_event
  after insert on public.order_status_history
  for each row execute function public.record_pulse_order_history_event();

create or replace function public.guard_pulse_shipment_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.pulse_shipment_id is distinct from old.pulse_shipment_id
     or new.order_id is distinct from old.order_id then
    raise exception 'shipment identity fields are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_pulse_shipment_identity_immutable
  before update on public.pulse_shipments
  for each row execute function public.guard_pulse_shipment_identity();

revoke all on function public.update_shipment_event_summary()
  from public, anon, authenticated;
revoke all on function public.create_pulse_shipment_for_order()
  from public, anon, authenticated;
revoke all on function public.sync_pulse_shipment_order()
  from public, anon, authenticated;
revoke all on function public.record_pulse_order_history_event()
  from public, anon, authenticated;
revoke all on function public.guard_pulse_shipment_identity()
  from public, anon, authenticated;

create or replace function public.record_shipment_event(
  p_pulse_shipment_id text,
  p_event_type text,
  p_source_type text,
  p_idempotency_key text,
  p_source_reference text default null,
  p_occurred_at timestamptz default null,
  p_location text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_evidence_refs jsonb default '[]'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns public.pulse_shipment_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_shipment public.pulse_shipments;
  v_event public.pulse_shipment_events;
  v_existing public.pulse_shipment_events;
  v_actor_organisation_id uuid;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_idempotency_key text := nullif(btrim(p_idempotency_key), '');
  v_verification_status text;
begin
  if public.current_user_id() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_event_type not in (
    'CREATED', 'QUOTE_REQUESTED', 'QUOTE_ACCEPTED', 'BOOKED',
    'PICKUP_ASSIGNED', 'PICKED_UP', 'RECEIVED_AT_FACILITY', 'INSPECTED',
    'DEPARTED_ORIGIN', 'IN_TRANSIT', 'ARRIVED_DESTINATION_COUNTRY',
    'CUSTOMS_PROCESSING', 'CUSTOMS_DOCUMENT_REQUIRED', 'CUSTOMS_CLEARED',
    'RECEIVED_AT_DESTINATION_FACILITY', 'OUT_FOR_DELIVERY',
    'DELIVERY_ATTEMPTED', 'DELIVERED', 'EXCEPTION', 'CANCELLED', 'RETURNED',
    'DRIVER_ACCEPTED', 'DRIVER_ARRIVED', 'ARRIVED_AT_PICKUP',
    'PICKUP_ATTEMPT_FAILED', 'PICKUP_ATTEMPTED', 'RECIPIENT_VERIFIED',
    'PAYMENT_CONFIRMED', 'PROOF_OF_DELIVERY_UPLOADED', 'CUSTOMER_DECLINED',
    'WRONG_ADDRESS', 'ROAD_DIVERSION', 'ORDER_STATUS_CHANGED'
  ) then
    raise exception 'unsupported shipment event type: %', p_event_type using errcode = '22023';
  end if;
  if p_source_type not in (
    'provider_app', 'facility_scan', 'manual'
  ) then
    raise exception 'unsupported shipment event source: %', p_source_type using errcode = '22023';
  end if;
  if v_idempotency_key is null then
    raise exception 'shipment events require an idempotency key' using errcode = '22023';
  end if;
  if p_source_reference is not null
     and (btrim(p_source_reference) = '' or char_length(p_source_reference) > 255) then
    raise exception 'source reference must contain 1 to 255 non-space characters'
      using errcode = '22023';
  end if;
  if p_location is not null and char_length(p_location) > 500 then
    raise exception 'location must be 500 characters or fewer' using errcode = '22023';
  end if;
  if char_length(coalesce(v_idempotency_key, '')) > 200 then
    raise exception 'idempotency key must be 200 characters or fewer' using errcode = '22023';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180) then
    raise exception 'latitude and longitude must be a valid coordinate pair' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_evidence_refs, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'evidence_refs must be an array and metadata must be an object'
      using errcode = '22023';
  end if;
  if p_source_type in ('provider_api', 'carrier_api', 'provider_webhook')
     and v_idempotency_key is null then
    raise exception 'provider events require an idempotency key' using errcode = '22023';
  end if;
  if p_source_type in ('provider_api', 'carrier_api', 'provider_webhook')
     and nullif(btrim(coalesce(p_source_reference, '')), '') is null then
    raise exception 'provider events require a source reference' using errcode = '22023';
  end if;

  select * into v_shipment
    from public.pulse_shipments
   where pulse_shipment_id = p_pulse_shipment_id;
  if not found then
    raise exception 'shipment % was not found', p_pulse_shipment_id using errcode = 'P0002';
  end if;

  if public.can_operate(v_shipment.business_id) then
    v_actor_organisation_id := v_shipment.business_id;
  elsif v_shipment.originator_business_id is not null
        and public.can_operate(v_shipment.originator_business_id) then
    v_actor_organisation_id := v_shipment.originator_business_id;
  else
    raise exception 'not permitted to record an event for this shipment'
      using errcode = '42501';
  end if;

  if v_idempotency_key is not null then
    select * into v_existing
      from public.pulse_shipment_events
     where shipment_id = v_shipment.id
       and source_type = p_source_type
       and idempotency_key = v_idempotency_key
     for update;

    if found then
      if v_existing.event_type is distinct from p_event_type
         or v_existing.source_reference is distinct from p_source_reference
         or v_existing.location is distinct from p_location
         or v_existing.latitude is distinct from p_latitude
         or v_existing.longitude is distinct from p_longitude
         or v_existing.actor_organisation_id is distinct from v_actor_organisation_id
         or v_existing.evidence_refs is distinct from coalesce(p_evidence_refs, '[]'::jsonb)
         or v_existing.metadata is distinct from coalesce(p_metadata, '{}'::jsonb)
         or (p_occurred_at is not null and v_existing.occurred_at is distinct from p_occurred_at) then
        raise exception 'idempotency key was already used for a different shipment event'
          using errcode = '23505';
      end if;
      return v_existing;
    end if;
  end if;

  v_verification_status := case
    when p_source_type in ('provider_app', 'facility_scan')
      then 'provider_reported'
    else 'pending_review'
  end;

  insert into public.pulse_shipment_events (
    shipment_id, business_id, event_type, source_type, source_reference,
    occurred_at, location, latitude, longitude, actor_user_id,
    actor_organisation_id, verification_status, evidence_refs,
    idempotency_key, metadata
  )
  values (
    v_shipment.id, v_shipment.business_id, p_event_type, p_source_type,
    p_source_reference, v_occurred_at, p_location, p_latitude, p_longitude,
    public.current_user_id(), v_actor_organisation_id, v_verification_status,
    coalesce(p_evidence_refs, '[]'::jsonb), v_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (shipment_id, source_type, idempotency_key) do nothing
  returning * into v_event;

  if found then
    return v_event;
  end if;

  select * into v_existing
    from public.pulse_shipment_events
   where shipment_id = v_shipment.id
     and source_type = p_source_type
     and idempotency_key = v_idempotency_key;

  if v_existing.event_type is distinct from p_event_type
     or v_existing.source_reference is distinct from p_source_reference
     or v_existing.location is distinct from p_location
     or v_existing.latitude is distinct from p_latitude
     or v_existing.longitude is distinct from p_longitude
     or v_existing.actor_organisation_id is distinct from v_actor_organisation_id
     or v_existing.evidence_refs is distinct from coalesce(p_evidence_refs, '[]'::jsonb)
     or v_existing.metadata is distinct from coalesce(p_metadata, '{}'::jsonb)
     or (p_occurred_at is not null and v_existing.occurred_at is distinct from p_occurred_at) then
    raise exception 'idempotency key was already used for a different shipment event'
      using errcode = '23505';
  end if;
  return v_existing;
end;
$$;

revoke all on function public.record_shipment_event(
  text, text, text, text, text, timestamptz, text, numeric, numeric, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.record_shipment_event(
  text, text, text, text, text, timestamptz, text, numeric, numeric, jsonb, jsonb
) to authenticated;

alter table public.pulse_shipments enable row level security;
alter table public.pulse_shipment_events enable row level security;
revoke all on public.pulse_shipments, public.pulse_shipment_events
  from anon, authenticated;
grant select on public.pulse_shipments, public.pulse_shipment_events to authenticated;

create policy pulse_shipments_read_participant on public.pulse_shipments
  for select to authenticated
  using (
    public.is_order_participant(order_id)
    or public.is_business_member(originator_business_id)
  );

create policy pulse_shipment_events_read_participant on public.pulse_shipment_events
  for select to authenticated
  using (
    exists (
      select 1
        from public.pulse_shipments s
       where s.id = shipment_id
         and (
           public.is_order_participant(s.order_id)
           or public.is_business_member(s.originator_business_id)
         )
    )
  );

-- Keep the timeline available to shipment passport clients as soon as they
-- subscribe; both additions are idempotent on projects with customized pubs.
do $$
declare
  t text;
begin
  foreach t in array array['pulse_shipments', 'pulse_shipment_events']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

comment on table public.pulse_shipments is
  'Provider-neutral shipment identity linked one-to-one to a carrier order; public IDs are immutable.';
comment on table public.pulse_shipment_events is
  'Append-only event timeline retaining source, verification state, timestamps, location, evidence, and idempotency.';
