import type { ReactNode } from 'react'
import type { ShipmentStatus } from '../lib/api'

/**
 * Domain components: shipment status, verification level, money, dates.
 *
 * Status is never communicated by colour alone — every badge carries a text
 * label, which is both an accessibility requirement and the thing that keeps a
 * dense table readable at a glance.
 */

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'critical'> = {
  accepted: 'info',
  assigned: 'info',
  driver_accepted: 'info',
  driver_arrived: 'info',
  at_pickup: 'info',
  picked_up: 'info',
  in_transit: 'info',
  pickup_attempt_failed: 'warning',
  arrival_attempted: 'warning',
  delivered: 'success',
  cancelled: 'neutral',
  failed: 'critical',
}

const STATUS_LABEL: Record<string, string> = {
  accepted: 'Accepted',
  assigned: 'Assigned',
  driver_accepted: 'Driver accepted',
  driver_arrived: 'Driver arrived',
  at_pickup: 'At pickup',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  pickup_attempt_failed: 'Pickup failed',
  arrival_attempted: 'Arrival attempted',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  const label = STATUS_LABEL[status] ?? status.replace(/_/g, ' ')
  return <span className={`badge badge--${tone}`}>{label}</span>
}

/**
 * Verification level is the difference between "the database recorded this" and
 * "a partner typed this in", so it is spelled out rather than hinted at.
 */
export function VerificationBadge({
  status,
}: {
  status: 'verified' | 'provider_reported' | 'pending_review' | 'unverified'
}) {
  const map = {
    verified: { tone: 'success', label: 'Verified' },
    provider_reported: { tone: 'info', label: 'Provider reported' },
    pending_review: { tone: 'warning', label: 'Pending review' },
    unverified: { tone: 'neutral', label: 'Unverified' },
  } as const
  const { tone, label } = map[status] ?? map.unverified
  return <span className={`badge badge--${tone} badge--sm`}>{label}</span>
}

export function SeverityBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const map = {
    low: { tone: 'neutral', label: 'Low' },
    medium: { tone: 'warning', label: 'Medium' },
    high: { tone: 'critical', label: 'High' },
  } as const
  const { tone, label } = map[level]
  return <span className={`badge badge--${tone}`}>{label}</span>
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})

export function DateValue({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return <span className="muted">—</span>
  return (
    <time dateTime={d.toISOString()} title={d.toISOString()}>
      {dateFmt.format(d)}
    </time>
  )
}

export function DateTimeValue({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return <span className="muted">—</span>
  return (
    <time dateTime={d.toISOString()} title={d.toISOString()}>
      {dateFmt.format(d)} {timeFmt.format(d)}
    </time>
  )
}

export function RelativeTime({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">never</span>
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return <span className="muted">never</span>
  const seconds = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 60) return <time dateTime={new Date(then).toISOString()}>{rtf.format(seconds, 'second')}</time>
  if (abs < 3600)
    return <time dateTime={new Date(then).toISOString()}>{rtf.format(Math.round(seconds / 60), 'minute')}</time>
  if (abs < 86400)
    return <time dateTime={new Date(then).toISOString()}>{rtf.format(Math.round(seconds / 3600), 'hour')}</time>
  return <DateTimeValue value={value} />
}

/**
 * Money is only rendered when the backend supplied an amount. There is no
 * fallback and no placeholder, because an invented balance is exactly what the
 * product rules forbid.
 */
export function Money({
  amount,
  currency,
}: {
  amount: number | string | null | undefined
  currency?: string | null
}) {
  if (amount === null || amount === undefined || amount === '') {
    return <span className="muted">—</span>
  }
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (Number.isNaN(n)) return <span className="muted">—</span>
  const text = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(n)
  return <span className="money">{text}</span>
}

export function ShipmentRef({ value }: { value: string }) {
  return <span className="mono ref">{value}</span>
}

/** A labelled metric tile. `hint` explains what the number actually means. */
export function Metric({
  label,
  value,
  hint,
  tone = 'neutral',
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'neutral' | 'info' | 'warning' | 'critical' | 'success'
  onClick?: () => void
}) {
  const inner = (
    <>
      <span className="metric__label">{label}</span>
      <span className={`metric__value metric__value--${tone}`}>{value}</span>
      {hint ? <span className="metric__hint">{hint}</span> : null}
    </>
  )
  return onClick ? (
    <button type="button" className="metric metric--action" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="metric">{inner}</div>
  )
}

export function statusLabel(status: ShipmentStatus | string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ')
}