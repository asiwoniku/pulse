import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SessionProvider, useSession } from './state/session'
import { AdminPage } from './pages/AdminPage'
import { AdminSignInPage } from './pages/AdminSignInPage'
import { IconShield, IconBuilding, IconAlert, IconUser } from './components/icons'
import './styles/tokens.css'
import './styles/app.css'

function AdminAppLayout() {
  const { session, signOut } = useSession()

  // After a social sign-in, capture OAuth redirect
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const expiresIn = params.get('expires_in')

    if (accessToken) {
      const next = {
        access_token: accessToken,
        refresh_token: refreshToken ?? null,
        expires_in: expiresIn ? Number(expiresIn) : null,
        user_id: 'admin_oauth_usr',
        email: 'ops-admin@pulse.com',
      }
      localStorage.setItem('pulse_partner_session', JSON.stringify(next))
      window.history.replaceState({}, document.title, window.location.pathname)
      window.location.reload()
    }
  }, [])

  if (!session) {
    return <AdminSignInPage />
  }

  return (
    <div className="admin-app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Executive Master Ops Navigation Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #312e81 0%, #4338ca 100%)',
              border: '1px solid #6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
            }}
          >
            <IconShield size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                Pulse Master Operations
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 700,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                admin.pulse.com
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 9999,
                  fontWeight: 600,
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                  }}
                />
                Live Operations Active
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
              Platform SuperAdmin & Arbitrator Console
            </div>
          </div>
        </div>

        {/* Operational Telemetry Ticker */}
        <div
          style={{
            display: 'none',
            alignItems: 'center',
            gap: 20,
            padding: '6px 16px',
            borderRadius: 8,
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
          }}
          className="admin-telemetry-pill"
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Escrow Liquidity</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>$184,500 USD</span>
          </div>
          <div style={{ width: 1, height: 24, background: 'rgba(51, 65, 85, 0.8)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Arbitration Queue</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>4 Escalated</span>
          </div>
          <div style={{ width: 1, height: 24, background: 'rgba(51, 65, 85, 0.8)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Active Fleets</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>1,240 Units</span>
          </div>
        </div>

        {/* User Identity & Subdomain switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href="https://partner.pulse.com"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'transparent',
              color: '#cbd5e1',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <IconBuilding size={14} />
            <span>Switch to partner.pulse.com</span>
          </a>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(51, 65, 85, 0.6)',
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              OP
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>
                ops-admin@pulse.com
              </span>
              <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 600 }}>SuperAdmin</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => signOut()}
            className="btn btn--sm btn--ghost"
            style={{ fontSize: 12, padding: '6px 10px' }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Admin Console */}
      <main style={{ flex: 1, padding: '24px 32px', maxWidth: 1600, width: '100%', margin: '0 auto' }}>
        <Routes>
          <Route path="/*" element={<AdminPage />} />
        </Routes>
      </main>

      <footer
        style={{
          borderTop: '1px solid rgba(51, 65, 85, 0.5)',
          padding: '16px 24px',
          textAlign: 'center',
          fontSize: 12,
          color: '#64748b',
          background: 'rgba(15, 23, 42, 0.9)',
        }}
      >
        <div>
          Pulse Global Logistics Platform • Operations & Dispute Arbitration Subdomain (admin.pulse.com)
        </div>
        <div style={{ marginTop: 4 }}>
          Strictly for authorized Pulse Platform Administrators and Dispute Arbitrators.
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AdminAppLayout />
      </SessionProvider>
    </BrowserRouter>
  )
}