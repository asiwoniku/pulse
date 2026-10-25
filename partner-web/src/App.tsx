import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { MobileDrawer, Sidebar, TopBar } from './components/shell'
import { SessionProvider, useSession } from './state/session'
import { system, isDemoMode, DEMO_MESSAGE } from './lib/api'
import { Banner } from './components/ui'
import { SignInPage } from './pages/SignInPage'
import { saveSession } from './lib/api'
import { OverviewPage } from './pages/OverviewPage'
import { ShipmentsPage } from './pages/ShipmentsPage'
import { ShipmentDetailPage } from './pages/ShipmentDetailPage'
import { CreateShipmentPage } from './pages/CreateShipmentPage'
import { DispatchPage, ExceptionsPage, FleetPage, IntegrationsPage, ListAreaPage } from './pages/Areas'
import { SettingsPage } from './pages/SettingsPage'
import { JoinPage } from './pages/JoinPage'
import { OffersPage } from './pages/OffersPage'
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
  const [demo] = useState(isDemoMode)
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

  // After a social sign-in, Supabase redirects back here with the session in the
  // URL fragment (implicit flow) or query string (code flow). Capture it, persist
  // it as the app's session, then strip the auth params from the URL so a refresh
  // doesn't re-trigger the flow.
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const expiresIn = params.get('expires_in')

    if (accessToken) {
      const next: { access_token: string; refresh_token: string | null; expires_in: number | null; user_id: string; email: string } = {
        access_token: accessToken,
        refresh_token: refreshToken ?? null,
        expires_in: expiresIn ? Number(expiresIn) : null,
        user_id: '',
        email: '',
      }
      saveSession(next)
      window.history.replaceState({}, document.title, window.location.pathname)
      window.location.reload()
      return
    }

    // Code flow: exchange the code via the backend.
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    if (code) {
      // The backend endpoint exchanges the code for a session.
      fetch('/api/auth/oauth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error('callback failed')
          const data = await r.json()
          saveSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? null,
            expires_in: data.expires_in ?? null,
            user_id: data.user_id ?? '',
            email: data.email ?? '',
          })
          window.history.replaceState({}, document.title, window.location.pathname)
          window.location.reload()
        })
        .catch(() => {
          // Ignore — the sign-in page will show its own error.
        })
    }
  }, [])

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
        {demo ? (
          <div className="demo-banner">
            <Banner tone="warning" title="Demo mode — fictional data">
              {DEMO_MESSAGE}
            </Banner>
          </div>
        ) : null}
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
            <Route path="/app/fleet" element={<FleetPage />} />
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
            <Route path="/app/offers" element={<OffersPage />} />
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
            <Route path="/app/join" element={<JoinPage />} />
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