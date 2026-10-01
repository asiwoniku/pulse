-- 0020: carrier discovery and sending an offer.
--
-- browse_carriers() is the reason this is a function and not a policy. Carrier
-- discovery means one authenticated user reading businesses they do not belong to,
-- and RLS is row-level: any policy wide enough to expose a carrier row exposes
-- every column of it, including email, phone and created_by. A SECURITY DEFINER
-- function returns exactly the columns a directory needs and nothing else, so no
-- policy is widened and no private column is reachable.
--
-- Ratings are aggregated live from real feedback. Nothing is denormalised, so
-- there is no cached figure to drift, and a carrier with no completed work shows
-- no rating rather than a fabricated one.

create or replace function public.browse_carriers(
  p_search        text default null,
  p_city          text default null,
  p_service_area  text default null,
  p_min_rating    numeric default null
)
returns table (
  id               uuid,
  name             text,
  city             text,
  country_code     char(2),
  currency         char(3),
  service_areas    text[],
  avg_rating       numeric,
  rated_drivers    bigint,
  active_drivers   bigint,
  completed_orders bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    b.id,
    b.name,
    b.city,
    b.country_code,
    b.currency,
    b.service_areas,
    round(avg(d.average_rating)::numeric, 2)           as avg_rating,
    count(d.average_rating)                            as rated_drivers,
    count(*) filter (where d.is_active)                as active_drivers,
    coalesce(sum(d.completed_order_count), 0)::bigint  as completed_orders
  from public.businesses b
  left join public.drivers d on d.business_id = b.id
  where b.kind = 'carrier'
    and b.is_active
    and (p_search is null or b.name ilike '%' || p_search || '%')
    and (p_city is null or b.city ilike '%' || p_city || '%')
    and (p_service_area is null or p_service_area = any (b.service_areas))
  group by b.id
  having p_min_rating is null
      or avg(d.average_rating) >= p_min_rating
  order by avg(d.average_rating) desc nulls last, b.name
  limit 100;
$$;

-- A vendor sends an offer to one named carrier.
create or replace function public.create_delivery_offer(
  p_carrier_business_id uuid,
  p_pickup_text         text,
  p_destination_text    text,
  p_description         text default null,
  p_parcel_details      jsonb default '{}'::jsonb,
  p_service_type        text default 'delivery',
  p_proposed_price      numeric default null,
  p_scheduled_at        timestamptz default null
)
returns public.delivery_offers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor   uuid := public.current_user_id();
  v_vendor  public.businesses;
  v_carrier public.businesses;
  v_offer   public.delivery_offers;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_pickup_text, ''))) < 3
     or char_length(trim(coalesce(p_destination_text, ''))) < 3 then
    raise exception 'pickup and destination are both required' using errcode = '22025';
  end if;

  -- The vendor is derived from membership, never trusted from a parameter.
  select b.* into v_vendor
  from public.businesses b
  join public.business_members m on m.business_id = b.id
  where m.user_id = v_actor and m.is_active and public.can_operate(b.id)
    and b.kind = 'vendor'
  order by b.created_at desc
  limit 1;
  if v_vendor.id is null then
    raise exception 'you need a vendor workspace to send offers' using errcode = '42501';
  end if;

  select * into v_carrier from public.businesses where id = p_carrier_business_id;
  if not found or v_carrier.kind <> 'carrier' or not v_carrier.is_active then
    raise exception 'the business you selected is not an active carrier' using errcode = '22025';
  end if;
  if v_carrier.id = v_vendor.id then
    raise exception 'an offer cannot be sent to your own business' using errcode = '22025';
  end if;

  perform public.expire_stale_offers();

  insert into public.delivery_offers
    (vendor_business_id, carrier_business_id, pickup_text, destination_text,
     description, parcel_details, service_type, proposed_price, currency,
     scheduled_at, created_by)
  values
    (v_vendor.id, v_carrier.id, trim(p_pickup_text), trim(p_destination_text),
     nullif(trim(coalesce(p_description, '')), ''),
     coalesce(nullif(p_parcel_details, 'null'::jsonb), '{}'::jsonb),
     coalesce(nullif(p_service_type, ''), 'delivery'), p_proposed_price,
     v_vendor.currency, p_scheduled_at, v_actor)
  returning * into v_offer;

  insert into public.offer_events (offer_id, from_status, to_status, actor_user_id, actor_role)
  values (v_offer.id, null, 'pending', v_actor, public.member_role(v_vendor.id));

  return v_offer;
end;
$$;

grant execute on function public.browse_carriers(text, text, text, numeric) to authenticated;
grant execute on function public.create_delivery_offer(uuid, text, text, text, jsonb, text, numeric, timestamptz) to authenticated;
grant execute on function public.expire_stale_offers() to authenticated;