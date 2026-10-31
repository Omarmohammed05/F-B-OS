import { BookOpen, Pencil, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CategoryManager from '../components/menu/CategoryManager';
import ProductDialog from '../components/menu/ProductDialog';
import { api, type MenuData, type MenuProduct } from '../lib/api';
import { formatCurrency, formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';
import { useAppData } from '../lib/store';

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning';
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[12px] font-medium text-ink-2">{label}</p>
      <p
        className="mt-1 text-[22px] font-bold tabular-nums tracking-tight"
        style={tone === 'warning' ? { color: 'var(--warning)' } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function ProductCard({
  product,
  currency,
  onToggle,
  onEdit,
}: {
  product: MenuProduct;
  currency: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { t, lang } = useLang();
  const name = lang === 'ar' ? product.name_ar : product.name_en;
  const hasRecipe = product.recipe_lines > 0;

  return (
    <article className="card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-surface-2 text-[24px] ${
            product.is_available ? '' : 'opacity-50'
          }`}
        >
          {product.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-ink">{name}</h3>
          <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink-2">
            {formatCurrency(lang, product.price, currency)}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={product.is_available}
          aria-label={`${name} · ${
            product.is_available ? t('menu.available') : t('menu.unavailable')
          }`}
          onClick={onToggle}
          className="shrink-0"
        >
          <span
            className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
              product.is_available ? 'justify-end' : 'justify-start'
            }`}
            style={{
              background: product.is_available ? 'var(--accent)' : 'var(--line)',
            }}
          >
            <span className="h-5 w-5 rounded-full bg-white shadow" />
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {hasRecipe ? (
          <>
            <span className="chip bg-surface-2 tabular-nums text-ink-2">
              {t('menu.cost')} {formatCurrency(lang, product.cost, currency)}
            </span>
            <span
              className="chip tabular-nums"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              {t('menu.margin')} {formatNumber(lang, product.margin_pct, 1)}%
            </span>
          </>
        ) : (
          <span className="chip bg-surface-2 text-[color:var(--warning)]">
            {t('menu.noRecipe')}
          </span>
        )}
        {product.is_available ? null : (
          <span className="chip bg-surface-2 text-ink-2">
            {t('menu.unavailable')}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
        <Link
          to={`/menu/${product.id}/recipe`}
          className="btn-quiet h-9 min-h-0 flex-1 gap-1.5 px-3 text-[13px]"
        >
          <BookOpen size={15} />
          {t('menu.recipe')}
        </Link>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t('menu.edit')}
          className="icon-btn h-9 w-9"
        >
          <Pencil size={15} />
        </button>
      </div>
    </article>
  );
}

export default function MenuPage() {
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const { t, lang } = useLang();

  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [active, setActive] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .menu()
      .then((result) => {
        if (!cancelled) setMenu(result);
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

  const applyMenu = (next: MenuData) => {
    setMenu(next);
    setActionError(false);
  };

  const toggleAvailability = (product: MenuProduct) => {
    api
      .updateProduct(product.id, { is_available: !product.is_available })
      .then(applyMenu)
      .catch(() => setActionError(true));
  };

  const visible = useMemo(() => {
    if (!menu) return [];
    const needle = query.trim().toLowerCase();
    return menu.products.filter((product) => {
      if (active !== 'all' && product.category_id !== active) return false;
      if (!needle) return true;
      return `${product.name_ar} ${product.name_en}`
        .toLowerCase()
        .includes(needle);
    });
  }, [menu, active, query]);

  const groups = useMemo(() => {
    if (!menu) return [];
    return menu.categories
      .map((category) => ({
        category,
        products: visible.filter(
          (product) => product.category_id === category.id,
        ),
      }))
      .filter((group) => group.products.length > 0);
  }, [menu, visible]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-9 w-56 rounded-[10px]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="skeleton h-[74px] rounded-card" />
          <div className="skeleton h-[74px] rounded-card" />
          <div className="skeleton h-[74px] rounded-card" />
        </div>
        <div className="skeleton h-11 rounded-field" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="skeleton h-[188px] rounded-card" />
          <div className="skeleton h-[188px] rounded-card" />
          <div className="skeleton h-[188px] rounded-card" />
        </div>
      </div>
    );
  }

  if (error || !menu) {
    return (
      <div className="card flex flex-col items-start gap-3 p-6">
        <p className="text-[15px] font-semibold text-ink">{t('common.error')}</p>
        <button
          type="button"
          onClick={() => setNonce((value) => value + 1)}
          className="btn-primary"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (product: MenuProduct) => {
    setEditing(product);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('menu.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('menu.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoriesOpen(true)}
            className="btn-quiet h-11 min-h-0 px-3 text-[13px]"
          >
            <SlidersHorizontal size={15} />
            {t('menu.manageCategories')}
          </button>
          <button
            type="button"
            onClick={openNew}
            disabled={menu.categories.length === 0}
            className="btn-primary h-11 min-h-0 px-4 text-[14px]"
          >
            <Plus size={17} />
            {t('menu.newProduct')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label={t('menu.products')}
          value={formatNumber(lang, menu.summary.product_count)}
        />
        <Stat
          label={t('menu.avgMargin')}
          value={`${formatNumber(lang, menu.summary.avg_margin_pct, 1)}%`}
        />
        <Stat
          label={t('menu.noRecipe')}
          value={formatNumber(lang, menu.summary.without_recipe)}
          tone={menu.summary.without_recipe > 0 ? 'warning' : undefined}
        />
      </div>

      {actionError ? (
        <div className="flex items-center justify-between gap-3 rounded-field border border-line bg-surface px-3 py-2 text-[13px] font-medium text-[color:var(--danger)]">
          {t('menu.invalid')}
          <button
            type="button"
            onClick={() => setActionError(false)}
            className="text-ink-2 hover:text-ink"
          >
            {t('common.close')}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[200px] flex-1 items-center sm:max-w-[320px]">
          <Search
            size={16}
            className="pointer-events-none absolute start-3 text-ink-2"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('menu.search')}
            aria-label={t('menu.search')}
            className="field ps-9"
          />
        </label>
      </div>

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setActive('all')}
          className={`chip shrink-0 border px-3 py-2 text-[13px] ${
            active === 'all'
              ? 'border-transparent text-[color:var(--accent)]'
              : 'border-line bg-surface text-ink-2'
          }`}
          style={
            active === 'all' ? { background: 'var(--accent-soft)' } : undefined
          }
        >
          {t('menu.all')}
          <span className="tabular-nums opacity-70">
            {menu.summary.product_count}
          </span>
        </button>
        {menu.categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setActive(category.id)}
            className={`chip shrink-0 border px-3 py-2 text-[13px] ${
              active === category.id
                ? 'border-transparent text-[color:var(--accent)]'
                : 'border-line bg-surface text-ink-2'
            }`}
            style={
              active === category.id
                ? { background: 'var(--accent-soft)' }
                : undefined
            }
          >
            <span>{category.emoji}</span>
            {lang === 'ar' ? category.name_ar : category.name_en}
            <span className="tabular-nums opacity-70">
              {category.product_count}
            </span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-[15px] font-semibold text-ink">
            {query.trim() ? t('menu.noResults') : t('menu.emptyCategory')}
          </p>
          <p className="text-[13px] text-ink-2">{t('menu.emptyCategoryHint')}</p>
          <button
            type="button"
            onClick={openNew}
            disabled={menu.categories.length === 0}
            className="btn-primary mt-2"
          >
            <Plus size={17} />
            {t('menu.newProduct')}
          </button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.category.id} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-bold tracking-tight text-ink">
                {group.category.emoji}{' '}
                {lang === 'ar'
                  ? group.category.name_ar
                  : group.category.name_en}
              </h2>
              <span className="text-[12px] font-medium tabular-nums text-ink-2">
                {group.products.length}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currency={currency}
                  onToggle={() => toggleAvailability(product)}
                  onEdit={() => openEdit(product)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <ProductDialog
        open={dialogOpen}
        product={editing}
        categories={menu.categories}
        onClose={() => setDialogOpen(false)}
        onSaved={applyMenu}
      />
      <CategoryManager
        open={categoriesOpen}
        categories={menu.categories}
        onClose={() => setCategoriesOpen(false)}
        onSaved={applyMenu}
      />
    </div>
  );
}
