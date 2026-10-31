import { useState, type FormEvent } from 'react'
import { operations } from '../lib/api'
import { useAction } from '../state/useQuery'
import { Banner, Panel } from '../components/ui'

/**
 * Add a vehicle to this workspace.
 *
 * `POST /api/vehicles` and `operations.createVehicle` both existed with no button
 * anywhere, so the Fleet page could list vehicles but never add one. The service
 * validates the fields and the workspace, and refuses anything it does not own.
 */
export function CreateVehicleForm({
  businessId,
  onCreated,
}: {
  businessId: string
  onCreated: () => void
}) {
  const [identifier, setIdentifier] = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [saved, setSaved] = useState(false)

  const create = useAction(() =>
    operations.createVehicle({
      business_id: businessId,
      identifier: identifier.trim(),
      vehicle_type: vehicleType.trim(),
      capacity_kg: capacity.trim() ? Number(capacity) : null,
    }),
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await create.run()
    if (result) {
      setIdentifier('')
      setVehicleType('')
      setCapacity('')
      setSaved(true)
      onCreated()
    }
  }

  return (
    <Panel
      title="Add a vehicle"
      description="Partner-managed. Pulse does not own or maintain the vehicle itself."
    >
      {create.error ? (
        <Banner tone="critical" title="Vehicle not saved">
          {create.error.message}
        </Banner>
      ) : null}
      {saved && !create.error ? (
        <Banner tone="success" title="Vehicle added">
          It now appears in the fleet list below.
        </Banner>
      ) : null}
      <form onSubmit={submit}>
        <div className="grid grid--2">
          <div className="field">
            <label htmlFor="vehicle-identifier">Registration / identifier</label>
            <input
              id="vehicle-identifier"
              className="input"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value)
                setSaved(false)
              }}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="vehicle-type">Type</label>
            <input
              id="vehicle-type"
              className="input"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              placeholder="e.g. van, motorcycle, truck"
            />
          </div>
          <div className="field">
            <label htmlFor="vehicle-capacity">Capacity (kg)</label>
            <input
              id="vehicle-capacity"
              className="input"
              type="number"
              min="0"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
        </div>
        <div className="row-actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={create.pending || identifier.trim().length < 2}
          >
            {create.pending ? 'Saving…' : 'Add vehicle'}
          </button>
        </div>
      </form>
    </Panel>
  )
}