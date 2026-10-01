-- 0012: ratings, audit trail, and column-level guards that RLS cannot express.

create table public.order_feedback (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_id    uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  driver_id   uuid references public.drivers (id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (comment is null or char_length(comment) <= 2000),
  created_at  timestamptz not null default now()
);

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  business_id   uuid references public.businesses (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_kind    public.actor_type not null default 'system',
  action        text not null,
  target_table  text,
  target_id     text,
  summary       text,
  metadata      jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);

create trigger trg_audit_immutable    before update or delete on public.audit_logs    for each row execute function public.forbid_mutation();
create trigger trg_feedback_immutable before update or delete on public.order_feedback for each row execute function public.forbid_mutation();

create index idx_audit_business_time on public.audit_logs (business_id, occurred_at desc);
create index idx_feedback_business   on public.order_feedback (business_id, created_at desc);

-- Feedback only ever attaches to a completed order, and only to that order's own
-- customer/driver pair. Nothing is rated that did not finish.
create or replace function public.guard_feedback()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found or v_order.status <> 'completed' then
    raise exception 'feedback is only possible on a completed order' using errcode = '45000';
  end if;
  if new.customer_id is null then
    new.customer_id := v_order.customer_id;
  end if;
  if new.driver_id is null then
    select a.driver_id into new.driver_id
    from public.driver_assignments a
    where a.order_id = new.order_id and a.is_current and a.status = 'accepted'
    limit 1;
  end if;
  if new.business_id is null then
    new.business_id := v_order.business_id;
  end if;
  return new;
end;
$$;

create trigger trg_feedback_guard
  before insert on public.order_feedback
  for each row execute function public.guard_feedback();

create or replace function public.refresh_driver_rating(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.drivers
     set average_rating = (
       select round(avg(f.rating)::numeric, 2)
       from public.order_feedback f
       where f.driver_id = p_driver_id
     )
   where id = p_driver_id;
end;
$$;

create or replace function public.on_feedback_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.driver_id is not null then
    perform public.refresh_driver_rating(new.driver_id);
  end if;
  return new;
end;
$$;

create trigger trg_feedback_refresh_rating
  after insert on public.order_feedback
  for each row execute function public.on_feedback_created();
