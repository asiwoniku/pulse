-- 0001: extensions, enums, shared triggers.
-- Scope: Pulse MVP. Marketplace / internationalisation tables arrive later and
-- are named in docs/database.md so this schema can grow into them.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.actor_type as enum ('customer', 'owner', 'staff', 'driver', 'system');
create type public.business_role as enum ('owner', 'admin', 'dispatcher', 'ops', 'driver');

-- Canonical delivery lifecycle (Master Engineering Specification section 10).
create type public.order_status as enum (
  'draft',
  'requested',
  'under_review',
  'quoted',
  'awaiting_customer_approval',
  'accepted',
  'assigned',
  'driver_accepted',
  'driver_arrived',
  'at_pickup',
  'pickup_attempt_failed',
  'picked_up',
  'in_transit',
  'arrival_attempted',
  'delivered',
  'completed',
  'cancelled',
  'failed'
);

-- Delivery-specific milestones (section 22). Kept separate from order_status so
-- a failed attempt does not destroy the order's primary status.
create type public.delivery_event as enum (
  'pickup_attempted',
  'delivery_attempted',
  'recipient_verified',
  'payment_confirmed',
  'proof_of_delivery_uploaded',
  'customer_declined',
  'wrong_address',
  'road_diversion'
);

create type public.assignment_status as enum (
  'pending', 'accepted', 'declined', 'expired', 'cancelled', 'superseded'
);

create type public.assignment_type as enum ('scheduled', 'on_demand', 'immediate');
create type public.payment_status as enum (
  'unpaid', 'pending_confirmation', 'paid', 'partially_paid', 'refunded', 'failed', 'waived'
);
create type public.payment_method as enum ('cash', 'bank_transfer', 'wallet', 'cash_on_delivery', 'provider');
create type public.driver_status as enum ('available', 'busy', 'offline', 'suspended');
create type public.vehicle_type as enum ('motorbike', 'tricycle', 'van', 'truck', 'bicycle', 'other');
create type public.notification_channel as enum ('push', 'whatsapp', 'sms', 'email', 'in_app');
create type public.notification_status as enum ('pending', 'sent', 'delivered', 'failed', 'skipped');
create type public.moving_status as enum (
  'request_submitted', 'awaiting_survey', 'survey_scheduled', 'survey_complete',
  'quoted', 'awaiting_customer_approval', 'accepted', 'crew_assigned', 'loading',
  'in_transit', 'unloading', 'completed', 'cancelled'
);
create type public.boolean_request as enum ('unset', 'yes', 'no');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Postgres does not provide nowait-on-default for updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Append-only guard: history and audit rows are never mutated or deleted.
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only: % operations are not permitted', tg_table_name, tg_op;
end;
$$;
