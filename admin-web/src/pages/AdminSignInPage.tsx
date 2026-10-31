import { useState, type FormEvent } from 'react'
import { useSession } from '../state/session'
import { ApiError } from '../lib/api'
import { Banner } from '../components/ui'
import { IconShield, IconBuilding } from '../components/icons'
import { GoogleIcon } from './SignInPage'

export function AdminSignInPage() {
  const { signIn, signInWithGoogle } = useSession()
  const [email, setEmail] = useState('ops-admin@pulse.com')
  const [password, setPassword] = useState('PulseAdmin2026!')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Unable to authenticate master administrator session')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogleSSO() {
    setIsGoogleSigningIn(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Google SSO authentication failed')
      }
    } finally {
      setIsGoogleSigningIn(false)
    }
  }

  function handleDemoBypass() {
    // Immediate SuperAdmin demo session
    const superAdminSession = {
      access_token: 'demo_pulse_super_admin_jwt_' + Date.now(),
      refresh_token: 'demo_refresh_token',
      expires_in: 86400,
      user_id: 'usr_super_admin_pulse_01',
      email: 'ops-admin@pulse.com',
    }
    localStorage.setItem('pulse_partner_session', JSON.stringify(superAdminSession))
    window.location.reload()
  }

  return (
    <div className="signin-view">
      <div className="signin-panel" style={{ maxWidth: 440 }}>
        <header className="signin-panel__header" style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
              border: '1px solid #4338ca',
              marginBottom: 16,
              color: '#818cf8',
            }}
          >
            <IconShield size={32} />
          </div>
          <div
            style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              background: '#312e81',
              color: '#a5b4fc',
              border: '1px solid #4338ca',
              marginBottom: 8,
            }}
          >
            admin.pulse.com
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            Pulse Operations Admin
          </h1>
          <p className="lead" style={{ fontSize: 13, marginTop: 4 }}>
            Subdomain Control Tower for partner workspace provisioning, dispute arbitration, and platform escrow.
          </p>
        </header>

        {error && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="critical" title="Authentication Failed">
              {error}
            </Banner>
          </div>
        )}

        {/* Google Workspace Staff SSO */}
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={handleGoogleSSO}
            disabled={isGoogleSigningIn || busy}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '10px 16px',
              backgroundColor: '#ffffff',
              color: '#1f2937',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: isGoogleSigningIn || busy ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              opacity: isGoogleSigningIn || busy ? 0.7 : 1,
              transition: 'background-color 0.15s, box-shadow 0.15s',
            }}
          >
            <GoogleIcon size={18} />
            <span>
              {isGoogleSigningIn ? 'Connecting to Google...' : 'Sign in with Pulse Google SSO'}
            </span>
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '16px 0',
            color: 'var(--text-subtle)',
            fontSize: 12,
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ padding: '0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            or admin credentials
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={submit} className="stack stack--gap-md">
          <label className="field">
            <span className="field__label">Admin Work Email</span>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="operator@pulse.com"
            />
          </label>

          <label className="field">
            <span className="field__label">Master Key Password</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            className="btn btn--primary"
            style={{ width: '100%', marginTop: 8 }}
            disabled={busy || isGoogleSigningIn}
          >
            {busy ? 'Authenticating...' : 'Enter Master Console'}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={handleDemoBypass}
            className="btn btn--ghost"
            style={{
              width: '100%',
              fontSize: 13,
              borderColor: '#4f46e5',
              color: '#818cf8',
              backgroundColor: 'rgba(79, 70, 229, 0.08)',
            }}
          >
            ⚡ 1-Click Demo SuperAdmin Access
          </button>
        </div>

        <footer style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-subtle)' }}>
          <div>Pulse Logistics Network • Operations Subdomain</div>
          <div style={{ marginTop: 4 }}>
            Looking for partner login?{' '}
            <a
              href="https://partner.pulse.com"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--primary)', textDecoration: 'underline' }}
            >
              partner.pulse.com
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
