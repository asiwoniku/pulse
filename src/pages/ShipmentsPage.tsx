import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { shipments } from '../lib/api'
import { useQuery } from '../state/useQuery'
import { useSession } from '../state/session'
import { Banner, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui'
import { DateTimeValue, RelativeTime, ShipmentRef, StatusBadge } from '../components/domain'
import { IconPlus } from '../components/icons'

/**
 * All shipments.
 *
 * The view filter is applied to rows the backend returned for this workspace.
 * Filtering is explicitly client-side and the page says so, because presenting
 * a client-side window as a server-side query would misrepresent the data.
 */

type ViewKey = 'all' | 'needs-pickup' | 'in-transit' | 'delivered' | 'exceptions'

const VIEWS: { key: ViewKey; label: string; match: (status: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'needs-pickup',
    label: 'Needs pickup',
    match: (s) => ['accepted', 'assigned', 'driver_accepted'].includes(s),
  },
  {
    key: 'in-transit',
    label: 'In transit',
    match: (s) => ['picked_up', 'in_transit', 'driver_arrived', 'at_pickup'].includes(s),
  },
  { key: 'delivered', label: 'Delivered', match: (s) => s === 'delivered' },
  {
    key: 'exceptions',
    label: 'Exceptions',
    match: (s) => ['failed', 'pickup_attempt_failed', 'arrival_attempted'].includes(s),
  },
]

export function ShipmentsPage() {
  const { activeBusiness } = useSession()
  const [params, setParams] = useSearchParams()
  const businessId = activeBusiness?.id ?? null
  const view = (params.get('view') as ViewKey) || 'all'
  const remoteSearch = params.get('search') ?? ''
  const [term, setTerm] = useState(remoteSearch)
  const [offset, setOffset] = useState(0)

  useEffect(() => setTerm(remoteSearch), [remoteSearch])

  const query = useQuery(
    businessId ? () => shipments.list(businessId, offset, 25, remoteSearch) : null,
    [businessId, offset, remoteSearch],
  )

  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0]
  const rows = useMemo(() => {
    const all = query.data?.shipments ?? []
    const byStatus = all.filter((s) => active.match(s.current_status))
    const needle = term.trim().toLowerCase()
    if (!needle) return byStatus
    return byStatus.filter(
      (s) =>
        s.pulse_shipment_id.toLowerCase().includes(needle) ||
        (s.last_verified_location ?? '').toLowerCase().includes(needle),
    )
  }, [query.data, active, term])

  const filtered = term.trim().length > 0 || view !== 'all'
return (
    <>
      <PageHeader
        eyebrow={activeBusiness?.name ?? 'Workspace'}
        title="All shipments"
        description="Every shipment this workspace is authorised to see, straight from Postgres."
        actions={
          <Link to="/app/shipments/new" className="btn btn--primary">
            <IconPlus size={16} />
            Create shipment
          </Link>
        }
      />

      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Shipment views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v.key === view}
              className={`tab ${v.key === view ? 'is-active' : ''}`}
              onClick={() => {
                setOffset(0)
                const next: Record<string, string> = {}
                if (v.key !== 'all') next.view = v.key
                if (remoteSearch) next.search = remoteSearch
                setParams(next)
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="toolbar__right">
          <label className="sr-only" htmlFor="shipment-filter">
            Filter by reference or location
          </label>
          <input
            id="shipment-filter"
            type="search"
            className="input input--sm"
            placeholder="Filter this page…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      </div>

      <Panel>
        {query.error ? (
          <ErrorState message={query.error.message} onRetry={query.reload} />
        ) : query.initial ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'Nothing matches this view' : 'No shipments yet'}
            body={
              filtered
                ? 'No shipment in the returned window matches the current filter. Clear the filter to see everything this workspace returned.'
                : 'Nothing is displayed until a real shipment exists in this workspace. Pulse never fills an empty board with sample records.'
            }
            action={
              filtered ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setTerm('')
                    setParams({})
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link to="/app/shipments/new" className="btn btn--primary">
                  Create the first shipment
                </Link>
              )
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Shipments in this workspace</caption>
                <thead>
                  <tr>
                    <th scope="col">Shipment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last verified location</th>
                    <th scope="col">Last event</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/app/shipments/${s.id}`} className="rowlink">
                          <ShipmentRef value={s.pulse_shipment_id} />
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={s.current_status} />
                      </td>
                      <td>{s.last_verified_location ?? <span className="muted">—</span>}</td>
                      <td>
                        <RelativeTime value={s.last_event_received_at ?? s.created_at} />
                      </td>
                      <td>
                        <DateTimeValue value={s.created_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pager">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 25))}
              >
                Previous
              </button>
              <span className="pager__info">
                {rows.length} on this page · filtered in the browser
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={!query.data?.has_more}
                onClick={() => setOffset(offset + 25)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Panel>

      {query.data?.note ? <Banner tone="info">{query.data.note}</Banner> : null}
    </>
  )
}