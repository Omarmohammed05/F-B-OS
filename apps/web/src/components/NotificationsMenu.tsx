import { Bell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type NotificationsData } from '../lib/api';
import { formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';

// Everything in the panel is real: new tickets, low stock and finished stamp
// cards, read from the API each time the bell opens (and once on load, so the
// dot only shows when something actually needs attention).
export default function NotificationsMenu() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsData | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await api.notifications());
    } catch {
      // Keep the last list; the bell simply shows no new count.
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = data?.items ?? [];

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          void load();
        }}
        aria-label={t('top.notifications')}
        aria-expanded={open}
        className="icon-btn relative"
      >
        <Bell size={17} />
        {items.length > 0 ? (
          <span
            className="absolute end-2.5 top-2.5 h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--accent)' }}
          />
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <p className="border-b border-line px-4 py-3 text-[13px] font-semibold text-ink">
            {t('top.notifications')}
          </p>
          {items.length > 0 ? (
            <ul>
              {items.map((item) => (
                <li key={item.key} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(item.href);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start text-[13px] text-ink transition-colors duration-150 hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {lang === 'ar' ? item.title_ar : item.title_en}
                    </span>
                    <span className="chip shrink-0 border border-line bg-surface-2 tabular-nums text-ink-2">
                      {formatNumber(lang, item.count)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13px] text-ink-2">
              {busy && data === null
                ? t('common.loading')
                : t('top.notifications.empty')}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
