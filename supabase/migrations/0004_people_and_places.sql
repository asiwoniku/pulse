-- 0004: customers, drivers, vehicles, locations, devices.

-- Customers are discovered, not invented. A customer row appears only from a
-- real order, a real WhatsApp contact, or self-registration. Nothing is seeded.
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  display_name    text check (display_name is null or char_length(trim(display_name)) between 1 and 120),
  phone_e164      text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp_jid    text,
  email           citext,
  city            text,
  profile_user_id uuid references public.profiles (id) on delete set null,
  source          text not null default 'order'
                    check (source in ('order', 'whatsapp', 'import', 'manual', 'self_registered')),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, phone_e164)
);

create table public.drivers (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses (id) on delete cascade,
  profile_user_id       uuid references public.profiles (id) on delete set null,
  full_name             text not null check (char_length(trim(full_name)) between 2 and 120),
  phone_e164            text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  status                public.driver_status not null default 'available',
  vehicle_type          public.vehicle_type,
  home_base             text,
  service_areas         text[] not null default '{}',
  -- Stays NULL until a real completed order is actually rated. Never invented.
  average_rating        numeric(3,2) check (average_rating is null or average_rating between 0 and 5),
  completed_order_count integer not null default 0 check (completed_order_count >= 0),
  is_active             boolean not null default true,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (business_id, phone_e164)
);

create table public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  driver_id       uuid references public.drivers (id) on delete set null,
  label           text not null check (char_length(trim(label)) between 2 and 80),
  registration    text,
  type            public.vehicle_type not null default 'other',
  capacity_note   text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Addresses as data. lat/lng stay NULL until a real maps provider is wired in
-- (section 33: no invented distances, ETAs, or map pins).
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  label           text not null check (char_length(trim(label)) between 2 and 120),
  address_line    text,
  city            text,
  state           text,
  country_code    char(2) not null default 'NG',
  notes           text,
  lat             numeric(9,6) check (lat is null or lat between -90 and 90),
  lng             numeric(9,6) check (lng is null or lng between -180 and 180),
  geocoded_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  push_token      text not null unique,
  platform        text not null check (platform in ('android', 'ios')),
  app_version     text,
  is_active       boolean not null default true,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_customers_updated  before update on public.customers  for each row execute function public.set_updated_at();
create trigger trg_drivers_updated    before update on public.drivers    for each row execute function public.set_updated_at();
create trigger trg_vehicles_updated   before update on public.vehicles   for each row execute function public.set_updated_at();
create trigger trg_locations_updated  before update on public.locations  for each row execute function public.set_updated_at();
create trigger trg_devices_updated    before update on public.devices    for each row execute function public.set_updated_at();

create index idx_customers_business on public.customers (business_id, phone_e164);
create index idx_customers_profile  on public.customers (profile_user_id) where profile_user_id is not null;
create index idx_drivers_business   on public.drivers (business_id) where is_active;
create index idx_drivers_available  on public.drivers (business_id, status) where is_active;
create index idx_drivers_profile    on public.drivers (profile_user_id) where profile_user_id is not null;
create index idx_vehicles_business  on public.vehicles (business_id) where is_active;
create index idx_locations_business on public.locations (business_id);

-- A drivers row must match a real driver membership in the same business, so a
-- stolen business id can never be paired with someone else's profile.
create or replace function public.assert_driver_business_consistency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.profile_user_id is not null and not exists (
       select 1 from public.business_members
       where business_id = new.business_id
         and user_id = new.profile_user_id
         and role = 'driver'
         and is_active
     ) then
    raise exception
      'profile % has no active driver membership in business %',
      new.profile_user_id, new.business_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_drivers_membership_guard
  before insert or update on public.drivers
  for each row execute function public.assert_driver_business_consistency();

