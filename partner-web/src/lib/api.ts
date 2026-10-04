/**
 * The single place the browser talks to the Pulse service.
 *
 * Every operational read is a pass-through: the service forwards *this user's*
 * bearer token to Postgres, so row-level security decides what comes back. That
 * means an empty list is a real answer and must never be papered over with
 * sample rows. The one rule this file enforces is that errors surface as a
 * typed ApiError rather than a silent empty array, so a page can always tell
 * "nothing yet" apart from "the request failed".
 */

export class ApiError extends Error {
  readonly status: number
  readonly source: string | null
  readonly detail: unknown

  constructor(status: number, message: string, source: string | null, detail: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.source = source
    this.detail = detail
  }

  /** 401 means the session is gone and the user must sign in again. */
  get isAuthFailure(): boolean {
    return this.status === 401
  }
}

const TOKEN_KEY = 'pulse.session'

export interface Session {
  access_token: string
  refresh_token: string | null
  expires_in: number | null
  user_id: string | null
  email: string | null
}

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = loadSession()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch {
    // A network failure is not an empty result. Say so plainly so the page can
    // offer a retry instead of showing a confident "no shipments yet".
    throw new ApiError(
      0,
      'Cannot reach the Pulse service. Check your connection.',
      'network',
      null,
    )
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!response.ok) {
    const err = (body as { error?: { message?: string; source?: string; detail?: unknown } })
      ?.error
    throw new ApiError(
      response.status,
      err?.message ?? `Request failed (${response.status}).`,
      err?.source ?? null,
      err?.detail ?? null,
    )
  }

  return body as T
}

export const get = <T>(path: string) => request<T>(path)
export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
export const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export interface SignUpResult {
  access_token: string | null
  user_id: string | null
  email: string | null
  needs_confirmation: boolean
  note?: string
}

export const auth = {
  signIn: (email: string, password: string) =>
    post<Session>('/api/auth/signin', { email, password }),
  signUp: (email: string, password: string) =>
    post<SignUpResult>('/api/auth/signup', { email, password }),
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

export interface Business {
  id: string
  name: string
  phone_e164?: string | null
  email?: string | null
  city: string | null
  country_code: string | null
  currency: string | null
  kind: string | null
  is_active: boolean
  my_role: string | null
}

export interface Workspace {
  businesses: Business[]
  source?: string
  note?: string
}

export interface Member {
  id: string
  user_id: string
  role: string
  is_active: boolean
  joined_at: string
  profile?: {
    id?: string
    full_name?: string | null
    phone_e164?: string | null
    avatar_url?: string | null
  } | null
}

export interface Invitation {
  id: string
  email: string
  role: string
  status: string
  expires_at: string
}

export interface MembersResponse {
  members: Member[]
  pending_invitations: Invitation[]
  note?: string
}

export const workspace = {
  list: () => get<Workspace>('/api/businesses'),
  create: (input: {
    p_name: string
    p_city?: string
    p_country_code?: string
    p_currency?: string
    p_kind?: string
    p_phone_e164?: string
  }) => post<Record<string, unknown>>('/api/rpc/create_business', input),
  /** Company profile edit. The service restricts this to the columns a business
   * may set about itself and to what businesses_update_owner allows. */
  patchBusiness: (
    businessId: string,
    input: Partial<Pick<Business, 'name' | 'phone_e164' | 'email' | 'city' | 'country_code' | 'currency' | 'is_active'>> & {
      service_areas?: string[]
    },
  ) => patch<Record<string, unknown>>(`/api/businesses/${encodeURIComponent(businessId)}`, input),
  members: (businessId: string) =>
    get<MembersResponse>(`/api/businesses/${encodeURIComponent(businessId)}/members`),
  invite: (input: {
    p_business_id: string
    p_email: string
    p_role: string
    p_display_name?: string
  }) => post<Record<string, unknown>>('/api/rpc/invite_worker', input),
}

/* ------------------------------------------------------------------ */
/* Workspace records                                                  */
/* ------------------------------------------------------------------ */

export interface MovingRequest {
  id: string
  business_id: string
  order_id: string | null
  status: string
  origin_text: string
  destination_text: string
  preferred_date: string | null
  survey_note: string | null
  requires_survey: string
  requires_packing: string
  requires_unpacking: string
  requires_crate_storage: string
  has_stairs: string
  has_elevator: string
  quote_amount: number | null
  currency: string
  created_at: string
  items: Record<string, unknown>[]
}

/** Shapes for the workspace record endpoints. Typed rather than
 * Record<string, unknown> so a missing or renamed column is a compile error here
 * instead of an "unknown" leaking into a rendered page. */
export interface PaymentAttempt {
  id: string
  order_id: string
  /** The service joins the order for display; null when RLS hides it. */
  order?: { id?: string; reference?: string } | null
  provider: string
  amount: number | string
  currency: string
  status: string
  created_at: string
  confirmed_at: string | null
}

export interface FeedbackRecord {
  id: string
  order_id: string
  driver_id: string | null
  order?: { id?: string; reference?: string } | null
  rating: number
  comment: string | null
  created_at: string
}

export const workspaceRecords = {
  moving: (businessId: string) =>
    get<{ moving_requests: MovingRequest[]; has_more: boolean; note?: string }>(
      `/api/moving-requests?business_id=${encodeURIComponent(businessId)}`,
    ),
  createMoving: (input: {
    business_id: string
    origin_text: string
    destination_text: string
    preferred_date?: string
    currency?: string
  }) =>
    post<{ moving_request: MovingRequest }>('/api/moving-requests', input),
  payments: (businessId: string) =>
    get<{ payment_attempts: PaymentAttempt[]; has_more: boolean; note?: string }>(
      `/api/payment-attempts?business_id=${encodeURIComponent(businessId)}`,
    ),
  notifications: (businessId: string) =>
    get<{ notifications: Record<string, unknown>[]; note?: string }>(
      `/api/notifications?business_id=${encodeURIComponent(businessId)}`,
    ),
  audit: (businessId: string) =>
    get<{ audit_logs: Record<string, unknown>[]; note?: string }>(
      `/api/audit-logs?business_id=${encodeURIComponent(businessId)}`,
    ),
  feedback: (businessId: string) =>
    get<{ feedback: FeedbackRecord[]; has_more: boolean; note?: string }>(
      `/api/order-feedback?business_id=${encodeURIComponent(businessId)}`,
    ),
  documents: (businessId: string) =>
    get<{
      documents: Record<string, unknown>[]
      shipments_scanned: number
      has_more: boolean
      note?: string
    }>(`/api/documents?business_id=${encodeURIComponent(businessId)}`),
  /** Kept here as well as on `workspace`: SettingsPage edits the company
   * profile, and both call sites hit the same restricted endpoint. */
  patchBusiness: (businessId: string, input: Record<string, unknown>) =>
    patch<{ businesses: Record<string, unknown>[]; ignored_columns: string[]; note: string }>(
      `/api/businesses/${encodeURIComponent(businessId)}`,
      input,
    ),
}

/* ------------------------------------------------------------------ */
/* Shipments and the Shipment Passport                                  */
/* ------------------------------------------------------------------ */

export type ShipmentStatus =
  | 'accepted'
  | 'assigned'
  | 'driver_accepted'
  | 'driver_arrived'
  | 'at_pickup'
  | 'pickup_attempt_failed'
  | 'picked_up'
  | 'in_transit'
  | 'arrival_attempted'
  | 'delivered'
  | 'cancelled'
  | 'failed'

export interface Shipment {
  id: string
  pulse_shipment_id: string
  business_id: string
  originator_business_id: string | null
  current_status: ShipmentStatus
  order_id: string
  created_at: string
  last_event_received_at: string | null
  last_verified_event_at: string | null
  last_verified_location: string | null
  order?: Record<string, unknown> | null
}

export interface ShipmentEvent {
  event_id: string
  shipment_id: string
  event_type: string
  source_type: string
  source_reference: string | null
  occurred_at: string
  received_at: string
  location: string | null
  latitude: string | number | null
  longitude: string | number | null
  actor_user_id: string | null
  verification_status: 'verified' | 'provider_reported' | 'pending_review' | 'unverified'
  order_status_from: string | null
  order_status_to: string | null
  idempotency_key: string
  metadata: Record<string, unknown>
}

export interface Page {
  limit: number
  offset: number
  has_more: boolean
}

export interface ShipmentList extends Page {
  shipments: Shipment[]
  note?: string
}

export interface ShipmentDetail extends Shipment {
  order: Record<string, unknown> | null
  events: ShipmentEvent[]
  event_note?: string
}

export const shipments = {
  list: (businessId: string, offset = 0, limit = 25, search = '') =>
    get<ShipmentList>(
      `/api/shipments?business_id=${encodeURIComponent(businessId)}&offset=${offset}&limit=${limit}${search ? `&q=${encodeURIComponent(search)}` : ''}`,
    ),
  detail: (shipmentId: string) =>
    get<ShipmentDetail>(`/api/shipments/${encodeURIComponent(shipmentId)}`),
  /** Records a real event through the guarded RPC; Postgres is the authority. */
  recordEvent: (input: {
    p_pulse_shipment_id: string
    p_event_type: string
    p_source_type: string
    p_idempotency_key: string
    p_source_reference?: string
    p_location?: string
  }) => post<Record<string, unknown>>('/api/rpc/record_shipment_event', input),
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export interface Order {
  id: string
  reference: string
  status: string
  customer_id: string | null
  pickup_text: string | null
  destination_text: string | null
  service_type: string | null
  promised_at: string | null
  created_at: string
}

export interface OrderList extends Page {
  orders: Order[]
  note?: string
}

export interface Board {
  business_id: string
  orders: Record<string, unknown>[]
  counts: Record<string, number>
  limit: number
  truncated: boolean
  transition_source: string
  drivers_available: Record<string, unknown>[]
  note?: string
}

export const operations = {
  board: (businessId: string) =>
    get<Board>(`/api/board?business_id=${encodeURIComponent(businessId)}`),
  orders: (businessId: string, offset = 0, limit = 25) =>
    get<OrderList>(
      `/api/orders?business_id=${encodeURIComponent(businessId)}&offset=${offset}&limit=${limit}`,
    ),
  drivers: (businessId: string) =>
    get<{ drivers: Record<string, unknown>[] }>(
      `/api/drivers?business_id=${encodeURIComponent(businessId)}`,
    ),
  customers: (businessId: string) =>
    get<{ customers: Record<string, unknown>[] }>(
      `/api/customers?business_id=${encodeURIComponent(businessId)}`,
    ),
  vehicles: (businessId: string) =>
    get<{ vehicles: Record<string, unknown>[] }>(
      `/api/vehicles?business_id=${encodeURIComponent(businessId)}`,
    ),
  createVehicle: (input: Record<string, unknown>) =>
    post<Record<string, unknown>>('/api/vehicles', input),
  carriers: () => get<{ carriers: Record<string, unknown>[] }>('/api/carriers'),
  offers: (businessId: string) =>
    get<{ offers: Record<string, unknown>[] }>(
      `/api/offers?business_id=${encodeURIComponent(businessId)}`,
    ),
  createOrder: (input: Record<string, unknown>) =>
    post<Record<string, unknown>>('/api/rpc/create_delivery_order', input),
  assignDriver: (input: Record<string, unknown>) =>
    post<Record<string, unknown>>('/api/rpc/assign_driver', input),
}

/* ------------------------------------------------------------------ */
/* Service health — reported honestly, never faked                     */
/* ------------------------------------------------------------------ */

export interface ProviderStatus {
  key: string
  title: string
  state: 'live' | 'unconfigured' | 'needs_dependency'
  configured: boolean
  missing_env: string[]
  unlocks?: string
  docs?: string
  offline_note?: string
}

export interface ServiceStatus {
  service: string
  supabase_configured: boolean
  supabase_url_present: boolean
  using_service_role: boolean
  providers: ProviderStatus[]
}

export const system = {
  status: () => get<ServiceStatus>('/api/status'),
  health: () => get<{ ok: boolean; supabase: string | null }>('/api/health'),
  /** Offline text parser; works with no credentials at all. */
  parseWhatsApp: (text: string) =>
    post<Record<string, unknown>>('/api/imports/whatsapp', { text }),
}