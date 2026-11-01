import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AdminApiError,
  listPlatformAudit,
  listPlatformOrganisations,
  loadPlatformOverview,
  updatePlatformReview,
  type AccountStatus,
  type AdminOverview,
  type PlatformAuditEntry,
  type PlatformOrganisation,
  type VerificationStatus,
} from '../lib/api'

type Section = 'overview' | 'organisations' | 'audit'

const verificationLabels: Record<VerificationStatus, string> = {
  not_submitted: 'Not submitted',
  submitted: 'Submitted',
  in_review: 'In review',
  verified: 'Verified',
  rejected: 'Rejected',
  needs_more_information: 'Needs more information',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function ErrorNotice({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="admin-alert admin-alert--page" role="alert">
      <div>
        <strong>Platform data could not be loaded</strong>
        <p>{message}</p>
        {message.includes('403') || message.toLowerCase().includes('platform administrator')
          ? <p>Access is checked by platform-admin database functions; contact a platform owner if this is unexpected.</p>
          : null}
      </div>
      <button className="admin-button admin-button--quiet" type="button" onClick={retry}>Retry</button>
    </div>
  )
}

export function AdminPage() {
  const [section, setSection] = useState<Section>('overview')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [organisations, setOrganisations] = useState<PlatformOrganisation[]>([])
  const [audit, setAudit] = useState<PlatformAuditEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active')
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('not_submitted')
  const [method, setMethod] = useState('')
  const [source, setSource] = useState('')
  const [limitations, setLimitations] = useState('')
  const [reviewNote, setReviewNote] = useState('')

  const selected = organisations.find((organisation) => organisation.business_id === selectedId) ?? null
  const filteredOrganisations = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return organisations
    return organisations.filter((organisation) =>
      [organisation.name, organisation.city, organisation.country_code, organisation.kind, organisation.contact_email]
        .some((value) => value?.toLowerCase().includes(term)),
    )
  }, [organisations, query])

  async function loadData(includeAudit = section === 'audit') {
    setLoading(true)
    setError(null)
    try {
      const [nextOverview, nextOrganisations, nextAudit] = await Promise.all([
        loadPlatformOverview(),
        listPlatformOrganisations(),
        includeAudit ? listPlatformAudit() : Promise.resolve(audit),
      ])
      setOverview(nextOverview)
      setOrganisations(nextOrganisations)
      if (includeAudit) setAudit(nextAudit)
    } catch (cause) {
      setError(cause instanceof AdminApiError || cause instanceof Error
        ? cause.message
        : 'An unexpected platform API error occurred.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (section === 'audit') void listPlatformAudit().then(setAudit).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Platform audit could not be loaded.')
    })
  }, [section])

  useEffect(() => {
    if (!selected) return
    setAccountStatus(selected.account_status)
    setVerificationStatus(selected.verification_status)
    setMethod(selected.verification_method ?? '')
    setSource(selected.verification_source ?? '')
    setLimitations(selected.verification_limitations ?? '')
    setReviewNote(selected.review_note ?? '')
    setNotice(null)
  }, [selectedId, selected?.reviewed_at])

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await updatePlatformReview({
        business_id: selected.business_id,
        account_status: accountStatus,
        verification_status: verificationStatus,
        verification_method: method.trim(),
        verification_source: source.trim(),
        verification_limitations: limitations.trim(),
        review_note: reviewNote.trim(),
      })
      await loadData(section === 'audit')
      setNotice('The organisation review was saved and recorded in the platform audit trail.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const pending = organisations.filter((organisation) =>
    ['submitted', 'in_review', 'needs_more_information'].includes(organisation.verification_status),
  )

  return (
    <main className="platform-main">
      <div className="platform-heading">
        <div>
          <p className="admin-eyebrow">NETWORK GOVERNANCE / PLATFORM OPERATIONS</p>
          <h1>Platform administration</h1>
          <p className="admin-lead">
            Manage organisation standing and manual verification records. This workspace has no access to shipment, order, driver, customer, or dispatch data.
          </p>
        </div>
        <button className="admin-button admin-button--quiet" type="button" onClick={() => void loadData(section === 'audit')} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <nav className="platform-tabs" aria-label="Platform administration sections">
        {([
          ['overview', 'Overview'],
          ['organisations', 'Organisations'],
          ['audit', 'Admin audit trail'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={section === key ? 'platform-tab is-active' : 'platform-tab'}
            type="button"
            aria-current={section === key ? 'page' : undefined}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? <ErrorNotice message={error} retry={() => void loadData(section === 'audit')} /> : null}
      {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}
      {loading && !overview ? (
        <div className="admin-loading admin-loading--inline" role="status"><span className="admin-spinner" />Loading platform records…</div>
      ) : null}

      {section === 'overview' && overview ? (
        <>
          <section className="platform-metrics" aria-label="Platform account summary">
            <article className="platform-metric platform-metric--lead">
              <span>Organisations on Pulse</span>
              <strong>{overview.total_organisations}</strong>
              <small>Organisation profiles only · no operational workload data</small>
            </article>
            <article className="platform-metric">
              <span>Verification queue</span>
              <strong>{overview.pending_verification}</strong>
              <small>Submitted, in-review, or more information requested</small>
            </article>
            <article className="platform-metric">
              <span>Verified organisations</span>
              <strong>{overview.verified_organisations}</strong>
              <small>Method, source, limitations, and reviewer recorded</small>
            </article>
            <article className="platform-metric">
              <span>Suspended accounts</span>
              <strong>{overview.suspended_organisations}</strong>
              <small>Platform-level access control</small>
            </article>
          </section>

          <section className="platform-panel">
            <div className="platform-panel__heading">
              <div>
                <p className="admin-eyebrow">MANUAL REVIEW</p>
                <h2>Verification queue</h2>
                <p>Review evidence outside this console; record the source and limits of each decision.</p>
              </div>
              <button className="admin-button admin-button--primary" type="button" onClick={() => setSection('organisations')}>
                Open organisation register
              </button>
            </div>
            {loading ? <div className="admin-empty">Refreshing organisation records…</div> : pending.length === 0 ? (
              <div className="admin-empty">No organisations are currently awaiting a verification decision.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Organisation</th><th>Type</th><th>Location</th><th>Verification</th><th>Created</th><th /></tr></thead>
                  <tbody>{pending.slice(0, 8).map((organisation) => (
                    <tr key={organisation.business_id}>
                      <td><strong>{organisation.name}</strong><small>{organisation.contact_email ?? 'No contact email'}</small></td>
                      <td>{organisation.kind}</td>
                      <td>{[organisation.city, organisation.country_code].filter(Boolean).join(', ') || '—'}</td>
                      <td><span className="admin-status admin-status--warning">{verificationLabels[organisation.verification_status]}</span></td>
                      <td>{formatDate(organisation.created_at)}</td>
                      <td><button className="admin-button admin-button--quiet" type="button" onClick={() => { setSelectedId(organisation.business_id); setSection('organisations') }}>Review</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
          <p className="platform-boundary-note">
            Data boundary: platform RPCs return business profile and verification metadata only. Shipment and partner-operation tables are not queried by this application.
          </p>
        </>
      ) : null}

      {section === 'organisations' ? (
        <section className="platform-panel">
          <div className="platform-panel__heading">
            <div>
              <p className="admin-eyebrow">ACCOUNT GOVERNANCE</p>
              <h2>Organisation register</h2>
              <p>Profile, account standing, and verification state. No partner workload details are exposed.</p>
            </div>
            <label className="admin-search">
              <span className="sr-only">Filter organisations</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter organisations" />
            </label>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Organisation</th><th>Type</th><th>Location</th><th>Account</th><th>Verification</th><th>Reviewed</th><th /></tr></thead>
              <tbody>
                {filteredOrganisations.map((organisation) => (
                  <tr key={organisation.business_id} className={selectedId === organisation.business_id ? 'is-selected' : undefined}>
                    <td><strong>{organisation.name}</strong><small>{organisation.contact_email ?? 'No contact email'}</small></td>
                    <td>{organisation.kind}</td>
                    <td>{[organisation.city, organisation.country_code].filter(Boolean).join(', ') || '—'}</td>
                    <td><span className={`admin-status ${organisation.account_status === 'active' ? 'admin-status--success' : 'admin-status--critical'}`}>{organisation.account_status}</span></td>
                    <td>{verificationLabels[organisation.verification_status]}</td>
                    <td>{formatDate(organisation.reviewed_at)}</td>
                    <td><button className="admin-button admin-button--quiet" type="button" onClick={() => setSelectedId(organisation.business_id)}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && filteredOrganisations.length === 0
              ? <div className="admin-empty">{organisations.length ? 'No organisations match this filter.' : 'No organisation records have been returned.'}</div>
              : null}
          </div>
          {selected ? (
            <form className="review-form" onSubmit={submitReview}>
              <div className="review-form__heading">
                <div><p className="admin-eyebrow">PLATFORM REVIEW</p><h3>{selected.name}</h3></div>
                <span className="mono">{selected.business_id}</span>
              </div>
              <div className="review-form__grid">
                <label><span>Platform account</span><select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value as AccountStatus)}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
                <label><span>Verification status</span><select value={verificationStatus} onChange={(event) => setVerificationStatus(event.target.value as VerificationStatus)}>{Object.entries(verificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>Verification method</span><input maxLength={300} value={method} onChange={(event) => setMethod(event.target.value)} placeholder="e.g. Manual document review" /></label>
                <label><span>Evidence source</span><input maxLength={1000} value={source} onChange={(event) => setSource(event.target.value)} placeholder="Describe the source reviewed" /></label>
                <label className="review-form__wide"><span>Limitations / confidence notes</span><textarea maxLength={1000} rows={2} value={limitations} onChange={(event) => setLimitations(event.target.value)} placeholder="State what the evidence does not establish" /></label>
                <label className="review-form__wide"><span>Reviewer note</span><textarea maxLength={2000} rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Internal platform review record" /></label>
              </div>
              {verificationStatus === 'verified'
                ? <p className="review-form__hint">A verified decision requires method, source, and limitations; the database enforces all three.</p>
                : null}
              <div className="review-form__actions">
                <button className="admin-button admin-button--quiet" type="button" onClick={() => setSelectedId(null)}>Close</button>
                <button className="admin-button admin-button--primary" type="submit" disabled={busy || (verificationStatus === 'verified' && (!method.trim() || !source.trim() || !limitations.trim()))}>
                  {busy ? 'Saving review…' : 'Save review decision'}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {section === 'audit' ? (
        <section className="platform-panel">
          <div className="platform-panel__heading">
            <div><p className="admin-eyebrow">IMMUTABLE PLATFORM RECORD</p><h2>Administrator audit trail</h2><p>Latest 100 platform-level organisation review actions.</p></div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Time</th><th>Action</th><th>Organisation ID</th><th>Admin user ID</th><th>Decision details</th></tr></thead>
              <tbody>{audit.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.occurred_at)}</td>
                  <td>{entry.action.replace(/_/g, ' ')}</td>
                  <td className="mono">{entry.business_id ?? '—'}</td>
                  <td className="mono">{entry.actor_user_id ?? '—'}</td>
                  <td><code>{JSON.stringify(entry.details)}</code></td>
                </tr>
              ))}</tbody>
            </table>
            {!audit.length ? <div className="admin-empty">No platform administration actions have been recorded.</div> : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}
