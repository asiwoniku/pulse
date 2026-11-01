import { SessionProvider, useSession } from './state/session'
import { AdminPage } from './pages/AdminPage'
import { AdminSignInPage } from './pages/AdminSignInPage'
import './styles/tokens.css'
import './styles/app.css'
import './styles/admin.css'

function AdminApplication() {
  const { session, loading, signOut } = useSession()

  if (loading) {
    return (
      <main className="admin-loading" role="status">
        <span className="admin-spinner" aria-hidden="true" />
        Verifying platform administrator access
      </main>
    )
  }

  if (!session) return <AdminSignInPage />

  return (
    <div className="platform-shell">
      <header className="platform-topbar">
        <a className="platform-brand" href="/" aria-label="Pulse platform administration home">
          <span className="platform-brand__mark">P</span>
          <span>
            <strong>Pulse</strong>
            <small>Platform control plane</small>
          </span>
        </a>
        <div className="platform-topbar__right">
          <span className="platform-boundary">ADMIN ONLY · NO PARTNER OPERATIONS</span>
          <span className="platform-user">{session.user.email ?? session.user.id}</span>
          <button className="admin-button admin-button--quiet" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <AdminPage />
      <footer className="platform-footer">
        Platform account controls only. Operational shipment records remain isolated in partner workspaces.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <AdminApplication />
    </SessionProvider>
  )
}
