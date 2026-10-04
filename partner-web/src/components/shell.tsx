import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { NAV } from '../nav/navConfig'
import {
  IconAlert,
  IconBell,
  IconBox,
  IconCard,
  IconChart,
  IconChevronDown,
  IconFile,
  IconGlobe,
  IconGrid,
  IconHelp,
  IconLogout,
  IconMove,
  IconPlug,
  IconSearch,
  IconSettings,
  IconShield,
  IconStar,
  IconTruck,
  IconUser,
  IconUsers,
  IconWarehouse,
  IconX,
  type IconProps,
} from './icons'
import { useSession } from '../state/session'
import { isDemoMode, setDemoMode, DEMO_MESSAGE, workspaceRecords } from '../lib/api'
import { useQuery } from '../state/useQuery'

/**
 * The demo switch.
 *
 * It lives in the sidebar rather than a hidden route because turning it on is a
 * decision someone makes on purpose. It is off by default, it is remembered per
 * browser, and while it is on the rest of the shell keeps saying so — the point is
 * that a reviewer can look at the whole product without a single real record, and
 * can never afterwards be unsure which data they were looking at.
 */
export function DemoToggle() {
  const [on, setOn] = useState(isDemoMode)
  return (
    <div className="demo-toggle">
      <label className="demo-toggle__label">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setDemoMode(e.target.checked)
            setOn(e.target.checked)
            // A reload is the honest way to apply it: every page re-reads its data,
            // so nothing assembled before the switch can survive into demo mode.
            window.location.reload()
          }}
        />
        <span>Demo mode</span>
      </label>
      {on ? <p className="demo-toggle__note">{DEMO_MESSAGE}</p> : null}
    </div>
  )
}

const ICONS: Record<string, (p: IconProps) => JSX.Element> = {
  '/app/overview': IconGrid,
  '/app/shipments': IconBox,
  '/app/shipments/new': IconBox,
  '/app/exceptions': IconAlert,
  '/app/dispatch': IconTruck,
  '/app/drivers': IconUser,
  '/app/fleet': IconTruck,
  '/app/warehouse': IconWarehouse,
  '/app/moving': IconMove,
  '/app/international': IconGlobe,
  '/app/customers': IconUsers,
  '/app/reputation': IconStar,
  '/app/documents': IconFile,
  '/app/audit': IconFile,
  '/app/payments': IconCard,
  '/app/reports': IconChart,
  '/app/integrations': IconPlug,
  '/app/team': IconUsers,
  '/app/company/verification': IconShield,
  '/app/settings': IconSettings,
  '/app/help': IconHelp,
}

/**
 * The persistent shell: sidebar, top bar, page container.
 *
 * Two accessibility rules are load-bearing here. Active navigation is marked by
 * an accent marker plus weight and colour, never colour alone, and the mobile
 * drawer closes on Escape so keyboard users are never trapped in an overlay.
 */

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    dispatcher: 'Dispatcher',
    driver: 'Driver',
    warehouse: 'Warehouse',
    finance: 'Finance',
    support: 'Support',
    auditor: 'Auditor',
  }
  return map[role] ?? role
}

function OrgSwitcher() {
  const { businesses, activeBusiness, selectBusiness } = useSession()
  if (businesses.length === 0) {
    return (
      <div className="org org--empty">
        <span className="org__name">No workspace yet</span>
        <span className="org__meta">Create one to begin</span>
      </div>
    )
  }
  return (
    <div className="org">
      <label className="sr-only" htmlFor="org-switcher">
        Active workspace
      </label>
      <div className="org__control">
        <select
          id="org-switcher"
          className="org__select"
          value={activeBusiness?.id ?? ''}
          onChange={(e) => selectBusiness(e.target.value)}
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <IconChevronDown className="org__chevron" size={14} />
      </div>
      <span className="org__meta">
        {activeBusiness?.kind ? `${activeBusiness.kind} · ` : ''}
        {activeBusiness?.my_role ? roleLabel(activeBusiness.my_role) : 'Member'}
      </span>
    </div>
  )
}

export function Sidebar({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { session, signOut } = useSession()
  const location = useLocation()

  return (
    <div className={`sidebar__inner ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar__brand">
        <span className="brandmark" aria-hidden="true" />
        {!collapsed ? (
          <span className="brandmark__text">
            <strong>Pulse</strong>
            <span>Partner</span>
          </span>
        ) : null}
      </div>

      <OrgSwitcher />

      <nav className="nav" aria-label="Main">
        {NAV.map((group) => (
          <div className="nav__group" key={group.label}>
            {!collapsed ? <p className="nav__grouplabel">{group.label}</p> : null}
            <ul className="nav__list">
              {group.items.map((item) => {
                const Icon = ICONS[item.to] ?? IconGrid
                // Shipment detail routes live under /app/shipments, so the list
                // entry stays active while the user is inside one.
                const isActive =
                  location.pathname === item.to ||
                  (item.to === '/app/shipments' &&
                    location.pathname.startsWith('/app/shipments/') &&
                    !location.pathname.startsWith('/app/shipments/new'))
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      className={`nav__link ${isActive ? 'is-active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={18} />
                      {!collapsed ? <span>{item.label}</span> : null}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        {!collapsed ? <DemoToggle /> : null}
        <NavLink
          to="/app/help"
          onClick={onNavigate}
          className="nav__link nav__link--quiet"
          title={collapsed ? 'Help & support' : undefined}
        >
          <IconHelp size={18} />
          {!collapsed ? <span>Help & support</span> : null}
        </NavLink>
        <NavLink
          to="/app/settings"
          onClick={onNavigate}
          className="nav__link nav__link--quiet"
          title={collapsed ? 'Settings' : undefined}
        >
          <IconSettings size={18} />
          {!collapsed ? <span>Settings</span> : null}
        </NavLink>

        {!collapsed ? (
          <div className="account">
            <div className="account__avatar" aria-hidden="true">
              {(session?.email ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <span className="account__email" title={session?.email ?? undefined}>
              {session?.email ?? 'Signed in'}
            </span>
            <button
              type="button"
              className="account__signout"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <IconLogout size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function TopBar({
  onToggleSidebar,
  onOpenDrawer,
  onSearch,
  health,
}: { 
  onToggleSidebar: () => void
  onOpenDrawer: () => void
  onSearch: (term: string) => void
  health: { ok: boolean; label: string } | null
}) {
  const { activeBusiness } = useSession()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const businessId = activeBusiness?.id ?? null
  const notifications = useQuery(
    notificationsOpen && businessId
      ? () => workspaceRecords.notifications(businessId)
      : null,
    [businessId, notificationsOpen],
  )
  const entries = notifications.data?.notifications ?? []

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__icon topbar__menu"
        onClick={onOpenDrawer}
        aria-label="Open navigation"
      >
        <IconGrid size={20} />
      </button>
      <button
        type="button"
        className="topbar__icon topbar__collapse"
        onClick={onToggleSidebar}
        aria-label="Collapse or expand navigation"
        title="Collapse or expand navigation"
      >
        <IconGrid size={18} />
      </button>

      <form
        className="topbar__search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          onSearch(search.trim())
        }}
      >
        <IconSearch size={16} />
        <input
          type="search"
          className="topbar__input"
          placeholder="Search shipment references…"
          aria-label="Global search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="topbar__hint" type="submit">Search</button>
      </form>

      <div className="topbar__right">
        {health ? (
          <span
            className={`health ${health.ok ? 'health--ok' : 'health--down'}`}
            title="Live state reported by the Pulse service"
          >
            <span className="health__dot" aria-hidden="true" />
            {health.label}
          </span>
        ) : null}
        <div className="notification-control">
          <button
            type="button"
            className="topbar__icon"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            aria-controls="notification-panel"
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <IconBell size={18} />
          </button>
          {notificationsOpen ? (
            <section className="notification-panel" id="notification-panel" aria-label="Recent notifications">
              <div className="notification-panel__head">
                <strong>Notifications</strong>
                <button type="button" className="notification-panel__close" onClick={() => setNotificationsOpen(false)}>Close</button>
              </div>
              {notifications.error ? (
                <div className="notification-panel__state" role="alert">{notifications.error.message}<button type="button" onClick={notifications.reload}>Retry</button></div>
              ) : notifications.initial ? (
                <div className="notification-panel__state" role="status">Loading notifications…</div>
              ) : entries.length ? (
                <ul className="notification-list">
                  {entries.map((item) => (
                    <li key={String(item.id)}>
                      <button
                        type="button"
                        className="notification-item"
                        onClick={() => {
                          setNotificationsOpen(false)
                          navigate('/app/shipments')
                        }}
                      >
                        <strong>{String(item.title ?? 'Notification')}</strong>
                        <span>{String(item.body ?? '')}</span>
                        <small>{String(item.status ?? 'unknown')} · {String(item.channel ?? 'in-app')}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="notification-panel__state">No notifications in this workspace.</div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="drawer__scrim" onClick={onClose} />
      <div className="drawer__panel">
        <button
          type="button"
          className="drawer__close"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <IconX size={20} />
        </button>
        <Sidebar collapsed={false} onNavigate={onClose} />
      </div>
    </div>
  )
}