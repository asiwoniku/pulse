import { Link, useNavigate } from 'react-router-dom'
import { operations, shipments } from '../lib/api'
import { useQuery } from '../state/useQuery'
import { useSession } from '../state/session'
import { Banner, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui'
import { DateTimeValue, Metric, RelativeTime, ShipmentRef, StatusBadge } from '../components/domain'
import { IconPlus } from '../components/icons'
import { ActiveShipmentMap } from '../components/ActiveShipmentMap'

/**
 * Overview.
 *
 * Every number here is counted from rows the backend actually returned for this
 * workspace under this user's token. Nothing is estimated, and a metric with no
 * underlying data reads "0" rather than being hidden — a blank tile would be
 * indistinguishable from a broken query.
 */
export function OverviewPage() {
  const { activeBusiness } = useSession()
  const navigate = useNavigate()
  const businessId = activeBusiness?.id ?? null

  const board = useQuery(
    businessId ? () => operations.board(businessId) : null,
    [businessId],
  )
  const list = useQuery(
    businessId ? () => shipments.list(businessId, 0, 25) : null,
    [businessId],
  )

  const rows = list.data?.shipments ?? []
  const counts = board.data?.counts ?? {}

  // Statuses the database treats as blocked or needing intervention.
  const exceptions = rows.filter((s) =>
    ['failed', 'pickup_attempt_failed', 'arrival_attempted'].includes(s.current_status),
  )
  const inTransit = rows.filter((s) =>
    ['picked_up', 'in_transit', 'driver_arrived', 'at_pickup'].includes(s.current_status),
  )
  const awaitingPickup = rows.filter((s) =>
    ['accepted', 'assigned', 'driver_accepted'].includes(s.current_status),
  )
  const delivered = rows.filter((s) => s.current_status === 'delivered')

  if (!businessId) {
    return (
      <>
        <PageHeader title="Overview" description="Your operations at a glance." />
        <Panel>
          <EmptyState
            title="No workspace selected"
            body="This account is not a member of a partner company yet. Create a workspace to start tracking real shipments."
            action={
              <Link to="/app/settings" className="btn btn--primary">
                Set up a workspace
              </Link>
            }
          />
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={activeBusiness?.name ?? 'Workspace'}
        title="Overview"
        description="Live counts for this workspace, read under your own access token."
        actions={
          <Link to="/app/shipments/new" className="btn btn--primary">
            <IconPlus size={16} />
            Create shipment
          </Link>
        }
      />

      {list.error ? (
        <Banner tone="critical" title="Could not load shipments">
          {list.error.message}
        </Banner>
      ) : null}

      <div className="metrics">
        <Metric
          label="Active shipments"
          value={board.loading ? '—' : rows.length}
          hint="Shipments in this workspace's most recent window."
          onClick={() => navigate('/app/shipments')}
        />
        <Metric
          label="Awaiting pickup"
          value={board.loading ? '—' : awaitingPickup.length}
          hint="Accepted or assigned, not yet collected."
          tone="info"
          onClick={() => navigate('/app/shipments?view=needs-pickup')}
        />
        <Metric
          label="In transit"
          value={board.loading ? '—' : inTransit.length}
          hint="Picked up and moving."
          tone="info"
          onClick={() => navigate('/app/shipments?view=in-transit')}
        />
        <Metric
          label="Delivered"
          value={board.loading ? '—' : delivered.length}
          hint="Completed in this window."
          tone="success"
          onClick={() => navigate('/app/shipments?view=delivered')}
        />
        <Metric
          label="Exceptions"
          value={board.loading ? '—' : exceptions.length}
          hint="Failed, pickup-failed, or arrival attempted."
          tone={exceptions.length > 0 ? 'critical' : 'neutral'}
          onClick={() => navigate('/app/exceptions')}
        />
      </div>

      {board.data?.truncated ? (
        <Banner tone="warning" title="Showing a recent window">
          Only the {board.data.limit} most recent shipments were returned, so these totals
          are not the whole workload. Open All shipments for the full list.
        </Banner>
      ) : null}
      <Panel title="Active shipment routes & network map" description="Live geospatial visualization of active shipments and delivery nodes.">
        <div className="panel__body" style={{ padding: 0 }}>
          <ActiveShipmentMap shipments={rows} height="360px" />
        </div>
      </Panel>

      <div className="grid grid--2">
        <Panel
          title="Urgent exceptions"
          description="Shipments the database currently reports as blocked."
          actions={
            <Link to="/app/exceptions" className="btn btn--ghost">
              Open queue
            </Link>
          }
        >
          {list.initial ? (
            <Skeleton rows={3} />
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={list.reload} />
          ) : exceptions.length === 0 ? (
            <EmptyState
              title="Nothing blocked"
              body="No shipment in this workspace is currently failed or awaiting a second delivery attempt."
            />
          ) : (
            <ul className="list">
              {exceptions.slice(0, 6).map((s) => (
                <li key={s.id} className="list__row">
                  <Link to={`/app/shipments/${s.id}`} className="list__main">
                    <ShipmentRef value={s.pulse_shipment_id} />
                    <StatusBadge status={s.current_status} />
                  </Link>
                  <RelativeTime value={s.last_event_received_at ?? s.created_at} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent activity"
          description="Latest shipments by creation time."
          actions={
            <Link to="/app/shipments" className="btn btn--ghost">
              View all
            </Link>
          }
        >
          {list.initial ? (
            <Skeleton rows={3} />
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={list.reload} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No shipments yet"
              body="When a real order exists in this workspace it will appear here. Nothing is shown until the database holds a row."
            />
          ) : (
            <ul className="list">
              {rows.slice(0, 6).map((s) => (
                <li key={s.id} className="list__row">
                  <Link to={`/app/shipments/${s.id}`} className="list__main">
                    <ShipmentRef value={s.pulse_shipment_id} />
                    <span className="muted">
                      {s.last_verified_location ?? 'No verified location yet'}
                    </span>
                  </Link>
                  <DateTimeValue value={s.created_at} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Service health" description="Reported by the Pulse service, not assumed.">
        {board.loading ? (
          <Skeleton rows={2} />
        ) : board.error ? (
          <ErrorState message={board.error.message} onRetry={board.reload} />
        ) : (
          <dl className="deflist">
            <div>
              <dt>Transition source</dt>
              <dd>{board.data?.transition_source ?? 'unknown'}</dd>
            </div>
            <div>
              <dt>Status counts</dt>
              <dd>
                {Object.keys(counts).length === 0
                  ? 'none returned'
                  : Object.entries(counts)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
              </dd>
            </div>
            <div>
              <dt>Drivers available</dt>
              <dd>{board.data?.drivers_available?.length ?? 0}</dd>
            </div>
          </dl>
        )}
      </Panel>
    </>
  )
}