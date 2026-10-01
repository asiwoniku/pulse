-- 0007: driver assignments.
-- Note: guard_order_status_change() in 0006 calls
-- driver_has_current_assignment(), defined below. PL/pgSQL resolves function
-- references at execution time, so the migration order is safe.

create table public.driver_assignments (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  order_id          uuid not null references public.orders (id) on delete cascade,
  driver_id         uuid not null references public.drivers (id) on delete restrict,
  assignment_type   public.assignment_type not null default 'immediate',
  status            public.assignment_status not null default 'pending',
  is_current        boolean not null default true,
  assigned_by       uuid references public.profiles (id) on delete set null,
  assigned_at       timestamptz not null default now(),
  accepted_at       timestamptz,
  declined_at       timestamptz,
  declined_reason   text,
  cancelled_at      timestamptz,
  superseded_at     timestamptz,
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Append-only trail of assignment decisions (section 28: reassignment must
-- preserve previous assignment history).
create table public.assignment_events (
  id              bigint generated always as identity primary key,
  business_id     uuid not null references public.businesses (id) on delete cascade,
  assignment_id   uuid not null references public.driver_assignments (id) on delete cascade,
  order_id        uuid not null references public.orders (id) on delete cascade,
  event           text not null
                    check (event in ('assigned','accepted','declined','superseded','cancelled','expired')),
  actor_user_id   uuid references public.profiles (id) on delete set null,
  actor_role      public.business_role,
  detail          text,
  occurred_at     timestamptz not null default now()
);

create trigger trg_assignments_updated before update on public.driver_assignments
  for each row execute function public.set_updated_at();
create trigger trg_assignment_events_immutable before update or delete on public.assignment_events
  for each row execute function public.forbid_mutation();

create unique index idx_assignment_single_current
  on public.driver_assignments (order_id) where is_current;
create index idx_assignments_driver_queue
  on public.driver_assignments (driver_id, status, assigned_at desc) where is_current;
create index idx_assignments_business_open
  on public.driver_assignments (business_id, status) where is_current;
create index idx_assignment_events_order on public.assignment_events (order_id, occurred_at);

-- Is this profile the driver currently holding this order? Used by the status
-- guard in 0006 and by client queries.
create or replace function public.driver_has_current_assignment(p_order_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.driver_assignments a
    join public.drivers d on d.id = a.driver_id
    where a.order_id = p_order_id
      and a.is_current
      and a.status in ('pending', 'accepted')
      and d.profile_user_id = p_user_id
  );
$$;

-- Convenience for the driver app: the assignment row the caller owns.
create or replace function public.current_assignment_for(p_order_id uuid)
returns public.driver_assignments
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select a.*
  from public.driver_assignments a
  where a.order_id = p_order_id and a.is_current
  limit 1;
$$;
