import {
  Bell,
  Coins,
  Gem,
  Hammer,
  Inbox,
  LayoutDashboard,
  Megaphone,
  PackageOpen,
  Gift,
  ReceiptText,
  Scale,
  Share2,
  ShieldCheck,
  Users,
  UserCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LANDING_ROUTES } from '@goldsmith/shared';
import type { RailBadgeKey, RoleId } from '@goldsmith/shared';

/** Every screen has one id. FEAT-002 onwards replace the placeholder behind an id in components/registry.tsx. */
export type RouteId =
  | 'today'
  | 'decisions'
  | 'leads'
  | 'lead-review'
  | 'lead-create'
  | 'lead-convert'
  | 'order-copy'
  | 'stock'
  | 'metal-pool'
  | 'stock-out'
  | 'edit-propose'
  | 'edit-apply'
  | 'scrap-decision'
  | 'parcels'
  | 'parcel-arrival'
  | 'parcel-tag'
  | 'parcel-qc'
  | 'parcel-match'
  | 'parcel-clear'
  | 'customers'
  | 'customer-new'
  | 'karigars'
  | 'karigar-new'
  | 'staff-directory'
  | 'staff-new'
  | 'scales'
  | 'security'
  | 'wishes'
  | 'broadcast'
  | 'catalogue'
  | 'k-jobs';

export interface Route {
  id: RouteId;
  params?: Record<string, string>;
}

export interface NavItem {
  id: RouteId;
  label: string;
  icon: LucideIcon;
  badge?: RailBadgeKey;
  /** Other routes that keep this item highlighted. */
  also?: RouteId[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

const leadsItem: NavItem = { id: 'leads', label: 'Leads', icon: Inbox, badge: 'leads', also: ['lead-review', 'lead-create', 'lead-convert', 'order-copy'] };
const parcelsItem: NavItem = {
  id: 'parcels', label: 'Parcels in', icon: PackageOpen, badge: 'parcels', also: ['parcel-arrival', 'parcel-tag', 'parcel-qc', 'parcel-match', 'parcel-clear'],
};
const stockItem: NavItem = { id: 'stock', label: 'Showroom stock', icon: Gem, badge: 'stock', also: ['edit-propose', 'edit-apply', 'scrap-decision'] };
const customersItem: NavItem = { id: 'customers', label: 'Customers', icon: Users, also: ['customer-new'] };

const outreach: NavSection = {
  label: 'Outreach',
  items: [
    { id: 'wishes', label: 'Wishes', icon: Gift },
    { id: 'broadcast', label: 'Broadcast', icon: Megaphone },
    { id: 'catalogue', label: 'Catalogue', icon: Share2 },
  ],
};

const staffNav: NavSection[] = [
  {
    label: 'Work',
    items: [
      { id: 'today', label: 'Today', icon: LayoutDashboard },
      leadsItem,
      stockItem,
      { id: 'stock-out', label: 'Stock-out', icon: ReceiptText },
      parcelsItem,
      customersItem,
    ],
  },
  outreach,
];

const ownerNav: NavSection[] = [
  {
    label: 'Oversight',
    items: [
      { id: 'decisions', label: 'Decisions', icon: Bell, badge: 'decisions' },
      leadsItem,
      parcelsItem,
      stockItem,
      { id: 'metal-pool', label: 'Metal pool', icon: Coins },
      { id: 'karigars', label: 'Karigars', icon: Hammer, also: ['karigar-new'] },
      customersItem,
      { id: 'staff-directory', label: 'Staff', icon: UserCog, also: ['staff-new'] },
      { id: 'scales', label: 'Scales & rules', icon: Scale },
      { id: 'security', label: 'Security log', icon: ShieldCheck },
    ],
  },
  outreach,
];

/** The karigar has no rail: one phone screen with Jobs / Gold / Me tabs. */
export function navFor(role: RoleId): NavSection[] {
  if (role === 'staff') return staffNav;
  if (role === 'owner') return ownerNav;
  return [];
}

export const landingRoute: Record<RoleId, RouteId> = LANDING_ROUTES;

export const isActive = (item: NavItem, routeId: RouteId): boolean => item.id === routeId || (item.also?.includes(routeId) ?? false);

export const routeTitles: Record<RouteId, string> = {
  today: 'Today',
  decisions: 'Decisions',
  leads: 'Leads',
  'lead-review': 'Check a lead',
  'lead-create': 'Add a lead by hand',
  'lead-convert': 'Convert a lead',
  'order-copy': 'Order copy to a karigar',
  stock: 'Showroom stock',
  'metal-pool': 'Metal pool',
  'stock-out': 'Stock-out',
  'edit-propose': 'Propose a change to a tag',
  'edit-apply': 'Apply a proposed change',
  'scrap-decision': 'Scrap request',
  parcels: 'Parcels in',
  'parcel-arrival': 'A parcel has arrived',
  'parcel-tag': 'Tag one item',
  'parcel-qc': 'Check this piece',
  'parcel-match': 'Match and release',
  'parcel-clear': 'A parcel that will not add up',
  customers: 'Customers',
  'customer-new': 'Add a customer',
  karigars: 'Karigars',
  'karigar-new': 'Add a karigar',
  'staff-directory': 'Staff',
  'staff-new': 'Add a staff member',
  scales: 'Scales & rules',
  security: 'Security log',
  wishes: 'Wishes',
  broadcast: 'Broadcast',
  catalogue: 'Catalogue',
  'k-jobs': 'My jobs',
};


/** Every route a rail reaches: its items and the routes that keep an item highlighted. */
function closure(sections: NavSection[]): Set<RouteId> {
  const ids = new Set<RouteId>();
  for (const section of sections) {
    for (const item of section.items) {
      ids.add(item.id);
      for (const also of item.also ?? []) ids.add(also);
    }
  }
  return ids;
}
const staffRoutes = closure(staffNav);
/** Routes only the owner reaches: the owner's rail minus the staff rail (decisions, metal pool, karigars, staff, scales, security). */
export const ownerOnlyRoutes: ReadonlySet<RouteId> = new Set([...closure(ownerNav)].filter((id) => !staffRoutes.has(id)));
/**
 * Whether a role may open a screen. The server refuses the operations anyway (EP-05); this keeps
 * the screen from opening. The karigar opens only `k-jobs`, which only the karigar opens; the
 * owner-only routes are the owner's rail minus the staff rail. Nothing else is closed.
 */
export function canOpenRoute(role: RoleId, id: RouteId): boolean {
  if (role === 'karigar') return id === 'k-jobs';
  if (id === 'k-jobs') return false;
  if (role === 'staff') return !ownerOnlyRoutes.has(id);
  return true;
}
/** The screen a request opens: the request when the role may open it, else the role's landing route. */
export function resolveRoute(role: RoleId, requested: RouteId): { id: RouteId; redirected: boolean } {
  return canOpenRoute(role, requested) ? { id: requested, redirected: false } : { id: landingRoute[role], redirected: true };
}
/** Whether a text is a route id (a deep link such as /security). */
export const isRouteId = (text: string): text is RouteId => Object.hasOwn(routeTitles, text);
