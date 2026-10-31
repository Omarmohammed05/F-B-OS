import { useState } from 'react';
import { formatCurrency, formatDayLong, formatDayShort, formatPercent } from '../lib/format';
import { useLang } from '../lib/i18n';

type Props = {
  points: { day: string; amount: number }[];
  currency: string;
  /** Show every Nth day label; a 30-day range would otherwise truncate them. */
  labelEvery?: number;
};

export default function RevenueChart({
  points,
  currency,
  labelEvery = 1,
}: Props) {
  const { t, lang, dir } = useLang();
  const [selected, setSelected] = useState(points.length - 1);

  if (points.length === 0) return null;

  const max = Math.max(...points.map((point) => point.amount));
  const total = points.reduce((sum, point) => sum + point.amount, 0);
  const first = points[0].amount;
  const last = points[points.length - 1].amount;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const current = points[Math.min(selected, points.length - 1)];

  return (
    <section className="card flex flex-col p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">
            {t('revenue.title')}
          </h2>
          <p className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[30px]">
            {formatCurrency(lang, total, currency)}
          </p>
        </div>
        <span className="chip bg-surface-2 text-ink-2">
          {formatPercent(lang, change)} · {t('revenue.vsLast')}
        </span>
      </div>

      <div className="mt-6 flex items-end gap-2 sm:gap-3" style={{ height: 176 }}>
        {points.map((point, index) => {
          const isSelected = index === Math.min(selected, points.length - 1);
          const height = Math.max(6, Math.round((point.amount / max) * 100));
          return (
            <button
              key={point.day}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`${formatDayLong(lang, point.day)} — ${formatCurrency(
                lang,
                point.amount,
                currency,
              )}`}
              aria-pressed={isSelected}
              data-testid={`revenue-bar-${index}`}
              className="group relative flex h-full flex-1 items-end rounded-[8px] outline-offset-4"
            >
              <span
                className="w-full rounded-[6px] transition-colors duration-150"
                style={{
                  height: `${height}%`,
                  background: isSelected ? 'var(--accent)' : 'var(--line)',
                }}
              />
              {isSelected ? (
                <span
                  className="pointer-events-none absolute bottom-[calc(100%+10px)] z-10 w-[132px] rounded-field bg-ink px-2.5 py-2 text-center text-surface shadow-lg"
                  style={
                    index === 0
                      ? { insetInlineStart: 0 }
                      : index === points.length - 1
                        ? { insetInlineEnd: 0 }
                        : {
                            insetInlineStart: '50%',
                            transform:
                              dir === 'rtl'
                                ? 'translateX(50%)'
                                : 'translateX(-50%)',
                          }
                  }
                >
                  <span className="block text-[11px] opacity-80">
                    {formatDayLong(lang, current.day)}
                  </span>
                  <span className="block text-[13px] font-bold">
                    {formatCurrency(lang, current.amount, currency)}
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2 border-t border-line pt-2 sm:gap-3">
        {(labelEvery > 1
          ? points.filter((_, index) => index % labelEvery === 0)
          : points
        ).map((point) => (
          <span
            key={point.day}
            className={`flex-1 truncate text-center text-[11px] ${
              point.day === current.day
                ? 'font-semibold text-ink'
                : 'text-ink-2'
            }`}
          >
            {formatDayShort(lang, point.day)}
          </span>
        ))}
      </div>
    </section>
  );
}
