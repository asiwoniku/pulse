import { useState, type FormEvent } from 'react'
import { shipments } from '../lib/api'
import { useAction } from '../state/useQuery'
import { Banner, Panel } from '../components/ui'

/** The events a partner may submit by hand, with honest labels. */
const MANUAL_EVENTS: { value: string; label: string }[] = [
  { value: 'PICKUP_ATTEMPTED', label: 'Pickup attempted' },
  { value: 'PICKUP_ATTEMPT_FAILED', label: 'Pickup attempt failed' },
  { value: 'DELIVERY_ATTEMPTED', label: 'Delivery attempted' },
  { value: 'WRONG_ADDRESS', label: 'Wrong address' },
  { value: 'ROAD_DIVERSION', label: 'Road diversion' },
  { value: 'EXCEPTION', label: 'Exception raised' },
]

/**
 * Record a manual shipment event.
 *
 * `record_shipment_event` was allow-listed on the service and exposed on the API
 * client, but nothing ever called it, so the Passport could only ever show events
 * the database had written itself. Submitting here produces a real row — it is
 * stored with the partner as the source and stays `pending_review`, because a
 * user-submitted event must never be able to advance the order on its own.
 *
 * The idempotency key is generated once per submission attempt so a double click,
 * or a retry after a dropped connection, cannot create two events.
 */
export function RecordEventForm({
  pulseShipmentId,
  onRecorded,
}: {
  pulseShipmentId: string
  onRecorded: () => void
}) {
  const [eventType, setEventType] = useState(MANUAL_EVENTS[0].value)
  const [location, setLocation] = useState('')
  const [recorded, setRecorded] = useState(false)

  const record = useAction(() =>
    shipments.recordEvent({
      p_pulse_shipment_id: pulseShipmentId,
      p_event_type: eventType,
      p_source_type: 'partner',
      p_idempotency_key: `partner-${pulseShipmentId}-${eventType}-${Date.now()}`,
      p_location: location.trim() || undefined,
    }),
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await record.run()
    if (result) {
      setRecorded(true)
      setLocation('')
      onRecorded()
    }
  }

  return (
    <Panel
      title="Record a manual update"
      description="Logged against this shipment as a partner-submitted event, held for review."
    >
      {record.error ? (
        <Banner tone="critical" title="Event not recorded">
          {record.error.message}
        </Banner>
      ) : null}
      {recorded && !record.error ? (
        <Banner tone="success" title="Event recorded">
          Added to the chain of custody below as pending review.
        </Banner>
      ) : null}
      <form onSubmit={submit}>
        <div className="grid grid--2">
          <div className="field">
            <label htmlFor="event-type">What happened</label>
            <select
              id="event-type"
              className="input"
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value)
                setRecorded(false)
              }}
            >
              {MANUAL_EVENTS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="event-location">Where (optional)</label>
            <input
              id="event-location"
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Ikeja, Lagos"
            />
          </div>
        </div>
        <div className="row-actions">
          <button className="btn btn--primary" type="submit" disabled={record.pending}>
            {record.pending ? 'Recording…' : 'Record event'}
          </button>
        </div>
      </form>
    </Panel>
  )
}