import type { StaffRole } from './api';
import type { TranslationKey } from './i18n';

/** One place for how a role is labelled and tinted across the app. */
export const ROLE_LABEL_KEY: Record<StaffRole, TranslationKey> = {
  owner: 'team.role.owner',
  admin: 'team.role.admin',
  manager: 'team.role.manager',
  cashier: 'team.role.cashier',
  kitchen: 'team.role.kitchen',
};

export const ROLE_TONE: Record<StaffRole, string> = {
  owner: 'var(--accent)',
  admin: 'var(--danger)',
  manager: 'var(--warning)',
  cashier: 'var(--success)',
  kitchen: 'var(--text-2)',
};

export const ROLES: StaffRole[] = [
  'admin',
  'manager',
  'cashier',
  'kitchen',
];

/** The platform owner: opens, bills, blocks and removes restaurants. */
export function isOwner(role: StaffRole | undefined): boolean {
  return role === 'owner';
}

/**
 * Who may manage accounts, the store profile and the locations: a restaurant's
 * own admin, and the platform owner above them. Staff roles never can.
 */
export function canManageStore(role: StaffRole | undefined): boolean {
  return role === 'admin' || role === 'owner';
}
