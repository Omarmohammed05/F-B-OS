import {
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardCheck,
  LayoutDashboard,
  Monitor,
  QrCode,
  ReceiptText,
  SlidersHorizontal,
  Sparkles,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { TranslationKey } from './i18n';

export type NavItem = {
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  end?: boolean;
  /** Only the platform owner sees this entry (restaurants, income). */
  ownerOnly?: boolean;
};

export type NavGroup = {
  labelKey: TranslationKey;
  items: NavItem[];
  ownerOnly?: boolean;
};

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav.group.platform',
    ownerOnly: true,
    items: [
      { to: '/platform', labelKey: 'nav.overview', icon: LayoutDashboard },
      { to: '/restaurants', labelKey: 'nav.restaurants', icon: Building2 },
      { to: '/income', labelKey: 'nav.income', icon: Wallet },
    ],
  },
  {
    labelKey: 'nav.group.main',
    items: [
      {
        to: '/',
        labelKey: 'nav.dashboard',
        icon: LayoutDashboard,
        end: true,
      },
      { to: '/pos', labelKey: 'nav.pos', icon: Monitor },
      { to: '/orders', labelKey: 'nav.orders', icon: ReceiptText },
      { to: '/menu', labelKey: 'nav.menu', icon: UtensilsCrossed },
      { to: '/qr-menu', labelKey: 'nav.qrMenu', icon: QrCode },
    ],
  },
  {
    labelKey: 'nav.group.operations',
    items: [
      { to: '/checklists', labelKey: 'nav.checklists', icon: ClipboardCheck },
      { to: '/attendance', labelKey: 'nav.attendance', icon: CalendarClock },
      { to: '/inventory', labelKey: 'nav.inventory', icon: Boxes },
      { to: '/customers', labelKey: 'nav.customers', icon: Users },
      { to: '/loyalty', labelKey: 'nav.loyalty', icon: Sparkles },
    ],
  },
  {
    labelKey: 'nav.group.growth',
    items: [{ to: '/reports', labelKey: 'nav.reports', icon: BarChart3 }],
  },
  {
    labelKey: 'nav.group.settings',
    items: [
      { to: '/team', labelKey: 'nav.team', icon: UserCog },
      { to: '/settings', labelKey: 'nav.settings', icon: SlidersHorizontal },
    ],
  },
];

export const TAB_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/pos', labelKey: 'nav.pos', icon: Monitor },
  { to: '/orders', labelKey: 'nav.orders', icon: ReceiptText },
  { to: '/menu', labelKey: 'nav.menu', icon: UtensilsCrossed },
  { to: '/settings', labelKey: 'nav.settings', icon: SlidersHorizontal },
];

/**
 * The platform owner runs no restaurant shift, so the till, the board and the
 * roster are noise on their screen: they get the platform screens only.
 */
export const OWNER_TAB_ITEMS: NavItem[] = [
  { to: '/platform', labelKey: 'nav.overview', icon: LayoutDashboard },
  { to: '/restaurants', labelKey: 'nav.restaurants', icon: Building2 },
  { to: '/income', labelKey: 'nav.income', icon: Wallet },
];

/** The groups a role may see: the platform owner sees the platform, nobody else. */
export function navGroupsFor(owner: boolean): NavGroup[] {
  return NAV_GROUPS.filter((group) => Boolean(group.ownerOnly) === owner);
}

export function tabItemsFor(owner: boolean): NavItem[] {
  return owner ? OWNER_TAB_ITEMS : TAB_ITEMS;
}
