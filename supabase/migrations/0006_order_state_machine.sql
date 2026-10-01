-- 0006: the order state machine, enforced in the database.
-- Clients may *request* a transition; only Postgres decides whether it is legal.

-- The complete legal edge set. One place to read, test, and extend.
create or replace function public.order_transition_edges()
returns table (from_status public.order_status, to_status public.order_status)
language sql
stable
as $$
  select * from (values
    ('draft'::public.order_status,                    'requested'::public.order_status),
    ('draft'::public.order_status,                    'cancelled'::public.order_status),
    ('requested'::public.order_status,                'under_review'::public.order_status),
    ('requested'::public.order_status,                'assigned'::public.order_status),
    ('requested'::public.order_status,                'cancelled'::public.order_status),
    ('under_review'::public.order_status,             'quoted'::public.order_status),
    ('under_review'::public.order_status,             'accepted'::public.order_status),
    ('under_review'::public.order_status,             'assigned'::public.order_status),
    ('under_review'::public.order_status,             'cancelled'::public.order_status),
    ('quoted'::public.order_status,                   'awaiting_customer_approval'::public.order_status),
    ('quoted'::public.order_status,                   'accepted'::public.order_status),
    ('quoted'::public.order_status,                   'assigned'::public.order_status),
    ('quoted'::public.order_status,                   'cancelled'::public.order_status),
    ('awaiting_customer_approval'::public.order_status, 'accepted'::public.order_status),
    ('awaiting_customer_approval'::public.order_status, 'cancelled'::public.order_status),
    ('accepted'::public.order_status,                 'assigned'::public.order_status),
    ('accepted'::public.order_status,                 'cancelled'::public.order_status),
    ('assigned'::public.order_status,                 'driver_accepted'::public.order_status),
    -- Reassignment returns an order to the dispatcher pool.
    ('assigned'::public.order_status,                 'under_review'::public.order_status),
    ('assigned'::public.order_status,                 'cancelled'::public.order_status),
    ('driver_accepted'::public.order_status,          'driver_arrived'::public.order_status),
    ('driver_accepted'::public.order_status,          'at_pickup'::public.order_status),
    ('driver_accepted'::public.order_status,          'under_review'::public.order_status),
    ('driver_accepted'::public.order_status,          'cancelled'::public.order_status),
    ('driver_arrived'::public.order_status,           'at_pickup'::public.order_status),
    ('driver_arrived'::public.order_status,           'pickup_attempt_failed'::public.order_status),
    ('driver_arrived'::public.order_status,           'cancelled'::public.order_status),
    ('at_pickup'::public.order_status,                'picked_up'::public.order_status),
    ('at_pickup'::public.order_status,                'pickup_attempt_failed'::public.order_status),
    ('at_pickup'::public.order_status,                'cancelled'::public.order_status),
    ('pickup_attempt_failed'::public.order_status,    'driver_arrived'::public.order_status),
    ('pickup_attempt_failed'::public.order_status,    'at_pickup'::public.order_status),
    ('pickup_attempt_failed'::public.order_status,    'failed'::public.order_status),
    ('pickup_attempt_failed'::public.order_status,    'cancelled'::public.order_status),
    ('picked_up'::public.order_status,                'in_transit'::public.order_status),
    ('picked_up'::public.order_status,                'cancelled'::public.order_status),
    ('in_transit'::public.order_status,               'arrival_attempted'::public.order_status),
    ('in_transit'::public.order_status,               'delivered'::public.order_status),
    ('in_transit'::public.order_status,               'failed'::public.order_status),
    ('in_transit'::public.order_status,               'cancelled'::public.order_status),
    ('arrival_attempted'::public.order_status,        'delivered'::public.order_status),
    ('arrival_attempted'::public.order_status,        'in_transit'::public.order_status),
    ('arrival_attempted'::public.order_status,        'failed'::public.order_status),
    ('arrival_attempted'::public.order_status,        'cancelled'::public.order_status),
    ('delivered'::public.order_status,                'completed'::public.order_status)
  ) as edges (from_status, to_status);
  -- completed / cancelled / failed are terminal. Re-applying the current status
  -- is handled separately by is_valid_order_transition() as an idempotent no-op.
$$;

-- ---------------------------------------------------------------------------
-- Enforcement: no UPDATE of orders.status may bypass the machine, regardless of
-- whether it arrives through PostgREST, SQL, or an admin session.
-- ---------------------------------------------------------------------------
create or replace function public.guard_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.current_user_id();
  v_role  public.business_role;
begin
  -- Internal writers (migrations, service role, replication) carry no JWT sub.
  if v_actor is null then
    return new;
  end if;

  if new.status is distinct from old.status then

    if not public.is_valid_order_transition(old.status, new.status) then
      raise exception 'illegal order transition % -> %', old.status, new.status
        using errcode = '45000';
    end if;

    v_role := public.member_role(old.business_id);

    if v_role is null and not public.current_user_is_platform_admin() then
      raise exception 'caller is not a member of this business'
        using errcode = '42501';
    end if;

    -- Execution stages belong to the assigned driver. Staff may also move them
    -- (the owner app shows Mark delivered), but a driver may never touch
    -- commercial or dispatch stages.
    if public.status_requires_driver(new.status)
       and v_role = 'driver'
       and not public.driver_has_current_assignment(old.id, v_actor) then
      raise exception 'driver % is not assigned to order %', v_actor, old.id
        using errcode = '42501';
    end if;

    if not public.status_requires_driver(new.status)
       and v_role = 'driver'
       and not public.current_user_is_platform_admin() then
      raise exception 'drivers may not move an order into %', new.status
        using errcode = '42501';
    end if;

    new.status_changed_at := now();
  end if;

  return new;
end;
$$;

create trigger trg_orders_status_guard
  before update on public.orders
  for each row execute function public.guard_order_status_change();

-- History is written by the database, never trusted to a client (section 20).
create or replace function public.record_order_status_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.current_user_id();
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history
      (business_id, order_id, from_status, to_status, actor_user_id, actor_role, actor_kind)
    values (
      new.business_id, new.id, old.status, new.status, v_actor,
      public.member_role(new.business_id),
      case when public.member_role(new.business_id) = 'driver' then 'driver'::public.actor_type else 'staff' end
    );
  end if;
  return new;
end;
$$;

create trigger trg_orders_record_history
  after update of status on public.orders
  for each row execute function public.record_order_status_history();


create or replace function public.is_valid_order_transition(
  p_from public.order_status,
  p_to   public.order_status
)
returns boolean
language sql
stable
as $$
  select p_from = p_to
      or exists (
        select 1 from public.order_transition_edges() e
        where e.from_status = p_from and e.to_status = p_to
      );
$$;

-- Who is allowed to move an order into a given status.
-- Drivers act only on the execution stages of an order assigned to them.
create or replace function public.status_requires_driver(p_to public.order_status)
returns boolean
language sql
immutable
as $$
  select p_to in (
    'driver_accepted'::public.order_status, 'driver_arrived', 'at_pickup',
    'pickup_attempt_failed', 'picked_up', 'in_transit',
    'arrival_attempted', 'delivered'
  );
$$;
