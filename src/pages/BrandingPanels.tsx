import { useState, type FormEvent } from 'react'
import { partner, type IssuedCredentials } from '../lib/api'
import { Banner, Panel } from '../components/ui'

/**
 * The partner's own mark.
 *
 * This exists so a partner sees *their* company in the workspace rather than only
 * Pulse's. It is presentation and nothing more: the logo is never used for
 * authorisation, which is why it can be a plain public storage read while the
 * upload itself is guarded by `can_operate`.
 */
export function LogoPanel({
  businessId,
  logoUrl,
  onSaved,
}: {
  businessId: string
  logoUrl: string | null
  onSaved: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setPending(true)
    setError('')
    try {
      await partner.uploadLogo(businessId, file)
      setSaved(true)
      setFile(null)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The logo could not be uploaded.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Panel
      title="Your mark"
      description="Shown beside Pulse's, so the workspace looks like your company's."
    >
      {error ? (
        <Banner tone="critical" title="Logo not uploaded">
          {error}
        </Banner>
      ) : null}
      {saved && !error ? (
        <Banner tone="success" title="Saved">
          Your mark is now on the workspace.
        </Banner>
      ) : null}

      <div className="logo-preview">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Your company logo"
            // A logo that fails to load must not leave a broken image icon next to
            // Pulse's mark.
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <span className="logo-preview__empty">No mark yet</span>
        )}
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="logo-file">Logo file</label>
          <input
            id="logo-file"
            className="input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setSaved(false)
            }}
          />
          <span className="muted small">PNG, JPEG or WebP, up to 512 kB.</span>
        </div>
        <div className="row-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={pending || !file}
          >
            {pending ? 'Uploading…' : 'Upload logo'}
          </button>
        </div>
      </form>
    </Panel>
  )
}

/**
 * Issue a driver their login.
 *
 * The credentials are shown **once** and then gone. Pulse keeps only a bcrypt hash,
 * so there is nothing to retrieve later — which is the point: a partner handing a
 * driver a password on paper should not be able to read it back out of the system
 * afterwards.
 */
export function IssueDriverPanel({ businessId }: { businessId: string }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<IssuedCredentials | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    setIssued(null)
    try {
      const result = await partner.issueDriver({
        business_id: businessId,
        full_name: name.trim(),
        phone_e164: phone.trim() || undefined,
        password,
      })
      setIssued(result.credentials)
      setName('')
      setPhone('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The login could not be issued.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Panel
      title="Add a driver"
      description="Pulse creates the account and hands back a staff ID and password."
    >
      {error ? (
        <Banner tone="critical" title="Login not issued">
          {error}
        </Banner>
      ) : null}
      {issued ? (
        <Banner tone="success" title="Give these to your driver now">
          <p>
            Staff ID <strong className="mono">{issued.staff_id}</strong> — password{' '}
            <strong className="mono">{issued.password}</strong>
          </p>
          <p>{issued.note}</p>
        </Banner>
      ) : null}

      <form onSubmit={submit}>
        <div className="grid grid--2">
          <div className="field">
            <label htmlFor="driver-name">Full name</label>
            <input
              id="driver-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="driver-phone">Phone (E.164)</label>
            <input
              id="driver-phone"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234…"
            />
          </div>
          <div className="field">
            <label htmlFor="driver-password">Password</label>
            <input
              id="driver-password"
              className="input"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            <span className="muted small">
              At least 8 characters. You will not see it again after saving.
            </span>
          </div>
        </div>
        <div className="row-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={pending || name.trim().length < 2 || password.length < 8}
          >
            {pending ? 'Creating…' : 'Create driver login'}
          </button>
        </div>
      </form>
    </Panel>
  )
}