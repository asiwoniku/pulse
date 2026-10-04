/**
 * Browser-only sample records for a design review.
 *
 * This is the sanctioned exception to "no fabricated work in live workspaces",
 * and it is deliberately hard to confuse with real data:
 *
 *  - Opt-in. `isDemoMode()` stays false until someone switches it on.
 *  - Never merged into a live response. `demoFetch` only answers while the toggle
 *    is on, and the shell renders a banner saying so, so a sample order can never
 *    appear beside a real one without a warning.
 *  - Never written. Writes in demo mode are refused with a plain message instead
 *    of pretending something was saved.
 *  - Every id is prefixed `demo-`, so anything that did leak would be obviously
 *    synthetic rather than quietly plausible.
 *
 * It exists to let someone see the layout and the workflow with no rows in
 * Postgres. It is not a seed file, and deleting it breaks nothing real.
 */

const stamp = (minutesAgo: number): string =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString()

export interface DemoBusiness {
  id: string
  name: string
  kind: string
  city: string | null
  country_code: string | null
  currency: string | null
  phone_e164: string | null
  email: string | null
  service_areas: string[]
  is_active: boolean
}

export const DEMO_BUSINESS: DemoBusiness = {
  id: 'demo-business',
  name: 'Demo Haulage Co.',
  kind: 'carrier',
  city: 'Lagos',
  country_code: 'NG',
  currency: 'NGN',
  phone_e164: '+2348000000001',
  email: 'ops@demo-haulage.example',
  service_areas: ['Lagos', 'Abuja'],
  is_active: true,
}

export interface DemoOrder {
  id: string
  reference: string
  status: string
  customer_id: string | null
  pickup_text: string | null
  destination_text: string | null
  service_type: string | null
  promised_at: string | null
  created_at: string
  price_amount: number | null
  currency: string | null
}

/** Statuses chosen to cover the lifecycle a dispatcher actually works through. */
const ORDERS: DemoOrder[] = [
  { id: 'demo-o1', reference: 'PLS-0001', status: 'requested', customer_id: null, pickup_text: '12 Adeola Odeku, Victoria Island', destination_text: '15 Ozumba Mbadiwe Ave, Ikoyi', service_type: 'parcel', promised_at: stamp(-300), created_at: stamp(320), price_amount: 45000, currency: 'NGN' },
  { id: 'demo-o2', reference: 'PLS-0002', status: 'quoted', customer_id: null, pickup_text: 'Shop 4, Ikeja City Mall', destination_text: '24 Allen Ave, Ikeja', service_type: 'parcel', promised_at: stamp(-180), created_at: stamp(200), price_amount: 12000, currency: 'NGN' },
  { id: 'demo-o3', reference: 'PLS-0003', status: 'accepted', customer_id: null, pickup_text: 'Warehouse 7, Apapa Wharf', destination_text: '18 Broad Street, Lagos Island', service_type: 'pallet', promised_at: stamp(-90), created_at: stamp(150), price_amount: 250000, currency: 'NGN' },
  { id: 'demo-o4', reference: 'PLS-0004', status: 'assigned', customer_id: null, pickup_text: '5 Lekki Phase 1', destination_text: '9 Admiralty Way, Lekki Phase 1', service_type: 'moving', promised_at: stamp(-30), created_at: stamp(120), price_amount: 95000, currency: 'NGN' },
  { id: 'demo-o5', reference: 'PLS-0005', status: 'driver_arrived', customer_id: null, pickup_text: '30 Awolowo Road, Ikoyi', destination_text: '3 Bode Thomas, Victoria Island', service_type: 'parcel', promised_at: stamp(-60), created_at: stamp(400), price_amount: 18000, currency: 'NGN' },
  { id: 'demo-o6', reference: 'PLS-0006', status: 'in_transit', customer_id: null, pickup_text: '22 Balogun Street', destination_text: '14 Adeniran Ogunsanya, Surulere', service_type: 'parcel', promised_at: stamp(-45), created_at: stamp(240), price_amount: 22000, currency: 'NGN' },
  { id: 'demo-o7', reference: 'PLS-0007', status: 'delivered', customer_id: null, pickup_text: '1 Michael Okpara Road, Abuja', destination_text: 'Wuse II, Abuja', service_type: 'pallet', promised_at: stamp(-600), created_at: stamp(900), price_amount: 310000, currency: 'NGN' },
  { id: 'demo-o8', reference: 'PLS-0008', status: 'failed', customer_id: null, pickup_text: '8 Ekpo Layout, Ikoyi', destination_text: 'Not reachable', service_type: 'parcel', promised_at: stamp(-700), created_at: stamp(1000), price_amount: 15000, currency: 'NGN' },
]

/** The same edges migration 0006 enforces, so the preview moves the way the app does. */
const ALLOWED: Record<string, string[]> = {
  requested: ['under_review', 'cancelled', 'failed'],
  under_review: ['quoted', 'cancelled', 'failed'],
  quoted: ['awaiting_customer_approval', 'cancelled', 'failed'],
  awaiting_customer_approval: ['accepted', 'cancelled', 'failed'],
  accepted: ['assigned', 'cancelled', 'failed'],
  assigned: ['driver_accepted', 'cancelled', 'failed'],
  driver_accepted: ['driver_arrived', 'failed'],
  driver_arrived: ['at_pickup', 'pickup_attempt_failed', 'failed'],
  at_pickup: ['picked_up', 'pickup_attempt_failed', 'failed'],
  picked_up: ['in_transit', 'failed'],
  in_transit: ['arrival_attempted', 'delivered', 'failed'],
  arrival_attempted: ['delivered', 'failed'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
  failed: [],
}

const DRIVERS = [
  { id: 'demo-d1', full_name: 'Amaka Obi', phone_e164: '+2348000000011', status: 'available' },
  { id: 'demo-d2', full_name: 'Tunde Bakare', phone_e164: '+2348000000012', status: 'available' },
  { id: 'demo-d3', full_name: 'Chidi Nwosu', phone_e164: '+2348000000013', status: 'busy' },
]

const VEHICLES = [
  { id: 'demo-v1', identifier: 'LAG-4412', vehicle_type: 'van', capacity_kg: 1200 },
  { id: 'demo-v2', identifier: 'ABJ-7781', vehicle_type: 'truck', capacity_kg: 9000 },
  { id: 'demo-v3', identifier: 'LAG-0092', vehicle_type: 'motorcycle', capacity_kg: 25 },
]

const CUSTOMERS = [
  { id: 'demo-c1', name: 'Adaeze Nwosu', phone_e164: '+2348000000021', email: 'adaeze@example.com' },
  { id: 'demo-c2', name: 'Kelechi Udo', phone_e164: '+2348000000022', email: 'kelechi@example.com' },
  { id: 'demo-c3', name: 'Sade Adeyemi', phone_e164: '+2348000000023', email: null },
]

const CARRIERS = [
  { id: 'demo-k1', name: 'Northern Freight Ltd', city: 'Abuja', kind: 'carrier' },
  { id: 'demo-k2', name: 'Coastal Haulage', city: 'Port Harcourt', kind: 'carrier' },
  { id: 'demo-k3', name: 'Swift Parcel Co', city: 'Lagos', kind: 'carrier' },
]

const OFFERS = [
  { id: 'demo-of1', status: 'pending', vendor_business_id: 'demo-k2', vendor_name: 'Coastal Haulage', pickup_text: 'Port Harcourt depot', destination_text: 'Lagos Island', created_at: stamp(60) },
  { id: 'demo-of2', status: 'accepted', vendor_business_id: 'demo-k3', vendor_name: 'Swift Parcel Co', pickup_text: 'Ikeja', destination_text: 'Ikoyi', created_at: stamp(300) },
]

export const demo = {
  business: DEMO_BUSINESS,
  orders: () =>
    ORDERS.map((o) => ({
      ...o,
      allowed_next: ALLOWED[o.status] ?? [],
      driver_stage: false,
    })),
  drivers: () => DRIVERS,
  availableDrivers: () => DRIVERS.filter((d) => d.status === 'available'),
  vehicles: () => VEHICLES,
  customers: () => CUSTOMERS,
  carriers: () => CARRIERS,
  offers: () => OFFERS,
  members: () => [
    { id: 'demo-m1', user_id: 'demo-u1', role: 'owner', is_active: true, joined_at: stamp(20000), profile: { id: 'demo-u1', full_name: 'Amaka Obi' } },
    { id: 'demo-m2', user_id: 'demo-u2', role: 'dispatcher', is_active: true, joined_at: stamp(15000), profile: { id: 'demo-u2', full_name: 'Tunde Bakare' } },
    { id: 'demo-m3', user_id: 'demo-u3', role: 'driver', is_active: true, joined_at: stamp(9000), profile: { id: 'demo-u3', full_name: 'Chidi Nwosu' } },
  ],
  pendingInvitations: () => [
    { id: 'demo-inv1', email: 'new.hire@example.com', role: 'driver', status: 'pending', expires_at: stamp(-4320) },
  ],
  shipments: () => [
    { id: 'demo-s1', pulse_shipment_id: 'PLS-DEMO-0004', business_id: DEMO_BUSINESS.id, originator_business_id: null, current_status: 'assigned', order_id: 'demo-o4', created_at: stamp(120), last_event_received_at: stamp(10), last_verified_event_at: stamp(10), last_verified_location: 'Lekki Phase 1', order: { reference: 'PLS-0004' } },
    { id: 'demo-s2', pulse_shipment_id: 'PLS-DEMO-0006', business_id: DEMO_BUSINESS.id, originator_business_id: null, current_status: 'in_transit', order_id: 'demo-o6', created_at: stamp(240), last_event_received_at: stamp(40), last_verified_event_at: stamp(40), last_verified_location: 'Third Mainland Bridge', order: { reference: 'PLS-0006' } },
    { id: 'demo-s3', pulse_shipment_id: 'PLS-DEMO-0007', business_id: DEMO_BUSINESS.id, originator_business_id: null, current_status: 'delivered', order_id: 'demo-o7', created_at: stamp(900), last_event_received_at: stamp(600), last_verified_event_at: stamp(600), last_verified_location: 'Wuse II, Abuja', order: { reference: 'PLS-0007' } },
  ],
  events: (shipmentId: string) => [
    { event_id: 'demo-e1', shipment_id: shipmentId, event_type: 'CREATED', source_type: 'system', source_reference: null, occurred_at: stamp(240), received_at: stamp(240), location: null, latitude: null, longitude: null, actor_user_id: null, verification_status: 'verified', order_status_from: null, order_status_to: 'requested', idempotency_key: 'demo-1', metadata: {} },
    { event_id: 'demo-e2', shipment_id: shipmentId, event_type: 'BOOKED', source_type: 'system', source_reference: null, occurred_at: stamp(230), received_at: stamp(230), location: null, latitude: null, longitude: null, actor_user_id: null, verification_status: 'verified', order_status_from: 'requested', order_status_to: 'accepted', idempotency_key: 'demo-2', metadata: {} },
    { event_id: 'demo-e3', shipment_id: shipmentId, event_type: 'PICKED_UP', source_type: 'provider', source_reference: 'TRACK-88213', occurred_at: stamp(45), received_at: stamp(44), location: 'Third Mainland Bridge', latitude: null, longitude: null, actor_user_id: null, verification_status: 'provider_reported', order_status_from: 'at_pickup', order_status_to: 'picked_up', idempotency_key: 'demo-3', metadata: { note: 'Provider reported' } },
    { event_id: 'demo-e4', shipment_id: shipmentId, event_type: 'ROAD_DIVERSION', source_type: 'partner', source_reference: null, occurred_at: stamp(20), received_at: stamp(20), location: 'Lekki Phase 1', latitude: null, longitude: null, actor_user_id: 'demo-u1', verification_status: 'pending_review', order_status_from: null, order_status_to: null, idempotency_key: 'demo-4', metadata: { note: 'Partner submitted, awaiting review' } },
  ],
}