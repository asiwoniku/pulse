-- 0016: privileges, realtime, and storage. Run after every policy exists.

-- ---------------------------------------------------------------------------
-- Privileges. 0014 revoked the Supabase defaults; re-grant the minimum the
-- clients need. RLS still decides which rows, and INSERT/UPDATE rights are
-- meaningless where no policy exists.
-- ---------------------------------------------------------------------------
grant select on all tables    in schema public to authenticated;
grant insert, update on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

-- Policies call these helpers, so the querying role must be able to execute them.
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema public from anon;

-- Never callable from a client: internal or audit-writing.
-- Guarded rather than listed flat: write_audit() is referenced here and in the
-- verification queries, but no migration creates it, so revoking it directly
-- fails the whole migration with 42883. to_regprocedure() resolves a type-only
-- signature, which is what actually matches.
do $$
declare
  sig text;
  internal text[] := array[
    'public.next_order_reference(uuid)',
    'public.refresh_driver_rating(uuid)',
    'public.handle_new_auth_user()',
    'public.write_audit(uuid,text,text,text,text,jsonb)'
  ];
begin
  foreach sig in array internal loop
    if to_regprocedure(sig) is not null then
      execute 'revoke execute on function ' || sig || ' from authenticated';
    else
      raise notice 'skipping revoke: % is not present in this schema', sig;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: only the tables whose row changes the apps must react to.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- Adding a table already in the publication raises, so add only the missing ones.
do $$
declare
  t text;
begin
  foreach t in array array['orders','driver_assignments','assignment_events','notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Proof-of-delivery media. Objects live under <business_id>/<order_id>/...
-- and are readable only by participants of that order. Nothing is public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 10485760,
        array['image/jpeg','image/png','image/heic','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg','image/png','image/heic','application/pdf'];

create policy proofs_read_participant on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and public.is_order_participant(((storage.foldername(name))[2])::uuid)
  );

-- Only the driver holding the assignment, or dispatch staff of that business,
-- may upload proof for an order.
create policy proofs_insert_participant on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and (
      public.can_operate(((storage.foldername(name))[1])::uuid)
      or public.driver_has_current_assignment(
           ((storage.foldername(name))[2])::uuid, public.current_user_id())
    )
  );
