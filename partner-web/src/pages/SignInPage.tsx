import { useState, type FormEvent } from 'react'
import { useSession } from '../state/session'
import { ApiError } from '../lib/api'
import { Banner } from '../components/ui'
import { IconBox } from '../components/icons'

/**
 * Sign-in and account creation.
 *
 * The one thing this screen must not do is pretend. If the project requires
 * email confirmation and no mail is configured, it says exactly that instead of
 * navigating into an app the user cannot actually use.
 */
export function SignInPage() {
  const { signIn, signUp, signInWithGoogle } = useSession()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Google OAuth sign-in
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false)

  const valid = email.trim().length > 3 && password.length >= 6 && !busy && !isGoogleSigningIn

  const valid = email.trim().length > 3 && password.length >= 6 && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
      } else {
        const result = await signUp(email.trim(), password)
        if (result.needsConfirmation) {
          setNotice(
            result.note ??
              'This project requires email confirmation, and no mail provider is configured. The account exists but cannot be signed into until confirmation is sent.',
          )
          setMode('signin')
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__panel">
        <div className="auth__topline">
          <div className="auth__brand">
            <span className="brandmark" aria-hidden="true" />
            <span className="brandmark__text">
              <strong>Pulse</strong>
              <span>Partner</span>
            </span>
          </div>
          <span className="auth__secure">PARTNER WORKSPACE</span>
        </div>

        <div className="auth__form-content">
          <p className="auth__eyebrow">YOUR OPERATIONS, IN SYNC</p>
          <h1 className="auth__title">
            {mode === 'signin' ? (
              <>Welcome <span>back.</span></>
            ) : (
              <>Join the <span>network.</span></>
            )}
          </h1>
          <p className="auth__sub">
            {mode === 'signin'
              ? 'Sign in to your partner workspace and pick up where your team left off.'
              : 'Create an account for your logistics company and get your workspace started.'}
          </p>

          {error ? (
            <Banner tone="critical" title="Sign-in failed">
              {error}
            </Banner>
          ) : null}
          {notice ? <Banner tone="warning" title="Account created">{notice}</Banner> : null}
          <div className="google-continue" onClick={() => signInWithGoogle()} disabled={isGoogleSigningIn}>
            <span>Continue with Google</span>
          </div>

          <form onSubmit={submit} className="form" noValidate>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className="input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <span className="field__hint">At least 6 characters.</span>
            </div>

            <button type="submit" className="btn btn--primary" disabled={!valid}>
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in to workspace' : 'Create account'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={() => void signInWithGoogle()}
          >
            Sign in with Google
            <span aria-hidden="true">â†’</span>
          </button>

          <p className="auth__switch">
            {mode === 'signin' ? 'New to Pulse? ' : 'Already registered? '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
                setNotice(null)
              }}
            >
              {mode === 'signin' ? 'Create a partner account' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="auth__legal">By continuing, you’re accessing a workspace for logistics partners.</p>
      </div>

      <aside className="auth__aside" aria-hidden="true">
        <div className="auth__aside-top">
          <span className="auth__aside-mark"><IconBox size={17} /></span>
          <span>THE PULSE PARTNER PLATFORM</span>
        </div>
        <div className="auth__aside-copy">
          <p className="auth__aside-kicker">BUILT FOR EVERY HANDOFF</p>
          <h2>Good logistics<br /><span>moves together.</span></h2>
          <p>
            Keep bookings, shipment progress and proof of delivery connected in one
            workspace built around your team.
          </p>
        </div>

        <div className="auth__preview">
          <div className="auth__preview-bar">
            <div className="auth__preview-dots"><i /><i /><i /></div>
            <span>PARTNER WORKSPACE</span>
            <span className="auth__preview-live">PREVIEW</span>
          </div>
          <div className="auth__preview-body">
            <nav className="auth__preview-nav">
              <span className="auth__preview-logo"><b /></span>
              <span className="is-selected"><i />Overview</span>
              <span><i />Shipments</span>
              <span><i />Dispatch</span>
              <span><i />Partners</span>
              <div className="auth__preview-nav-foot"><b />Your workspace</div>
            </nav>
            <div className="auth__preview-main">
              <div className="auth__preview-heading">
                <div><span>WORKSPACE OVERVIEW</span><b>One clear picture.</b></div>
                <div className="auth__preview-avatar">P</div>
              </div>
              <div className="auth__preview-cards">
                <div><span>SHIPMENT VISIBILITY</span><b><i className="preview-dot preview-dot--teal" />One shared view</b><em /></div>
                <div><span>EVENT HISTORY</span><b><i className="preview-dot preview-dot--blue" />Source-aware updates</b><em /></div>
              </div>
              <div className="auth__preview-route">
                <div className="auth__preview-route-head"><b>Every handoff, connected</b><span>WORKFLOW PREVIEW</span></div>
                <svg viewBox="0 0 500 126" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 88C88 88 77 35 155 35C220 35 207 94 280 94C352 94 334 48 410 48C440 48 450 62 478 62" stroke="rgba(255,255,255,.14)" strokeWidth="2" strokeDasharray="4 7" />
                  <path d="M22 88C88 88 77 35 155 35C220 35 207 94 280 94C352 94 334 48 410 48C440 48 450 62 478 62" stroke="url(#route-line)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="8 9" />
                  <defs><linearGradient id="route-line" x1="22" y1="88" x2="478" y2="62" gradientUnits="userSpaceOnUse"><stop stopColor="#38D8B6" /><stop offset="1" stopColor="#7297FF" /></linearGradient></defs>
                  <circle cx="22" cy="88" r="6" fill="#122238" stroke="#38D8B6" strokeWidth="3" />
                  <circle cx="155" cy="35" r="6" fill="#122238" stroke="#38D8B6" strokeWidth="3" />
                  <circle cx="280" cy="94" r="6" fill="#122238" stroke="#7297FF" strokeWidth="3" />
                  <circle cx="410" cy="48" r="6" fill="#122238" stroke="#7297FF" strokeWidth="3" />
                </svg>
                <div className="auth__preview-stages"><span>Booking</span><span>In transit</span><span>Handoff</span><span>Proof</span></div>
              </div>
            </div>
          </div>
        </div>
        <div className="auth__aside-foot"><span>ONE WORKSPACE</span><i /> <span>YOUR PARTNER NETWORK</span><i /> <span>EVERY HANDOFF</span></div>
      </aside>
    </div>
  )
}