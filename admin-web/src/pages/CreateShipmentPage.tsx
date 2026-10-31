import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, operations, type Order } from '../lib/api'
import { useAction } from '../state/useQuery'
import { useSession } from '../state/session'
import { Banner, PageHeader, Panel } from '../components/ui'
import { AddressInput } from '../components/AddressInput'

/**
 * Create shipment — a guided multi-step form rather than one long wall of inputs.
 *
 * Two rules govern the submit path. Success is only ever reported when the
 * database actually returned a created order, and entered values are kept in
 * component state so going back a step does not lose the user's work. Postgres
 * owns every rule about what is genuinely valid; this form only checks what a
 * browser can check on its own.
 */

interface Draft {
  customer_name: string
  customer_phone: string
  pickup_text: string
  destination_text: string
  description: string
  service_type: string
  price_amount: string
}

const EMPTY: Draft = {
  customer_name: '',
  customer_phone: '',
  pickup_text: '',
  destination_text: '',
  description: '',
  service_type: 'delivery',
  price_amount: '',
}

const STEPS = [
  'Shipment details',
  'Pickup & destination',
  'Sender & recipient',
  'Service & price',
  'Review',
] as const

export function CreateShipmentPage() {
  const { activeBusiness } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [created, setCreated] = useState<Order | null>(null)

  const submit = useAction(async () => {
    const result = await operations.createOrder({
      p_business_id: activeBusiness!.id,
      p_customer_name: draft.customer_name.trim(),
      p_customer_phone: draft.customer_phone.trim() || null,
      p_pickup_text: draft.pickup_text.trim(),
      p_destination_text: draft.destination_text.trim(),
      p_description: draft.description.trim() || null,
      p_service_type: draft.service_type,
      p_price_amount: draft.price_amount.trim() ? Number(draft.price_amount) : null,
    })
    const raw = result as unknown as Order
    const row = Array.isArray(result) ? (result[0] as unknown as Order) : raw
    if (!row || !row.id) {
      throw new ApiError(
        502,
        'The service did not return the created shipment.',
        'supabase',
        null,
      )
    }
    return row
  })

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  const stepValid = (() => {
    switch (step) {
      case 1:
        return draft.pickup_text.trim().length > 2 && draft.destination_text.trim().length > 2
      case 2:
        return draft.customer_name.trim().length > 1
      case 3:
        return draft.price_amount === '' || Number(draft.price_amount) >= 0
      default:
        return true
    }
  })()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (step < STEPS.length - 1) {
      if (stepValid) setStep((s) => s + 1)
      return
    }
    const row = await submit.run()
    if (row) setCreated(row)
  }
if (created) {
    return (
      <>
        <PageHeader title="Shipment created" description="The order exists in Postgres." />
        <Panel>
          <Banner tone="success" title="Created">
            The database accepted this order and returned its real reference.
          </Banner>
          <dl className="deflist">
            <div>
              <dt>Reference</dt>
              <dd className="mono">{created.reference}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{created.status}</dd>
            </div>
            <div>
              <dt>Order id</dt>
              <dd className="mono">{created.id}</dd>
            </div>
          </dl>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate('/app/shipments')}
            >
              View all shipments
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setCreated(null)
                setDraft(EMPTY)
                setStep(0)
              }}
            >
              Create another
            </button>
          </div>
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={activeBusiness?.name ?? 'Workspace'}
        title="Create shipment"
        description="Five short steps. Nothing is saved until the final confirmation."
        actions={
          <Link to="/app/shipments" className="btn btn--secondary">
            Cancel
          </Link>
        }
      />

      <ol className="steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`steps__item ${i === step ? 'is-current' : ''} ${
              i < step ? 'is-done' : ''
            }`}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="steps__num">{i < step ? '✓' : i + 1}</span>
            <span className="steps__label">{label}</span>
          </li>
        ))}
      </ol>

      <Panel>
        {submit.error ? (
          <Banner tone="critical" title="The shipment was not created">
            {submit.error.message}
          </Banner>
        ) : null}

        <form onSubmit={onSubmit} noValidate>
          {step === 0 ? (
            <p className="lead">
              This shipment will be created inside{' '}
              <strong>{activeBusiness?.name ?? 'your workspace'}</strong>. Continue to enter
              the route.
            </p>
          ) : null}

          {step === 1 ? (
            <div className="grid grid--2">
              <AddressInput
                id="pickup"
                label="Pickup address"
                value={draft.pickup_text}
                onChange={(v) => set('pickup_text', v)}
                placeholder="Start typing a street, landmark or area"
                required
              />
              <AddressInput
                id="destination"
                label="Destination address"
                value={draft.destination_text}
                onChange={(v) => set('destination_text', v)}
                placeholder="Start typing a street, landmark or area"
                required
              />
              <div className="field field--full">
                <label htmlFor="description">Description / contents</label>
                <textarea
                  id="description"
                  className="input"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid grid--2">
              <div className="field">
                <label htmlFor="customer">Customer name</label>
                <input
                  id="customer"
                  className="input"
                  value={draft.customer_name}
                  onChange={(e) => set('customer_name', e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="phone">Customer phone</label>
                <input
                  id="phone"
                  className="input"
                  value={draft.customer_phone}
                  onChange={(e) => set('customer_phone', e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid grid--2">
              <div className="field">
                <label htmlFor="service">Service</label>
                <select
                  id="service"
                  className="input"
                  value={draft.service_type}
                  onChange={(e) => set('service_type', e.target.value)}
                >
                  {/* These are the four values migration 0018 permits on
                      `orders.service_type`. The list used to offer standard /
                      express / same_day, none of which the check constraint
                      accepts, so every one of those shipments was rejected by
                      Postgres. `delivery` and `moving` are the same lifecycle —
                      the database has one state machine — so "what kind of job is
                      this" is carried by the type, not by a second workflow. */}
                  <option value="delivery">Delivery — a parcel or courier job</option>
                  <option value="moving">Moving — household or office relocation</option>
                  <option value="errand">Errand — document, key or small item</option>
                  <option value="freight">Freight — pallet, bulk or cargo</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="price">Price</label>
                <input
                  id="price"
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.price_amount}
                  onChange={(e) => set('price_amount', e.target.value)}
                />
                <span className="field__hint">
                  Left blank, the database stores no price rather than zero.
                </span>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <dl className="deflist deflist--review">
              <div>
                <dt>Customer</dt>
                <dd>{draft.customer_name || '—'}</dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>{draft.pickup_text || '—'}</dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>{draft.destination_text || '—'}</dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>{draft.service_type}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{draft.price_amount || 'Not set'}</dd>
              </div>
            </dl>
          ) : null}

          <div className="row-actions">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!stepValid || submit.pending}
            >
              {step === STEPS.length - 1
                ? submit.pending
                  ? 'Creating…'
                  : 'Create shipment'
                : 'Continue'}
            </button>
          </div>
        </form>
      </Panel>
    </>
  )
}