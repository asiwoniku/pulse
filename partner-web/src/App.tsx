import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { MobileDrawer, Sidebar, TopBar } from './components/shell'
import { SessionProvider, useSession } from './state/session'
import { system } from './lib/api'
import { SignInPage } from './pages/SignInPage'
import { OverviewPage } from './pages/OverviewPage'
import { ShipmentsPage } from './pages/ShipmentsPage'
import { ShipmentDetailPage } from './pages/ShipmentDetailPage'
import { CreateShipmentPage } from './pages/CreateShipmentPage'
import { DispatchPage, ExceptionsPage, IntegrationsPage, ListAreaPage } from './pages/Areas'
import { SettingsPage } from './pages/SettingsPage'
import {
  AuditPage,
  DocumentsPage,
  HelpPage,
  InternationalPage,
  MovingPage,
  PaymentsPage,
  ReputationPage,
  ReportsPage,
  TeamPage,
  VerificationPage,
  WarehousePage,
} from './pages/WorkspacePages'
import './styles/tokens.css'
import './styles/app.css'

/**
 * Application root.
 *
 * Route names come from the brief's recommended map one-for-one, so a deep link,
 * a refresh and the browser back button all land on the same place.
 */

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [health, setHealth] = useState<{ ok: boolean; label: string } | null>(null)
  const { session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()

  // Live health only. A failure here is never shown as "connected".
  useEffect(() => {
    let cancelled = false
    const check = () => {
      system
        .health()
        .then((h) => {
          if (cancelled) return
          setHealth(
            h.ok
              ? { ok: true, label: h.supabase ? 'Connected' : 'Service up' }
              : { ok: false, label: 'Unavailable' },
          )
        })
        .catch(() => {
          if (!cancelled) setHealth({ ok: false, label: 'Unreachable' })
        })
    }
    check()
    const timer = window.setInterval(check, 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // Escape closes the drawer so keyboard users are never trapped.
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  if (!session) return <SignInPage />

  return (
    <div className={`app ${collapsed ? 'app--collapsed' : ''}`}>
      <aside className="sidebar">
        <Sidebar collapsed={collapsed} />
      </aside>
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />
      <div className="main">
        <TopBar
          onToggleSidebar={() => setCollapsed((c) => !c)}
          onOpenDrawer={() => setDrawer(true)}
          onSearch={(term) =>
            navigate(term ? `/app/shipments?search=${encodeURIComponent(term)}` : '/app/shipments')
          }
          health={health}
        />
        <main className="content" id="main-content" key={location.pathname}>
          <Routes>
            <Route path="/app/overview" element={<OverviewPage />} />
            <Route path="/app/shipments" element={<ShipmentsPage />} />
            <Route path="/app/shipments/new" element={<CreateShipmentPage />} />
            <Route path="/app/shipments/:shipmentId" element={<ShipmentDetailPage />} />
            <Route
              path="/app/shipments/:shipmentId/passport"
              element={<ShipmentDetailPage />}
            />
            <Route path="/app/exceptions" element={<ExceptionsPage />} />
            <Route path="/app/dispatch" element={<DispatchPage />} />
            <Route
              path="/app/drivers"
              element={
                <ListAreaPage
                  title="Drivers"
                  description="Driver directory for this workspace."
                  area="drivers"
                  endpoint="drivers"
                />
              }
            />
            <Route
              path="/app/fleet"
              element={
                <ListAreaPage
                  title="Fleet & vehicles"
                  description="Partner-managed vehicles. Pulse does not own these."
                  area="vehicles"
                  endpoint="vehicles"
                />
              }
            />
            <Route
              path="/app/customers"
              element={
                <ListAreaPage
                  title="Customers"
                  description="Customers visible to your role in this workspace."
                  area="customers"
                  endpoint="customers"
                />
              }
            />
            <Route
              path="/app/carriers"
              element={
                <ListAreaPage
                  title="Carrier directory"
                  description="Carriers you may send offers to."
                  area="carriers"
                  endpoint="carriers"
                />
              }
            />
            <Route path="/app/integrations" element={<IntegrationsPage />} />
            <Route path="/app/warehouse" element={<WarehousePage />} />
            <Route path="/app/moving" element={<MovingPage />} />
            <Route path="/app/international" element={<InternationalPage />} />
            <Route path="/app/documents" element={<DocumentsPage />} />
            <Route path="/app/audit" element={<AuditPage />} />
            <Route path="/app/payments" element={<PaymentsPage />} />
            <Route path="/app/reputation" element={<ReputationPage />} />
            <Route path="/app/reports" element={<ReportsPage />} />
            <Route path="/app/team" element={<TeamPage />} />
            <Route path="/app/company/verification" element={<VerificationPage />} />
            <Route path="/app/help" element={<HelpPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={<Navigate to="/app/overview" replace />}
            />
            <Route path="/" element={<Navigate to="/app/overview" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </SessionProvider>
  )
}