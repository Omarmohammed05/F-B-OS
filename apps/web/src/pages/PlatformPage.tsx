import { Check, Link2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { inviteLink } from '../components/platform/InviteLinkDialog';
import { api, type PlatformOverview, type PlatformRestaurant } from '../lib/api';
import { formatCurrency, formatMonth, formatNumber } from '../lib/format';
import { useLang, type TranslationKey } from '../lib/i18n';

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[12px] font-medium text-ink-2">{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-ink-2">{hint}</p> : null}
    </div>
  );
}

/** What the platform trail's action codes are called on screen. */
const ACTION_LABEL: Record<string, TranslationKey> = {
  'restaurant.create': 'platform.log.create',
  'restaurant.update': 'platform.log.update',
  'restaurant.block': 'platform.log.block',
  'restaurant.unblock': 'platform.log.unblock',
  'restaurant.delete': 'platform.log.delete',
  'restaurant.invite': 'platform.log.invite',
  'restaurant.activate': 'platform.log.activate',
  'software.payment': 'platform.log.payment',
  'software.payment.delete': 'platform.log.paymentDelete',
};

/**
 * The platform owner's home: restaurants, their bills, and the two lists that
 * need a decision — the ones nobody has activated, and the ones that owe this
 * month. A restaurant's own trade stays on its own dashboard.
 */
export default function PlatformPage() {
  const { t, lang } = useLang();
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .platformOverview()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const money = (value: number) =>
    formatCurrency(lang, value, data?.currency ?? 'EGP');

  const nameOf = (row: PlatformRestaurant) =>
    lang === 'ar' ? row.name_ar : row.name_en;

  const copy = async (row: PlatformRestaurant) => {
    try {
      await navigator.clipboard.writeText(inviteLink(row.invite_token));
      setCopied(row.id);
    } catch {
      // A frame that refuses the clipboard still shows the link on the list page.
      setCopied(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('platform.overviewTitle')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {t('platform.overviewSubtitle')}
          </p>
        </div>
        <Link
          to="/restaurants?new=1"
          className="btn-primary h-11 min-h-0 px-4 text-[14px]"
        >
          <Plus size={17} />
          {t('platform.newRestaurant')}
        </Link>
      </div>

      {data ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat
            label={t('platform.statRestaurants')}
            value={formatNumber(lang, data.summary.total)}
            hint={t('platform.statActiveHint', {
              count: formatNumber(lang, data.summary.active),
            })}
          />
          <Stat
            label={t('platform.statPending')}
            value={formatNumber(lang, data.summary.pending)}
            hint={t('platform.statPendingHint')}
          />
          <Stat
            label={t('platform.statMonthlyPrice')}
            value={money(data.summary.monthly_price)}
            hint={t('platform.statMonth', {
              month: formatMonth(lang, data.month),
            })}
          />
          <Stat
            label={t('platform.statUnpaid')}
            value={money(data.summary.unpaid_amount)}
            hint={t('platform.statUnpaidHint', {
              count: formatNumber(lang, data.summary.unpaid),
            })}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-12 rounded-field" />
          <div className="skeleton mt-2 h-12 rounded-field" />
          <div className="skeleton mt-2 h-12 rounded-field" />
        </div>
      ) : !data ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-ink">
            {t('platform.loadError')}
          </p>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="btn-primary"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="card">
            <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold text-ink">
                {t('platform.pendingTitle')}
              </h2>
              <p className="text-[13px] tabular-nums text-ink-2">
                {formatNumber(lang, data.pending.length)}
              </p>
            </div>
            {data.pending.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-ink-2">
                {t('platform.pendingEmpty')}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.pending.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">
                        {nameOf(row)}
                      </p>
                      <p className="text-[12px] text-ink-2">
                        {t('platform.invitePending')}
                      </p>
                    </div>
                    {row.invite_token ? (
                      <button
                        type="button"
                        onClick={() => copy(row)}
                        className="btn-quiet h-9 min-h-0 px-3 text-[12px]"
                        style={{ color: 'var(--accent)' }}
                      >
                        {copied === row.id ? (
                          <Check size={14} />
                        ) : (
                          <Link2 size={14} />
                        )}
                        {copied === row.id
                          ? t('platform.inviteCopied')
                          : t('platform.inviteCopy')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold text-ink">
                {t('platform.unpaidTitle')}
              </h2>
              <p className="text-[13px] tabular-nums text-ink-2">
                {money(data.summary.unpaid_amount)}
              </p>
            </div>
            {data.unpaid.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-ink-2">
                {t('platform.unpaidEmpty')}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.unpaid.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">
                        {nameOf(row)}
                      </p>
                      <p className="text-[12px] text-ink-2">
                        {t('platform.price')}
                      </p>
                    </div>
                    <p className="text-[14px] tabular-nums text-ink">
                      {money(row.software_price)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line px-4 py-3">
              <Link
                to="/income"
                className="text-[13px] font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                {t('platform.unpaidAction')}
              </Link>
            </div>
          </section>

          <section className="card lg:col-span-2">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold text-ink">
                {t('platform.activityTitle')}
              </h2>
            </div>
            {data.activity.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-ink-2">
                {t('platform.activityEmpty')}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.activity.map((event) => (
                  <li key={event.id} className="flex gap-3 px-4 py-3">
                    <p className="min-w-0 flex-1 text-[13px] text-ink">
                      <span className="font-semibold">
                        {ACTION_LABEL[event.action]
                          ? t(ACTION_LABEL[event.action])
                          : event.action}
                      </span>
                      {event.detail ? (
                        <span className="text-ink-2"> — {event.detail}</span>
                      ) : null}
                    </p>
                    {event.actor ? (
                      <p className="shrink-0 text-[12px] text-ink-2">
                        {event.actor}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
