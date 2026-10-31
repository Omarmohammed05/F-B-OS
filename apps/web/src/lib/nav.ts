import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Monitor,
  ReceiptText,
  SlidersHorizontal,
  Sparkles,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { TranslationKey } from './i18n';

export type NavItem = {
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  end?: boolean;
};

export type NavGroup = {
  labelKey: TranslationKey;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
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
    ],
  },
  {
    labelKey: 'nav.group.operations',
    items: [
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
