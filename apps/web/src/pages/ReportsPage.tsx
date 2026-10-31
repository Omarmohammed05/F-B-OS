import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import RevenueChart from '../components/RevenueChart';
import { api, type ReportData } from '../lib/api';
import { formatCurrency, formatNumber } from '../lib/format';
import { useLang, type TranslationKey } from '../lib/i18n';
import { useAppData } from '../lib/store';

const CHANNEL_KEY: Record<string, TranslationKey> = {
  dine_in: 'rep.channel.dine_in',
  takeaway: 'rep.channel.takeaway',
  delivery: 'rep.channel.delivery',
};

const PAYMENT_KEY: Record<string, TranslationKey> = {
  cash: 'rep.payment.cash',
  card: 'rep.payment.card',
  wallet: 'rep.payment.wallet',
};

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[12px] font-medium text-ink-2">{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {note ? <p className="mt-1 text-[12px] text-ink-2">{note}</p> : null}
    </div>
  );
}

function SplitList({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: { key: string; label: string; orders: number; revenue: number }[];
  currency: string;
}) {
  const { t, lang } = useLang();
  const max = Math.max(1, ...rows.map((row) => row.revenue));

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-medium text-ink">{row.label}</span>
              <span className="tabular-nums text-ink-2">
                {t('rep.count', { count: row.orders })} ·{' '}
                <span className="text-ink">
                  {formatCurrency(lang, row.revenue, currency)}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((row.revenue / max) * 100)}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ReportsPage() {
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const { t, lang } = useLang();

  const [days, setDays] = useState(7);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .report(days)
      .then((result) => {
        if (!cancelled) setReport(result);
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
  }, [days]);

  const totals = report?.totals;
  const hasSales = (totals?.orders ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('rep.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('rep.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={t('rep.title')}
            className="flex rounded-field border border-line bg-surface p-0.5"
          >
            {[7, 30].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                aria-pressed={days === value}
                className="h-10 rounded-[10px] px-3 text-[13px] font-semibold transition-colors"
                style={
                  days === value
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                    : { color: 'var(--text-2)' }
                }
              >
                {value === 7 ? t('rep.days7') : t('rep.days30')}
              </button>
            ))}
          </div>
          <a
            href={api.reportCsvUrl(days)}
            download
            className="btn-quiet h-11 min-h-0 gap-1.5 px-4 text-[14px]"
          >
            <Download size={16} />
            {t('rep.export')}
          </a>
        </div>
      </div>

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-24 rounded-field" />
          <div className="skeleton mt-2 h-24 rounded-field" />
        </div>
      ) : error || !report || !totals ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-ink">
            {t('rep.failed')}
          </p>
          <button
            type="button"
            onClick={() => setDays(days)}
            className="btn-primary"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : !hasSales ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-[15px] font-semibold text-ink">{t('rep.empty')}</p>
          <p className="text-[13px] text-ink-2">{t('orders.emptyHint')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat
              label={t('rep.netSales')}
              value={formatCurrency(lang, totals.revenue, currency)}
              note={`${t('rep.orders')}: ${formatNumber(lang, totals.orders)}`}
            />
            <Stat
              label={t('rep.orders')}
              value={formatNumber(lang, totals.orders)}
              note={t('rep.items') + `: ${formatNumber(lang, totals.items)}`}
            />
            <Stat
              label={t('rep.avgTicket')}
              value={formatCurrency(lang, totals.avg_ticket, currency)}
            />
            <Stat
              label={t('rep.foodCost')}
              value={`${formatNumber(lang, totals.food_cost_pct, 1)}%`}
              note={t('rep.target')}
            />
          </div>

          <RevenueChart
            points={report.series.map((point) => ({
              day: point.day,
              amount: point.revenue,
            }))}
            currency={currency}
            labelEvery={days > 10 ? 5 : 1}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4 sm:p-5">
              <h2 className="text-[15px] font-semibold text-ink">
                {t('rep.margin')}
              </h2>
              <ul className="mt-3 flex flex-col divide-y divide-line text-[14px]">
                {[
                  {
                    label: t('rep.revenue'),
                    value: formatCurrency(lang, totals.revenue, currency),
                  },
                  {
                    label: t('rep.cost'),
                    value: formatCurrency(lang, totals.food_cost, currency),
                  },
                  {
                    label: t('rep.gross'),
                    value: formatCurrency(lang, totals.gross_margin, currency),
                  },
                  {
                    label: t('rep.cancelled'),
                    value: `${formatNumber(lang, totals.cancelled_orders)} · ${formatCurrency(
                      lang,
                      totals.cancelled_value,
                      currency,
                    )}`,
                  },
                ].map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-2 py-2.5"
                  >
                    <span className="text-ink-2">{row.label}</span>
                    <span className="font-semibold tabular-nums text-ink">
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card overflow-hidden">
              <h2 className="px-4 pt-4 text-[15px] font-semibold text-ink sm:px-5">
                {t('rep.topProducts')}
              </h2>
              <table className="mt-2 w-full border-collapse text-[14px]">
                <thead>
                  <tr className="table-head">
                    <th className="px-4 py-2 text-start font-semibold sm:px-5">
                      {t('menu.products')}
                    </th>
                    <th className="px-4 py-2 text-end font-semibold">
                      {t('rep.qty')}
                    </th>
                    <th className="px-4 py-2 text-end font-semibold sm:px-5">
                      {t('rep.netSales')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.top_products.map((product) => (
                    <tr
                      key={product.product_id}
                      className="border-t border-line align-middle"
                    >
                      <td className="px-4 py-2.5 sm:px-5">
                        <span className="me-2">{product.emoji}</span>
                        <span className="font-medium text-ink">
                          {lang === 'ar' ? product.name_ar : product.name_en}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-end tabular-nums text-ink-2">
                        {formatNumber(lang, product.qty)}
                      </td>
                      <td className="px-4 py-2.5 text-end tabular-nums text-ink sm:px-5">
                        {formatCurrency(lang, product.revenue, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SplitList
              title={t('rep.channels')}
              currency={currency}
              rows={report.channels.map((row) => ({
                key: row.channel,
                label: t(CHANNEL_KEY[row.channel] ?? 'rep.channels'),
                orders: row.orders,
                revenue: row.revenue,
              }))}
            />
            <SplitList
              title={t('rep.payments')}
              currency={currency}
              rows={report.payments.map((row) => ({
                key: row.payment_method,
                label: t(PAYMENT_KEY[row.payment_method] ?? 'rep.payments'),
                orders: row.orders,
                revenue: row.revenue,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
