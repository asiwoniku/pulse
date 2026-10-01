-- 0019: order provenance and marketplace row level security.
--
-- orders.business_id always means "the carrier doing the work". A vendor is not a
-- member of that carrier, so a vendor needs one extra link to see its own jobs —
-- and only one link, which cannot be used to write.

alter table public.orders
  add column originator_business_id uuid references public.businesses (id) on delete set null;

create index idx_orders_originator on public.orders (originator_business_id, created_at desc)
  where originator_business_id is not null;

comment on column public.orders.originator_business_id is
  'Vendor business that sent this order to a carrier. NULL for orders a carrier created itself. Read-only: used for vendor visibility and provenance, never as a writer.';

alter table public.delivery_offers enable row level security;
alter table public.offer_events    enable row level security;

-- A vendor reads the orders it sent. This is an additional SELECT policy, so
-- Postgres ORs it with the carrier's policies. It grants nothing else: writes stay
-- governed by orders_update_staff_or_driver, which requires can_operate() or an
-- active driver assignment, and a vendor is neither in the carrier's business.
create policy orders_read_originator on public.orders
  for select to authenticated
  using (public.is_business_member(originator_business_id));

-- Offers: the two parties involved, and nobody else. There is no INSERT policy --
-- offers are created by create_delivery_offer(), which checks the caller's role in
-- the vendor business and that the target really is a carrier.
create policy offers_read_party on public.delivery_offers
  for select to authenticated
  using (
    public.is_business_member(vendor_business_id)
    or public.is_business_member(carrier_business_id)
  );

create policy offers_update_carrier on public.delivery_offers
  for update to authenticated
  using (public.can_operate(carrier_business_id))
  with check (public.can_operate(carrier_business_id));

create policy offers_update_vendor_withdraw on public.delivery_offers
  for update to authenticated
  using (public.is_business_member(vendor_business_id))
  with check (public.is_business_member(vendor_business_id));

-- The vendor may withdraw its own pending offer. Updating a carrier's answer is
-- refused by guard_offer_transition below; this policy only allows the row to be
-- touched so the trigger can produce the right error rather than an RLS silence.
create or replace function public.guard_offer_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor  uuid := public.current_user_id();
  v_role   public.business_role;
begin
  if v_actor is null then
    return new;
  end if;
  if new.status is distinct from old.status then
    if not exists (
      select 1 from (values
        ('pending'::public.offer_status, 'accepted'::public.offer_status),
        ('pending'::public.offer_status, 'declined'::public.offer_status),
        ('pending'::public.offer_status, 'withdrawn'::public.offer_status),
        ('pending'::public.offer_status, 'expired'::public.offer_status)
      ) as e (from_status, to_status)
      where e.from_status = old.status and e.to_status = new.status
    ) then
      raise exception 'illegal offer transition % -> %', old.status, new.status
        using errcode = '45000';
    end if;

    -- Answering is the carrier's call; withdrawing is the vendor's.
    v_role := public.member_role(new.carrier_business_id);
    if new.status in ('accepted', 'declined')
       and v_role is null
       and not public.can_operate(new.carrier_business_id) then
      raise exception 'only the carrier being offered this job may accept or decline it'
        using errcode = '42501';
    end if;
    if new.status = 'withdrawn'
       and not public.is_business_member(new.vendor_business_id) then
      raise exception 'only the vendor may withdraw its offer' using errcode = '42501';
    end if;

    new.responded_at := case
      when new.status = 'withdrawn' then old.responded_at
      else now()
    end;
  end if;
  return new;
end;
$$;

create trigger trg_offers_transition_guard
  before update on public.delivery_offers
  for each row execute function public.guard_offer_transition();

-- Offer events are visible to both parties of the offer.
create policy offer_events_read_party on public.offer_events
  for select to authenticated
  using (
    exists (
      select 1 from public.delivery_offers o
      where o.id = offer_id
        and (public.is_business_member(o.vendor_business_id)
             or public.is_business_member(o.carrier_business_id))
    )
  );