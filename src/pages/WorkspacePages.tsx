import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { operations, shipments, workspace, workspaceRecords, type MovingRequest } from '../lib/api'
import { useAction, useQuery } from '../state/useQuery'
import { useSession } from '../state/session'
import { Banner, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui'
import { DateTimeValue, Money, ShipmentRef, StatusBadge } from '../components/domain'

function PageLoad({
  initial,
  error,
  retry,
  empty,
  children,
}: {
  initial: boolean
  error: Error | null
  retry: () => void
  empty: boolean
  children: ReactNode
}) {
  if (error) return <ErrorState message={error.message} onRetry={retry} />
  if (initial) return <Skeleton rows={5} />
  if (empty) return <EmptyState title="Nothing here yet" body="No matching records were returned for this workspace." />
  return <>{children}</>
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [keys.map(quote).join(','), ...rows.map((row) => keys.map((key) => quote(row[key])).join(','))].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function WarehousePage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => shipments.list(id, 0, 100) : null, [id])
  const data = query.data as any
  const rows = (data?.shipments ?? []).filter((s: any) =>
    ['accepted', 'assigned', 'driver_accepted', 'driver_arrived', 'at_pickup', 'picked_up'].includes(s.current_status),
  )
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Warehouse & handoff" description="Live shipment handoff queue. Physical bin inventory is not recorded in Pulse." actions={<Link className="btn btn--primary" to="/app/shipments/new">Create shipment</Link>} />
      <div className="metrics">
        <div className="metric"><span className="metric__label">Awaiting pickup</span><strong className="metric__value">{rows.filter((r) => ['accepted', 'assigned', 'driver_accepted'].includes(r.current_status)).length}</strong><span className="metric__hint">In the returned shipment window</span></div>
        <div className="metric"><span className="metric__label">At pickup</span><strong className="metric__value">{rows.filter((r) => ['driver_arrived', 'at_pickup'].includes(r.current_status)).length}</strong><span className="metric__hint">Awaiting handoff or collection</span></div>
        <div className="metric"><span className="metric__label">Collected</span><strong className="metric__value">{rows.filter((r) => r.current_status === 'picked_up').length}</strong><span className="metric__hint">Shipment status from Postgres</span></div>
      </div>
      <Panel title="Handoff queue" description="Sorted and filtered from actual shipment statuses.">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!rows.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Shipment</th><th>Status</th><th>Last verified location</th><th>Updated</th><th /></tr></thead><tbody>
            {rows.map((row) => <tr key={row.id}><td><ShipmentRef value={row.pulse_shipment_id} /></td><td><StatusBadge status={row.current_status} /></td><td>{row.last_verified_location ?? '—'}</td><td><DateTimeValue value={row.last_event_received_at} /></td><td><Link className="rowlink" to={`/app/shipments/${row.id}`}>Open</Link></td></tr>)}
          </tbody></table></div>
        </PageLoad>
      </Panel>
    </>
  )
}

export function MovingPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => workspaceRecords.moving(id) : null, [id])
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const create = useAction(async () => {
    if (!id) throw new Error('Choose a workspace first.')
    return workspaceRecords.createMoving({
      business_id: id,
      origin_text: origin.trim(),
      destination_text: destination.trim(),
      preferred_date: date || undefined,
      currency: activeBusiness?.currency ?? 'NGN',
    })
  })
  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await create.run()
    if (result) {
      setOrigin('')
      setDestination('')
      setDate('')
      query.reload()
    }
  }
  const data = query.data as any
  const rows = data?.moving_requests ?? []
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Moving jobs" description="Create a moving request and review its real survey, route, and captured-item records." />
      <Panel title="New moving request" description="This creates a request in the workspace database; it does not schedule a survey or promise a quote.">
        {create.error ? <Banner tone="critical" title="Request not created">{create.error.message}</Banner> : null}
        <form onSubmit={submit}>
          <div className="grid grid--2">
            <div className="field"><label htmlFor="moving-origin">Origin</label><input id="moving-origin" className="input" required minLength={3} maxLength={500} value={origin} onChange={(e) => setOrigin(e.target.value)} /></div>
            <div className="field"><label htmlFor="moving-destination">Destination</label><input id="moving-destination" className="input" required minLength={3} maxLength={500} value={destination} onChange={(e) => setDestination(e.target.value)} /></div>
            <div className="field"><label htmlFor="moving-date">Preferred date</label><input id="moving-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="row-actions"><button className="btn btn--primary" type="submit" disabled={create.pending || origin.trim().length < 3 || destination.trim().length < 3}>{create.pending ? 'Creating…' : 'Create moving request'}</button></div>
        </form>
      </Panel>
      <Panel title="Moving requests" description="Up to 100 most recent requests visible to your workspace.">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!rows.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Route</th><th>Status</th><th>Preferred date</th><th>Quote</th><th>Survey / items</th></tr></thead><tbody>
            {rows.map((row: MovingRequest) => <tr key={row.id}><td><strong>{row.origin_text}</strong><br /><span className="muted">to {row.destination_text}</span></td><td><StatusBadge status={row.status} /></td><td>{row.preferred_date ?? 'Not set'}</td><td><Money amount={row.quote_amount} currency={row.currency} /></td><td>{row.requires_survey === 'unset' ? 'Survey not recorded' : `Survey: ${row.requires_survey}`}{row.items.length ? ` · ${row.items.length} item(s)` : ''}</td></tr>)}
          </tbody></table></div>
        </PageLoad>
      </Panel>
      {query.data?.note ? <Banner tone="info">{query.data.note}</Banner> : null}
    </>
  )
}

export function InternationalPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => shipments.list(id, 0, 100) : null, [id])
  const data = query.data as any
  const rows = data?.shipments ?? []
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="International & clearance" description="Review recorded shipment routes and service types. No customs declarations or clearance provider is connected." actions={<Link className="btn btn--secondary" to="/app/shipments">All shipments</Link>} />
      <Panel title="Shipment route book" description="The current schema records free-text addresses, not countries, customs entries, or border milestones.">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!rows.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Shipment</th><th>Service</th><th>Origin</th><th>Destination</th><th>Status</th><th /></tr></thead><tbody>
            {rows.map((row) => <tr key={row.id}><td><ShipmentRef value={row.pulse_shipment_id} /></td><td>{String(row.order?.service_type ?? 'Not recorded')}</td><td>{String(row.order?.pickup_text ?? '—')}</td><td>{String(row.order?.destination_text ?? '—')}</td><td><StatusBadge status={row.current_status} /></td><td><Link className="rowlink" to={`/app/shipments/${row.id}`}>Passport</Link></td></tr>)}
          </tbody></table></div>
        </PageLoad>
      </Panel>
    </>
  )
}

export function DocumentsPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => workspaceRecords.documents(id) : null, [id])
  const data = query.data as any
  const rows = data?.documents ?? []
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Documents & proof of delivery" description="A verified index of proof-of-delivery events recorded against shipments." />
      <Panel title="Recorded proof events" description="File bytes are private; open the shipment passport to review its event history.">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!rows.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Shipment</th><th>Event</th><th>Verification</th><th>Recorded</th><th /></tr></thead><tbody>
            {rows.map((row) => {
              const shipment = row.shipment as Record<string, unknown> | null
              return <tr key={String(row.event_id)}><td><ShipmentRef value={String(shipment?.pulse_shipment_id ?? 'Shipment')} /></td><td>Proof of delivery</td><td>{String(row.verification_status ?? 'unverified')}</td><td><DateTimeValue value={String(row.occurred_at ?? '')} /></td><td>{shipment?.id ? <Link className="rowlink" to={`/app/shipments/${shipment.id}`}>Open passport</Link> : null}</td></tr>
            })}
          </tbody></table></div>
        </PageLoad>
      </Panel>
      {query.data?.note ? <Banner tone="info">{query.data.note}</Banner> : null}
    </>
  )
}

export function AuditPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => workspaceRecords.audit(id) : null, [id])
  const data = query.data as any
  const rows = data?.audit_logs ?? []
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Audit history" description="Append-only actions recorded by the database for this workspace." />
      <Panel title="Recent activity" description="Latest 100 visible audit records.">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!rows.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Target</th><th>Summary</th></tr></thead><tbody>
            {rows.map((row) => <tr key={String(row.id)}><td><DateTimeValue value={String(row.occurred_at ?? '')} /></td><td>{String(row.action ?? '—')}</td><td>{String(row.actor_kind ?? 'system')}</td><td>{[row.target_table, row.target_id].filter(Boolean).join(' · ') || '—'}</td><td>{String(row.summary ?? '—')}</td></tr>)}
          </tbody></table></div>
        </PageLoad>
      </Panel>
      {query.data?.note ? <Banner tone="info">{query.data.note}</Banner> : null}
    </>
  )
}

export function PaymentsPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => workspaceRecords.payments(id) : null, [id])
  const data = query.data as any
  const rows = data?.payment_attempts ?? []
  // The accumulator is typed explicitly. Inferred from the `{}` seed it widens to
  // `{}`, and `map[status] + 1` then fails because `{}` has no `+`.
  const totals = useMemo(
    () =>
      rows.reduce<Record<string, number>>((sum, row) => {
        if (row.status === 'paid') {
          const currency = String(row.currency ?? '')
          sum[currency] = (sum[currency] ?? 0) + Number(row.amount ?? 0)
        }
        return sum
      }, {}),
    [rows],
  )
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Payments" description="Payment attempts actually recorded for orders. No provider connection or payout ledger is configured." />
      <div className="metrics">{Object.entries(totals).length ? Object.entries(totals).map(([currency, value]) => <div className="metric" key={currency}><span className="metric__label">Recorded paid · {currency}</span><strong className="metric__value">{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><span className="metric__hint">In the latest 100 attempts</span></div>) : <div className="metric"><span className="metric__label">Recorded paid attempts</span><strong className="metric__value">0</strong><span className="metric__hint">No confirmed attempts in this window</span></div>}</div>
      <Panel title="Payment attempts" description="Pending attempts are not counted as revenue; provider payloads are not exposed.">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!rows.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Provider</th><th>Amount</th><th>Status</th><th>Created</th><th>Confirmed</th></tr></thead><tbody>
            {rows.map((row) => { const order = row.order as Record<string, unknown> | null; return <tr key={String(row.id)}><td>{String(order?.reference ?? row.order_id ?? '—')}</td><td>{String(row.provider ?? 'manual')}</td><td><Money amount={Number(row.amount)} currency={String(row.currency ?? '')} /></td><td><StatusBadge status={String(row.status ?? '')} /></td><td><DateTimeValue value={String(row.created_at ?? '')} /></td><td><DateTimeValue value={(row.confirmed_at as string) ?? null} /></td></tr> })}
          </tbody></table></div>
        </PageLoad>
      </Panel>
      {query.data?.note ? <Banner tone="info">{query.data.note}</Banner> : null}
    </>
  )
}

export function ReputationPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => workspaceRecords.feedback(id) : null, [id])
  const data = query.data as any
  const rows = data?.feedback ?? []
  const average = rows.length ? rows.reduce((total, row) => total + Number(row.rating), 0) / rows.length : null
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Reviews & reputation" description="Ratings collected for completed orders, sourced from immutable customer feedback." />
      <div className="metrics"><div className="metric"><span className="metric__label">Average rating</span><strong className="metric__value">{average === null ? '—' : average.toFixed(1)}</strong><span className="metric__hint">{rows.length} rating(s) in the returned window</span></div><div className="metric"><span className="metric__label">Reviews</span><strong className="metric__value">{rows.length}</strong><span className="metric__hint">Latest 100 visible records</span></div></div>
      <Panel title="Customer feedback">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!rows.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Rating</th><th>Comment</th><th>Order</th><th>Received</th></tr></thead><tbody>
            {rows.map((row) => { const order = row.order as Record<string, unknown> | null; return <tr key={String(row.id)}><td>{'★'.repeat(Number(row.rating))}{'☆'.repeat(5 - Number(row.rating))} <span className="muted">{String(row.rating)}/5</span></td><td>{String(row.comment ?? 'No written comment')}</td><td>{String(order?.reference ?? '—')}</td><td><DateTimeValue value={String(row.created_at ?? '')} /></td></tr> })}
          </tbody></table></div>
        </PageLoad>
      </Panel>
      {query.data?.note ? <Banner tone="info">{query.data.note}</Banner> : null}
    </>
  )
}

export function ReportsPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => operations.board(id) : null, [id])
  const data = query.data as any
  const rows = data?.orders ?? []
  const statuses = useMemo(
    () =>
      rows.reduce<Record<string, number>>((map, row) => {
        const status = String(row.status ?? 'unknown')
        map[status] = (map[status] ?? 0) + 1
        return map
      }, {}),
    [rows],
  )
  const collected = rows.filter((row) => ['delivered', 'completed'].includes(String(row.status)))
  const onExport = () => downloadCsv('pulse-recent-orders.csv', rows)
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Reports" description="Operational summary of the latest orders returned by the live board." actions={<button type="button" className="btn btn--secondary" disabled={!rows.length} onClick={onExport}>Export CSV</button>} />
      {query.data?.truncated ? <Banner tone="warning" title="Recent window">The board is limited to its latest {query.data.limit} orders; figures below are not all-time totals.</Banner> : null}
      <div className="metrics"><div className="metric"><span className="metric__label">Orders in window</span><strong className="metric__value">{rows.length}</strong><span className="metric__hint">Recent orders visible to this workspace</span></div><div className="metric"><span className="metric__label">Delivered / completed</span><strong className="metric__value">{collected.length}</strong><span className="metric__hint">Based on current order status</span></div><div className="metric"><span className="metric__label">Other statuses</span><strong className="metric__value">{Object.keys(statuses).length}</strong><span className="metric__hint">Distinct lifecycle states</span></div></div>
      <Panel title="Orders by status">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!rows.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Status</th><th>Orders</th><th>Share of window</th></tr></thead><tbody>
            {Object.entries(statuses).sort((a, b) => b[1] - a[1]).map(([status, count]) => <tr key={status}><td><StatusBadge status={status} /></td><td>{count}</td><td>{Math.round((count / rows.length) * 100)}%</td></tr>)}
          </tbody></table></div>
        </PageLoad>
      </Panel>
    </>
  )
}

export function TeamPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const query = useQuery(id ? () => workspace.members(id) : null, [id])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('dispatcher')
  const invite = useAction(() => {
    if (!id) throw new Error('Choose a workspace first.')
    return workspace.invite({ p_business_id: id, p_email: email.trim(), p_role: role })
  })
  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await invite.run()
    if (result) {
      setEmail('')
      query.reload()
    }
  }
  const members = query.data?.members ?? []
  // Already typed as Invitation[] by the client, so no cast is needed — and a
  // cast to Record<string, unknown>[] here would erase the fields below.
  const invitations = query.data?.pending_invitations ?? []
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Team & permissions" description="Workspace membership is enforced by database roles and row-level security." />
      <Panel title="Invite a teammate" description="The database validates the invitation role and creates the pending invitation.">
        {invite.error ? <Banner tone="critical" title="Invitation not sent">{invite.error.message}</Banner> : null}
        <form onSubmit={submit}><div className="grid grid--2"><div className="field"><label htmlFor="invite-email">Email</label><input id="invite-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div><div className="field"><label htmlFor="invite-role">Role</label><select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="dispatcher">Dispatcher</option><option value="ops">Operations</option><option value="driver">Driver</option></select></div></div><div className="row-actions"><button className="btn btn--primary" type="submit" disabled={invite.pending || !email.trim()}>{invite.pending ? 'Inviting…' : 'Invite teammate'}</button></div></form>
      </Panel>
      <Panel title="Members" description="Current membership rows and roles.">
        <PageLoad initial={query.initial} error={query.error} retry={query.reload} empty={!members.length}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Member since</th><th>Status</th></tr></thead><tbody>
            {members.map((member) => { const profile = member.profile as Record<string, unknown> | null; return <tr key={String(member.id)}><td>{String(profile?.full_name ?? profile?.phone_e164 ?? member.user_id ?? 'Member')}</td><td>{String(member.role ?? '—')}</td><td><DateTimeValue value={String(member.joined_at ?? '')} /></td><td>{member.is_active ? 'Active' : 'Inactive'}</td></tr> })}
          </tbody></table></div>
        </PageLoad>
      </Panel>
      {invitations.length ? <Panel title="Pending invitations"><div className="table-wrap"><table className="table"><thead><tr><th>Email</th><th>Role</th><th>Expires</th></tr></thead><tbody>{invitations.map((row) => <tr key={String(row.id)}><td>{String(row.email)}</td><td>{String(row.role)}</td><td><DateTimeValue value={String(row.expires_at ?? '')} /></td></tr>)}</tbody></table></div></Panel> : null}
    </>
  )
}

export function VerificationPage() {
  const { activeBusiness } = useSession()
  const fields = [
    ['Company name', activeBusiness?.name],
    ['Operating city', activeBusiness?.city],
    ['Country', activeBusiness?.country_code],
    ['Currency', activeBusiness?.currency],
  ]
  const missing = fields.filter(([, value]) => !value)
  return (
    <>
      <PageHeader eyebrow={activeBusiness?.name ?? 'Workspace'} title="Company profile readiness" description="Review the business details currently on file. This workspace has no connected verification provider." actions={<Link className="btn btn--primary" to="/app/settings">Edit company profile</Link>} />
      <Panel title="Profile checklist" description="These are stored profile fields, not a KYC or legal verification result.">
        <ul className="list">{fields.map(([label, value]) => <li className="list__row" key={label}><span className="list__main"><strong>{label}</strong><span className="muted">{value || 'Not provided'}</span></span><span className={`badge ${value ? 'badge--success' : 'badge--warning'}`}>{value ? 'On file' : 'Needed'}</span></li>)}</ul>
        <div className="row-actions"><Link className="btn btn--secondary" to="/app/settings">Update profile</Link>{missing.length ? <span className="muted">{missing.length} field(s) to complete</span> : <span className="muted">Core workspace profile fields are present</span>}</div>
      </Panel>
      <Banner tone="info">Pulse does not submit company documents or represent this checklist as a verification decision.</Banner>
    </>
  )
}

export function HelpPage() {
  const { activeBusiness, session } = useSession()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const query = useQuery(() => workspace.list(), [])
  async function copyDiagnostics() {
    setCopyError('')
    const text = JSON.stringify({
      workspace: activeBusiness?.id ?? null,
      user: session?.user_id ?? null,
      workspaceCount: query.data?.businesses.length ?? null,
      capturedAt: new Date().toISOString(),
    }, null, 2)
    if (!navigator.clipboard?.writeText) {
      setCopyError('Clipboard access is unavailable in this browser context.')
      return
    }
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }
  return (
    <>
      <PageHeader eyebrow="Pulse Partner" title="Help & support" description="Quick routes to the workspace controls and real service status." />
      <div className="grid grid--2">
        <Panel title="Workspace help" description="Open a working area to manage the related records."><ul className="list"><li className="list__row"><Link className="rowlink" to="/app/shipments">Shipment tracking</Link></li><li className="list__row"><Link className="rowlink" to="/app/team">Team invitations</Link></li><li className="list__row"><Link className="rowlink" to="/app/integrations">Integration status</Link></li><li className="list__row"><Link className="rowlink" to="/app/settings">Workspace settings</Link></li></ul></Panel>
        <Panel title="Share diagnostics" description="Copies only workspace/user identifiers and whether membership data loaded."><button type="button" className="btn btn--secondary" onClick={() => { void copyDiagnostics().catch(() => setCopyError('The browser could not copy diagnostics. Check clipboard permissions and try again.')) }}>{copied ? 'Diagnostics copied' : 'Copy diagnostics'}</button>{copyError ? <p className="muted" role="alert">{copyError}</p> : null}{query.error ? <p className="muted" role="status">Workspace details could not be loaded: {query.error.message}</p> : null}</Panel>
      </div>
      <Banner tone="info">For account access problems, sign out and sign in again. Service connection status is shown in the top bar; provider-specific availability is on Integrations.</Banner>
    </>
  )
}
