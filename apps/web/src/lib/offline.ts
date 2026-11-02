import { useEffect, useState } from 'react';
import {
  ApiError,
  api,
  type AuthUser,
  type Customer,
  type DashboardData,
  type OrderInput,
  type PosCatalog,
  type QrMenuData,
} from './api';

/**
 * The till's own memory, so a dropped connection never closes the counter.
 *
 * Two things live in `localStorage`: the last successful answer for a handful of
 * read screens (the POS catalog and guest book, the dashboard, the QR link and
 * who is signed in), and the **outbox** — tickets rung up while the connection
 * was down. Nothing here writes a price or a total to the server: a queued
 * ticket is the same `{products, qty}` payload the POS always sends, replayed
 * with an `Idempotency-Key`, so the API keeps pricing, tax, availability and the
 * ticket number as the only source of truth.
 */

export const cacheKeys = {
  pos: 'sufra.cache.pos',
  dashboard: 'sufra.cache.dashboard',
  qr: 'sufra.cache.qr',
  user: 'sufra.cache.user',
} as const;

const OUTBOX_KEY = 'sufra.pos.outbox';
const FAILED_KEY = 'sufra.pos.failed';
const SEQUENCE_KEY = 'sufra.pos.sequence';

export type PosCache = { catalog: PosCatalog; customers: Customer[] };
export type DashboardCache = DashboardData;
export type QrCache = QrMenuData;
export type UserCache = AuthUser;

export function saveCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage must never stop the counter.
  }
}

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearCache(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clean up in a browser that blocks storage.
  }
}

/** A ticket rung up without a connection, waiting for the server. */
export type PendingOrder = {
  /** Also sent as the `Idempotency-Key`, so a replay never doubles a ticket. */
  id: string;
  /** The number printed on the guest's slip while the ticket is local. */
  number: string;
  payload: OrderInput;
  created_at: string;
};

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, rows: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Keep the rest of the shift going; the ticket stays in memory for this page.
  }
  emit();
}

export function readOutbox(): PendingOrder[] {
  return readList<PendingOrder>(OUTBOX_KEY);
}

/** Tickets the server refused outright — kept so the counter can look them up. */
export function readFailed(): PendingOrder[] {
  return readList<PendingOrder>(FAILED_KEY);
}

function localId(): string {
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return generated.slice(0, 64);
}

/**
 * Park a ticket on the device. The number is local (`OFF-3`) on purpose: only
 * the server mints real ticket numbers, so the slip never claims one it does
 * not own.
 */
export function queueOrder(payload: OrderInput): PendingOrder {
  let sequence = 0;
  try {
    sequence = Number(localStorage.getItem(SEQUENCE_KEY) || '0') + 1;
    localStorage.setItem(SEQUENCE_KEY, String(sequence));
  } catch {
    sequence = readOutbox().length + 1;
  }
  const queued: PendingOrder = {
    id: localId(),
    number: `OFF-${sequence}`,
    payload,
    created_at: new Date().toISOString(),
  };
  writeList(OUTBOX_KEY, [...readOutbox(), queued]);
  return queued;
}

const listeners = new Set<() => void>();
let syncing: Promise<number> | null = null;
let lastSynced = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function dropQueued(id: string): void {
  writeList(
    OUTBOX_KEY,
    readOutbox().filter((row) => row.id !== id),
  );
}

function parkFailed(row: PendingOrder): void {
  writeList(FAILED_KEY, [...readFailed(), row]);
}

/**
 * Replay every parked ticket, oldest first. A dropped connection stops the run
 * and leaves the rest for the next attempt; a ticket the server rejects (an item
 * sold out meanwhile, say) is moved aside so it cannot block the ones behind it.
 */
export async function syncOutbox(): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    let synced = 0;
    for (const row of readOutbox()) {
      try {
        await api.createOrder(row.payload, row.id);
        dropQueued(row.id);
        synced += 1;
      } catch (error) {
        if (!(error instanceof ApiError)) break;
        // 401/403/429 and a 5xx are worth another try; anything else is final.
        if ([401, 403, 429].includes(error.status) || error.status >= 500) break;
        dropQueued(row.id);
        parkFailed(row);
      }
    }
    if (synced > 0) {
      lastSynced = synced;
      window.setTimeout(() => {
        lastSynced = 0;
        emit();
      }, 8000);
    }
    return synced;
  })().finally(() => {
    syncing = null;
    emit();
  });
  emit();
  return syncing;
}

export type SyncState = {
  online: boolean;
  pending: number;
  failed: number;
  syncing: boolean;
  /** Tickets that just reached the server; 0 once the notice fades. */
  synced: number;
};

function snapshot(): SyncState {
  return {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pending: readOutbox().length,
    failed: readFailed().length,
    syncing: syncing !== null,
    synced: lastSynced,
  };
}

/**
 * The connection, the queue and the drain — read by the status chip and the POS.
 * The queue also drains on a timer, because a proxy that comes back often never
 * fires the browser's `online` event.
 */
export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(snapshot);

  useEffect(() => {
    const refresh = () => setState(snapshot());
    refresh();
    const unsubscribe = subscribeSync(refresh);
    const onOnline = () => {
      refresh();
      void syncOutbox();
    };
    const onOffline = () => refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = window.setInterval(() => {
      if (readOutbox().length > 0 && navigator.onLine) void syncOutbox();
    }, 10000);
    if (readOutbox().length > 0 && navigator.onLine) void syncOutbox();
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(timer);
    };
  }, []);

  return state;
}
