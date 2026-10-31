import { formatCurrency, formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';

type Props = {
  payments: { method_ar: string; method_en: string; amount: number }[];
  currency: string;
  orderCount: number;
};

const radii = { r: 54, stroke: 16 };
const circumference = 2 * Math.PI * radii.r;

const segmentColors = [
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--ink-2)',
];

export default function PaymentDonut({
  payments,
  currency,
  orderCount,
}: Props) {
  const { t, lang } = useLang();
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);

  let offset = 0;
  const segments = payments.map((payment, index) => {
    const share = total > 0 ? payment.amount / total : 0;
    const length = share * circumference;
    const segment = {
      ...payment,
      color: segmentColors[index % segmentColors.length],
      dash: `${length} ${circumference - length}`,
      offset: -offset,
      share,
    };
    offset += length;
    return segment;
  });

  return (
    <section className="card flex flex-col p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-ink">{t('payment.title')}</h2>

      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <svg
            width="140"
            height="140"
            viewBox="0 0 140 140"
            role="img"
            aria-label={t('payment.title')}
          >
            <circle
              cx="70"
              cy="70"
              r={radii.r}
              fill="none"
              stroke="var(--surface-2)"
              strokeWidth={radii.stroke}
            />
            <g transform="rotate(-90 70 70)">
              {segments.map((segment) => (
                <circle
                  key={segment.method_en}
                  cx="70"
                  cy="70"
                  r={radii.r}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={radii.stroke}
                  strokeDasharray={segment.dash}
                  strokeDashoffset={segment.offset}
                />
              ))}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] text-ink-2">{t('payment.title')}</span>
            <span className="text-[16px] font-bold leading-tight text-ink">
              {formatCurrency(lang, total, currency)}
            </span>
            <span className="text-[11px] text-ink-2">
              {t('payment.orders', { count: formatNumber(lang, orderCount) })}
            </span>
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-2">
          {segments.map((segment) => (
            <li
              key={segment.method_en}
              className="flex items-center justify-between gap-2 text-[13px]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: segment.color }}
                />
                <span className="truncate text-ink-2">
                  {lang === 'ar' ? segment.method_ar : segment.method_en}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-ink">
                {formatCurrency(lang, segment.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
