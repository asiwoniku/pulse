import { demo } from './demoData'
export { demo } from './demoData'

export class ApiError extends Error {
  status: number
  source: string | null
  detail: unknown
  isAuthFailure: boolean

  constructor(status: number, message: string, source: string | null, detail: unknown, isAuthFailure: boolean = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.source = source
    this.detail = detail
    this.isAuthFailure = isAuthFailure
  }
}

interface RequestInitExtra {
  method?: string
  body?: string
  headers?: Record<string, string>
}

async function request<T>(
  path: string,
  init: RequestInitExtra = {},
): Promise<T> {
  const demoRes = demoFetch(path)
  if (demoRes !== null) {
    return demoRes as T
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...init.headers,
  }

  const token = window.localStorage.getItem('pulse.session')
  if (token) {
    try {
      const { access_token } = JSON.parse(token)
      if (access_token) headers.Authorization = `Bearer ${access_token}`
    } catch {
      /* Ignore */
    }
  }

  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!res.ok) {
    const err = (body as { error?: { message?: string; source?: string; detail?: unknown } })
      ?.error
    throw new ApiError(
      res.status,
      err?.message ?? `Request failed (${res.status}).`,
      err?.source ?? null,
      err?.detail ?? null,
      res.status === 401 || res.status === 403,
    )
  }

  return body as T
}

export const get = <T = any>(path: string) => request<T>(path)
export const post = <T = any>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
export const patch = <T = any>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

const DEMO_KEY = 'pulse.demo'

export function isDemoMode(): boolean {
  try {
    return window.localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function setDemoMode(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(DEMO_KEY, '1')
    else window.localStorage.removeItem(DEMO_KEY)
  } catch {
    /* Ignore */
  }
}

export const DEMO_MESSAGE =
  'Demo mode is on. Every record below is fictional and exists only in this browser — nothing was read from or written to the database.'

export function clearSession(): void {
  window.localStorage.removeItem('pulse.session')
}

export function loadSession(): Session | null {
  try {
    const data = window.localStorage.getItem('pulse.session')
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    window.localStorage.setItem('pulse.session', JSON.stringify(session))
  } catch {
    /* Ignore */
  }
}

export function demoFetch(path: string): unknown | null {
  if (!isDemoMode()) return null
  if (!path.startsWith('/api/')) return null

  const url = new URL(path, window.location.origin)
  const route = url.pathname
  const businessId = url.searchParams.get('business_id')

  const page = { limit: 25, offset: 0, has_more: false }

  switch (route) {
    case '/api/businesses':
      return { businesses: [demo.business], note: DEMO_MESSAGE }

    case '/api/board':
      return {
        business_id: businessId ?? demo.business.id,
        orders: demo.orders(),
        counts: {},
        limit: 50,
        note: DEMO_MESSAGE,
      }

    case '/api/orders':
      return { ...page, orders: demo.orders(), note: DEMO_MESSAGE }

    case '/api/drivers':
      return { drivers: demo.drivers(), note: DEMO_MESSAGE }

    case '/api/customers':
      return { customers: demo.customers(), note: DEMO_MESSAGE }

    case '/api/vehicles':
      return { vehicles: demo.vehicles(), note: DEMO_MESSAGE }

    case '/api/carriers':
      return { carriers: demo.carriers(), note: DEMO_MESSAGE }

    case '/api/offers':
      return { offers: demo.offers(), note: DEMO_MESSAGE }

    case '/api/shipments':
      return { ...page, data: demo.shipments(), shipments: demo.shipments(), note: DEMO_MESSAGE }

    case '/api/moving-requests':
      return { moving_requests: [], has_more: false, note: DEMO_MESSAGE }

    case '/api/payment-attempts':
      return { payment_attempts: [], has_more: false, note: DEMO_MESSAGE }

    case '/api/notifications':
      return { notifications: [], note: DEMO_MESSAGE }

    case '/api/audit-logs':
      return { audit_logs: [], note: DEMO_MESSAGE }

    case '/api/order-feedback':
      return { feedback: [], has_more: false, note: DEMO_MESSAGE }

    case '/api/documents':
      return {
        documents: [],
        shipments_scanned: demo.shipments().length,
        has_more: false,
        note: DEMO_MESSAGE,
      }

    case '/api/status':
      return {
        service: 'pulse-demo',
        supabase_configured: false,
        supabase_url_present: false,
        using_service_role: false,
        providers: [
          {
            key: 'demo',
            title: 'Demo mode',
            state: 'live',
            configured: true,
            missing_env: [],
            unlocks: 'Sample records in this browser only',
          },
        ],
      }

    case '/api/health':
      return { ok: true, supabase: null }

    default:
      break
  }

  const members = /^\/api\/businesses\/[^/]+\/members$/.exec(route)
  if (members) {
    return {
      members: demo.members(),
      pending_invitations: demo.pendingInvitations(),
      note: DEMO_MESSAGE,
    }
  }

  const shipmentDetail = /^\/api\/shipments\/([^/]+)$/.exec(route)
  if (shipmentDetail) {
    const id = shipmentDetail[1]
    const match = demo.shipments().find((s) => s.id === id) ?? demo.shipments()[0]
    return { ...match, events: demo.events(id), note: DEMO_MESSAGE }
  }

  return null
}

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

export const oauthStart = (provider: 'google' | 'microsoft') =>
  post<{ authorization_url: string }>(`/api/auth/oauth/${provider}`)

export const system = {
  health: () => get<{ ok: boolean; supabase: string | null }>('/api/health'),
  status: () => get<any>('/api/status'),
}

export interface Business {
  id: string
  name?: string | null
  phone_e164?: string | null
  email?: string | null
  city: string | null
  country_code: string | null
  currency: string | null
  kind: string | null
  logo_url: string | null
  is_active: boolean
  my_role?: string | null
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
    avatar_url: string | null
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
  patchBusiness: (
    businessId: string,
    input: any,
  ) =>
    patch<Record<string, unknown>>(
      `/api/businesses/${encodeURIComponent(businessId)}`,
      input,
    ),
  members: (businessId: string) =>
    get<MembersResponse>(
      `/api/businesses/${encodeURIComponent(businessId)}/members`,
    ),
  invite: (input: {
    p_business_id: string
    p_email: string
    p_role: string
    p_display_name?: string
  }) => post<Record<string, unknown>>('/api/rpc/invite_worker', input),

  acceptInvitation: (code: string) =>
    post<Record<string, unknown>>('/api/rpc/accept_invitation', {
      p_code: code.trim(),
    }),
}

export interface MovingRequest {
  id: string
  business_id: string
  order_id: string | null
  origin_text?: string
  destination_text?: string
  status?: string
  preferred_date?: string | null
  quote_amount?: number | null
  currency?: string | null
  requires_survey?: boolean
  items?: Array<{
    description: string
    quantity: number
    weight: number
  }> | null
}

export interface Order {
  id: string
  business_id: string
  status: string
  reference?: string | null
  current_status?: string
  created_at?: string
  updated_at?: string
  delivered_at?: string
  pickup_at?: string
  source?: string
  notes?: string
  driver?: {
    id: string
    name: string
    email: string
  } | null
  carrier?: {
    id: string
    name: string
    email: string
  } | null
}

export const ShipmentStatus = {
  DRAFT: 'draft',
  PENDING: 'pending',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const

export type ShipmentStatusValue = typeof ShipmentStatus[keyof typeof ShipmentStatus]

export interface ShipmentEvent {
  id: string
  event_id?: string
  shipment_id: string
  event_type: string
  description: string
  occurred_at: string
  verification_status?: string
  received_at?: string
  source_type?: string
  source_reference?: string
  location?: any
  metadata?: Record<string, unknown>
}

export interface Shipment {
  id: string
  pulse_shipment_id?: string
  business_id: string
  order_id: string | null
  order?: any
  current_status: string
  status?: any
  statuses: StatusRecord[]
  events?: ShipmentEvent[]
  created_at: string
  updated_at: string
  last_event_received_at?: string | null
  last_verified_location?: any
  delivered_at?: string
  pickup_at?: string
  source?: string
  notes?: string
  driver?: any
  carrier?: any
}

export interface StatusRecord {
  status: string
  timestamp: string
  note?: string
}

export interface ShipmentsList {
  shipments: Shipment[]
  data?: Shipment[]
  has_more: boolean
  next_cursor?: string | null
  note?: string
}

export interface OrdersList {
  orders: Order[]
  has_more: boolean
  note?: string
}

export interface Session {
  access_token: string
  refresh_token: string | null
  expires_in: number | null
  user_id: string
  email: string
}

export interface Partner {
  id: string
  name: string
  email: string
  created_at: string
}

export interface IssuedCredentials {
  id: string
  credential_id: string
  staff_id?: string
  password?: string
  type: string
  subject_did: string
  issuer_did: string
  status: string
  created_at: string
  updated_at: string
  note?: string
}

export interface Feedback {
  id: string
  business_id: string
  rating: number
  comment?: string | null
  created_at: string
}

export interface CreateMovingRequestInput {
  origin: string
  destination: string
  preferred_date: string
  requires_survey: boolean
}

export const operations: any = {
  createVehicle: (input?: any) => post<any>('/api/rpc/create_vehicle', input ?? {}),
  carriers: () => get<any>('/api/rpc/carriers'),
  offers: (id: string) => get<any>(`/api/rpc/offers/${id}`),
  createOffer: (input: any) => post<any>('/api/rpc/create_offer', input),
  respondToOffer: (offerId: string, input: any) => post<any>(`/api/rpc/respond_to_offer/${offerId}`, input),
  withdrawOffer: (offerId: string) => post<any>(`/api/rpc/withdraw_offer/${offerId}`, {}),
  board: (input: any) => post<any>('/api/rpc/board', input),
  listShipments: (businessId: string) => get<any>(`/api/businesses/${encodeURIComponent(businessId)}/shipments`),
  detail: (shipmentId: string) => get<any>(`/api/shipments/${shipmentId}`),
  recordEvent: (input: any) => post<any>('/api/rpc/record_event', input),
  listOrders: (businessId: string) => get<any>(`/api/businesses/${encodeURIComponent(businessId)}/orders`),
  createOrder: (input: any) => post<any>('/api/rpc/create_order', input),
  drivers: (businessId: string) => get<any>(`/api/drivers?business_id=${businessId}`),
  customers: (businessId: string) => get<any>(`/api/customers?business_id=${businessId}`),
  vehicles: (businessId: string) => get<any>(`/api/vehicles?business_id=${businessId}`),
  patchOrder: (orderId: string, input: any) => patch<any>(`/api/orders/${orderId}`, input),
  assignDriverTo: (orderId: string, driverId: string) => post<any>(`/api/orders/${orderId}/assign`, { driver_id: driverId }),
};

export const shipments: any = {
  list: (businessId: string) => get<any>(`/api/businesses/${encodeURIComponent(businessId)}/shipments`),
  detail: (shipmentId: string) => get<any>(`/api/shipments/${shipmentId}`),
  recordEvent: (input: any) => post<any>('/api/rpc/record_event', input),
};

export interface Geo {
  latitude: number
  longitude: number
  address?: string
}

export const geo = {
  suggest: async (text: string) => {
    if (isDemoMode()) {
      return { candidates: demo.suggest(text), note: 'Demo geocoder' }
    }
    return get<{ candidates: any[]; note?: string }>(`/api/geo/suggest?q=${encodeURIComponent(text)}`)
  }
}

export interface WorkspaceRecords {
  notifications: (businessId: string) => Promise<any>
  moving: (businessId: string) => Promise<any>
  createMoving: (input: any) => Promise<any>
  documents: (businessId: string) => Promise<any>
  audit: (businessId: string) => Promise<any>
  payments: (businessId: string) => Promise<any>
  feedback: (businessId: string) => Promise<any>
}

export const workspaceRecords: any = {
  notifications: (businessId: string) => get<any>(`/api/notifications?business_id=${businessId}`),
  moving: (businessId: string) => get<any>(`/api/moving-requests?business_id=${businessId}`),
  createMoving: (input: any) => post<any>('/api/moving-requests', input),
  documents: (businessId: string) => get<any>(`/api/documents?business_id=${businessId}`),
  audit: (businessId: string) => get<any>(`/api/audit-logs?business_id=${businessId}`),
  payments: (businessId: string) => get<any>(`/api/payment-attempts?business_id=${businessId}`),
  feedback: (businessId: string) => get<any>(`/api/order-feedback?business_id=${businessId}`),
}

export const partner: any = {
  list: () => get<any>('/api/partners'),
  uploadLogo: (formData: any) => post<any>('/api/partner/logo', formData),
  issueDriver: (input: any) => post<any>('/api/partner/issue-driver', input),
}