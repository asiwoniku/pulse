-- 0009: order creation, driver responses, delivery attempts, proof of delivery.

-- Creating an order discovers the customer from a real phone number. It never
-- fabricates a customer, a price, or a delivery time.
create or replace function public.create_delivery_order(
  p_business_id     uuid,
  p_customer_name   text,
  p_customer_phone  text,
  p_pickup_text     text,
  p_destination_text text,
  p_description     text default null,
  p_parcel_details  jsonb default '{}'::jsonb,
  p_service_type    text default 'delivery',
  p_price_amount    numeric default null,
  p_payment_method  public.payment_method default null,
  p_scheduled_at    timestamptz default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor    uuid := public.current_user_id();
  v_customer public.customers;
  v_order    public.orders;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.can_operate(p_business_id) then
    raise exception 'not permitted to create orders in this business'
      using errcode = '42501';
  end if;
  if p_customer_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'customer phone must be E.164, e.g. +2348012345678'
      using errcode = '22025';
  end if;
  if char_length(trim(p_pickup_text)) < 3 or char_length(trim(p_destination_text)) < 3 then
    raise exception 'pickup and destination are both required' using errcode = '22025';
  end if;

  insert into public.customers as c
    (business_id, display_name, phone_e164, created_by)
  values
    (p_business_id, nullif(trim(coalesce(p_customer_name, '')), ''),
     p_customer_phone, v_actor)
  on conflict (business_id, phone_e164)
    do update set display_name = coalesce(nullif(excluded.display_name, ''), c.display_name)
  returning * into v_customer;

  insert into public.orders
    (business_id, customer_id, reference, status, service_type, description,
     parcel_details, pickup_text, destination_text, price_amount, payment_method,
     currency, scheduled_at, created_by)
  select
    p_business_id, v_customer.id, public.next_order_reference(p_business_id),
    'requested'::public.order_status, p_service_type,
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(nullif(p_parcel_details, 'null'::jsonb), '{}'::jsonb),
    trim(p_pickup_text), trim(p_destination_text), p_price_amount, p_payment_method,
    b.currency, p_scheduled_at, v_actor
  from public.businesses b
  where b.id = p_business_id
  returning * into v_order;

  insert into public.order_status_history
    (business_id, order_id, from_status, to_status, actor_user_id, actor_role, actor_kind)
  values (v_order.business_id, v_order.id, null, v_order.status, v_actor,
          public.member_role(v_order.business_id), 'staff');

  return v_order;
end;
$$;

-- A driver accepts or declines the assignment the dispatcher sent them.
create or replace function public.respond_to_assignment(
  p_assignment_id uuid,
  p_accept        boolean,
  p_reason        text default null
)
returns public.driver_assignments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment public.driver_assignments;
  v_driver     public.drivers;
  v_actor      uuid := public.current_user_id();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_assignment from public.driver_assignments where id = p_assignment_id;
  if not found then
    raise exception 'assignment % not found', p_assignment_id using errcode = 'P0001';
  end if;

  select * into v_driver from public.drivers where id = v_assignment.driver_id;
  if v_driver.profile_user_id is distinct from v_actor then
    raise exception 'this assignment belongs to another driver' using errcode = '42501';
  end if;
  if not v_assignment.is_current or v_assignment.status <> 'pending' then
    raise exception 'assignment is % and can no longer be answered', v_assignment.status
      using errcode = '45000';
  end if;

  if p_accept then
    update public.driver_assignments
       set status = 'accepted', accepted_at = now()
     where id = p_assignment_id returning * into v_assignment;

    insert into public.assignment_events
      (business_id, assignment_id, order_id, event, actor_user_id, actor_role)
    values (v_assignment.business_id, p_assignment_id, v_assignment.order_id,
            'accepted', v_actor, 'driver');

    update public.orders set status = 'driver_accepted'
     where id = v_assignment.order_id and status = 'assigned';
  else
    update public.driver_assignments
       set status = 'declined', declined_at = now(), is_current = false,
           declined_reason = nullif(trim(coalesce(p_reason, '')), '')
     where id = p_assignment_id returning * into v_assignment;

    insert into public.assignment_events
      (business_id, assignment_id, order_id, event, actor_user_id, actor_role, detail)
    values (v_assignment.business_id, p_assignment_id, v_assignment.order_id,
            'declined', v_actor, 'driver', v_assignment.declined_reason);

    update public.orders set status = 'under_review'
     where id = v_assignment.order_id and status in ('assigned', 'driver_accepted');
  end if;

  return v_assignment;
end;
$$;

-- Delivery attempts are milestones, not status overrides: the order keeps its
-- primary status while the attempt is recorded (section 22).
create or replace function public.record_delivery_attempt(
  p_order_id uuid,
  p_event    public.delivery_event,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders;
  v_actor uuid := public.current_user_id();
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0001';
  end if;
  if not public.driver_has_current_assignment(p_order_id, v_actor)
     and not public.can_operate(v_order.business_id) then
    raise exception 'not permitted to record attempts for this order'
      using errcode = '42501';
  end if;

  insert into public.order_status_history
    (business_id, order_id, from_status, to_status, delivery_event, note,
     actor_user_id, actor_role, actor_kind)
  values (
    v_order.business_id, v_order.id, v_order.status, v_order.status, p_event,
    nullif(trim(coalesce(p_note, '')), ''), v_actor,
    public.member_role(v_order.business_id),
    case when public.member_role(v_order.business_id) = 'driver'
         then 'driver'::public.actor_type else 'staff' end
  );
end;
$$;

-- Proof of delivery: real captured artefacts, and an OTP check only when the
-- business actually required one. Transitions to `delivered` through the guard.
create or replace function public.capture_proof_of_delivery(
  p_order_id          uuid,
  p_delivered_to_name text,
  p_signature_url     text default null,
  p_photo_url         text default null,
  p_otp_code          text default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders;
  v_actor uuid := public.current_user_id();
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0001';
  end if;
  if not public.driver_has_current_assignment(p_order_id, v_actor) then
    raise exception 'only the assigned driver may capture proof of delivery'
      using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_delivered_to_name, ''))) < 2 then
    raise exception 'recipient name is required' using errcode = '22025';
  end if;
  if p_signature_url is null and p_photo_url is null then
    raise exception 'a signature or delivery photo is required' using errcode = '22025';
  end if;

  if v_order.delivery_otp_required then
    if v_order.delivery_otp_hash is null then
      raise exception 'order requires an OTP but none was issued'
        using errcode = '55000';
    end if;
    if p_otp_code is null
       or not (crypt(p_otp_code, v_order.delivery_otp_hash) = v_order.delivery_otp_hash) then
      raise exception 'incorrect delivery OTP' using errcode = '42501';
    end if;
  end if;

  update public.orders
     set delivered_to_name  = trim(p_delivered_to_name),
         signature_url      = nullif(trim(coalesce(p_signature_url, '')), ''),
         delivery_photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
         delivery_otp_verified = case when v_order.delivery_otp_required
                                      then true else delivery_otp_verified end
   where id = p_order_id;

  update public.orders set status = 'delivered' where id = p_order_id;
  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end;
$$;

-- Once an order really reaches completed, the driver's real workload moves by
-- one. Ratings stay NULL until a real customer rates a real completed order.
create or replace function public.on_order_completed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_driver_id uuid;
begin
  select a.driver_id into v_driver_id
  from public.driver_assignments a
  where a.order_id = new.id and a.is_current and a.status = 'accepted'
  limit 1;

  if v_driver_id is not null then
    update public.drivers
       set completed_order_count = completed_order_count + 1
     where id = v_driver_id;
  end if;
  return new;
end;
$$;

create trigger trg_orders_completed
  after update of status on public.orders
  for each row
  when (new.status = 'completed' and old.status is distinct from new.status)
  execute function public.on_order_completed();

-- Driver availability. A driver changes their own status; dispatch staff may
-- change any driver in their business.
create or replace function public.set_driver_availability(
  p_status    public.driver_status,
  p_driver_id uuid default null
)
returns public.drivers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor  uuid := public.current_user_id();
  v_driver public.drivers;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_driver_id is null then
    select * into v_driver from public.drivers
     where profile_user_id = v_actor and is_active
     order by created_at desc limit 1;
    if v_driver.id is null then
      raise exception 'no driver profile is linked to this account' using errcode = 'P0001';
    end if;
  else
    select * into v_driver from public.drivers where id = p_driver_id;
    if not found or not public.can_operate(v_driver.business_id) then
      raise exception 'not permitted to change this driver' using errcode = '42501';
    end if;
  end if;

  update public.drivers set status = p_status where id = v_driver.id
  returning * into v_driver;
  return v_driver;
end;
$$;

-- Push device registration. Notification *delivery* stays unconfigured until a
-- real FCM credential exists; registering a token is still honest work.
create or replace function public.register_device(
  p_push_token  text,
  p_platform    text,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.current_user_id();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.devices (user_id, push_token, platform, app_version)
  values (v_actor, p_push_token, p_platform, p_app_version)
  on conflict (push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        app_version = excluded.app_version,
        is_active = true,
        last_seen_at = now();

  update public.profiles
     set push_tokens = (
       select array_agg(distinct d.push_token)
       from public.devices d
       where d.user_id = v_actor and d.is_active
     )
   where id = v_actor;
end;
$$;
