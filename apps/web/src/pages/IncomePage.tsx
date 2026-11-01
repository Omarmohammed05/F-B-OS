import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import PaymentDialog from '../components/platform/PaymentDialog';
import {
  api,
  type IncomeData,
  type IncomeEntry,
  type PlatformRestaurant,
} from '../lib/api';
import {
  formatCurrency,
  formatDayLong,
  formatMonth,
  formatNumber,
} from '../lib/format';
import { useLang } from '../lib/i18n';

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

/**
 * What the owner collects for the software itself — one entry per restaurant
 * per month — kept apart from the ticket sales each restaurant rings up for
 * itself.
 */
export default function IncomePage() {
  const { t, lang } = useLang();
  const [data, setData] = useState<IncomeData | null>(null);
  const [restaurants, setRestaurants] = useState<PlatformRestaurant[]>([]);
  const [currency, setCurrency] = useState('EGP');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([api.income(6), api.restaurants()])
      .then(([income, platform]) => {
        if (cancelled) return;
        setData(income);
        setRestaurants(platform.restaurants);
        setCurrency(platform.currency || income.currency);
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

  const money = (value: number) => formatCurrency(lang, value, currency);

  const months = useMemo(
    () => (data?.months ?? []).filter((row) => row.entries.length > 0),
    [data],
  );

  const nameOf = (entry: IncomeEntry) =>
    lang === 'ar' ? entry.name_ar : entry.name_en;

  const removePayment = (entry: IncomeEntry) => {
    setBusyId(entry.id);
    api
      .deletePayment(entry.restaurant_id, entry.id)
      .then((next) => {
        setData(next);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('income.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('income.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={restaurants.every((row) => row.is_deleted)}
          className="btn-primary h-11 min-h-0 px-4 text-[14px] disabled:opacity-40"
        >
          <Plus size={17} />
          {t('platform.recordPayment')}
        </button>
      </div>

      {data ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          <Stat
            label={t('platform.statIncomeMonth')}
            value={money(data.summary.this_month)}
            hint={
              data.months[0]
                ? t('platform.statMonth', {
                    month: formatMonth(lang, data.months[0].month),
                  })
                : undefined
            }
          />
          <Stat
            label={t('income.total')}
            value={money(data.summary.total)}
          />
          <Stat
            label={t('income.billed')}
            value={money(data.summary.monthly_price)}
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
      ) : months.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-[15px] font-semibold text-ink">
            {t('income.empty')}
          </p>
          <p className="text-[13px] text-ink-2">{t('income.emptyHint')}</p>
        </div>
      ) : (
        months.map((month) => (
          <section key={month.month} className="card overflow-x-auto">
            <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold text-ink">
                {formatMonth(lang, month.month)}
              </h2>
              <p className="text-[13px] text-ink-2">
                <span className="tabular-nums text-ink">
                  {money(month.total)}
                </span>{' '}
                · {t('income.count', { count: formatNumber(lang, month.count) })}
              </p>
            </div>
            <table className="w-full min-w-[560px] border-collapse text-[14px]">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2.5 text-start font-semibold">
                    {t('platform.restaurant')}
                  </th>
                  <th className="px-4 py-2.5 text-start font-semibold">
                    {t('platform.paidOn')}
                  </th>
                  <th className="px-4 py-2.5 text-start font-semibold">
                    {t('platform.note')}
                  </th>
                  <th className="px-4 py-2.5 text-end font-semibold">
                    {t('platform.amount')}
                  </th>
                  <th className="w-14 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {month.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-t border-line align-middle"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {nameOf(entry)}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {formatDayLong(lang, entry.paid_on)}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {entry.note || '—'}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-ink">
                      {money(entry.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => removePayment(entry)}
                          disabled={busyId === entry.id}
                          aria-label={`${t('income.deletePayment')} — ${nameOf(entry)}`}
                          className="icon-btn h-9 w-9 text-[color:var(--danger)] disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      {error && data ? (
        <p className="text-[13px] font-medium text-[color:var(--danger)]">
          {t('income.deleteFailed')}
        </p>
      ) : null}

      <PaymentDialog
        open={dialogOpen}
        restaurants={restaurants}
        currency={currency}
        onClose={() => setDialogOpen(false)}
        onSaved={(next) => {
          setData(next);
          setError(false);
        }}
      />
    </div>
  );
}
