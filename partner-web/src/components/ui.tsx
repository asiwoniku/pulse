import type { ReactNode } from 'react'

/**
 * Shared primitives.
 *
 * Small on purpose: each exists because the brief calls for it by name, and
 * because rebuilding "a status badge" on twenty pages is how a product stops
 * looking like one product. Everything here is presentational and dumb — data
 * fetching lives in useQuery, state in the page.
 */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {eyebrow ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="page-header__title">{title}</h1>
        {description ? <p className="page-header__desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  )
}

export function Panel({
  title,
  description,
  actions,
  children,
  padded = true,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  padded?: boolean
}) {
  return (
    <section className="panel">
      {title || actions ? (
        <div className="panel__head">
          <div>
            {title ? <h2 className="panel__title">{title}</h2> : null}
            {description ? <p className="panel__desc">{description}</p> : null}
          </div>
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? 'panel__body' : undefined}>{children}</div>
    </section>
  )
}

/**
 * The empty state is a first-class screen, not a shrug. It always offers the
 * real next action, and it never implies that data was withheld.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__mark" aria-hidden="true" />
      <h3 className="empty__title">{title}</h3>
      <p className="empty__body">{body}</p>
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'This page could not load',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="empty empty--error" role="alert">
      <div className="empty__mark empty__mark--error" aria-hidden="true" />
      <h3 className="empty__title">{title}</h3>
      <p className="empty__body">{message}</p>
      {onRetry ? (
        <div className="empty__action">
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton__row" />
      ))}
    </div>
  )
}

export function Banner({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'success' | 'warning' | 'critical'
  title?: string
  children: ReactNode
}) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'critical' ? 'alert' : 'status'}>
      {title ? <strong className="banner__title">{title}</strong> : null}
      <div className="banner__body">{children}</div>
    </div>
  )
}