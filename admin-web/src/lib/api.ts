const SESSION_KEY = 'pulse.platform-admin.session'

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

export interface AdminSession {
  access_token: string
  refresh_token: string
  expires_at: number
  user: {
    id: string
    email?: string
  }
}

export interface AdminOverview {
  total_organisations: number
  pending_verification: number
  verified_organisations: number
  suspended_organisations: number
}

export type AccountStatus = 'active' | 'suspended'
export type VerificationStatus =
  | 'not_submitted'
  | 'submitted'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'needs_more_information'

export interface PlatformOrganisation {
  business_id: string
  name: string
  kind: string
  contact_email: string | null
  contact_phone: string | null
  city: string | null
  country_code: string
  created_at: string
  account_status: AccountStatus
  verification_status: VerificationStatus
  verification_method: string | null
  verification_source: string | null
  verification_limitations: string | null
  review_note: string | null
  reviewed_at: string | null
}

export interface PlatformAuditEntry {
  id: number
  business_id: string | null
  action: string
  actor_user_id: string | null
  details: Record<string, unknown>
  occurred_at: string
}

const config = () => {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey || !url.startsWith('https://')) {
    throw new AdminApiError(
      'Platform admin is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      0,
    )
  }
  return { url, anonKey }
}

async function decode<T>(response: Response): Promise<T> {
  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }
  if (!response.ok) {
    const body = payload as { message?: string; msg?: string; error_description?: string } | null
    const message =
      body?.message ??
      body?.msg ??
      body?.error_description ??
      (typeof payload === 'string' ? payload : `Request failed (${response.status}).`)
    throw new AdminApiError(message, response.status)
  }
  return payload as T
}

function toSession(payload: {
  access_token: string
  refresh_token: string
  expires_in?: number
  expires_at?: number
  user: { id: string; email?: string }
}): AdminSession {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at ?? Math.floor(Date.now() / 1000) + (payload.expires_in ?? 3600),
    user: payload.user,
  }
}

function loadStoredSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AdminSession
    if (!parsed.access_token || !parsed.refresh_token || !parsed.user?.id) return null
    return parsed
  } catch {
    return null
  }
}

function storeSession(session: AdminSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

async function refreshSession(session: AdminSession): Promise<AdminSession> {
  const { url, anonKey } = config()
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
  const refreshed = toSession(await decode<Parameters<typeof toSession>[0]>(response))
  storeSession(refreshed)
  return refreshed
}

async function currentSession(): Promise<AdminSession> {
  const session = loadStoredSession()
  if (!session) throw new AdminApiError('Sign in with an authorized platform admin account.', 401)
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    return refreshSession(session)
  }
  return session
}

async function rpcWithSession<T>(
  session: AdminSession,
  functionName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { url, anonKey } = config()
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  return decode<T>(response)
}

export async function signInAsPlatformAdmin(email: string, password: string): Promise<AdminSession> {
  const { url, anonKey } = config()
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = toSession(await decode<Parameters<typeof toSession>[0]>(response))

  try {
    await rpcWithSession<AdminOverview>(session, 'platform_admin_overview')
  } catch (error) {
    clearAdminSession()
    if (error instanceof AdminApiError && error.status === 403) {
      throw new AdminApiError('This account is not authorized for the platform admin console.', 403)
    }
    throw error
  }
  storeSession(session)
  return session
}

export async function restorePlatformAdminSession(): Promise<AdminSession | null> {
  const saved = loadStoredSession()
  if (!saved) {
    clearAdminSession()
    return null
  }
  const session =
    saved.expires_at <= Math.floor(Date.now() / 1000) + 60
      ? await refreshSession(saved)
      : saved
  await rpcWithSession<AdminOverview>(session, 'platform_admin_overview')
  storeSession(session)
  return session
}

export async function loadPlatformOverview(): Promise<AdminOverview> {
  return rpcWithSession(await currentSession(), 'platform_admin_overview')
}

export async function listPlatformOrganisations(): Promise<PlatformOrganisation[]> {
  return rpcWithSession(await currentSession(), 'platform_admin_organisations')
}

export async function listPlatformAudit(): Promise<PlatformAuditEntry[]> {
  return rpcWithSession(await currentSession(), 'platform_admin_recent_actions', {
    p_limit: 100,
  })
}

export async function updatePlatformReview(input: {
  business_id: string
  account_status: AccountStatus
  verification_status: VerificationStatus
  verification_method: string
  verification_source: string
  verification_limitations: string
  review_note: string
}): Promise<void> {
  await rpcWithSession(await currentSession(), 'platform_admin_review_business', {
    p_business_id: input.business_id,
    p_account_status: input.account_status,
    p_verification_status: input.verification_status,
    p_verification_method: input.verification_method || null,
    p_verification_source: input.verification_source || null,
    p_verification_limitations: input.verification_limitations || null,
    p_review_note: input.review_note || null,
  })
}
