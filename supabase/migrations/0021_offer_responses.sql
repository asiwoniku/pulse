-- 0021: answering an offer.
--
-- On acceptance the offer becomes a real order in the carrier's own business, with
-- the vendor recorded as that carrier's customer -- which is the commercial truth:
-- a carrier invoices the vendor that sent it the job.
--
-- Everything downstream (state machine, one-live-assignment, column guards, status
-- history) then applies unchanged, because this is an ordinary order carrying a
-- provenance link. No second fulfilment path is introduced.

create or replace function public.respond_to_offer(
  p_offer_id  uuid,
  p_accept    boolean,
  p_reason    text default null
)
returns public.delivery_offers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer  public.delivery_offers;
  v_vendor public.businesses;
  v_order  public.orders;
begin
  select * into v_offer from public.delivery_offers where id = p_offer_id for update;
  if not found then
    raise exception 'offer % not found', p_offer_id using errcode = 'P0001';
  end if;
  if not public.can_operate(v_offer.carrier_business_id) then
    raise exception 'only the carrier this offer was sent to may answer it'
      using errcode = '42501';
  end if;

  perform public.expire_stale_offers();
  if v_offer.status <> 'pending' then
    raise exception 'this offer is % and can no longer be answered', v_offer.status
      using errcode = '45000';
  end if;

  select * into v_vendor from public.businesses where id = v_offer.vendor_business_id;

  if p_accept then
    -- customers.phone_e164 is NOT NULL, so a vendor without one cannot become a
    -- customer. Say so here rather than letting the insert fail opaquely.
    if v_vendor.phone_e164 is null then
      raise exception 'this vendor has no contact number, so it cannot be recorded as your customer'
        using errcode = '23514';
    end if;

    -- The canonical order path: allocates the reference, discovers or creates the
    -- customer, and writes the opening history row.
    v_order := public.create_delivery_order(
      p_business_id      => v_offer.carrier_business_id,
      p_customer_name    => v_vendor.name,
      p_customer_phone   => v_vendor.phone_e164,
      p_pickup_text      => v_offer.pickup_text,
      p_destination_text => v_offer.destination_text,
      p_description      => v_offer.description,
      p_parcel_details   => v_offer.parcel_details,
      p_service_type     => v_offer.service_type,
      p_price_amount     => v_offer.proposed_price,
      p_scheduled_at     => v_offer.scheduled_at
    );

    update public.orders
       set originator_business_id = v_offer.vendor_business_id,
           source                 = 'api'
     where id = v_order.id;

    update public.delivery_offers
       set status = 'accepted', order_id = v_order.id
     where id = v_offer.id
    returning * into v_offer;

    insert into public.offer_events
      (offer_id, from_status, to_status, actor_user_id, actor_role, note)
    values (v_offer.id, 'pending', 'accepted', public.current_user_id(),
            public.member_role(v_offer.carrier_business_id),
            'order ' || v_order.reference || ' created');
  else
    update public.delivery_offers
       set status = 'declined',
           decline_reason = nullif(trim(coalesce(p_reason, '')), '')
     where id = v_offer.id
    returning * into v_offer;

    insert into public.offer_events
      (offer_id, from_status, to_status, actor_user_id, actor_role, note)
    values (v_offer.id, 'pending', 'declined', public.current_user_id(),
            public.member_role(v_offer.carrier_business_id), v_offer.decline_reason);
  end if;

  return v_offer;
end;
$$;

-- The vendor pulls its own offer back before the carrier answers.
create or replace function public.withdraw_offer(p_offer_id uuid)
returns public.delivery_offers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.delivery_offers;
begin
  select * into v_offer from public.delivery_offers where id = p_offer_id for update;
  if not found then
    raise exception 'offer % not found', p_offer_id using errcode = 'P0001';
  end if;
  if not public.is_business_member(v_offer.vendor_business_id) then
    raise exception 'only the vendor that sent this offer may withdraw it'
      using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'this offer is % and can no longer be withdrawn', v_offer.status
      using errcode = '45000';
  end if;

  update public.delivery_offers set status = 'withdrawn' where id = v_offer.id
  returning * into v_offer;

  insert into public.offer_events (offer_id, from_status, to_status, actor_user_id, actor_role)
  values (v_offer.id, 'pending', 'withdrawn', public.current_user_id(),
          public.member_role(v_offer.vendor_business_id));

  return v_offer;
end;
$$;

-- 0016 revoked execute from PUBLIC on everything that existed then. These are new,
-- so they are granted explicitly rather than assumed -- supabase/README.md calls
-- this out: "when you add an RPC, add its grant."
grant execute on function public.respond_to_offer(uuid, boolean, text) to authenticated;
grant execute on function public.withdraw_offer(uuid) to authenticated;

-- Customers of a vendor may see the carriers it deals with.
create policy businesses_read_marketplace_counterparty on public.businesses
  for select to authenticated
  using (
    kind = 'carrier'
    and exists (
      select 1
      from public.delivery_offers o
      where o.carrier_business_id = id
        and public.is_business_member(o.vendor_business_id)
    )
  );