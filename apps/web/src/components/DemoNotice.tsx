import { ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { onDemoBlocked } from '../lib/demoNotice';
import { useLang } from '../lib/i18n';

/**
 * The demo store takes no writes. When one is refused, this says why — the page
 * that tried has its own "something went wrong" copy for a real failure.
 */
export default function DemoNotice() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const stop = onDemoBlocked(() => {
      setOpen(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setOpen(false), 7000);
    });
    return () => {
      stop();
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 mx-auto w-full max-w-[520px] px-4 lg:bottom-8">
      <div className="card flex items-start gap-3 p-3 shadow-2xl">
        <ShieldAlert
          size={18}
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--accent)' }}
        />
        <p className="flex-1 text-[13px] leading-5 text-ink">{t('demo.blocked')}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('common.close')}
          className="icon-btn h-8 w-8 shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
