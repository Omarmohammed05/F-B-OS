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

/**
 * Who may see what a plate costs and move a price: the manager on shift and the
 * people above them. The till and the pass ring up tickets, so their payloads
 * arrive without cost or margin at all (`deps.sees_cost` on the API) — this is
 * only what decides which controls render.
 */
export function canSeeCost(role: StaffRole | undefined): boolean {
  return role === 'manager' || role === 'admin' || role === 'owner';
}

/**
 * Who may tick a teammate's checklist box and read the week/month report: the
 * manager on shift, and the admin or owner above them. Everyone else ticks
 * only their own list.
 */
export function canSupervise(role: StaffRole | undefined): boolean {
  return role === 'manager' || role === 'admin' || role === 'owner';
}
