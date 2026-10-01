-- 0003: businesses, membership, invitations, and the authorization helpers
-- every later policy depends on.

create table public.businesses (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(trim(name)) between 2 and 120),
  slug            citext unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  phone_e164      text,
  email           citext,
  city            text,
  country_code    char(2) not null default 'NG' check (country_code ~ '^[A-Z]{2}$'),
  timezone        text not null default 'Africa/Lagos',
  currency        char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  service_areas   text[] not null default '{}',
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.business_members (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.business_role not null,
  is_active       boolean not null default true,
  invited_by      uuid references public.profiles (id) on delete set null,
  joined_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, user_id)
);

-- Workers are invited, never self-appointed (Genesis: worker invites + role
-- assignment). A driver membership is created together with a drivers row.
create table public.business_invitations (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  email           citext not null,
  phone_e164      text,
  role            public.business_role not null check (role <> 'owner'),
  display_name    text,
  code            citext not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by      uuid references public.profiles (id) on delete set null,
  expires_at      timestamptz not null default now() + interval '14 days',
  accepted_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_businesses_updated_at   before update on public.businesses           for each row execute function public.set_updated_at();
create trigger trg_business_members_upd    before update on public.business_members     for each row execute function public.set_updated_at();
create trigger trg_business_invitations_upd before update on public.business_invitations for each row execute function public.set_updated_at();

create index idx_members_user         on public.business_members (user_id) where is_active;
create index idx_members_business     on public.business_members (business_id, role) where is_active;
create index idx_invitations_email    on public.business_invitations (email) where status = 'pending';
create index idx_invitations_business on public.business_invitations (business_id, status);

-- ---------------------------------------------------------------------------
-- Authorization helpers. SECURITY DEFINER so a policy that reads
-- business_members cannot recurse into that table's own RLS.
-- ---------------------------------------------------------------------------

-- The caller's role inside one business, or NULL when not an active member.
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
  limit 1;
$$;

create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.member_role(p_business_id) is not null
      or public.current_user_is_platform_admin();
$$;

-- Permission gate. Roles are ordered owner > admin > dispatcher > ops > driver.
create or replace function public.has_business_role(p_business_id uuid, p_roles public.business_role[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.current_user_is_platform_admin()
      or public.member_role(p_business_id) = any (p_roles);
$$;

-- True when caller and p_user_id share at least one active business.
create or replace function public.shares_business_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.current_user_is_platform_admin() or exists (
    select 1
    from public.business_members mine
    join public.business_members theirs on theirs.business_id = mine.business_id
    where mine.user_id = public.current_user_id()
      and mine.is_active
      and theirs.user_id = p_user_id
      and theirs.is_active
  );
$$;

-- Every business the caller belongs to (workspace switcher + policies).
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
    and is_active;
$$;

-- Staff operations on orders/drivers. Drivers are excluded: they act through
-- driver_assignments, never on orders directly (section 4: driver cannot edit).
create or replace function public.can_operate(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.has_business_role(
    p_business_id,
    array['owner','admin','dispatcher','ops']::public.business_role[]
  );
$$;

