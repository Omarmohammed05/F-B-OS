import type { TranslationKey } from './i18n';

export type ModuleKey =
  | 'pos'
  | 'orders'
  | 'menu'
  | 'inventory'
  | 'customers'
  | 'loyalty'
  | 'reports'
  | 'team'
  | 'settings';

export type ModuleMeta = {
  key: ModuleKey;
  phase: number;
  titleKey: TranslationKey;
  blurbKey: TranslationKey;
  scopeKey: TranslationKey;
};

export const MODULES: Record<ModuleKey, ModuleMeta> = {
  pos: {
    key: 'pos',
    phase: 2,
    titleKey: 'module.pos.title',
    blurbKey: 'module.pos.blurb',
    scopeKey: 'module.pos.scope',
  },
  orders: {
    key: 'orders',
    phase: 2,
    titleKey: 'module.orders.title',
    blurbKey: 'module.orders.blurb',
    scopeKey: 'module.orders.scope',
  },
  menu: {
    key: 'menu',
    phase: 1,
    titleKey: 'module.menu.title',
    blurbKey: 'module.menu.blurb',
    scopeKey: 'module.menu.scope',
  },
  inventory: {
    key: 'inventory',
    phase: 1,
    titleKey: 'module.inventory.title',
    blurbKey: 'module.inventory.blurb',
    scopeKey: 'module.inventory.scope',
  },
  customers: {
    key: 'customers',
    phase: 3,
    titleKey: 'module.customers.title',
    blurbKey: 'module.customers.blurb',
    scopeKey: 'module.customers.scope',
  },
  loyalty: {
    key: 'loyalty',
    phase: 6,
    titleKey: 'module.loyalty.title',
    blurbKey: 'module.loyalty.blurb',
    scopeKey: 'module.loyalty.scope',
  },
  reports: {
    key: 'reports',
    phase: 3,
    titleKey: 'module.reports.title',
    blurbKey: 'module.reports.blurb',
    scopeKey: 'module.reports.scope',
  },
  team: {
    key: 'team',
    phase: 3,
    titleKey: 'module.team.title',
    blurbKey: 'module.team.blurb',
    scopeKey: 'module.team.scope',
  },
  settings: {
    key: 'settings',
    phase: 1,
    titleKey: 'module.settings.title',
    blurbKey: 'module.settings.blurb',
    scopeKey: 'module.settings.scope',
  },
};

export function moduleFromPath(value: string | undefined): ModuleMeta | null {
  if (!value) return null;
  return (MODULES as Record<string, ModuleMeta>)[value] ?? null;
}
