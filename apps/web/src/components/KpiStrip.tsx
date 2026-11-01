import type { TranslationKey } from '../lib/i18n';
import { useLang } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';

type Props = {
  metrics: {
    pending_orders: number;
    in_progress_orders: number;
    total_orders: number;
    available_tables: number;
    total_tables: number;
    sales_change: number;
  };
};

type Cell = {
  labelKey: TranslationKey;
  value: string;
  note: string;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
};

export default function KpiStrip({ metrics }: Props) {
  const { t, lang } = useLang();

  const change = metrics.sales_change;
  const changeNote = `${formatPercent(lang, change)} ${t('kpi.vsLast')}`;

  const cells: Cell[] = [
    {
      labelKey: 'kpi.pending',
      value: formatNumber(lang, metrics.pending_orders),
      note: changeNote,
      tone: 'warning',
    },
    {
      labelKey: 'kpi.inProgress',
      value: formatNumber(lang, metrics.in_progress_orders),
      note: changeNote,
      tone: 'accent',
    },
    {
      labelKey: 'kpi.totalOrders',
      value: formatNumber(lang, metrics.total_orders),
      note: changeNote,
      tone: 'success',
    },
    {
      labelKey: 'kpi.availableTables',
      value: `${formatNumber(lang, metrics.available_tables)}/${formatNumber(
        lang,
        metrics.total_tables,
      )}`,
      note: t('kpi.vsLast'),
      tone: 'neutral',
    },
  ];

  return (
    <section className="card kpi-grid" aria-label={t('kpi.totalOrders')}>
      {cells.map((cell) => (
        <div key={cell.labelKey} className="kpi-cell">
          <p className="text-[13px] font-medium text-ink-2">{t(cell.labelKey)}</p>
          <p className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
            {cell.value}
          </p>
          <p className="mt-1 flex items-start gap-1 text-[12px] leading-snug text-ink-2">
            {cell.tone && cell.tone !== 'neutral' ? (
              <span
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: `var(--${cell.tone})` }}
              />
            ) : null}
            <span>{cell.note}</span>
          </p>
        </div>
      ))}
    </section>
  );
}
