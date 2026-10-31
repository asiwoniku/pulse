import { useState, type FormEvent } from 'react'
import { operations } from '../lib/api'
import { useAction, useQuery } from '../state/useQuery'
import { useSession } from '../state/session'
import { Banner, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui'
import { StatusBadge } from '../components/domain'

/**
 * Marketplace: vendors originate an offer to a carrier, the carrier answers, and an
 * accepted offer becomes an ordinary order (migrations 0017-0021).
 *
 * The API client could already list carriers and offers but had no way to *act* on
 * them, so the loop stopped at a directory. Every button here calls a guarded RPC;
 * the database owns the one-open-offer-per-carrier rule and the offer state machine.
 */
export function OffersPage() {
  const { activeBusiness } = useSession()
  const id = activeBusiness?.id ?? null
  const carriers = useQuery(() => operations.carriers(), [])
  const offers = useQuery(id ? () => operations.offers(id) : null, [id])

  const [carrier, setCarrier] = useState('')
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [description, setDescription] = useState('')

  const create = useAction(() => {
    if (!id) throw new Error('Choose a workspace first.')
    if (!carrier) throw new Error('Choose a carrier to send this offer to.')
    return operations.createOffer({
      p_vendor_business_id: id,
      p_carrier_business_id: carrier,
      p_pickup_text: pickup.trim(),
      p_destination_text: destination.trim(),
      p_description: description.trim() || undefined,
    })
  })
  const respond = useAction((offerId: string, accept: boolean) =>
    operations.respondToOffer({ p_offer_id: offerId, p_accept: accept }),
  )
  const withdraw = useAction((offerId: string) => operations.withdrawOffer(offerId))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await create.run()
    if (result) {
      setPickup('')
      setDestination('')
      setDescription('')
      setCarrier('')
      offers.reload()
    }
  }

  const carrierRows = carriers.data?.carriers ?? []
  const offerRows = offers.data?.offers ?? []
  const actionError = create.error ?? respond.error ?? withdraw.error

  return (
    <>
      <PageHeader
        eyebrow={activeBusiness?.name ?? 'Workspace'}
        title="Offers"
        description="Send work to a carrier, and answer offers sent to you. One open offer per carrier at a time."
      />

      <div className="grid grid--2">
        <Panel title="Send an offer" description="The carrier sees this and can accept or decline.">
          {create.error ? (
            <Banner tone="critical" title="Offer not sent">
              {create.error.message}
            </Banner>
          ) : null}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="offer-carrier">Carrier</label>
              <select
                id="offer-carrier"
                className="input"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                required
              >
                <option value="">Choose a carrier…</option>
                {carrierRows.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {[String(c.name ?? ''), c.city ? `— ${String(c.city)}` : '']
                      .filter(Boolean)
                      .join(' ') || String(c.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="offer-pickup">Pickup</label>
              <input id="offer-pickup" className="input" value={pickup} onChange={(e) => setPickup(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="offer-destination">Destination</label>
              <input id="offer-destination" className="input" value={destination} onChange={(e) => setDestination(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="offer-description">Description</label>
              <input id="offer-description" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="row-actions">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={create.pending || !carrier || pickup.trim().length < 3 || destination.trim().length < 3}
              >
                {create.pending ? 'Sending…' : 'Send offer'}
              </button>
            </div>
          </form>
          {carriers.error ? (
            <p className="muted" role="status">
              Carrier directory could not be loaded: {carriers.error.message}
            </p>
          ) : null}
        </Panel>

        <Panel title="Offers" description="Sent and received, decided by the database.">
          {actionError && !create.error ? (
            <Banner tone="critical" title="Offer not updated">
              {actionError.message}
            </Banner>
          ) : null}
          {offers.initial ? (
            <Skeleton rows={4} />
          ) : offers.error ? (
            <ErrorState message={offers.error.message} onRetry={offers.reload} />
          ) : offerRows.length === 0 ? (
            <EmptyState
              title="No offers yet"
              body="Nothing has been sent or received for this workspace."
            />
          ) : (
            <ul className="list list--stacked">
              {offerRows.map((o) => {
                const status = String(o.status ?? '')
                const pending = status === 'pending'
                return (
                  <li key={String(o.id)} className="case">
                    <div className="case__head">
                      <strong>{String(o.vendor_name ?? o.vendor_business_id ?? 'Vendor')}</strong>
                      <StatusBadge status={status} />
                    </div>
                    <p className="case__meta">
                      {String(o.pickup_text ?? '')} → {String(o.destination_text ?? '')}
                    </p>
                    {pending ? (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={respond.pending}
                          onClick={() =>
                            void respond.run(String(o.id), true).then((r) => {
                              if (r) offers.reload()
                            })
                          }
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          disabled={respond.pending}
                          onClick={() =>
                            void respond.run(String(o.id), false).then((r) => {
                              if (r) offers.reload()
                            })
                          }
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={withdraw.pending}
                          onClick={() =>
                            void withdraw.run(String(o.id)).then((r) => {
                              if (r) offers.reload()
                            })
                          }
                        >
                          Withdraw
                        </button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
          {offers.data?.note ? <Banner tone="info">{offers.data.note}</Banner> : null}
        </Panel>
      </div>
    </>
  )
}