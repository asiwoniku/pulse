-- 0023: restore the sign-up trigger and close the PUBLIC execute leak.
--
-- Two defects, both invisible while the database is empty and both fatal to real
-- authentication:
--
-- 1. `0002` guards its trigger with a lookup in `pg_proc` for `auth.users`.
--    `auth.users` is a *table*, so that guard is always false and
--    `on_auth_user_created` was never actually created. Without it a real
--    sign-up produces no `public.profiles` row: the profile read returns empty,
--    `create_business` has nothing to attach the membership to, and the
--    `current_user_id()`-scoped RLS policies never match the caller. The
--    function itself was fine; only the trigger was missing.
--
-- 2. `0016` revokes execute on the internal functions from `authenticated`
--    only. Postgres grants EXECUTE to PUBLIC on new functions by default, so
--    `authenticated` keeps inheriting EXECUTE through PUBLIC and
--    `refresh_driver_rating(uuid)` stays callable by any client holding a key.
--    Revoking from a named role cannot remove a privilege that role holds via
--    PUBLIC; PUBLIC itself has to be revoked.
--
-- Both blocks below are guarded and idempotent, so this file is correct on a
-- fresh `db push` and on a project that has already applied 0001-0022.

-- ---------------------------------------------------------------------------
-- 1. Provision a profile whenever an auth user is created.
--    to_regclass is the correct lookup: it resolves relations, which is what
--    `auth.users` is. 0002 searched pg_proc and therefore never matched.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('auth.users') is not null
     and to_regprocedure('public.handle_new_auth_user()') is not null then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
    execute 'create trigger on_auth_user_created after insert on auth.users
             for each row execute function public.handle_new_auth_user()';
  else
    raise notice
      'auth.users not present: skipping trigger creation (profiles created via RPC in plain-Postgres CI)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Internal functions are callable by nobody over the wire.
--    PUBLIC is revoked as well as the named roles; see the note above.
-- ---------------------------------------------------------------------------
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
      execute 'revoke execute on function ' || sig
          || ' from public, anon, authenticated';
    else
      raise notice 'skipping revoke: % is not present in this schema', sig;
    end if;
  end loop;
end;
$$;