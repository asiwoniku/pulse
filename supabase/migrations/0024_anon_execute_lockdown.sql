-- 0024: no application RPC is callable by `anon`.
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and `anon` is a member of
-- PUBLIC. Migration 0016 revoked execute from `authenticated` for the internal
-- functions but never removed PUBLIC, and nothing ever removed it for the client
-- RPCs, so every SECURITY DEFINER function in `public` was reachable at
-- `/rest/v1/rpc/<name>` with the publishable anon key and no session.
--
-- That is a real exposure, not a theoretical one: these functions run as their
-- owner and deliberately bypass RLS, re-deriving authorization from
-- `current_user_id()`. Most of them raise on a null user id, but they are not
-- written to be an unauthenticated API surface, and leaving `PUBLIC` in place
-- means the next function added inherits the hole.
--
-- This migration revokes PUBLIC and `anon` execute across the application
-- functions, then re-grants exactly the client-facing set to `authenticated`.
-- Two consequences are deliberate:
--
--   * `authenticated` keeps everything it had, so no client breaks.
--   * The trigger and guard functions (`guard_*`, `on_*`) become
--     non-executable over the wire entirely — they are only ever meant to run
--     as a trigger, which does not check EXECUTE.
--
-- `citext` lives in `public` because migration 0001 installs the extension
-- there; its operator classes are not part of the application surface and are
-- left alone. It is covered by the separate `extension_in_public` advisor.
--
-- Idempotent: re-running revokes and re-grants the same set.

-- ---------------------------------------------------------------------------
-- 1. Close the application surface.
--    Enumerated rather than filtered on `prosecdef`, so a SECURITY INVOKER helper
--    that is nonetheless RPC-shaped cannot slip through unnoticed.
-- ---------------------------------------------------------------------------
do $$
declare
  sig text;
  closed text[] := array[
    -- identity and authorization helpers
    'public.current_user_email()',
    'public.active_business_id()',
    'public.is_order_participant(uuid)',
    'public.is_moving_participant(uuid)',
    -- workspace lifecycle
    'public.create_business(text,text,text,text,text)',
    'public.create_business(text,text,text,text,text,business_kind,text)',
    'public.invite_worker(uuid,text,business_role,text,text)',
    'public.accept_invitation(text)',
    -- order and delivery operations
    'public.create_delivery_order(uuid,text,text,text,text,text,jsonb,text,numeric,payment_method,timestamptz)',
    'public.record_delivery_attempt(uuid,delivery_event,text)',
    'public.capture_proof_of_delivery(uuid,text,text,text,text)',
    'public.set_driver_availability(driver_status,uuid)',
    'public.respond_to_assignment(uuid,boolean,text)',
    'public.register_device(text,text,text)',
    -- marketplace
    'public.browse_carriers(text,text,text,numeric)',
    'public.create_delivery_offer(uuid,text,text,text,jsonb,text,numeric,timestamptz)',
    'public.respond_to_offer(uuid,boolean,text)',
    'public.withdraw_offer(uuid)',
    'public.expire_stale_offers()',
    -- shipment events
    'public.record_shipment_event(text,text,text,text,text,timestamptz,text,numeric,numeric,jsonb,jsonb)',
    -- trigger and guard functions: never callable over HTTP, only as triggers
    'public.guard_order_columns()',
    'public.guard_driver_columns()',
    'public.guard_feedback()',
    'public.guard_offer_transition()',
    'public.on_feedback_created()',
    'public.on_order_completed()',
    'public.handle_new_auth_user()',
    'public.next_order_reference(uuid)',
    'public.next_pulse_shipment_reference(text)',
    'public.refresh_driver_rating(uuid)'
  ];
begin
  foreach sig in array closed loop
    if to_regprocedure(sig) is not null then
      execute 'revoke execute on function ' || sig || ' from public, anon, authenticated';
    else
      raise notice 'skipping revoke: % is not present in this schema', sig;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Re-grant the client-facing RPCs to `authenticated`.
--    This is the same set as ALLOWED_RPC in services/pulse_service/api.py, plus
--    the read helpers the portal and board call directly. Each is granted
--    explicitly so that revoking PUBLIC above cannot take these away with it.
-- ---------------------------------------------------------------------------
do $$
declare
  sig text;
  client text[] := array[
    'public.create_business(text,text,text,text,text)',
    'public.create_business(text,text,text,text,text,business_kind,text)',
    'public.invite_worker(uuid,text,business_role,text,text)',
    'public.accept_invitation(text)',
    'public.create_delivery_order(uuid,text,text,text,text,text,jsonb,text,numeric,payment_method,timestamptz)',
    'public.assign_driver(uuid,uuid,timestamptz,text)',
    'public.cancel_assignment(uuid,text)',
    'public.record_delivery_attempt(uuid,delivery_event,text)',
    'public.capture_proof_of_delivery(uuid,text,text,text,text)',
    'public.set_driver_availability(driver_status,uuid)',
    'public.respond_to_assignment(uuid,boolean,text)',
    'public.register_device(text,text,text)',
    'public.browse_carriers(text,text,text,numeric)',
    'public.create_delivery_offer(uuid,text,text,text,jsonb,text,numeric,timestamptz)',
    'public.respond_to_offer(uuid,boolean,text)',
    'public.withdraw_offer(uuid)',
    'public.expire_stale_offers()',
    'public.record_shipment_event(text,text,text,text,text,timestamptz,text,numeric,numeric,jsonb,jsonb)',
    -- read helpers used by /api/businesses, /api/board and the portal
    'public.current_user_email()',
    'public.active_business_id()',
    'public.current_business_ids()',
    'public.is_order_participant(uuid)',
    'public.is_moving_participant(uuid)',
    'public.is_business_member(uuid)',
    'public.has_business_role(uuid,business_role)',
    'public.shares_business_with(uuid)',
    'public.can_operate(uuid)',
    'public.order_transition_edges()',
    'public.is_valid_order_transition(order_status,order_status)',
    'public.status_requires_driver(order_status)'
  ];
begin
  foreach sig in array client loop
    if to_regprocedure(sig) is not null then
      execute 'grant execute on function ' || sig || ' to authenticated';
    else
      raise notice 'skipping grant: % is not present in this schema', sig;
    end if;
  end loop;
end;
$$;