import { formatCurrency, formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';

type Props = {
  items: {
    name_ar: string;
    name_en: string;
    emoji: string;
    orders: number;
    revenue: number;
  }[];
  currency: string;
};

export default function PopularItems({ items, currency }: Props) {
  const { t, lang } = useLang();

  return (
    <section className="card flex min-w-0 flex-col p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-ink">{t('popular.title')}</h2>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-x-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
        <span>{t('popular.item')}</span>
        <span className="text-end">{t('popular.orders')}</span>
        <span className="text-end">{t('popular.revenue')}</span>
      </div>

      <ul className="flex flex-col">
        {items.map((item, index) => (
          <li
            key={item.name_en}
            className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-3 py-2.5 ${
              index > 0 ? 'border-t border-line' : ''
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[16px]"
                style={{ background: 'var(--surface-2)' }}
                aria-hidden="true"
              >
                {item.emoji}
              </span>
              <span className="truncate text-[13px] font-medium text-ink">
                {lang === 'ar' ? item.name_ar : item.name_en}
              </span>
            </div>
            <span className="text-end text-[13px] text-ink-2">
              {formatNumber(lang, item.orders)}
            </span>
            <span className="text-end text-[13px] font-semibold text-ink">
              {formatCurrency(lang, item.revenue, currency)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
