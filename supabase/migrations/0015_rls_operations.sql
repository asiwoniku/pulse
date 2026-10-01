-- 0015: row level security for operational tables, plus the privileges that
-- policies and RPCs actually need.

-- ---------------------------------------------------------------------------
-- Orders and their immutable trail
-- ---------------------------------------------------------------------------
create policy orders_read_participant on public.orders
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_order_participant(id));

-- Direct updates stay possible for the two legitimate writers (dispatch staff
-- and the assigned driver). guard_order_status_change() decides which status
-- moves are legal and guard_order_columns() which columns.
create policy orders_update_staff_or_driver on public.orders
  for update to authenticated
  using (
    public.can_operate(business_id)
    or public.driver_has_current_assignment(id, public.current_user_id())
  )
  with check (
    public.can_operate(business_id)
    or public.driver_has_current_assignment(id, public.current_user_id())
  );

-- Orders are created only by create_delivery_order(): it allocates the human
-- reference and discovers the customer atomically. No INSERT policy exists.

create policy history_read_participant on public.order_status_history
  for select to authenticated
  using (public.is_order_participant(order_id));

-- History rows are written by triggers inside the same transaction, so no
-- INSERT policy is exposed to clients.
create policy references_read_member on public.order_references
  for select to authenticated
  using (public.can_operate(business_id));

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------
create policy assignments_read on public.driver_assignments
  for select to authenticated
  using (
    public.is_business_member(business_id)
    or driver_id in (select id from public.drivers where profile_user_id = public.current_user_id())
  );

-- assign_driver(), cancel_assignment(), respond_to_assignment() are the only
-- ways in; they check roles and the current-assignment invariant themselves.

-- Corrected: assignment_events has no driver_id column. 0007 defines
-- assignment_id / order_id / event / actor_user_id, so the original predicate
-- referenced a column that does not exist and failed with 42703. A driver
-- reaches their own trail through the assignment it belongs to.
create policy assignment_events_read on public.assignment_events
  for select to authenticated
  using (
    public.is_business_member(business_id)
    or exists (
      select 1
      from public.driver_assignments a
      join public.drivers d on d.id = a.driver_id
      where a.id = assignment_id
        and d.profile_user_id = public.current_user_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Notifications, payments, moving, feedback, audit
-- ---------------------------------------------------------------------------
create policy notifications_read on public.notifications
  for select to authenticated
  using (recipient_user_id = public.current_user_id() or public.can_operate(business_id));

create policy notifications_write_operate on public.notifications
  for insert to authenticated
  with check (public.can_operate(business_id));

create policy notifications_update_operate on public.notifications
  for update to authenticated
  using (public.can_operate(business_id))
  with check (public.can_operate(business_id));

create policy payments_read_member on public.payment_attempts
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_order_participant(order_id));

create policy payments_write_operate on public.payment_attempts
  for insert to authenticated
  with check (public.can_operate(business_id));

create policy payments_update_operate on public.payment_attempts
  for update to authenticated
  using (public.can_operate(business_id))
  with check (public.can_operate(business_id));

create policy moving_read_participant on public.moving_requests
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_moving_participant(id));

create policy moving_write_operate on public.moving_requests
  for insert to authenticated
  with check (public.can_operate(business_id));

create policy moving_update_operate on public.moving_requests
  for update to authenticated
  using (public.can_operate(business_id))
  with check (public.can_operate(business_id));

create policy moving_items_read on public.moving_items
  for select to authenticated
  using (public.is_moving_participant(moving_request_id));

create policy moving_items_write_operate on public.moving_items
  for insert to authenticated
  with check (public.can_operate(business_id));

create policy moving_items_update_operate on public.moving_items
  for update to authenticated
  using (public.can_operate(business_id))
  with check (public.can_operate(business_id));

create policy feedback_read on public.order_feedback
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_order_participant(order_id));

-- A customer may rate their own completed order; staff may record feedback they
-- actually collected. guard_feedback() rejects anything not completed.
create policy feedback_insert_participant on public.order_feedback
  for insert to authenticated
  with check (
    public.can_operate(business_id)
    or public.is_order_participant(order_id)
  );

create policy audit_read_operate on public.audit_logs
  for select to authenticated
  using (public.can_operate(business_id));
