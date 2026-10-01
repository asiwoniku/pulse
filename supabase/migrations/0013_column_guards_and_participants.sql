-- 0013: column guards + participant helpers used by row level security.

-- A driver may change their own availability, never their own reputation,
-- workload counters, ownership, or business linkage.
create or replace function public.guard_driver_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.current_user_id();
begin
  if v_actor is null or public.can_operate(old.business_id) then
    return new;
  end if;
  if old.profile_user_id is distinct from new.profile_user_id
     or new.profile_user_id is distinct from v_actor then
    raise exception 'only dispatch staff may change a driver account link'
      using errcode = '42501';
  end if;
  if new.business_id is distinct from old.business_id
     or new.average_rating is distinct from old.average_rating
     or new.completed_order_count is distinct from old.completed_order_count
     or new.is_active is distinct from old.is_active then
    raise exception 'drivers may only change their own availability'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_drivers_column_guard
  before update on public.drivers
  for each row execute function public.guard_driver_columns();

-- Staff-only commercial fields on an order. A driver touching an order is
-- recording execution facts, never price or payment state.
create or replace function public.guard_order_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role public.business_role := public.member_role(old.business_id);
begin
  if v_role is distinct from 'driver' then
    return new;
  end if;
  if new.price_amount is distinct from old.price_amount
     or new.currency is distinct from old.currency
     or new.payment_status is distinct from old.payment_status
     or new.payment_method is distinct from old.payment_method
     or new.payment_provider is distinct from old.payment_provider
     or new.provider_payment_id is distinct from old.provider_payment_id
     or new.parcel_details is distinct from old.parcel_details then
    raise exception 'drivers may not change commercial fields on an order'
      using errcode = '42501';
  end if;
  if new.customer_id is distinct from old.customer_id
     or new.business_id is distinct from old.business_id
     or new.created_by is distinct from old.created_by then
    raise exception 'drivers may not reassign order ownership' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_orders_column_guard
  before update on public.orders
  for each row execute function public.guard_order_columns();

-- ---------------------------------------------------------------------------
-- Participant helpers. SECURITY DEFINER so policies can ask "does this row
-- belong to me?" without recursing into the RLS of customers/orders.
-- ---------------------------------------------------------------------------
create or replace function public.is_order_participant(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.orders o
    left join public.customers c on c.id = o.customer_id
    where o.id = p_order_id
      and (c.profile_user_id = public.current_user_id()
           or public.is_business_member(o.business_id))
  );
$$;

create or replace function public.is_moving_participant(p_moving_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.moving_requests m
    left join public.customers c on c.id = m.customer_id
    where m.id = p_moving_request_id
      and (c.profile_user_id = public.current_user_id()
           or public.is_business_member(m.business_id))
  );
$$;

-- The business a caller is currently acting inside, when the client sent one.
-- Clients send it as an app setting: set local.pulse.business_id = '<uuid>'.
create or replace function public.active_business_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select nullif(current_setting('pulse.business_id', true), '')::uuid;
$$;
