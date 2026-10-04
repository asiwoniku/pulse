/**
 * The navigation model, kept in one place so the sidebar, the route table and
 * the mobile drawer can never disagree about what exists. Groups and ordering
 * match the brief's suggested structure exactly.
 *
 * A route the backend cannot serve yet is still listed — the page renders an
 * honest "not implemented" state rather than being hidden, because a missing
 * link is worse than an honest gap.
 */

export interface NavItem {
  to: string
  label: string
  /** Rendered when the feature has no backend behind it yet. */
  planned?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Workspace',
    items: [{ to: '/app/overview', label: 'Overview' }],
  },
  {
    label: 'Shipments',
    items: [
      { to: '/app/shipments', label: 'All shipments' },
      { to: '/app/shipments/new', label: 'Create shipment' },
      { to: '/app/exceptions', label: 'Exceptions & disputes' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/app/dispatch', label: 'Dispatch' },
      { to: '/app/drivers', label: 'Drivers' },
      { to: '/app/fleet', label: 'Fleet & vehicles' },
      { to: '/app/warehouse', label: 'Warehouse' },
      { to: '/app/moving', label: 'Moving jobs' },
      { to: '/app/international', label: 'International & clearance' },
    ],
  },
  {
    label: 'Relationships',
    items: [
      { to: '/app/customers', label: 'Customers' },
      { to: '/app/reputation', label: 'Reviews & reputation' },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/app/documents', label: 'Documents' },
      { to: '/app/audit', label: 'Audit history' },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/app/payments', label: 'Payments & payouts' },
      { to: '/app/reports', label: 'Reports & analytics' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/app/integrations', label: 'Integrations & API' },
      { to: '/app/team', label: 'Team & permissions' },
      { to: '/app/company/verification', label: 'Company verification' },
      { to: '/app/settings', label: 'Settings' },
      { to: '/app/help', label: 'Help & support' },
    ],
  },
]

/** Flattened list used by the route table and global search. */
export const ALL_ROUTES: NavItem[] = NAV.flatMap((group) => group.items)