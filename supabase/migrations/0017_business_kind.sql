-- 0017: carrier vs vendor.
--
-- A business is either a carrier (it fulfils deliveries and employs drivers) or a
-- vendor (it originates orders and hands them to carriers). Both are businesses:
-- they both have members, roles, invoices and an audit trail, so one table with a
-- discriminator is the honest model rather than two parallel hierarchies.
--
-- Default is 'carrier' so every row written before this migration is unchanged.

create type public.business_kind as enum ('carrier', 'vendor');

alter table public.businesses
  add column kind public.business_kind not null default 'carrier';

comment on column public.businesses.kind is
  'carrier fulfils orders and employs drivers; vendor originates orders and hands them to carriers.';

-- A vendor needs a reachable phone: accepting an offer materialises the vendor as
-- the carrier's customer, and customers.phone_e164 is NOT NULL. Catching that here
-- turns a late constraint violation into an explanation at the point of the mistake.
alter table public.businesses
  add constraint vendor_needs_phone
  check (kind <> 'vendor' or phone_e164 is not null);

create index idx_businesses_kind on public.businesses (kind) where is_active;

-- create_business() gains the kind. Carriers remain the default so every existing
-- caller — the portal, the Android client, the README — keeps working unchanged.
create or replace function public.create_business(
  p_name         text,
  p_city         text default null,
  p_country_code text default 'NG',
  p_timezone     text default 'Africa/Lagos',
  p_currency     text default 'NGN',
  p_kind         public.business_kind default 'carrier',
  p_phone_e164   text default null
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
  -- The check constraint would reject this too, but the column check gives an
  -- operator a sentence they can act on rather than a bare constraint name.
  if p_kind = 'vendor' and nullif(trim(coalesce(p_phone_e164, '')), '') is null then
    raise exception 'a vendor needs a contact phone number, because a carrier bills it as its customer'
      using errcode = '22025';
  end if;

  insert into public.businesses
    (name, city, country_code, timezone, currency, kind, phone_e164, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_city, '')), ''),
          upper(coalesce(nullif(p_country_code, ''), 'NG')),
          coalesce(nullif(p_timezone, ''), 'Africa/Lagos'),
          upper(coalesce(nullif(p_currency, ''), 'NGN')),
          coalesce(p_kind, 'carrier'),
          nullif(trim(coalesce(p_phone_e164, '')), ''), v_actor)
  returning * into v_biz;

  insert into public.business_members (business_id, user_id, role)
  values (v_biz.id, v_actor, 'owner');

  return v_biz;
end;
$$;