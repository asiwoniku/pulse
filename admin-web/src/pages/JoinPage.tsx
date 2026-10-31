import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { workspace } from '../lib/api'
import { useAction } from '../state/useQuery'
import { useSession } from '../state/session'
import { Banner, PageHeader, Panel } from '../components/ui'

/**
 * Redeem an invitation code.
 *
 * This route exists because `invite_worker` creates a real code and the mailer
 * emails a link to it, but the app had nowhere to enter that code: an owner could
 * invite a teammate who then had no way to join. The database still owns the rules —
 * the code must be pending, unexpired, and issued to the account that redeems it —
 * so a wrong or stale code fails here with the server's own reason.
 */
export function JoinPage() {
  // The mailer builds `${MAIL_INVITE_URL}?code=...`, so arriving from an emailed
  // link prefills the field. It is only a convenience: the code is still submitted
  // and validated by the database, never trusted from the query string.
  const [params] = useSearchParams()
  const [code, setCode] = useState(() => params.get('code') ?? '')
  const { session, refreshBusinesses, businesses } = useSession()
  const navigate = useNavigate()

  const accept = useAction(() => workspace.acceptInvitation(code))
  const [done, setDone] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await accept.run()
    if (result) {
      setDone(true)
      // The new membership row is only visible after the workspace list is re-read.
      refreshBusinesses()
    }
  }

  // An account with no workspace at all has nothing to return to, so send it home.
  if (done && businesses.length === 0) {
    navigate('/app/overview', { replace: true })
  }

  return (
    <>
      <PageHeader
        eyebrow={session?.email ?? 'Workspace'}
        title="Join a workspace"
        description="Enter the invitation code an owner sent you. The code only works for the account it was issued to."
      />
      <Panel title="Invitation code" description="Redeemed once, and only while it is still valid.">
        {!session ? (
          <Banner tone="warning" title="Sign in first">
            An invitation is always redeemed by the account it was sent to. Sign in with
            that account, then paste the code.
          </Banner>
        ) : null}
        {accept.error ? (
          <Banner tone="critical" title="Code not accepted">
            {accept.error.message}
          </Banner>
        ) : null}
        {done ? (
          <Banner tone="success" title="Invitation accepted">
            You are now a member of this workspace. It may take a moment to appear in the
            switcher at the top.
          </Banner>
        ) : null}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="join-code">Code</label>
            <input
              id="join-code"
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste the code from your invitation"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>
          <div className="row-actions">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={accept.pending || !session || code.trim().length < 4}
            >
              {accept.pending ? 'Checking…' : 'Accept invitation'}
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => navigate('/app/overview')}
            >
              Back to workspace
            </button>
          </div>
        </form>
      </Panel>
    </>
  )
}