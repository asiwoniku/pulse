-- 0010: workspace lifecycle — create business, invite workers, accept invites.
-- An owner never picks their own role later; creating a workspace grants owner.

create or replace function public.create_business(
  p_name         text,
  p_city         text default null,
  p_country_code text default 'NG',
  p_timezone     text default 'Africa/Lagos',
  p_currency     text default 'NGN'
)
returns public.businesses
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.current_user_id();
  v_biz   public.businesses;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'business name is required' using errcode = '22025';
  end if;

  insert into public.businesses (name, city, country_code, timezone, currency, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_city, '')), ''),
          upper(coalesce(nullif(p_country_code, ''), 'NG')),
          coalesce(nullif(p_timezone, ''), 'Africa/Lagos'),
          upper(coalesce(nullif(p_currency, ''), 'NGN')), v_actor)
  returning * into v_biz;

  insert into public.business_members (business_id, user_id, role)
  values (v_biz.id, v_actor, 'owner');

  return v_biz;
end;
$$;

-- Owners/admins may invite any staff role; dispatchers and ops may only invite
-- drivers and ops, so authority cannot be widened by a lower role.
create or replace function public.invite_worker(
  p_business_id  uuid,
  p_email        text,
  p_role         public.business_role,
  p_display_name text default null,
  p_phone_e164   text default null
)
returns public.business_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.current_user_id();
  v_role  public.business_role := public.member_role(p_business_id);
  v_inv   public.business_invitations;
begin
  if v_role is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'ownership is transferred separately, never invited'
      using errcode = '42501';
  end if;
  if p_role = 'admin' and v_role <> 'owner' then
    raise exception 'only the owner may invite an admin' using errcode = '42501';
  end if;
  if p_role in ('dispatcher', 'ops') and not public.can_operate(p_business_id) then
    raise exception 'not permitted to invite staff' using errcode = '42501';
  end if;
  if lower(coalesce(p_email, '')) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid worker email is required' using errcode = '22025';
  end if;

  insert into public.business_invitations
    (business_id, email, phone_e164, role, display_name, code, invited_by)
  values (
    p_business_id, lower(trim(p_email)), nullif(trim(coalesce(p_phone_e164, '')), ''),
    p_role, nullif(trim(coalesce(p_display_name, '')), ''),
    upper(encode(gen_random_bytes(5), 'hex')), v_actor
  )
  on conflict (code) do update set code = excluded.code
  returning * into v_inv;

  return v_inv;
end;
$$;

-- A worker accepts an invitation with the code they were given. Only the
-- invited email (or the invited phone on their profile) can claim it.
create or replace function public.accept_invitation(p_code text)
returns public.business_members
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.current_user_id();
  v_email text := public.current_user_email();
  v_phone text;
  v_inv   public.business_invitations;
  v_member public.business_members;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select phone_e164 into v_phone from public.profiles where id = v_actor;

  select * into v_inv
  from public.business_invitations
  where upper(code) = upper(trim(coalesce(p_code, '')))
  for update;

  if not found then
    raise exception 'invitation code not recognised' using errcode = 'P0001';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is %', v_inv.status using errcode = '45000';
  end if;
  if v_inv.expires_at < now() then
    update public.business_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired' using errcode = '45000';
  end if;

  if v_email is distinct from v_inv.email
     and (v_phone is null or v_phone is distinct from v_inv.phone_e164) then
    raise exception 'this invitation was issued to a different account'
      using errcode = '42501';
  end if;

  insert into public.business_members as m (business_id, user_id, role, invited_by)
  values (v_inv.business_id, v_actor, v_inv.role, v_inv.invited_by)
  on conflict (business_id, user_id)
    do update set role = excluded.role, is_active = true
  returning * into v_member;

  update public.business_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;

  -- A driver membership that can be linked to a real driver record is linked
  -- immediately; otherwise the driver app asks for the missing details rather
  -- than inventing them.
  if v_inv.role = 'driver' and not exists (
       select 1 from public.drivers
       where business_id = v_inv.business_id and profile_user_id = v_actor
     ) then
    insert into public.drivers as d (business_id, profile_user_id, full_name, phone_e164, created_by)
    select v_inv.business_id, v_actor, p.full_name, coalesce(p.phone_e164, v_inv.phone_e164), v_actor
    from public.profiles p
    where p.id = v_actor
      and char_length(coalesce(p.full_name, '')) >= 2
      and coalesce(p.phone_e164, v_inv.phone_e164) ~ '^\+[1-9][0-9]{6,14}$'
    on conflict (business_id, phone_e164)
      do update set profile_user_id = excluded.profile_user_id;
  end if;

  return v_member;
end;
$$;

-- The signed-in user's email claim (set by Supabase on the access token).
create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select lower(nullif(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'), ''
  ));
$$;
