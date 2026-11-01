import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MenuProduct, PosCatalog } from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import { useLang } from '../../lib/i18n';

type Props = {
  catalog: PosCatalog;
  currency: string;
  cart: Record<number, number>;
  onAdd: (product: MenuProduct) => void;
};

export default function PosProductGrid({
  catalog,
  currency,
  cart,
  onAdd,
}: Props) {
  const { t, lang } = useLang();
  const [active, setActive] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.products.filter((product) => {
      if (active !== 'all' && product.category_id !== active) return false;
      if (!needle) return true;
      return `${product.name_ar} ${product.name_en}`
        .toLowerCase()
        .includes(needle);
    });
  }, [catalog.products, active, query]);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <label className="relative flex w-full items-center">
        <Search
          size={16}
          className="pointer-events-none absolute start-3 text-ink-2"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('pos.search')}
          aria-label={t('pos.search')}
          className="field ps-9"
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActive('all')}
          aria-pressed={active === 'all'}
          className="chip h-9 px-3 text-[13px]"
          style={
            active === 'all'
              ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
              : { background: 'var(--surface-2)', color: 'var(--text-2)' }
          }
        >
          {t('pos.all')}
        </button>
        {catalog.categories.map((category) => {
          const selected = active === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setActive(category.id)}
              aria-pressed={selected}
              className="chip h-9 px-3 text-[13px]"
              style={
                selected
                  ? {
                      background: 'var(--accent)',
                      color: 'var(--accent-ink)',
                    }
                  : { background: 'var(--surface-2)', color: 'var(--text-2)' }
              }
            >
              <span aria-hidden>{category.emoji}</span>
              {lang === 'ar' ? category.name_ar : category.name_en}
            </button>
          );
        })}
      </div>

      {products.length === 0 ? (
        <p className="card px-4 py-8 text-center text-[14px] text-ink-2">
          {t('pos.noProducts')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const qty = cart[product.id] ?? 0;
            const name = lang === 'ar' ? product.name_ar : product.name_en;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onAdd(product)}
                aria-label={`${name} · ${formatCurrency(lang, product.price, currency)}`}
                className="card flex min-h-[112px] flex-col items-start gap-2 p-3 text-start transition-colors duration-150 hover:bg-surface-2"
              >
                <span className="relative flex h-11 w-11 items-center justify-center rounded-[13px] bg-surface-2 text-[22px]">
                  {product.emoji}
                  {qty > 0 ? (
                    <span
                      className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-ink)',
                      }}
                    >
                      {qty}
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 text-[14px] font-semibold leading-tight text-ink">
                  {name}
                </span>
                <span className="mt-auto text-[13px] font-semibold tabular-nums text-ink-2">
                  {formatCurrency(lang, product.price, currency)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
