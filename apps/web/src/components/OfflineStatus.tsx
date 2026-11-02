import { Check, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';
import { useSyncState } from '../lib/offline';

/**
 * What the counter needs to know when the connection is not the server's: that
 * the till is running on its own copy, how many tickets are still on the device,
 * and that they made it across. Mounted once in the shell, so the drain runs on
 * every screen — not only while the till page happens to be open.
 */
export default function OfflineStatus() {
  const { t, lang } = useLang();
  const { online, pending, failed, syncing, synced } = useSyncState();

  if (online && pending === 0 && failed === 0 && synced === 0) return null;

  const shell =
    'chip no-print border border-line bg-surface shadow-sm text-[12px]';

  return (
    <div className="pointer-events-none fixed bottom-[92px] start-3 z-40 flex flex-col items-start gap-2 lg:bottom-4">
      {!online ? (
        <span className={shell} style={{ color: 'var(--danger)' }}>
          <CloudOff size={14} />
          {t('offline.offline')}
        </span>
      ) : null}

      {pending > 0 ? (
        <span className={shell} style={{ color: 'var(--ink)' }}>
          <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
          {syncing
            ? t('offline.syncing')
            : t('offline.pending', { count: formatNumber(lang, pending) })}
        </span>
      ) : null}

      {failed > 0 ? (
        <span className={shell} style={{ color: 'var(--danger)' }}>
          <TriangleAlert size={14} />
          {t('offline.failed', { count: formatNumber(lang, failed) })}
        </span>
      ) : null}

      {synced > 0 ? (
        <span className={shell} style={{ color: 'var(--success)' }}>
          <Check size={14} />
          {t('offline.synced', { count: formatNumber(lang, synced) })}
        </span>
      ) : null}
    </div>
  );
}
