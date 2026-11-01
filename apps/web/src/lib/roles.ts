import type { StaffRole } from './api';
import type { TranslationKey } from './i18n';

/** One place for how a role is labelled and tinted across the app. */
export const ROLE_LABEL_KEY: Record<StaffRole, TranslationKey> = {
  admin: 'team.role.admin',
  owner: 'team.role.owner',
  manager: 'team.role.manager',
  cashier: 'team.role.cashier',
  kitchen: 'team.role.kitchen',
};

export const ROLE_TONE: Record<StaffRole, string> = {
  admin: 'var(--danger)',
  owner: 'var(--accent)',
  manager: 'var(--warning)',
  cashier: 'var(--success)',
  kitchen: 'var(--text-2)',
};

export const ROLES: StaffRole[] = [
  'admin',
  'owner',
  'manager',
  'cashier',
  'kitchen',
];
