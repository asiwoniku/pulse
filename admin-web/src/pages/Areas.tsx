import { useState } from 'react'
import { Link } from 'react-router-dom'
import { operations, shipments, system } from '../lib/api'
import { useAction, useQuery } from '../state/useQuery'
import { useSession } from '../state/session'
import { Banner, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui'
import { DateTimeValue, Money, ShipmentRef, StatusBadge } from '../components/domain'
import { CreateVehicleForm } from './CreateVehicleForm'

/**
 * Directory pages: drivers, customers, vehicles, carriers, offers.
 *
 * Each is a real route backed by a real endpoint and keeps the same three
 * states as every other page. Columns are narrowed to the useful ones so a wide
 * row never pushes the status off screen.
 */

function RecordTable({
  rows,
  columns,
}: {
  rows: Record<string, unknown>[]
  columns: string[]
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)}>
              {columns.map((c) => {
                const v = row[c]
                if (v === null || v === undefined || v === '') {
                  return (
                    <td key={c}>
                      <span className="muted">—</span>
                    </td>
                  )
                }
                if (typeof v === 'boolean') return <td key={c}>{v ? 'Yes' : 'No'}</td>
                if (c.endsWith('_at') || c.endsWith('_date')) {
                  return (
                    <td key={c}>
                      <DateTimeValue value={String(v)} />
                    </td>
                  )
                }
                return <td key={c}>{String(v)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PREFERRED: Record<string, string[]> = {
  drivers: ['full_name', 'status', 'phone_e164'],
  customers: ['name', 'phone_e164', 'email'],
  vehicles: ['identifier', 'vehicle_type', 'capacity_kg'],
  carriers: ['name', 'city', 'kind'],
  offers: ['status', 'pickup_text', 'destination_text'],
}

export function ListAreaPage({
  title,
  description,
  area,
  endpoint,
}: {
  title: string
  description: string
  area: string
  endpoint: 'drivers' | 'customers' | 'vehicles' | 'carriers' | 'offers'
}) {
  const { activeBusiness } = useSession()
  const businessId = activeBusiness?.id ?? null

  const query = useQuery(
    businessId
      ? async (): Promise<{ [key: string]: unknown; note?: string }> => {
          switch (endpoint) {
            case 'drivers':
              return operations.drivers(businessId)
            case 'customers':
              return operations.customers(businessId)
            case 'vehicles':
              return operations.vehicles(businessId)
            case 'carriers':
              return operations.carriers()
            case 'offers':
              return operations.offers(businessId)
          }
        }
      : null,
    [businessId, endpoint],
  )

  const rows = (query.data?.[endpoint] ?? []) as Record<string, unknown>[]

  return (
    <>
      <PageHeader
        eyebrow={activeBusiness?.name ?? 'Workspace'}
        title={title}
        description={description}
      />
      <Panel>
        {query.error ? (
          <ErrorState message={query.error.message} onRetry={query.reload} />
        ) : query.initial ? (
          <Skeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={`No ${area} yet`}
            body={`Postgres returned no ${area} for this workspace. Records appear here only once they genuinely exist.`}
          />
        ) : (
          <RecordTable
            rows={rows}
            columns={PREFERRED[endpoint] ?? Object.keys(rows[0] ?? {}).slice(0, 6)}
          />
        )}
      </Panel>
      {query.data?.note ? <Banner tone="info">{query.data.note}</Banner> : null}
    </>
  )
}
/** Readable labels for the lifecycle states. The raw value is the database's. */
const STATUS_LABEL: Record<string, string> = {
  requested: 'Requested',
  under_review: 'Under review',
  quoted: 'Quoted',
  awaiting_customer_approval: 'Awaiting approval',
  accepted: 'Accepted',
  assigned: 'Assigned',
  driver_accepted: 'Driver accepted',
  driver_arrived: 'Arrived at pickup',
  at_pickup: 'At pickup',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  arrival_attempted: 'Arrival attempted',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

function statusLabel(value: string): string {
  return STATUS_LABEL[value] ?? value.replace(/_/g, ' ')
}

/**
 * One order plus the actions the database says are legal right now.
 *
 * `allowed_next` and `drivers_available` both arrive from /api/board, derived from
 * the same edge table migration 0006 enforces. These buttons are therefore a
 * *preview* of what may be allowed — Postgres decides, and a refusal is rendered
 * verbatim rather than swallowed.
 */
function DispatchOrderRow({
  order,
  drivers,
  currency,
  onDone,
}: {
  order: Record<string, unknown>
  drivers: Record<string, unknown>[]
  currency: string | undefined
  onDone: () => void
}) {
  const orderId = String(order.id ?? '')
  const status = String(order.status ?? '')
  const allowed = Array.isArray(order.allowed_next)
    ? (order.allowed_next as unknown[]).map(String)
    : []
  const [driverId, setDriverId] = useState('')
  const move = useAction((next: string) => operations.patchOrder(orderId, { status: next }))
  const assign = useAction(() => operations.assignDriverTo(orderId, driverId))
  const busy = move.pending || assign.pending
  // 'assigned' is reached by handing the order to a driver, so the picker replaces
  // the plain button for that one edge.
  const needsDriver = allowed.includes('assigned')

  if (!allowed.length) {
    return (
      <tr>
        <td className="mono">{String(order.reference ?? order.id)}</td>
        <td><StatusBadge status={status} /></td>
        <td>{String(order.destination_text ?? '—')}</td>
        <td><DateTimeValue value={(order.promised_at as string) ?? null} /></td>
        <td><Money amount={(order.price_amount as number) ?? null} currency={currency} /></td>
        <td><span className="muted">No action available</span></td>
      </tr>
    )
  }

  return (
    <tr>
      <td className="mono">{String(order.reference ?? order.id)}</td>
      <td><StatusBadge status={status} /></td>
      <td>{String(order.destination_text ?? '—')}</td>
      <td><DateTimeValue value={(order.promised_at as string) ?? null} /></td>
      <td><Money amount={(order.price_amount as number) ?? null} currency={currency} /></td>
      <td className="row-actions">
        {(move.error || assign.error) ? (
          <p className="muted" role="alert">{(move.error ?? assign.error)!.message}</p>
        ) : null}
        {needsDriver ? (
          drivers.length ? (
            <span className="inline-form">
              <select
                className="input input--sm"
                aria-label={`Assign a driver to ${String(order.reference ?? order.id)}`}
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">Choose a driver…</option>
                {drivers.map((d) => (
                  <option key={String(d.id)} value={String(d.id)}>
                    {String(d.full_name ?? d.id)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busy || !driverId}
                onClick={() => void assign.run().then((r) => { if (r) onDone() })}
              >
                {assign.pending ? 'Assigning…' : 'Assign'}
              </button>
            </span>
          ) : (
            <span className="muted">No driver is available in this workspace</span>
          )
        ) : (
          allowed.map((next) => (
            <button
              key={next}
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={busy}
              onClick={() => void move.run(next).then((r) => { if (r) onDone() })}
            >
              {move.pending ? '…' : statusLabel(next)}
            </button>
          ))
        )}
      </td>
    </tr>
  )
}

/** Dispatch: a real board read, with the transition source shown. */
export function DispatchPage() {
  const { activeBusiness } = useSession()
  const businessId = activeBusiness?.id ?? null
  const board = useQuery(
    businessId ? () => operations.board(businessId) : null,
    [businessId],
  )
  const data = board.data

  return (
    <>
      <PageHeader
        eyebrow={activeBusiness?.name ?? 'Workspace'}
        title="Dispatch"
        description="The live operations board for this workspace."
        actions={
          <Link to="/app/shipments/new" className="btn btn--primary">
            New shipment
          </Link>
        }
      />
      <Panel>
        {board.error ? (
          <ErrorState message={board.error.message} onRetry={board.reload} />
        ) : board.initial ? (
          <Skeleton rows={5} />
        ) : !data || data.orders.length === 0 ? (
          <EmptyState
            title="Nothing to dispatch"
            body="No order is awaiting assignment in this workspace. Create a shipment to populate the board."
            action={
              <Link to="/app/shipments/new" className="btn btn--primary">
                Create shipment
              </Link>
            }
          />
        ) : (
          <>
            {data.truncated ? (
              <Banner tone="warning" title="Recent window only">
                The board returned the {data.limit} most recent orders. This is not the whole
                workload.
              </Banner>
            ) : null}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Status</th>
                    <th scope="col">Destination</th>
                    <th scope="col">Promised</th>
                    <th scope="col">Price</th>
                    <th scope="col">Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <DispatchOrderRow
                      key={String(o.id)}
                      order={o}
                      drivers={data.drivers_available}
                      currency={activeBusiness?.currency ?? undefined}
                      onDone={board.reload}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="footnote">
              Legal transitions come from <code>{data.transition_source}</code>; Postgres is
              the authority and this board only mirrors it.
            </p>
          </>
        )}
      </Panel>
    </>
  )
}

/** Fleet: the vehicle directory plus the form that actually adds to it. */
export function FleetPage() {
  const { activeBusiness } = useSession()
  const businessId = activeBusiness?.id ?? null
  const query = useQuery(
    businessId ? () => operations.vehicles(businessId) : null,
    [businessId],
  )
  const rows = (query.data?.vehicles ?? []) as Record<string, unknown>[]

  return (
    <>
      <PageHeader
        eyebrow={activeBusiness?.name ?? 'Workspace'}
        title="Fleet & vehicles"
        description="Partner-managed vehicles. Pulse does not own these."
      />
      {businessId ? (
        <CreateVehicleForm businessId={businessId} onCreated={query.reload} />
      ) : null}
      <Panel>
        {query.error ? (
          <ErrorState message={query.error.message} onRetry={query.reload} />
        ) : query.initial ? (
          <Skeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No vehicles yet"
            body="Postgres returned no vehicles for this workspace. Records appear here only once they genuinely exist."
          />
        ) : (
          <RecordTable rows={rows} columns={PREFERRED.vehicles} />
        )}
      </Panel>
      {query.data?.note ? <Banner tone="info">{query.data.note}</Banner> : null}
    </>
  )
}

/** Exceptions: derived from real statuses, never invented cases. */
export function ExceptionsPage() {
  const { activeBusiness } = useSession()
  const businessId = activeBusiness?.id ?? null
  const list = useQuery(
    businessId ? () => shipments.list(businessId, 0, 25) : null,
    [businessId],
  )

  const rows = (list.data?.shipments ?? []).filter((s) =>
    ['failed', 'pickup_attempt_failed', 'arrival_attempted'].includes(s.current_status),
  )

  return (
    <>
      <PageHeader
        eyebrow={activeBusiness?.name ?? 'Workspace'}
        title="Exceptions & disputes"
        description="Shipments the database reports as failed or needing a second attempt."
      />
      <Panel>
        {list.error ? (
          <ErrorState message={list.error.message} onRetry={list.reload} />
        ) : list.initial ? (
          <Skeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No open exceptions"
            body="Nothing in this workspace is currently failed, pickup-failed, or awaiting a second delivery attempt."
          />
        ) : (
          <ul className="list list--stacked">
            {rows.map((s) => (
              <li key={s.id} className="case">
                <div className="case__head">
                  <Link to={`/app/shipments/${s.id}`} className="rowlink">
                    <ShipmentRef value={s.pulse_shipment_id} />
                  </Link>
                  <StatusBadge status={s.current_status} />
                  <span className="badge badge--warning">Needs action</span>
                </div>
                <p className="case__meta">
                  Created <DateTimeValue value={s.created_at} /> · last event{' '}
                  <DateTimeValue value={s.last_event_received_at} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

/** Integrations: reports what is actually configured, never a fake "connected". */
export function IntegrationsPage() {
  const status = useQuery(() => system.status(), [])
  return (
    <>
      <PageHeader
        title="Integrations & API"
        description="Real connection state reported by the service. Nothing here is assumed connected."
      />
      <Panel>
        {status.error ? (
          <ErrorState message={status.error.message} onRetry={status.reload} />
        ) : status.initial ? (
          <Skeleton rows={5} />
        ) : (
          <ul className="list list--stacked">
            {status.data?.providers.map((p) => (
              <li key={p.key} className="integration">
                <div className="integration__head">
                  <strong>{p.title}</strong>
                  <span className={`badge badge--${p.configured ? 'success' : 'neutral'}`}>
                    {p.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <p className="integration__unlocks">{p.unlocks}</p>
                {p.configured ? null : (
                  <p className="integration__missing">
                    {p.missing_env.length > 0
                      ? `Missing: ${p.missing_env.join(', ')}`
                      : 'No credentials supplied.'}
                    {p.offline_note ? ` ${p.offline_note}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Database access" description="How this session reads data.">
        {status.data ? (
          <dl className="deflist">
            <div>
              <dt>Supabase configured</dt>
              <dd>{status.data.supabase_configured ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Service role in use</dt>
              <dd>
                {status.data.using_service_role
                  ? 'Yes — reads bypass row-level security'
                  : 'No — every read is scoped by your token'}
              </dd>
            </div>
          </dl>
        ) : (
          <Skeleton rows={2} />
        )}
      </Panel>
    </>
  )
}