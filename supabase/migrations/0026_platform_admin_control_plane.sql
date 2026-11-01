-- 0026: a platform-only control plane, separate from partner operations.
--
-- Platform administrators can review business profiles and platform account
-- status, but the platform-admin claim is not a shortcut through partner RLS.

create table public.platform_business_controls (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended')),
  verification_status text not null default 'not_submitted'
    check (verification_status in (
      'not_submitted', 'submitted', 'in_review', 'verified',
      'rejected', 'needs_more_information'
    )),
  verification_method text,
  verification_source text,
  verification_limitations text,
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_note is null or char_length(review_note) <= 2000),
  check (verification_method is null or char_length(verification_method) <= 300),
  check (verification_source is null or char_length(verification_source) <= 1000),
  check (verification_limitations is null or char_length(verification_limitations) <= 1000),
  check (
    verification_status <> 'verified'
    or (
      nullif(trim(verification_method), '') is not null
      and nullif(trim(verification_source), '') is not null
      and nullif(trim(verification_limitations), '') is not null
      and reviewed_by is not null
      and reviewed_at is not null
    )
  )
);

create trigger trg_platform_business_controls_updated_at
  before update on public.platform_business_controls
  for each row execute function public.set_updated_at();

-- Existing partner accounts remain active; future accounts receive an explicit
-- control row without granting the platform administrator any operational data.
insert into public.platform_business_controls (business_id, account_status)
select id, case when is_active then 'active' else 'suspended' end
from public.businesses
on conflict (business_id) do nothing;

create or replace function public.ensure_platform_business_controls()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.platform_business_controls (business_id)
  values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_platform_business_controls() from public, anon, authenticated;

create trigger trg_business_platform_controls
  after insert on public.businesses
  for each row execute function public.ensure_platform_business_controls();

alter table public.platform_business_controls enable row level security;
revoke all on public.platform_business_controls from public, anon, authenticated;

-- A platform-admin JWT only grants access to the platform control-plane RPCs.
-- It must not bypass membership or participant checks on partner-owned records.
create or replace function public.member_role(p_business_id uuid)
returns public.business_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select role
  from public.business_members
  where business_id = p_business_id
    and user_id = public.current_user_id()
    and is_active
    and not public.current_user_is_platform_admin()
  limit 1;
$$;

create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select not public.current_user_is_platform_admin()
     and public.member_role(p_business_id) is not null;
$$;

create or replace function public.has_business_role(
  p_business_id uuid,
  p_roles public.business_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.member_role(p_business_id) = any (p_roles);
$$;

create or replace function public.shares_business_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.business_members mine
    join public.business_members theirs on theirs.business_id = mine.business_id
    where mine.user_id = public.current_user_id()
      and mine.is_active
      and theirs.user_id = p_user_id
      and theirs.is_active
      and not public.current_user_is_platform_admin()
  );
$$;

create or replace function public.current_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select business_id
  from public.business_members
  where user_id = public.current_user_id()
    and is_active
    and not public.current_user_is_platform_admin();
$$;

create or replace function public.can_operate(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.member_role(p_business_id) =
           any (array['owner', 'admin', 'dispatcher', 'ops']::public.business_role[])
     and exists (
       select 1
       from public.businesses business
       where business.id = p_business_id
         and business.is_active
     )
     and coalesce((
       select controls.account_status = 'active'
       from public.platform_business_controls controls
       where controls.business_id = p_business_id
     ), true);
$$;

-- A platform-admin JWT cannot use the order state machine as an operations
-- backdoor. Only actual partner membership (or an assigned driver) can act.
create or replace function public.guard_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
     v_actor uuid := public.current_user_id();
     v_role public.business_role;
begin
     if v_actor is null then
       return new;
     end if;

     if new.status is distinct from old.status then
       if not public.is_valid_order_transition(old.status, new.status) then
         raise exception 'illegal order transition % -> %', old.status, new.status
           using errcode = '45000';
       end if;

       v_role := public.member_role(old.business_id);
       if v_role is null then
         raise exception 'caller is not a member of this business'
           using errcode = '42501';
       end if;

       if public.status_requires_driver(new.status)
          and v_role = 'driver'
          and not public.driver_has_current_assignment(old.id, v_actor) then
         raise exception 'driver % is not assigned to order %', v_actor, old.id
           using errcode = '42501';
       end if;

       if not public.status_requires_driver(new.status) and v_role = 'driver' then
         raise exception 'drivers may not move an order into %', new.status
           using errcode = '42501';
       end if;

       new.status_changed_at := now();
     end if;

     return new;
end;
$$;

create table public.platform_admin_audit_log (
  id bigint generated always as identity primary key,
  business_id uuid,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create trigger trg_platform_admin_audit_immutable
  before update or delete on public.platform_admin_audit_log
  for each row execute function public.forbid_mutation();

create index idx_platform_admin_audit_time
  on public.platform_admin_audit_log (occurred_at desc);
create index idx_platform_admin_audit_business_time
  on public.platform_admin_audit_log (business_id, occurred_at desc);

alter table public.platform_admin_audit_log enable row level security;
revoke all on public.platform_admin_audit_log from public, anon, authenticated;

create or replace function public.platform_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_organisations', count(*),
    'pending_verification', count(*) filter (
      where controls.verification_status in ('submitted', 'in_review', 'needs_more_information')
    ),
    'verified_organisations', count(*) filter (
      where controls.verification_status = 'verified'
    ),
    'suspended_organisations', count(*) filter (
      where controls.account_status = 'suspended'
    )
  )
  into v_result
  from public.businesses business
  join public.platform_business_controls controls on controls.business_id = business.id;

  return v_result;
end;
$$;

create or replace function public.platform_admin_organisations()
returns table (
  business_id uuid,
  name text,
  kind text,
  contact_email text,
  contact_phone text,
  city text,
  country_code text,
  created_at timestamptz,
  account_status text,
  verification_status text,
  verification_method text,
  verification_source text,
  verification_limitations text,
  review_note text,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  return query
  select
    business.id,
    business.name::text,
    business.kind::text,
    business.email::text,
    business.phone_e164,
    business.city,
    business.country_code::text,
    business.created_at,
    controls.account_status,
    controls.verification_status,
    controls.verification_method,
    controls.verification_source,
    controls.verification_limitations,
    controls.review_note,
    controls.reviewed_at
  from public.businesses business
  join public.platform_business_controls controls on controls.business_id = business.id
  order by business.created_at desc;
end;
$$;

create or replace function public.platform_admin_review_business(
  p_business_id uuid,
  p_account_status text,
  p_verification_status text,
  p_verification_method text default null,
  p_verification_source text default null,
  p_verification_limitations text default null,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.current_user_id();
begin
  if not public.current_user_is_platform_admin() or v_actor is null then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;
  if p_business_id is null
     or p_account_status is null
     or p_account_status not in ('active', 'suspended')
     or p_verification_status is null
     or p_verification_status not in (
       'not_submitted', 'submitted', 'in_review', 'verified',
       'rejected', 'needs_more_information'
     ) then
    raise exception 'invalid platform review status' using errcode = '22023';
  end if;
  if char_length(coalesce(p_review_note, '')) > 2000
     or char_length(coalesce(p_verification_method, '')) > 300
     or char_length(coalesce(p_verification_source, '')) > 1000
     or char_length(coalesce(p_verification_limitations, '')) > 1000 then
    raise exception 'review fields exceed their allowed length' using errcode = '22023';
  end if;
  if p_verification_status = 'verified'
     and (
       nullif(trim(coalesce(p_verification_method, '')), '') is null
       or nullif(trim(coalesce(p_verification_source, '')), '') is null
       or nullif(trim(coalesce(p_verification_limitations, '')), '') is null
     ) then
    raise exception 'verification requires a method, source, and limitations'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'organisation not found' using errcode = 'P0002';
  end if;

  insert into public.platform_business_controls (
    business_id, account_status, verification_status, verification_method,
    verification_source, verification_limitations, review_note, reviewed_by, reviewed_at
  )
  values (
    p_business_id, p_account_status, p_verification_status,
    nullif(trim(coalesce(p_verification_method, '')), ''),
    nullif(trim(coalesce(p_verification_source, '')), ''),
    nullif(trim(coalesce(p_verification_limitations, '')), ''),
    nullif(trim(coalesce(p_review_note, '')), ''),
    v_actor, now()
  )
  on conflict (business_id) do update set
    account_status = excluded.account_status,
    verification_status = excluded.verification_status,
    verification_method = excluded.verification_method,
    verification_source = excluded.verification_source,
    verification_limitations = excluded.verification_limitations,
    review_note = excluded.review_note,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at;

  update public.businesses
     set is_active = p_account_status = 'active'
   where id = p_business_id;

  insert into public.platform_admin_audit_log (
    business_id, actor_user_id, action, details
  )
  values (
    p_business_id,
    v_actor,
    'business_review_updated',
    jsonb_build_object(
      'account_status', p_account_status,
      'verification_status', p_verification_status,
      'verification_method', nullif(trim(coalesce(p_verification_method, '')), ''),
      'verification_source', nullif(trim(coalesce(p_verification_source, '')), ''),
      'verification_limitations', nullif(trim(coalesce(p_verification_limitations, '')), ''),
      'review_note', nullif(trim(coalesce(p_review_note, '')), '')
    )
  );

  return jsonb_build_object(
    'business_id', p_business_id,
    'account_status', p_account_status,
    'verification_status', p_verification_status
  );
end;
$$;

create or replace function public.platform_admin_recent_actions(p_limit integer default 50)
returns table (
  id bigint,
  business_id uuid,
  action text,
  actor_user_id uuid,
  details jsonb,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.current_user_is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  return query
  select log.id, log.business_id, log.action, log.actor_user_id, log.details, log.occurred_at
  from public.platform_admin_audit_log log
  order by log.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

revoke all on function public.platform_admin_overview() from public, anon, authenticated;
revoke all on function public.platform_admin_organisations() from public, anon, authenticated;
revoke all on function public.platform_admin_review_business(uuid,text,text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.platform_admin_recent_actions(integer) from public, anon, authenticated;

grant execute on function public.platform_admin_overview() to authenticated;
grant execute on function public.platform_admin_organisations() to authenticated;
grant execute on function public.platform_admin_review_business(uuid,text,text,text,text,text,text)
  to authenticated;
grant execute on function public.platform_admin_recent_actions(integer) to authenticated;
