-- 0014: row level security. Deny by default; grant the narrowest read/write.
-- Writes that must be atomic or role-checked go through SECURITY DEFINER RPCs,
-- so most tables expose SELECT only and no INSERT/UPDATE policy at all.

alter table public.profiles              enable row level security;
alter table public.businesses            enable row level security;
alter table public.business_members      enable row level security;
alter table public.business_invitations  enable row level security;
alter table public.customers             enable row level security;
alter table public.drivers               enable row level security;
alter table public.vehicles              enable row level security;
alter table public.locations             enable row level security;
alter table public.devices               enable row level security;
alter table public.orders                enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.order_references      enable row level security;
alter table public.driver_assignments    enable row level security;
alter table public.assignment_events     enable row level security;
alter table public.notifications         enable row level security;
alter table public.payment_attempts      enable row level security;
alter table public.moving_requests       enable row level security;
alter table public.moving_items          enable row level security;
alter table public.order_feedback        enable row level security;
alter table public.audit_logs            enable row level security;

-- PostgREST roles get no blanket rights; policies and RPC grants decide.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = public.current_user_id() or public.shares_business_with(id));

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = public.current_user_id())
  with check (id = public.current_user_id());

-- Provisioning happens in the auth trigger / RPC, never from a client.
create policy devices_own on public.devices
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- ---------------------------------------------------------------------------
-- Businesses and membership
-- ---------------------------------------------------------------------------
create policy businesses_read_member on public.businesses
  for select to authenticated
  using (public.is_business_member(id));

-- Creation happens through create_business(), which also writes the owner
-- membership; a bare insert would create an invisible orphan.
create policy businesses_update_owner on public.businesses
  for update to authenticated
  using (public.can_operate(id))
  with check (public.can_operate(id));

create policy members_read_same_business on public.business_members
  for select to authenticated
  using (public.is_business_member(business_id) or user_id = public.current_user_id());

create policy invitations_read_staff on public.business_invitations
  for select to authenticated
  using (public.can_operate(business_id));

-- Invitations are created by invite_worker() and consumed by accept_invitation().

-- ---------------------------------------------------------------------------
-- People and places
-- ---------------------------------------------------------------------------
create policy customers_read_member on public.customers
  for select to authenticated
  using (
    public.is_business_member(business_id)
    or profile_user_id = public.current_user_id()
  );

create policy customers_write_operate on public.customers
  for insert to authenticated
  with check (public.can_operate(business_id));

create policy customers_update_operate on public.customers
  for update to authenticated
  using (public.can_operate(business_id))
  with check (public.can_operate(business_id));

create policy drivers_read on public.drivers
  for select to authenticated
  using (
    public.is_business_member(business_id)
    or profile_user_id = public.current_user_id()
  );

create policy drivers_insert_operate on public.drivers
  for insert to authenticated
  with check (public.can_operate(business_id));

-- A driver may update their own row; guard_driver_columns() restricts columns.
create policy drivers_update_own_or_operate on public.drivers
  for update to authenticated
  using (public.can_operate(business_id) or profile_user_id = public.current_user_id())
  with check (public.can_operate(business_id) or profile_user_id = public.current_user_id());

create policy vehicles_read_member on public.vehicles
  for select to authenticated
  using (public.is_business_member(business_id));

create policy vehicles_write_operate on public.vehicles
  for insert to authenticated
  with check (public.can_operate(business_id));

create policy vehicles_update_operate on public.vehicles
  for update to authenticated
  using (public.can_operate(business_id))
  with check (public.can_operate(business_id));

create policy locations_read_member on public.locations
  for select to authenticated
  using (public.is_business_member(business_id));

create policy locations_insert_operate on public.locations
  for insert to authenticated
  with check (public.can_operate(business_id));

create policy locations_update_operate on public.locations
  for update to authenticated
  using (public.can_operate(business_id))
  with check (public.can_operate(business_id));
