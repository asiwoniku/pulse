import { useState, type FormEvent } from 'react'
import { AdminApiError } from '../lib/api'
import { useSession } from '../state/session'

export function AdminSignInPage() {
  const { signIn, error: restoreError } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(restoreError)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await signIn(email.trim(), password)
    } catch (cause) {
      setMessage(
        cause instanceof AdminApiError || cause instanceof Error
          ? cause.message
          : 'Unable to authenticate this platform admin account.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-login">
      <section className="admin-login__card">
        <div className="admin-mark" aria-hidden="true">P</div>
        <p className="admin-eyebrow">Pulse · Platform administration</p>
        <h1>Sign in to the control plane</h1>
        <p className="admin-lead">
          This console manages platform-level organisation status and verification.
          It has no shipment, order, driver, or partner operations workspace.
        </p>
        {message ? <div className="admin-alert" role="alert">{message}</div> : null}
        <form className="admin-form" onSubmit={submit}>
          <label>
            <span>Administrator email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="admin-button admin-button--primary" disabled={busy}>
            {busy ? 'Checking platform access…' : 'Sign in'}
          </button>
        </form>
        <p className="admin-login__foot">
          Access is verified by Postgres using the account’s trusted platform-admin claim.
          A partner workspace account alone is not sufficient.
        </p>
      </section>
    </main>
  )
}
