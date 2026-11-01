import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  clearAdminSession,
  restorePlatformAdminSession,
  signInAsPlatformAdmin,
  type AdminSession,
} from '../lib/api'

interface AdminSessionContext {
  session: AdminSession | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const Context = createContext<AdminSessionContext | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    restorePlatformAdminSession()
      .then((restored) => {
        if (active) setSession(restored)
      })
      .catch((cause: unknown) => {
        clearAdminSession()
        if (active && cause instanceof Error) setError(cause.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const value = useMemo<AdminSessionContext>(
    () => ({
      session,
      loading,
      error,
      async signIn(email, password) {
        setError(null)
        const signedIn = await signInAsPlatformAdmin(email, password)
        setSession(signedIn)
      },
      signOut() {
        clearAdminSession()
        setSession(null)
        setError(null)
      },
    }),
    [session, loading, error],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useSession(): AdminSessionContext {
  const context = useContext(Context)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}
