import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  Clock,
  ShoppingBag,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Ornament from '../components/public/Ornament';
import TimeLeft from '../components/public/TimeLeft';
import { publicMenuApi, type PublicOrderStatus } from '../lib/api';
import { formatClock, formatCurrency, formatNumber } from '../lib/format';
import { useLang, type TranslationKey } from '../lib/i18n';

/** The journey a guest waits through, in the order it happens. */
const STEPS: { status: PublicOrderStatus['status']; key: TranslationKey }[] = [
  { status: 'new', key: 'track.step.sent' },
  { status: 'preparing', key: 'track.step.preparing' },
  { status: 'served', key: 'track.step.served' },
];

const REACHED: Record<PublicOrderStatus['status'], number> = {
  new: 0,
  preparing: 1,
  served: 2,
  cancelled: 0,
};

const STATE_KEY: Record<PublicOrderStatus['status'], TranslationKey> = {
  new: 'track.state.new',
  preparing: 'track.state.preparing',
  served: 'track.state.served',
  cancelled: 'track.state.cancelled',
};

/**
 * Where a guest follows their own ticket after sending it from the QR menu.
 *
 * The link carries the branch token and the order number — nothing else, and
 * the API answers only the state, the plates and the total. While the kitchen
 * still has the order the page rereads it, so a phone left on the table stops
 * at "served" on its own.
 */
export default function PublicOrderPage() {
  const { token = '', number = '' } = useParams();
  const { t, lang } = useLang();

  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setOrder(null);
    publicMenuApi
      .track(token, number)
      .then((result) => {
        if (!cancelled) setOrder(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, number]);

  // A served or cancelled ticket has nothing left to ask about.
  const settled =
    order?.status === 'served' || order?.status === 'cancelled';
  useEffect(() => {
    if (!order || settled) return;
    const timer = window.setInterval(() => {
      publicMenuApi
        .track(token, number)
        .then((result) => setOrder(result))
        .catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
    // The status restarting the timer is what stops it once the plate lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, number, settled]);

  const Back = lang === 'ar' ? ArrowRight : ArrowLeft;

  const back = (
    <Link
      to={`/m/${token}`}
      className="btn-quiet mt-1 h-11 min-h-0 gap-1.5 rounded-full px-5 text-[14px]"
    >
      <Back size={16} />
      {t('track.back')}
    </Link>
  );

  if (!order) {
    return (
      <div className="guest-menu flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-[color:var(--accent)] opacity-80">
          <Ornament size={30} />
        </span>
        {failed ? (
          <>
            <p className="text-[17px] font-semibold text-ink">{t('track.notFound')}</p>
            <p className="text-[14px] text-ink-2">{t('track.notFoundHint')}</p>
            {back}
          </>
        ) : (
          <div className="skeleton h-24 w-full max-w-[380px] rounded-card" />
        )}
      </div>
    );
  }

  const cancelled = order.status === 'cancelled';
  const reached = REACHED[order.status];
  const Tone = cancelled ? X : order.status === 'served' ? Check : ChefHat;

  return (
    <div className="guest-menu min-h-screen px-4 py-6 text-ink">
      <div className="mx-auto flex w-full max-w-[460px] flex-col items-center gap-4">
        <span className="text-[color:var(--accent)]">
          <Ornament size={28} />
        </span>
        <div className="text-center">
          <p className="text-[12px] text-ink-2">{t('track.yourNumber')}</p>
          <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">
            #{order.number}
          </p>
        </div>

        <div className="card w-full px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{
                background: cancelled ? 'rgba(255,99,99,0.14)' : 'var(--accent-soft)',
                color: cancelled ? 'var(--danger)' : 'var(--accent)',
              }}
            >
              <Tone size={19} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">
                {t(STATE_KEY[order.status])}
              </p>
              <p className="text-[12px] tabular-nums text-ink-2">
                {formatClock(lang, order.placed_at)} · {t('track.live')}
              </p>
            </div>
          </div>

          {cancelled || order.status === 'served' ? null : (
            <div className="mt-4 flex items-center justify-between rounded-[12px] bg-surface-2 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <Clock size={13} />
                {t('track.timeLeft')}
              </span>
              <TimeLeft
                minutes={order.minutes_left}
                className="text-[14px] font-semibold tabular-nums text-[color:var(--accent)]"
              />
            </div>
          )}

          {cancelled ? null : (
            <ol className="mt-5 flex items-center gap-1.5">
              {STEPS.map((step, index) => {
                const done = index <= reached;
                return (
                  <li key={step.status} className="flex flex-1 flex-col gap-1.5">
                    <span
                      aria-hidden
                      className="h-[3px] rounded-full"
                      style={{
                        background: done ? 'var(--accent)' : 'var(--line)',
                      }}
                    />
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: done ? 'var(--text)' : 'var(--text-2)' }}
                    >
                      {t(step.key)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="card w-full px-4 py-3">
          <p className="text-[12px] font-semibold text-ink-2">{t('track.items')}</p>
          <ul className="mt-1.5 divide-y divide-line">
            {order.items.map((item, index) => (
              <li
                key={`${item.name_en}-${index}`}
                className="flex items-center gap-2.5 py-2 text-[13px]"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-2 text-[16px]"
                >
                  {item.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                  {lang === 'ar' ? item.name_ar : item.name_en}
                </span>
                <span className="shrink-0 tabular-nums text-ink-2">
                  ×{formatNumber(lang, item.qty)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2.5 text-[15px] font-bold text-ink">
            <span>{t('m.total')}</span>
            <span className="tabular-nums">
              {formatCurrency(lang, order.total, order.currency)}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
            <ShoppingBag size={13} />
            {order.table_no ? `${t('m.table')} #${order.table_no}` : t('m.takeaway')}
          </p>
        </div>

        {back}
      </div>
    </div>
  );
}
