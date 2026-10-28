import { Link, useParams, useSearchParams } from 'react-router-dom'
import { shipments, type ShipmentEvent } from '../lib/api'
import { useQuery } from '../state/useQuery'
import { Banner, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui'
import { DateTimeValue, ShipmentRef, StatusBadge, VerificationBadge } from '../components/domain'
import { RecordEventForm } from './RecordEventForm'

/**
 * Shipment detail and the Shipment Passport.
 *
 * The Passport is the product's accountability claim, so it is deliberately
 * literal: every event row shows who reported it, when it happened versus when
 * it was received, and whether the database treats it as verified. Manual
 * entries are labelled pending-review and are never presented as proof.
 */

const EVENT_LABEL: Record<string, string> = {
  CREATED: 'Shipment created',
  BOOKED: 'Booked',
  PICKUP_ASSIGNED: 'Pickup assigned',
  DRIVER_ACCEPTED: 'Driver accepted',
  DRIVER_ARRIVED: 'Driver arrived',
  ARRIVED_AT_PICKUP: 'Arrived at pickup',
  PICKUP_ATTEMPTED: 'Pickup attempted',
  PICKUP_ATTEMPT_FAILED: 'Pickup attempt failed',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  DELIVERY_ATTEMPTED: 'Delivery attempted',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Exception raised',
  CANCELLED: 'Cancelled',
  RECIPIENT_VERIFIED: 'Recipient verified',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  PROOF_OF_DELIVERY_UPLOADED: 'Proof of delivery uploaded',
  WRONG_ADDRESS: 'Wrong address',
  ROAD_DIVERSION: 'Road diversion',
  ORDER_STATUS_CHANGED: 'Status changed',
}

function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.replace(/_/g, ' ').toLowerCase()
}

function EventRow({ event }: { event: any }) {
  const meta = event.metadata as Record<string, unknown>
  const note = typeof meta.note === 'string' ? meta.note : null
  return (
    <li className="timeline__item">
      <div className="timeline__marker" aria-hidden="true" />
      <div className="timeline__body">
        <div className="timeline__head">
          <strong>{eventLabel(event.event_type)}</strong>
          <VerificationBadge status={event.verification_status} />
        </div>
        <dl className="timeline__meta">
          <div>
            <dt>Occurred</dt>
            <dd>
              <DateTimeValue value={event.occurred_at} />
            </dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>
              <DateTimeValue value={event.received_at} />
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {event.source_type.replace(/_/g, ' ')}
              {event.source_reference ? ` · ${event.source_reference}` : ''}
            </dd>
          </div>
          {event.location ? (
            <div>
              <dt>Location</dt>
              <dd>{event.location}</dd>
            </div>
          ) : null}
        </dl>
        {note ? <p className="timeline__note">{note}</p> : null}
      </div>
    </li>
  )
}

export function ShipmentDetailPage() {
  const { shipmentId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'passport' ? 'passport' : 'summary'

  const query = useQuery(() => shipments.detail(shipmentId), [shipmentId])

  if (query.initial) {
    return (
      <>
        <PageHeader title="Shipment" description="Loading…" />
        <Panel>
          <Skeleton rows={6} />
        </Panel>
      </>
    )
  }

  if (query.error) {
    return (
      <>
        <PageHeader title="Shipment" />
        <Panel>
          <ErrorState
            title="This shipment could not be loaded"
            message={query.error.message}
            onRetry={query.reload}
          />
        </Panel>
      </>
    )
  }

  const shipment = query.data as any
  if (!shipment) {
    return (
      <>
        <PageHeader title="Shipment" />
        <Panel>
          <EmptyState
            title="Not found"
            body="This shipment does not exist or is not visible to your role."
          />
        </Panel>
      </>
    )
  }

  const events = shipment.events ?? []
  const order = shipment.order as Record<string, unknown> | null

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/app/shipments">All shipments</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{shipment.pulse_shipment_id}</span>
      </nav>

      <PageHeader
        eyebrow={shipment.pulse_shipment_id}
        title="Shipment detail"
        description="Summary and the evidence-backed chain of custody."
        actions={
          <Link to="/app/shipments" className="btn btn--secondary">
            Back to shipments
          </Link>
        }
      />

      <div className="detail__head">
        <div className="detail__id">
          <ShipmentRef value={shipment.pulse_shipment_id} />
          <StatusBadge status={shipment.current_status} />
        </div>
        <dl className="detail__facts">
          <div>
            <dt>Created</dt>
            <dd>
              <DateTimeValue value={shipment.created_at} />
            </dd>
          </div>
          <div>
            <dt>Last event</dt>
            <dd>
              <DateTimeValue value={shipment.last_event_received_at} />
            </dd>
          </div>
          <div>
            <dt>Last verified location</dt>
            <dd>
              {shipment.last_verified_location ?? <span className="muted">none recorded</span>}
            </dd>
          </div>
          {order?.reference ? (
            <div>
              <dt>Order reference</dt>
              <dd className="mono">{String(order.reference)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="tabs" role="tablist" aria-label="Shipment sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'summary'}
          className={`tab ${tab === 'summary' ? 'is-active' : ''}`}
          onClick={() => setParams({})}
        >
          Summary
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'passport'}
          className={`tab ${tab === 'passport' ? 'is-active' : ''}`}
          onClick={() => setParams({ tab: 'passport' })}
        >
          Shipment Passport
        </button>
      </div>

{tab === 'summary' ? (
        <div className="grid grid--2">
          <Panel title="Order context" description="Only what your role may see.">
            {order ? (
              <dl className="deflist">
                <div>
                  <dt>Reference</dt>
                  <dd className="mono">{String(order.reference ?? '—')}</dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{String(order.service_type ?? '—')}</dd>
                </div>
                <div>
                  <dt>Pickup</dt>
                  <dd>{String(order.pickup_text ?? '—')}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>{String(order.destination_text ?? '—')}</dd>
                </div>
                <div>
                  <dt>Promised</dt>
                  <dd>
                    <DateTimeValue value={order.promised_at as string} />
                  </dd>
                </div>
              </dl>
            ) : (
              <EmptyState
                title="No linked order"
                body="This shipment has no order row visible to your role."
              />
            )}
          </Panel>

          <Panel title="Latest events" description="Most recent first.">
            {events.length === 0 ? (
              <EmptyState
                title="No events yet"
                body="The chain of custody begins when the first event is recorded."
              />
            ) : (
              <ul className="timeline">
                {events.slice(0, 5).map((e) => (
                  <EventRow key={e.event_id} event={e} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : (
        <>
          <Banner tone="info" title="How to read this record">
            Events marked <strong>Verified</strong> were written by the database itself.
            Partner-submitted events stay <strong>Pending review</strong> and do not change
            the order status on their own.
          </Banner>
          <RecordEventForm
            pulseShipmentId={shipment.pulse_shipment_id}
            onRecorded={query.reload}
          />
          <Panel
            title="Shipment Passport"
            description="Append-only. Events are never edited or deleted."
          >
            {events.length === 0 ? (
              <EmptyState
                title="This passport is empty"
                body="No events have been recorded against this shipment yet."
              />
            ) : (
              <ul className="timeline">
                {events.map((e) => (
                  <EventRow key={e.event_id} event={e} />
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </>
  )
}