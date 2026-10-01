-- 0002: identity (profiles) + JWT helpers.
-- Deliberately avoids a hard dependency on the `auth` schema so the same
-- migrations can be replayed against plain Postgres in CI.

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key,
  full_name            text,
  phone_e164           text,
  avatar_url           text,
  preferred_language   text not null default 'en' check (char_length(preferred_language) between 2 and 5),
  push_tokens          text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile per auth user. Identity only; business membership lives in business_members.';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- JWT / caller helpers.
-- SECURITY DEFINER so membership checks used inside policies cannot recurse
-- into the RLS of the tables they read (documented in docs/database.md).
-- ---------------------------------------------------------------------------
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  );
$$;

-- Staff roles are business-scoped, never global.
create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'platform_admin')::boolean,
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Provision a profile whenever an auth user is created.
-- Works with Supabase's auth.users trigger contract; safe if the column set of
-- the new record differs because only id/email are read.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, full_name, phone_e164)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', new.phone, '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'auth' and p.proname = 'users') then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
    execute 'create trigger on_auth_user_created after insert on auth.users
             for each row execute function public.handle_new_auth_user()';
  else
    raise notice 'auth.users not present: skipping trigger creation (profiles created via RPC in plain-Postgres CI)';
  end if;
end;
$$;
