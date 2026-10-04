import { useEffect, useState, type FormEvent } from 'react'
import { useSession } from '../state/session'
import { workspace as wsApi } from '../lib/api'
import { useAction } from '../state/useQuery'
import { Banner, PageHeader, Panel } from '../components/ui'

/**
 * Workspace creation and account settings.
 *
 * This is the only page that can create a business, because `create_business()`
 * is the only thing that writes a `businesses` row — there is no insert path
 * from the client, which is what stops an orphan organisation appearing.
 */
export function SettingsPage() {
  const { businesses, activeBusiness, signOut, session, expired, refreshBusinesses } = useSession()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [currency, setCurrency] = useState('')
  const [kind, setKind] = useState('carrier')
  const [profile, setProfile] = useState({ name: '', phone: '', email: '', city: '' })
  const [profileSaved, setProfileSaved] = useState(false)

  useEffect(() => {
    setProfile({
      name: activeBusiness?.name ?? '',
      phone: activeBusiness?.phone_e164 ?? '',
      email: activeBusiness?.email ?? '',
      city: activeBusiness?.city ?? '',
    })
    setProfileSaved(false)
  }, [activeBusiness?.id, activeBusiness?.name, activeBusiness?.phone_e164, activeBusiness?.email, activeBusiness?.city])

  const create = useAction(() =>
    wsApi.create({
      p_name: name.trim(),
      p_city: city.trim() || undefined,
      p_country_code: country.trim().toUpperCase() || undefined,
      p_currency: currency.trim().toUpperCase() || undefined,
      p_kind: kind,
    }),
  )
  const updateProfile = useAction(() => {
    if (!activeBusiness) throw new Error('Choose a workspace first.')
    return wsApi.patchBusiness(activeBusiness.id, {
      name: profile.name.trim(),
      phone_e164: profile.phone.trim() || null,
      email: profile.email.trim() || null,
      city: profile.city.trim() || null,
    })
  })

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    const result = await updateProfile.run()
    if (result) {
      setProfileSaved(true)
      refreshBusinesses()
    }
  }

  if (!session) {
    return (
      <>
        <PageHeader title="Settings" />
        <Panel>
          <Banner tone="warning" title="Not signed in">
            Sign in to manage a workspace.
          </Banner>
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Company profile and workspace membership for this account."
      />

      {expired ? (
        <Banner tone="critical" title="Session expired">
          Your session is no longer valid. Sign in again to continue.
        </Banner>
      ) : null}

      <Panel title="Your workspaces" description="Derived from your database membership.">
        {businesses.length === 0 ? (
          <Banner tone="info">
            This account is not a member of any workspace yet. Create one below to start
            using Pulse.
          </Banner>
        ) : (
          <ul className="list">
            {businesses.map((b) => (
              <li key={b.id} className="list__row">
                <span className="list__main">
                  <strong>{b.name}</strong>
                  <span className="muted">
                    {b.city ?? 'No city'} · {b.kind ?? 'carrier'} ·{' '}
                    {b.my_role ?? 'member'}
                  </span>
                </span>
                {b.id === activeBusiness?.id ? (
                  <span className="badge badge--success">Active</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {activeBusiness ? (
        <Panel title="Company profile" description="Edit the profile fields stored for the selected workspace. Database permissions decide whether this role may save changes.">
          {updateProfile.error ? <Banner tone="critical" title="Profile not saved">{updateProfile.error.message}</Banner> : null}
          {profileSaved ? <Banner tone="success" title="Saved">The workspace profile was updated.</Banner> : null}
          <form onSubmit={saveProfile}>
            <div className="grid grid--2">
              <div className="field"><label htmlFor="profile-name">Company name</label><input id="profile-name" className="input" required minLength={2} value={profile.name} onChange={(e) => { setProfile((value) => ({ ...value, name: e.target.value })); setProfileSaved(false) }} /></div>
              <div className="field"><label htmlFor="profile-city">City</label><input id="profile-city" className="input" value={profile.city} onChange={(e) => { setProfile((value) => ({ ...value, city: e.target.value })); setProfileSaved(false) }} /></div>
              <div className="field"><label htmlFor="profile-phone">Phone</label><input id="profile-phone" className="input" type="tel" value={profile.phone} onChange={(e) => { setProfile((value) => ({ ...value, phone: e.target.value })); setProfileSaved(false) }} /></div>
              <div className="field"><label htmlFor="profile-email">Email</label><input id="profile-email" className="input" type="email" value={profile.email} onChange={(e) => { setProfile((value) => ({ ...value, email: e.target.value })); setProfileSaved(false) }} /></div>
            </div>
            <div className="row-actions"><button className="btn btn--primary" type="submit" disabled={updateProfile.pending || profile.name.trim().length < 2}>{updateProfile.pending ? 'Saving…' : 'Save company profile'}</button></div>
          </form>
        </Panel>
      ) : null}
<Panel
        title="Create a workspace"
        description="Creating one grants you owner. This writes a real row via create_business()."
      >
        {create.error ? (
          <Banner tone="critical" title="Not created">
            {create.error.message}
          </Banner>
        ) : null}

        <div className="grid grid--2">
          <div className="field">
            <label htmlFor="ws-name">Company name</label>
            <input
              id="ws-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ws-kind">Kind</label>
            <select
              id="ws-kind"
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="carrier">Carrier — performs deliveries</option>
              <option value="vendor">Vendor — originates jobs</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ws-city">City</label>
            <input
              id="ws-city"
              className="input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ws-country">Country code</label>
            <input
              id="ws-country"
              className="input"
              maxLength={2}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
            <span className="field__hint">Two letters, e.g. NG.</span>
          </div>
          <div className="field">
            <label htmlFor="ws-currency">Currency</label>
            <input
              id="ws-currency"
              className="input"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>
        </div>

        <div className="row-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={name.trim().length < 2 || create.pending}
            onClick={async () => {
              const ok = await create.run()
              if (ok) setName('')
            }}
          >
            {create.pending ? 'Creating…' : 'Create workspace'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </Panel>
    </>
  )
}
