import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ApiError,
  auth,
  clearSession,
  demo,
  isDemoMode,
  loadSession,
  oauthStart,
  saveSession,
  workspace,
  type Business,
  type Session,
  type SignUpResult,
} from '../lib/api'

/**
 * Session and workspace context.
 *
 * Two things every authenticated page needs and that must never disagree:
 * who is signed in, and which company the user is acting inside. Tenant
 * isolation depends on the second being explicit — the selected business id is
 * passed to every query rather than inferred, so a page cannot accidentally read
 * across workspaces.
 */

interface SessionState {
  session: Session | null
  businesses: Business[]
  activeBusiness: Business | null
  loading: boolean
  /** Set when the session is gone; the shell shows a re-authenticate prompt. */
  expired: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ needsConfirmation: boolean; note?: string }>
  signInWithGoogle: () => Promise<void>
  signOut: () => void
  selectBusiness: (id: string) => void
  refreshBusinesses: () => void
}

const Ctx = createContext<SessionState | null>(null)

const BUSINESS_KEY = 'pulse.business'

export function SessionProvider({ children }: { children: ReactNode }) {
  // In demo mode there is no account and no token. A stand-in session is supplied
  // so the shell renders and the reviewer can walk the product; it carries no
  // credentials, so it cannot authenticate anything, and it is never persisted.
  const demoSession: Session | null = isDemoMode()
    ? { access_token: '', refresh_token: null, expires_in: null, user_id: 'demo-user', email: 'demo@example.invalid' }
    : null

  const [session, setSession] = useState<Session | null>(() => loadSession() ?? demoSession)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [activeId, setActiveId] = useState<string | null>(
    () => window.localStorage.getItem(BUSINESS_KEY),
  )
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)
  const [businessRevision, setBusinessRevision] = useState(0)

  // Load the workspace whenever a session exists. Failures here are surfaced as
  // an expired session or an empty workspace, never as invented companies.
  useEffect(() => {
    let cancelled = false
    if (!session) {
      setBusinesses([])
      setLoading(false)
      return
    }
    // Demo mode never calls the service: the workspace list is the fixture, so no
    // token is needed and no real account is consulted.
    if (isDemoMode()) {
      setBusinesses([demo.business as unknown as Business])
      setLoading(false)
      setExpired(false)
      return
    }
    setLoading(true)
    workspace
      .list()
      .then((data) => {
        if (cancelled) return
        const list = data.businesses ?? []
        setBusinesses(list)
        setExpired(false)
        setActiveId((current) => {
          if (current && list.some((b) => b.id === current)) return current
          return list[0]?.id ?? null
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.isAuthFailure) {
          setExpired(true)
          clearSession()
          setSession(null)
        } else {
          setBusinesses([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, businessRevision])

  const value = useMemo<SessionState>(
    () => ({
      session,
      businesses,
      activeBusiness: businesses.find((b) => b.id === activeId) ?? null,
      loading,
      expired,
      async signIn(email, password) {
        const next = await auth.signIn(email, password)
        saveSession(next)
        setSession(next)
        setExpired(false)
      },
      async signUp(email, password) {
        const result: SignUpResult = await auth.signUp(email, password)
        if (!result.access_token) {
          // Email confirmation is required and no mail is configured, so there
          // is deliberately no session to open. Report it rather than pretending.
          return { needsConfirmation: true, note: result.note }
        }
        const next: Session = {
          access_token: result.access_token as string,
          refresh_token: null,
          expires_in: null,
          user_id: result.user_id ?? '',
          email: result.email ?? '',
        }
        saveSession(next)
        setSession(next)
        return { needsConfirmation: false }
      },
      async signInWithGoogle() {
        const { authorization_url } = await oauthStart('google')
        // Navigate the browser to the Supabase authorize URL. Supabase will
        // redirect back here with a session cookie / URL params after the user
        // signs in with Google.
        window.location.href = authorization_url
      },
      signOut() {
        clearSession()
        window.localStorage.removeItem(BUSINESS_KEY)
        setSession(null)
        setBusinesses([])
        setActiveId(null)
      },
      selectBusiness(id) {
        setActiveId(id)
        window.localStorage.setItem(BUSINESS_KEY, id)
      },
      refreshBusinesses() {
        setBusinessRevision((revision) => revision + 1)
      },
    }),
    [session, businesses, activeId, loading, expired],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/** The active business id, or null when the user has no workspace yet. */
export function useBusinessId(): string | null {
  return useSession().activeBusiness?.id ?? null
}