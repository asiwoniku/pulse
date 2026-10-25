export class ApiError {
  status: number
  message: string
  source: string | null
  detail: unknown
  isAuthFailure: boolean

  constructor(status: number, message: string, source: string | null, detail: unknown, isAuthFailure: boolean = false) {
    this.status = status
    this.message = message
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
      /* Ignore malformed stored session; the request will fail without a token. */
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
    )
  }

  return body as T
}

export const get = <T>(path: string) => request<T>(path)
export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
export const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

import { demo } from './demoData'
export { demo } from './demoData'

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
    /* Private browsing with storage disabled: simply not available. */
  }
}

export const DEMO_MESSAGE =
  'Demo mode is on. Every record below is fictional and exists only in this browser \u2014 nothing was read from or written to the database.'

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
    /* Private browsing with storage disabled: simply not available. */
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
      return { ...page, shipments: demo.shipments(), note: DEMO_MESSAGE }

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
/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

\n  user_id: string\n  email: string

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

/**
 * Starts a social sign-in flow. Returns a Supabase authorize URL the browser
 * should be navigated to. After the user signs in with the provider, Supabase
 * redirects back to this site with a session, which the page then persists.
 */
export const oauthStart = (provider: 'google' | 'microsoft') =>
  post<{ authorization_url: string }>(`/api/auth/oauth/${provider}`)

/* ------------------------------------------------------------------ */
/* System                                                              */
/* ------------------------------------------------------------------ */

export const system = {
  health: () => get<{ ok: boolean; supabase: string | null }>('/api/health'),
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

export interface Business {
  id: string
  phone_e164?: string | null
  email?: string | null
  city: string | null
  country_code: string | null
  currency: string | null
  kind: string | null
  logo_url: string | null
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
    input: Partial<
      Pick<
        Business,
        | 'name'
        | 'phone_e164'
        | 'email'
        | 'city'
        | 'country_code'
        | 'currency'
        | 'is_active'
      >
    > & { service_areas?: string[] },
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

/* ------------------------------------------------------------------ */
/* Workspace records                                                  */
/* ------------------------------------------------------------------ */

export interface MovingRequest {
  id: string
  business_id: string
  order_id: string | null
}

export interface Order {
  id: string
  business_id: string
  status: string
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

export interface ShipmentsList {
  shipments: Shipment[]
  has_more: boolean
}

export interface Shipment {
  id: string
  business_id: string
  order_id: string | null
  current_status: string
  statuses: StatusRecord[]
  created_at: string
  updated_at: string
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

export interface StatusRecord {
  status: string
  timestamp: string
  note?: string
}

export interface OrdersList {
  orders: Order[]
  has_more: boolean
}
