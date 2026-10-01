-- 0008: assignment operations (dispatch RPCs).
-- Split out of 0007 so schema and behaviour stay reviewable separately.
-- 0008: assignment operations.
-- These RPCs are the only sanctioned path for dispatch changes. They are
-- SECURITY DEFINER, so each one re-checks the caller's business role before
-- touching anything.

create or replace function public.assign_driver(
  p_order_id          uuid,
  p_driver_id         uuid,
  p_assignment_type   public.assignment_type default 'immediate',
  p_scheduled_start   timestamptz default null,
  p_notes             text default null
)
returns public.driver_assignments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order      public.orders;
  v_driver     public.drivers;
  v_actor      uuid := public.current_user_id();
  v_assignment public.driver_assignments;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0001';
  end if;

  if not public.can_operate(v_order.business_id) then
    raise exception 'only owner, admin, dispatcher or ops may assign drivers'
      using errcode = '42501';
  end if;

  select * into v_driver from public.drivers where id = p_driver_id;
  if not found or v_driver.business_id <> v_order.business_id or not v_driver.is_active then
    raise exception 'driver % is not an active driver of this business', p_driver_id
      using errcode = '23514';
  end if;

  if v_order.status in ('completed', 'cancelled', 'failed') then
    raise exception 'order is % and cannot be assigned', v_order.status
      using errcode = '45000';
  end if;

  -- Any previous assignment is preserved, never deleted (section 28).
  update public.driver_assignments
     set is_current = false, status = 'superseded', superseded_at = now()
   where order_id = p_order_id and is_current;

  insert into public.driver_assignments
    (business_id, order_id, driver_id, assignment_type, scheduled_start, notes, assigned_by)
  values
    (v_order.business_id, p_order_id, p_driver_id, p_assignment_type,
     p_scheduled_start, nullif(trim(coalesce(p_notes, '')), ''), v_actor)
  returning * into v_assignment;

  insert into public.assignment_events
    (business_id, assignment_id, order_id, event, actor_user_id, actor_role, detail)
  select v_order.business_id, v_assignment.id, p_order_id, 'assigned',
         v_actor, public.member_role(v_order.business_id),
         'assigned to ' || v_driver.full_name;

  update public.orders set status = 'assigned' where id = p_order_id;

  return v_assignment;
end;
$$;

create or replace function public.cancel_assignment(
  p_assignment_id uuid,
  p_reason        text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment public.driver_assignments;
  v_actor      uuid := public.current_user_id();
begin
  select * into v_assignment from public.driver_assignments where id = p_assignment_id;
  if not found then
    raise exception 'assignment % not found', p_assignment_id using errcode = 'P0001';
  end if;
  if not public.can_operate(v_assignment.business_id) then
    raise exception 'not permitted to cancel assignments in this business'
      using errcode = '42501';
  end if;
  if not v_assignment.is_current then
    raise exception 'assignment is already %', v_assignment.status using errcode = '45000';
  end if;

  update public.driver_assignments
     set status = 'cancelled', is_current = false, cancelled_at = now()
   where id = p_assignment_id;

  insert into public.assignment_events
    (business_id, assignment_id, order_id, event, actor_user_id, actor_role, detail)
  values (v_assignment.business_id, p_assignment_id, v_assignment.order_id,
          'cancelled', v_actor, public.member_role(v_assignment.business_id),
          nullif(trim(coalesce(p_reason, '')), ''));

  update public.orders set status = 'under_review'
   where id = v_assignment.order_id
     and status in ('assigned', 'driver_accepted');
end;
$$;
