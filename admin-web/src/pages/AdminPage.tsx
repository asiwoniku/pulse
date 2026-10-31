import { useState } from 'react'
import { PageHeader, Panel, Banner, Badge } from '../components/ui'
import {
  IconShield,
  IconBuilding,
  IconAlert,
  IconCheck,
  IconCopy,
  IconPlus,
  IconTruck,
  IconFile,
  IconSearch,
  IconCard,
  IconArrowRight,
  IconRefresh,
  IconUser,
} from '../components/icons'
import { demo } from '../lib/demoData'

interface PartnerWorkspace {
  id: string
  name: string
  email: string
  phone: string
  category: 'Freight & Haulage' | 'Last-Mile Courier' | 'Cold-Chain Express' | 'Moving & Storage'
  regions: string[]
  fleetCount: number
  driverCount: number
  escrowBalance: number
  status: 'active' | 'pending_kyc' | 'suspended'
  commissionRate: number
  issuedAt: string
  tempPassword?: string
  contactName: string
}

interface DisputeEvidence {
  id: string
  title: string
  type: 'bol' | 'photo' | 'gps' | 'statement'
  timestamp: string
  uploader: string
  description: string
}

interface EscalatedDispute {
  id: string
  trackingCode: string
  partnerId: string
  partnerName: string
  claimantName: string
  claimantType: 'shipper' | 'receiver' | 'broker'
  claimantEmail: string
  amountContested: number
  currency: string
  severity: 'critical' | 'high' | 'medium'
  status: 'escalated_to_admin' | 'under_arbitration' | 'awaiting_evidence' | 'resolved_partner' | 'resolved_claimant' | 'resolved_split'
  category: 'cargo_damage' | 'temp_excursion' | 'driver_abandonment' | 'missing_items' | 'customs_delay'
  title: string
  description: string
  partnerDefense: string
  filedAt: string
  escalatedAt: string
  evidence: DisputeEvidence[]
  arbitrationNotes?: string
  resolvedAt?: string
  resolutionSummary?: string
}

const INITIAL_PARTNERS: PartnerWorkspace[] = [
  {
    id: 'biz_apex_haulage',
    name: 'Apex Haulage & Freight Co.',
    email: 'ops@apexhaulage.com',
    contactName: 'Marcus Vance',
    phone: '+44 20 7946 0912',
    category: 'Freight & Haulage',
    regions: ['London / Southeast UK', 'Midlands', 'Rotterdam Link'],
    fleetCount: 38,
    driverCount: 42,
    escrowBalance: 28450,
    status: 'active',
    commissionRate: 7.5,
    issuedAt: '2025-11-14',
  },
  {
    id: 'biz_polartrack',
    name: 'PolarTrack Cold Chain Logistics',
    email: 'dispatch@polartrack.eu',
    contactName: 'Elena Rostova',
    phone: '+44 161 496 0231',
    category: 'Cold-Chain Express',
    regions: ['Manchester', 'Leeds', 'Heathrow Cargo Hub'],
    fleetCount: 16,
    driverCount: 19,
    escrowBalance: 42100,
    status: 'active',
    commissionRate: 6.0,
    issuedAt: '2026-01-20',
  },
  {
    id: 'biz_swiftshift',
    name: 'SwiftShift Moving & Commercial Storage',
    email: 'admin@swiftshiftmovers.com',
    contactName: 'David Kalu',
    phone: '+44 121 496 0884',
    category: 'Moving & Storage',
    regions: ['Birmingham', 'Bristol', 'Oxford Corridor'],
    fleetCount: 12,
    driverCount: 15,
    escrowBalance: 8750,
    status: 'active',
    commissionRate: 9.0,
    issuedAt: '2026-02-05',
  },
  {
    id: 'biz_metro_dispatch',
    name: 'MetroSprint Last-Mile Solutions',
    email: 'support@metrosprint.co.uk',
    contactName: 'Sarah Jenkins',
    phone: '+44 20 8946 0199',
    category: 'Last-Mile Courier',
    regions: ['Greater London Zones 1-6'],
    fleetCount: 24,
    driverCount: 30,
    escrowBalance: 15200,
    status: 'pending_kyc',
    commissionRate: 8.0,
    issuedAt: '2026-03-28',
  },
  {
    id: 'biz_vanguard_logistics',
    name: 'Vanguard Industrial Transport',
    email: 'hq@vanguardhaul.com',
    contactName: 'Thomas Thorne',
    phone: '+44 191 496 0541',
    category: 'Freight & Haulage',
    regions: ['Newcastle', 'Edinburgh', 'Glasgow Port'],
    fleetCount: 22,
    driverCount: 26,
    escrowBalance: 19300,
    status: 'active',
    commissionRate: 7.0,
    issuedAt: '2025-09-12',
  },
]

const INITIAL_DISPUTES: EscalatedDispute[] = [
  {
    id: 'DSP-9821',
    trackingCode: 'PLS-90218',
    partnerId: 'biz_vanguard_logistics',
    partnerName: 'Vanguard Industrial Transport',
    claimantName: 'Hyperion Precision Systems Inc.',
    claimantType: 'shipper',
    claimantEmail: 'logistics@hyperionsys.com',
    amountContested: 6450,
    currency: 'USD',
    severity: 'critical',
    status: 'escalated_to_admin',
    category: 'cargo_damage',
    title: 'Severe Hydraulic Crate Damage - Dropped During Intermodal Transfer',
    description:
      'Receiver rejected 2 crates of semiconductor fabrication parts upon delivery at Silicon Park dock. Crates exhibit heavy impact puncture marks and sensor tilt tags were tripped. Shipper demands immediate 100% escrow chargeback of $6,450 for cargo remanufacturing.',
    partnerDefense:
      'Driver insists crates were delivered in exact condition received at loading bay. BOL was stamped "shipper load and count" with pre-existing exterior carton tears. Vanguard claims dock crane at receiving caused the impact drop.',
    filedAt: '2026-10-28 14:22',
    escalatedAt: '2026-10-30 09:15',
    evidence: [
      {
        id: 'ev_1',
        title: 'Dock Receiving Rejection Receipt & Photo Inspection',
        type: 'photo',
        timestamp: '2026-10-28 14:40',
        uploader: 'Dock Master, Hyperion Systems',
        description: 'High-res photos showing 40cm forklift tine puncture through reinforced crate wall and red shock-watch indicator activated.',
      },
      {
        id: 'ev_2',
        title: 'Carrier Bill of Lading (Pre-departure)',
        type: 'bol',
        timestamp: '2026-10-27 08:10',
        uploader: 'Vanguard Dispatch',
        description: 'Signed origin BOL noting "Packaging exterior shows minor corner crumple at pickup".',
      },
      {
        id: 'ev_3',
        title: 'Vehicle G-Force & Route Telemetry Log',
        type: 'gps',
        timestamp: '2026-10-28 11:32',
        uploader: 'Pulse Platform Telematics',
        description: 'Hard braking event (0.78G) recorded along M4 westbound at 11:32 AM prior to delivery.',
      },
    ],
  },
  {
    id: 'DSP-8142',
    trackingCode: 'PLS-77402',
    partnerId: 'biz_polartrack',
    partnerName: 'PolarTrack Cold Chain Logistics',
    claimantName: 'BioMedica Laboratories Ltd.',
    claimantType: 'receiver',
    claimantEmail: 'quality@biomedicalabs.org',
    amountContested: 18200,
    currency: 'EUR',
    severity: 'critical',
    status: 'under_arbitration',
    category: 'temp_excursion',
    title: 'Vaccine Batch Thermal Excursion (+11.8°C for 64 minutes)',
    description:
      'Shipment of biologic reagents required strict +2°C to +8°C refrigerated transit. Datalogger extraction upon receipt showed compartment ambient reached +11.8°C while vehicle was stationary at service plaza.',
    partnerDefense:
      'Carrier claims auxiliary refrigeration unit underwent emergency thermal reset due to alternator fuse trip. Datalogger inside insulated secondary container showed product stayed under 7.5°C despite ambient rise. Demands certified laboratory assay.',
    filedAt: '2026-10-29 10:05',
    escalatedAt: '2026-10-30 16:30',
    evidence: [
      {
        id: 'ev_4',
        title: 'NIST-Calibrated Temperature Logger CSV',
        type: 'statement',
        timestamp: '2026-10-29 10:15',
        uploader: 'BioMedica QA Manager',
        description: 'Thermal logs indicating 64-minute interval above +8.0°C threshold.',
      },
      {
        id: 'ev_5',
        title: 'Reefer Maintenance Service & Defrost Log',
        type: 'bol',
        timestamp: '2026-10-29 18:20',
        uploader: 'PolarTrack Fleet Engineering',
        description: 'Telemetry proof that insulated cryogenic foam box maintained thermal mass.',
      },
    ],
  },
  {
    id: 'DSP-6730',
    trackingCode: 'PLS-54190',
    partnerId: 'biz_swiftshift',
    partnerName: 'SwiftShift Moving & Storage',
    claimantName: 'FinTech Advisory Partners UK',
    claimantType: 'shipper',
    claimantEmail: 'facilities@fintechadvisory.co.uk',
    amountContested: 4100,
    currency: 'GBP',
    severity: 'high',
    status: 'escalated_to_admin',
    category: 'missing_items',
    title: 'Missing Uninterrupted Power Supply (UPS) Server Hardware',
    description:
      'Commercial office relocation between Mayfair and Canary Wharf. 2 enterprise 3000VA UPS backup units are missing from destination server room. Client provides loading dock CCTV video.',
    partnerDefense:
      'Moving crew leader claims UPS units were classified as hazardous lead-acid battery cargo and were staged separately in secure ground depot awaiting specialized hazmat permit transport, not stolen.',
    filedAt: '2026-10-27 18:45',
    escalatedAt: '2026-10-29 11:20',
    evidence: [
      {
        id: 'ev_6',
        title: 'Signed Relocation Inventory Sheet',
        type: 'bol',
        timestamp: '2026-10-27 09:00',
        uploader: 'SwiftShift Moving Lead',
        description: 'Manifest marked item #44 "Hazardous battery cell - separate manifest required".',
      },
    ],
  },
  {
    id: 'DSP-5119',
    trackingCode: 'PLS-33108',
    partnerId: 'biz_apex_haulage',
    partnerName: 'Apex Haulage & Freight Co.',
    claimantName: 'BuildCorp Infrastructure PLC',
    claimantType: 'receiver',
    claimantEmail: 'procure@buildcorp.com',
    amountContested: 2850,
    currency: 'GBP',
    severity: 'medium',
    status: 'awaiting_evidence',
    category: 'driver_abandonment',
    title: '48-Hour Unannounced Demurrage & Off-Route Cargo Holding',
    description:
      'Driver detoured 140 miles off designated motorway freight corridor to handle a second unmanifested cargo consignment, causing a 2-day shutdown of tower crane at job site.',
    partnerDefense:
      'Apex Haulage states the primary M1 highway was closed due to an overnight multi-vehicle collision, requiring designated police tactical detour. Driver tachograph provided.',
    filedAt: '2026-10-26 12:10',
    escalatedAt: '2026-10-28 17:00',
    evidence: [
      {
        id: 'ev_7',
        title: 'National Highways Official Road Closure Notice',
        type: 'statement',
        timestamp: '2026-10-26 23:15',
        uploader: 'Apex Haulage Compliance',
        description: 'Highways agency incident report confirming 11-hour road blockade.',
      },
    ],
  },
]

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<'partners' | 'disputes' | 'fleet' | 'broadcasts'>('disputes')
  const [partners, setPartners] = useState<PartnerWorkspace[]>(INITIAL_PARTNERS)
  const [disputes, setDisputes] = useState<EscalatedDispute[]>(INITIAL_DISPUTES)
  const [selectedDispute, setSelectedDispute] = useState<EscalatedDispute | null>(INITIAL_DISPUTES[0])

  // New Partner Modal
  const [showNewPartnerModal, setShowNewPartnerModal] = useState(false)
  const [partnerForm, setPartnerForm] = useState({
    name: '',
    email: '',
    contactName: '',
    phone: '',
    category: 'Freight & Haulage' as PartnerWorkspace['category'],
    regions: '',
    commissionRate: 8.0,
  })
  const [issuedCredentials, setIssuedCredentials] = useState<{
    workspaceId: string
    name: string
    email: string
    tempPassword: string
    loginUrl: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  // Arbitration Decision State
  const [arbitrationDecision, setArbitrationDecision] = useState<'partner' | 'claimant' | 'split' | 'extend' | null>(null)
  const [arbitrationNote, setArbitrationNote] = useState('')
  const [resolutionSuccessMessage, setResolutionSuccessMessage] = useState<string | null>(null)

  // Filters
  const [disputeFilter, setDisputeFilter] = useState<'all' | 'escalated' | 'under_review' | 'resolved'>('all')
  const [partnerFilter, setPartnerFilter] = useState<'all' | 'active' | 'pending' | 'suspended'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // System Broadcast Banner
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(
    'OPERATIONAL NOTICE: Cross-channel customs processing experiencing 4-hour delay at Port of Dover. Drivers advised to verify transit documentation prior to staging.',
  )
  const [newBroadcastInput, setNewBroadcastInput] = useState('')

  // Helper stats
  const totalEscrow = disputes.reduce((sum, d) => sum + d.amountContested, 0)
  const activeEscalationsCount = disputes.filter(
    (d) => d.status === 'escalated_to_admin' || d.status === 'under_arbitration' || d.status === 'awaiting_evidence',
  ).length

  // Filtered lists
  const filteredDisputes = disputes.filter((d) => {
    if (disputeFilter === 'escalated' && d.status !== 'escalated_to_admin') return false
    if (disputeFilter === 'under_review' && d.status !== 'under_arbitration' && d.status !== 'awaiting_evidence') return false
    if (disputeFilter === 'resolved' && !d.status.startsWith('resolved_')) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        d.id.toLowerCase().includes(q) ||
        d.trackingCode.toLowerCase().includes(q) ||
        d.partnerName.toLowerCase().includes(q) ||
        d.claimantName.toLowerCase().includes(q)
      )
    }
    return true
  })

  const filteredPartners = partners.filter((p) => {
    if (partnerFilter === 'active' && p.status !== 'active') return false
    if (partnerFilter === 'pending' && p.status !== 'pending_kyc') return false
    if (partnerFilter === 'suspended' && p.status !== 'suspended') return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.contactName.toLowerCase().includes(q)
    }
    return true
  })

  // Handle partner creation
  function handleCreatePartner(e: React.FormEvent) {
    e.preventDefault()
    if (!partnerForm.name || !partnerForm.email) return

    const generatedId = 'biz_' + partnerForm.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 16) + '_' + Math.random().toString(36).substring(2, 6)
    const generatedPassword = 'PLS-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000)

    const newPartner: PartnerWorkspace = {
      id: generatedId,
      name: partnerForm.name,
      email: partnerForm.email,
      contactName: partnerForm.contactName || 'Primary Administrator',
      phone: partnerForm.phone || '+44 20 7000 0000',
      category: partnerForm.category,
      regions: partnerForm.regions ? partnerForm.regions.split(',').map((r) => r.trim()) : ['National Delivery Corridor'],
      fleetCount: 0,
      driverCount: 0,
      escrowBalance: 0,
      status: 'active',
      commissionRate: partnerForm.commissionRate,
      issuedAt: new Date().toISOString().split('T')[0],
      tempPassword: generatedPassword,
    }

    setPartners((prev) => [newPartner, ...prev])
    setIssuedCredentials({
      workspaceId: generatedId,
      name: partnerForm.name,
      email: partnerForm.email,
      tempPassword: generatedPassword,
      loginUrl: window.location.origin + '/app/overview?workspace=' + generatedId,
    })
    setPartnerForm({
      name: '',
      email: '',
      contactName: '',
      phone: '',
      category: 'Freight & Haulage',
      regions: '',
      commissionRate: 8.0,
    })
  }

  // Handle partner status change
  function togglePartnerStatus(id: string) {
    setPartners((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const nextStatus = p.status === 'active' ? 'suspended' : 'active'
        return { ...p, status: nextStatus }
      }),
    )
  }

  // Handle dispute arbitration execution
  function executeArbitration() {
    if (!selectedDispute || !arbitrationDecision) return

    let nextStatus: EscalatedDispute['status']
    let summary: string

    switch (arbitrationDecision) {
      case 'partner':
        nextStatus = 'resolved_partner'
        summary = `Arbitration ruled in favor of Partner (${selectedDispute.partnerName}). Full escrow of $${selectedDispute.amountContested.toLocaleString()} released. Official ruling: ${arbitrationNote || 'Evidence confirmed carrier fulfilled agreed standard of transit.'}`
        break
      case 'claimant':
        nextStatus = 'resolved_claimant'
        summary = `Arbitration ruled in favor of Claimant (${selectedDispute.claimantName}). 100% refund of $${selectedDispute.amountContested.toLocaleString()} issued from escrow. Surcharge issued to carrier. Ruling: ${arbitrationNote || 'Evidence proved carrier breached terms of service.'}`
        break
      case 'split':
        nextStatus = 'resolved_split'
        summary = `Equitable 50/50 Mediated Compromise enforced. $${(selectedDispute.amountContested / 2).toLocaleString()} released to partner, $${(selectedDispute.amountContested / 2).toLocaleString()} refunded to claimant. Ruling: ${arbitrationNote || 'Shared liability determined due to contributing factors.'}`
        break
      case 'extend':
        nextStatus = 'awaiting_evidence'
        summary = `Super Admin extended arbitration deadline by 48 hours for mandatory cargo survey report. Directions: ${arbitrationNote || 'Both parties ordered to supply dock inspection logs.'}`
        break
    }

    const updatedDispute: EscalatedDispute = {
      ...selectedDispute,
      status: nextStatus,
      arbitrationNotes: arbitrationNote,
      resolvedAt: new Date().toISOString(),
      resolutionSummary: summary,
    }

    setDisputes((prev) => prev.map((d) => (d.id === selectedDispute.id ? updatedDispute : d)))
    setSelectedDispute(updatedDispute)
    setResolutionSuccessMessage(`Ruling executed successfully for ${selectedDispute.id}: ${summary}`)
    setArbitrationDecision(null)
    setArbitrationNote('')
  }

  return (
    <div className="admin-page">
      {/* Top Banner & Control Tower Badge */}
      <div className="admin-topline">
        <div className="admin-topline__left">
          <span className="admin-badge">
            <IconShield size={14} />
            <span>PULSE MASTER OPERATIONS & SUPER ADMIN</span>
          </span>
          <span className="admin-status-indicator">
            <span className="admin-status-indicator__dot" />
            <span>Core Network: Live & Authoritative</span>
          </span>
        </div>
        <div className="admin-topline__right">
          <span className="mono muted">ADMIN CONSOLE v2.4</span>
        </div>
      </div>

      <PageHeader
        eyebrow="Central Network Governance"
        title="Pulse Operations Command"
        description="Master control tower for onboarded partner logistics workspaces, executive dispute arbitration, network-wide fleet routing, and platform financial escrow governance."
        actions={
          <div className="admin-header-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setResolutionSuccessMessage(null)
                setPartners([...INITIAL_PARTNERS])
                setDisputes([...INITIAL_DISPUTES])
              }}
            >
              <IconRefresh size={14} />
              Reset Demo Records
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setShowNewPartnerModal(true)
                setIssuedCredentials(null)
              }}
            >
              <IconPlus size={16} />
              Issue Partner Login
            </button>
          </div>
        }
      />

      {/* Network Alert Banner */}
      {broadcastMessage ? (
        <div className="admin-broadcast-banner">
          <div className="admin-broadcast-banner__content">
            <IconAlert size={18} />
            <div>
              <strong>NETWORK ADVISORY:</strong> {broadcastMessage}
            </div>
          </div>
          <button
            type="button"
            className="link"
            style={{ color: 'inherit', fontSize: '12px' }}
            onClick={() => setBroadcastMessage(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {resolutionSuccessMessage ? (
        <Banner tone="success" title="Arbitration Resolution Executed">
          {resolutionSuccessMessage}
        </Banner>
      ) : null}

      {/* Primary KPI Grid */}
      <div className="admin-metrics">
        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span>Escalated Disputes</span>
            <span className="admin-metric-card__tag admin-metric-card__tag--critical">Needs Action</span>
          </div>
          <div className="admin-metric-card__value">{activeEscalationsCount}</div>
          <div className="admin-metric-card__sub">
            Contesting <strong>${totalEscrow.toLocaleString()}</strong> in escrow hold
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span>Registered Partners</span>
            <span className="admin-metric-card__tag admin-metric-card__tag--teal">Verified</span>
          </div>
          <div className="admin-metric-card__value">{partners.length}</div>
          <div className="admin-metric-card__sub">
            {partners.filter((p) => p.status === 'active').length} active, {partners.filter((p) => p.status === 'pending_kyc').length} pending KYC
          </div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span>Active Network Fleet</span>
            <span className="admin-metric-card__tag">Cross-Carrier</span>
          </div>
          <div className="admin-metric-card__value">112</div>
          <div className="admin-metric-card__sub">132 verified drivers across all partner workspaces</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-card__header">
            <span>Network Escrow Volume</span>
            <span className="admin-metric-card__tag admin-metric-card__tag--blue">Secured</span>
          </div>
          <div className="admin-metric-card__value">$114,800</div>
          <div className="admin-metric-card__sub">Avg. release duration: 2.4 days post-POD</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="admin-nav-tabs">
        <button
          type="button"
          className={`admin-nav-tab ${activeTab === 'disputes' ? 'admin-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('disputes')}
        >
          <IconAlert size={16} />
          <span>Escalated Disputes</span>
          {activeEscalationsCount > 0 ? (
            <span className="admin-nav-tab__count">{activeEscalationsCount}</span>
          ) : null}
        </button>

        <button
          type="button"
          className={`admin-nav-tab ${activeTab === 'partners' ? 'admin-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('partners')}
        >
          <IconBuilding size={16} />
          <span>Partner Workspaces & Logins</span>
          <span className="admin-nav-tab__count">{partners.length}</span>
        </button>

        <button
          type="button"
          className={`admin-nav-tab ${activeTab === 'fleet' ? 'admin-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('fleet')}
        >
          <IconTruck size={16} />
          <span>Network Live Dispatch</span>
        </button>

        <button
          type="button"
          className={`admin-nav-tab ${activeTab === 'broadcasts' ? 'admin-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('broadcasts')}
        >
          <IconShield size={16} />
          <span>Platform Advisories & Settings</span>
        </button>
      </div>

      {/* TAB 1: ESCALATED DISPUTES ARBITRATION */}
      {activeTab === 'disputes' ? (
        <div className="admin-split-layout">
          {/* Left: Disputes List */}
          <div className="admin-split-layout__list">
            <div className="admin-filter-bar">
              <div className="admin-search-box">
                <IconSearch size={14} />
                <input
                  type="text"
                  placeholder="Search disputes, tracking #, or partner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="admin-filter-pills">
                <button
                  type="button"
                  className={`admin-pill ${disputeFilter === 'all' ? 'admin-pill--active' : ''}`}
                  onClick={() => setDisputeFilter('all')}
                >
                  All ({disputes.length})
                </button>
                <button
                  type="button"
                  className={`admin-pill ${disputeFilter === 'escalated' ? 'admin-pill--active' : ''}`}
                  onClick={() => setDisputeFilter('escalated')}
                >
                  Escalated ({disputes.filter((d) => d.status === 'escalated_to_admin').length})
                </button>
                <button
                  type="button"
                  className={`admin-pill ${disputeFilter === 'under_review' ? 'admin-pill--active' : ''}`}
                  onClick={() => setDisputeFilter('under_review')}
                >
                  In Review ({disputes.filter((d) => d.status === 'under_arbitration' || d.status === 'awaiting_evidence').length})
                </button>
                <button
                  type="button"
                  className={`admin-pill ${disputeFilter === 'resolved' ? 'admin-pill--active' : ''}`}
                  onClick={() => setDisputeFilter('resolved')}
                >
                  Resolved ({disputes.filter((d) => d.status.startsWith('resolved_')).length})
                </button>
              </div>
            </div>

            <div className="admin-disputes-cards">
              {filteredDisputes.map((dispute) => {
                const isSelected = selectedDispute?.id === dispute.id
                return (
                  <div
                    key={dispute.id}
                    className={`admin-dispute-item ${isSelected ? 'admin-dispute-item--selected' : ''}`}
                    onClick={() => setSelectedDispute(dispute)}
                  >
                    <div className="admin-dispute-item__top">
                      <div className="admin-dispute-item__ids">
                        <span className="admin-dispute-item__id">{dispute.id}</span>
                        <span className="admin-dispute-item__tracking">{dispute.trackingCode}</span>
                      </div>
                      <span className={`admin-severity-badge admin-severity-badge--${dispute.severity}`}>
                        {dispute.severity.toUpperCase()}
                      </span>
                    </div>

                    <h4 className="admin-dispute-item__title">{dispute.title}</h4>

                    <div className="admin-dispute-item__parties">
                      <div>
                        <span className="muted">Carrier:</span> <strong>{dispute.partnerName}</strong>
                      </div>
                      <div>
                        <span className="muted">Claimant:</span> <strong>{dispute.claimantName}</strong>
                      </div>
                    </div>

                    <div className="admin-dispute-item__footer">
                      <div className="admin-dispute-item__amount">
                        <span className="muted">Escrow at stake:</span>{' '}
                        <strong>
                          ${dispute.amountContested.toLocaleString()} {dispute.currency}
                        </strong>
                      </div>
                      <span className={`admin-status-badge admin-status-badge--${dispute.status}`}>
                        {dispute.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                )
              })}

              {filteredDisputes.length === 0 ? (
                <div className="admin-empty-state">No escalated disputes matching current filter.</div>
              ) : null}
            </div>
          </div>

          {/* Right: Master Arbitration Dossier */}
          <div className="admin-split-layout__detail">
            {selectedDispute ? (
              <Panel>
                <div className="admin-dossier-header">
                  <div>
                    <div className="admin-dossier-header__meta">
                      <span className="mono">{selectedDispute.id}</span>
                      <span className="dot" />
                      <span>Tracking: {selectedDispute.trackingCode}</span>
                      <span className="dot" />
                      <span>Escalated: {selectedDispute.escalatedAt}</span>
                    </div>
                    <h2 className="admin-dossier-header__title">{selectedDispute.title}</h2>
                  </div>
                  <div className="admin-dossier-header__escrow">
                    <span className="admin-dossier-header__escrow-label">CONTESTED ESCROW</span>
                    <span className="admin-dossier-header__escrow-val">
                      ${selectedDispute.amountContested.toLocaleString()}
                    </span>
                    <span className="muted" style={{ fontSize: '11px' }}>Held in Pulse Vault</span>
                  </div>
                </div>

                {/* Status Callout if Resolved */}
                {selectedDispute.status.startsWith('resolved_') ? (
                  <div className="admin-ruling-notice">
                    <div className="admin-ruling-notice__title">
                      <IconCheck size={16} />
                      <strong>OFFICIAL ARBITRATION RULING ENTERED</strong>
                    </div>
                    <p>{selectedDispute.resolutionSummary}</p>
                    {selectedDispute.resolvedAt ? (
                      <span className="footnote">Ruling confirmed on {new Date(selectedDispute.resolvedAt).toLocaleString()} by Executive Operations</span>
                    ) : null}
                  </div>
                ) : null}

                {/* The Two Arguments */}
                <div className="admin-arguments-grid">
                  <div className="admin-argument-card admin-argument-card--claimant">
                    <div className="admin-argument-card__head">
                      <span>CLAIMANT DEMAND ({selectedDispute.claimantType.toUpperCase()})</span>
                      <strong>{selectedDispute.claimantName}</strong>
                    </div>
                    <p className="admin-argument-card__body">{selectedDispute.description}</p>
                    <div className="admin-argument-card__foot">
                      <span className="muted">Demand:</span> <strong>Full Escrow Chargeback (${selectedDispute.amountContested.toLocaleString()})</strong>
                    </div>
                  </div>

                  <div className="admin-argument-card admin-argument-card--partner">
                    <div className="admin-argument-card__head">
                      <span>PARTNER CARRIER DEFENSE</span>
                      <strong>{selectedDispute.partnerName}</strong>
                    </div>
                    <p className="admin-argument-card__body">{selectedDispute.partnerDefense}</p>
                    <div className="admin-argument-card__foot">
                      <span className="muted">Position:</span> <strong>Release Contract Funds to Carrier</strong>
                    </div>
                  </div>
                </div>

                {/* Evidence Locker */}
                <div className="admin-evidence-section">
                  <h3 className="admin-section-subtitle">
                    <IconFile size={16} />
                    Verified Evidence Locker ({selectedDispute.evidence.length} documents on file)
                  </h3>

                  <div className="admin-evidence-list">
                    {selectedDispute.evidence.map((ev) => (
                      <div key={ev.id} className="admin-evidence-item">
                        <div className="admin-evidence-item__icon">
                          {ev.type === 'bol' ? <IconFile size={16} /> : ev.type === 'gps' ? <IconTruck size={16} /> : <IconCheck size={16} />}
                        </div>
                        <div className="admin-evidence-item__info">
                          <div className="admin-evidence-item__title">{ev.title}</div>
                          <p className="admin-evidence-item__desc">{ev.description}</p>
                          <div className="admin-evidence-item__meta">
                            <span>Uploaded by: <strong>{ev.uploader}</strong></span>
                            <span className="dot" />
                            <span>{ev.timestamp}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn--secondary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => alert(`Reviewing certified hash for document ${ev.id}: Valid SHA-256 seal verified on Pulse ledger.`)}
                        >
                          Verify Hash
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Executive Arbitration Action Console */}
                {!selectedDispute.status.startsWith('resolved_') ? (
                  <div className="admin-arbitration-console">
                    <h3 className="admin-section-subtitle">
                      <IconShield size={16} />
                      Executive Arbitration Decision Console
                    </h3>
                    <p className="lead" style={{ fontSize: '13px', marginBottom: '14px' }}>
                      As Master Super Admin, your decision is binding. Executing a ruling immediately adjusts the smart contract escrow ledger, releases or refunds payments, and records the judgment in the network audit log.
                    </p>

                    <div className="admin-ruling-options">
                      <label
                        className={`admin-ruling-option ${arbitrationDecision === 'partner' ? 'admin-ruling-option--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="decision"
                          checked={arbitrationDecision === 'partner'}
                          onChange={() => setArbitrationDecision('partner')}
                        />
                        <div>
                          <strong>Rule for Partner Carrier (Release 100% Escrow)</strong>
                          <p>Transfers ${selectedDispute.amountContested.toLocaleString()} to {selectedDispute.partnerName} and clears incident from carrier record.</p>
                        </div>
                      </label>

                      <label
                        className={`admin-ruling-option ${arbitrationDecision === 'claimant' ? 'admin-ruling-option--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="decision"
                          checked={arbitrationDecision === 'claimant'}
                          onChange={() => setArbitrationDecision('claimant')}
                        />
                        <div>
                          <strong>Rule for Claimant (100% Refund to Shipper)</strong>
                          <p>Refunds ${selectedDispute.amountContested.toLocaleString()} to {selectedDispute.claimantName} and charges carrier safety deductible.</p>
                        </div>
                      </label>

                      <label
                        className={`admin-ruling-option ${arbitrationDecision === 'split' ? 'admin-ruling-option--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="decision"
                          checked={arbitrationDecision === 'split'}
                          onChange={() => setArbitrationDecision('split')}
                        />
                        <div>
                          <strong>Enforce 50/50 Mediated Compromise</strong>
                          <p>Splits liability evenly: ${(selectedDispute.amountContested / 2).toLocaleString()} released to partner, ${(selectedDispute.amountContested / 2).toLocaleString()} refunded to customer.</p>
                        </div>
                      </label>

                      <label
                        className={`admin-ruling-option ${arbitrationDecision === 'extend' ? 'admin-ruling-option--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="decision"
                          checked={arbitrationDecision === 'extend'}
                          onChange={() => setArbitrationDecision('extend')}
                        />
                        <div>
                          <strong>Order Independent Inspection (48h Extension)</strong>
                          <p>Places dispute under formal survey hold and sends notice to carrier and customer for certified inspector attendance.</p>
                        </div>
                      </label>
                    </div>

                    <div className="field" style={{ marginTop: '16px' }}>
                      <label htmlFor="arb-notes">Official Ruling Notes & Justification (Permanent Record)</label>
                      <textarea
                        id="arb-notes"
                        className="input"
                        rows={3}
                        style={{ height: 'auto', padding: '10px 14px' }}
                        placeholder="Detail the technical or operational basis for this arbitration ruling..."
                        value={arbitrationNote}
                        onChange={(e) => setArbitrationNote(e.target.value)}
                      />
                    </div>

                    <div className="admin-arbitration-actions">
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={!arbitrationDecision}
                        onClick={executeArbitration}
                      >
                        <IconCheck size={16} />
                        Execute Binding Arbitration Ruling
                      </button>
                    </div>
                  </div>
                ) : null}
              </Panel>
            ) : (
              <Panel>
                <div className="admin-empty-state">Select a dispute from the list to review the arbitration dossier.</div>
              </Panel>
            )}
          </div>
        </div>
      ) : null}

      {/* TAB 2: PARTNER WORKSPACES & LOGINS */}
      {activeTab === 'partners' ? (
        <div className="admin-partners-view">
          <div className="admin-partners-toolbar">
            <div className="admin-search-box">
              <IconSearch size={14} />
              <input
                type="text"
                placeholder="Search partner companies, email, or regions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="admin-filter-pills">
              <button
                type="button"
                className={`admin-pill ${partnerFilter === 'all' ? 'admin-pill--active' : ''}`}
                onClick={() => setPartnerFilter('all')}
              >
                All ({partners.length})
              </button>
              <button
                type="button"
                className={`admin-pill ${partnerFilter === 'active' ? 'admin-pill--active' : ''}`}
                onClick={() => setPartnerFilter('active')}
              >
                Active ({partners.filter((p) => p.status === 'active').length})
              </button>
              <button
                type="button"
                className={`admin-pill ${partnerFilter === 'pending' ? 'admin-pill--active' : ''}`}
                onClick={() => setPartnerFilter('pending')}
              >
                Pending Verification ({partners.filter((p) => p.status === 'pending_kyc').length})
              </button>
              <button
                type="button"
                className={`admin-pill ${partnerFilter === 'suspended' ? 'admin-pill--active' : ''}`}
                onClick={() => setPartnerFilter('suspended')}
              >
                Suspended ({partners.filter((p) => p.status === 'suspended').length})
              </button>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setShowNewPartnerModal(true)
                setIssuedCredentials(null)
              }}
            >
              <IconPlus size={16} />
              Issue Partner Login
            </button>
          </div>

          <Panel>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Logistics Partner</th>
                    <th>Category</th>
                    <th>Service Corridor</th>
                    <th>Fleet / Drivers</th>
                    <th>Escrow Held</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map((partner) => (
                    <tr key={partner.id}>
                      <td>
                        <div className="partner-cell">
                          <strong>{partner.name}</strong>
                          <span className="muted" style={{ fontSize: '12px' }}>
                            {partner.email} • {partner.contactName}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="admin-category-badge">{partner.category}</span>
                      </td>
                      <td>
                        <div className="corridor-cell">
                          {partner.regions.slice(0, 2).join(', ')}
                          {partner.regions.length > 2 ? ` +${partner.regions.length - 2} more` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="mono">
                          {partner.fleetCount} trucks / {partner.driverCount} drivers
                        </span>
                      </td>
                      <td>
                        <span className="mono font-semibold">${partner.escrowBalance.toLocaleString()}</span>
                      </td>
                      <td>
                        <span className="mono">{partner.commissionRate}%</span>
                      </td>
                      <td>
                        <span className={`admin-partner-status admin-partner-status--${partner.status}`}>
                          {partner.status === 'active' ? 'Active Partner' : partner.status === 'pending_kyc' ? 'Pending KYC' : 'Suspended'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn--secondary"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => {
                              const pass = 'PLS-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000)
                              setIssuedCredentials({
                                workspaceId: partner.id,
                                name: partner.name,
                                email: partner.email,
                                tempPassword: pass,
                                loginUrl: window.location.origin + '/app/overview?workspace=' + partner.id,
                              })
                              setShowNewPartnerModal(true)
                            }}
                          >
                            Re-issue Login
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => togglePartnerStatus(partner.id)}
                          >
                            {partner.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* TAB 3: NETWORK LIVE DISPATCH OVERVIEW */}
      {activeTab === 'fleet' ? (
        <div className="admin-fleet-view">
          <Panel>
            <div className="admin-fleet-header">
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Cross-Network Active Shipment Monitor</h3>
                <p className="muted" style={{ fontSize: '13px' }}>
                  Super Admin real-time view across all carriers. Intervene directly to reroute loads or re-assign stranded shipments.
                </p>
              </div>
              <span className="badge badge--success">All Telematics Relays Live</span>
            </div>

            <div className="admin-fleet-grid">
              <div className="admin-fleet-card">
                <div className="admin-fleet-card__head">
                  <span className="mono font-bold">PLS-90218</span>
                  <span className="admin-severity-badge admin-severity-badge--critical">HELD IN DISPUTE</span>
                </div>
                <div className="admin-fleet-card__route">London Gateway → Manchester Tech Park</div>
                <div className="admin-fleet-card__details">
                  <div><span>Carrier:</span> Vanguard Industrial Transport</div>
                  <div><span>Cargo:</span> Semiconductor Pallets (Fragile)</div>
                  <div><span>Escrow:</span> $6,450 Held</div>
                </div>
                <div className="admin-fleet-card__foot">
                  <span className="muted">Status:</span> <strong>Receiving Dock Refusal</strong>
                </div>
              </div>

              <div className="admin-fleet-card">
                <div className="admin-fleet-card__head">
                  <span className="mono font-bold">PLS-88192</span>
                  <span className="admin-severity-badge" style={{ background: '#e6f5ec', color: '#1c7a4a' }}>ON SCHEDULE</span>
                </div>
                <div className="admin-fleet-card__route">Heathrow Air Cargo → Oxford Science Vale</div>
                <div className="admin-fleet-card__details">
                  <div><span>Carrier:</span> PolarTrack Cold Chain Logistics</div>
                  <div><span>Cargo:</span> Bio-reagents (Controlled +4°C)</div>
                  <div><span>Current Temp:</span> +4.2°C (Optimal)</div>
                </div>
                <div className="admin-fleet-card__foot">
                  <span className="muted">ETA:</span> <strong>42 minutes (M40 Corridor)</strong>
                </div>
              </div>

              <div className="admin-fleet-card">
                <div className="admin-fleet-card__head">
                  <span className="mono font-bold">PLS-65512</span>
                  <span className="admin-severity-badge" style={{ background: '#fdf3e0', color: '#8a5a08' }}>WEATHER SLOWDOWN</span>
                </div>
                <div className="admin-fleet-card__route">Birmingham Central Hub → Newcastle Depot</div>
                <div className="admin-fleet-card__details">
                  <div><span>Carrier:</span> Apex Haulage & Freight Co.</div>
                  <div><span>Cargo:</span> Automotive Stamping Dies (Heavy)</div>
                  <div><span>Tachograph:</span> 4h 15m driven (Rest stop mandated)</div>
                </div>
                <div className="admin-fleet-card__foot">
                  <span className="muted">Delay:</span> <strong>+1h 10m heavy rain speed restriction</strong>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* TAB 4: PLATFORM ADVISORIES & RULES */}
      {activeTab === 'broadcasts' ? (
        <div className="admin-broadcasts-view">
          <Panel>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
              Publish Network Operations Broadcast
            </h3>
            <p className="lead" style={{ fontSize: '13px', marginBottom: '16px' }}>
              Broadcast messages are immediately pinned across all partner workspaces, driver mobile apps, and dispatcher dashboards.
            </p>

            <div className="field">
              <label htmlFor="bc-input">Broadcast Alert Message</label>
              <textarea
                id="bc-input"
                className="input"
                rows={2}
                style={{ height: 'auto', padding: '10px 14px' }}
                placeholder="e.g. Severe weather disruption warning along M6 motorway; all high-sided vehicles advise alternative routing..."
                value={newBroadcastInput}
                onChange={(e) => setNewBroadcastInput(e.target.value)}
              />
            </div>

            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!newBroadcastInput.trim()}
                onClick={() => {
                  setBroadcastMessage(newBroadcastInput.trim())
                  setNewBroadcastInput('')
                }}
              >
                Broadcast to All Partner Workspaces
              </button>
              {broadcastMessage ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setBroadcastMessage(null)}
                >
                  Clear Active Broadcast
                </button>
              ) : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {/* MODAL: ISSUE NEW PARTNER WORKSPACE & CREDENTIALS */}
      {showNewPartnerModal ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <div>
                <span className="admin-badge">
                  <IconBuilding size={14} />
                  <span>WORKSPACE ONBOARDING</span>
                </span>
                <h3 className="admin-modal__title">
                  {issuedCredentials ? 'Partner Workspace Credentials Issued' : 'Issue New Partner Workspace & Login'}
                </h3>
              </div>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => {
                  setShowNewPartnerModal(false)
                  setIssuedCredentials(null)
                }}
              >
                ×
              </button>
            </div>

            {issuedCredentials ? (
              <div className="admin-credentials-slip">
                <div className="admin-credentials-slip__banner">
                  <IconCheck size={20} />
                  <div>
                    <strong>Partner Workspace Successfully Provisioned!</strong>
                    <p>Share these initial login credentials with the partner executive team.</p>
                  </div>
                </div>

                <div className="admin-credentials-slip__box">
                  <div className="admin-cred-row">
                    <span className="admin-cred-label">Company / Workspace:</span>
                    <strong className="admin-cred-val">{issuedCredentials.name}</strong>
                  </div>
                  <div className="admin-cred-row">
                    <span className="admin-cred-label">Workspace ID:</span>
                    <span className="admin-cred-val mono">{issuedCredentials.workspaceId}</span>
                  </div>
                  <div className="admin-cred-row">
                    <span className="admin-cred-label">Master Admin Email:</span>
                    <span className="admin-cred-val mono">{issuedCredentials.email}</span>
                  </div>
                  <div className="admin-cred-row">
                    <span className="admin-cred-label">Temporary Access Pass:</span>
                    <span className="admin-cred-val mono" style={{ color: '#0e9186', fontWeight: 700 }}>
                      {issuedCredentials.tempPassword}
                    </span>
                  </div>
                  <div className="admin-cred-row">
                    <span className="admin-cred-label">Direct Login URL:</span>
                    <span className="admin-cred-val mono" style={{ wordBreak: 'break-all', fontSize: '11px' }}>
                      {issuedCredentials.loginUrl}
                    </span>
                  </div>
                </div>

                <div className="admin-credentials-slip__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      const text = `Pulse Partner Login Credentials:
Company: ${issuedCredentials.name}
Workspace ID: ${issuedCredentials.workspaceId}
Email: ${issuedCredentials.email}
Temporary Passcode: ${issuedCredentials.tempPassword}
Login URL: ${issuedCredentials.loginUrl}`
                      navigator.clipboard.writeText(text)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2500)
                    }}
                  >
                    <IconCopy size={16} />
                    {copied ? 'Credentials Copied!' : 'Copy Credentials to Clipboard'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => {
                      setShowNewPartnerModal(false)
                      setIssuedCredentials(null)
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreatePartner} className="form admin-partner-form">
                <div className="field">
                  <label htmlFor="p-name">Logistics Company Name *</label>
                  <input
                    id="p-name"
                    type="text"
                    required
                    className="input"
                    placeholder="e.g. Skyline Express Haulage Ltd."
                    value={partnerForm.name}
                    onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="field">
                    <label htmlFor="p-email">Corporate Admin Email *</label>
                    <input
                      id="p-email"
                      type="email"
                      required
                      className="input"
                      placeholder="dispatch@skylineexpress.com"
                      value={partnerForm.email}
                      onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="p-contact">Primary Operations Manager</label>
                    <input
                      id="p-contact"
                      type="text"
                      className="input"
                      placeholder="e.g. Jason Ward"
                      value={partnerForm.contactName}
                      onChange={(e) => setPartnerForm({ ...partnerForm, contactName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="field">
                    <label htmlFor="p-cat">Partner Category</label>
                    <select
                      id="p-cat"
                      className="input"
                      value={partnerForm.category}
                      onChange={(e) =>
                        setPartnerForm({ ...partnerForm, category: e.target.value as PartnerWorkspace['category'] })
                      }
                    >
                      <option value="Freight & Haulage">Freight & Heavy Haulage</option>
                      <option value="Last-Mile Courier">Last-Mile Courier</option>
                      <option value="Cold-Chain Express">Cold-Chain Express</option>
                      <option value="Moving & Storage">Moving & Commercial Relocation</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="p-comm">Pulse Platform Fee (%)</label>
                    <input
                      id="p-comm"
                      type="number"
                      step="0.5"
                      min="2"
                      max="20"
                      className="input"
                      value={partnerForm.commissionRate}
                      onChange={(e) =>
                        setPartnerForm({ ...partnerForm, commissionRate: parseFloat(e.target.value) || 8.0 })
                      }
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="p-regions">Operating Regions / Hubs (comma-separated)</label>
                  <input
                    id="p-regions"
                    type="text"
                    className="input"
                    placeholder="e.g. London, Birmingham, Manchester, Southampton Port"
                    value={partnerForm.regions}
                    onChange={(e) => setPartnerForm({ ...partnerForm, regions: e.target.value })}
                  />
                </div>

                <div className="admin-modal__footer">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setShowNewPartnerModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary">
                    <IconPlus size={16} />
                    Generate & Provision Workspace
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
