import { ArrowDownUp, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import IngredientDialog from '../components/inventory/IngredientDialog';
import StockMoveDialog from '../components/inventory/StockMoveDialog';
import {
  api,
  type Ingredient,
  type IngredientsData,
  type StockMovement,
} from '../lib/api';
import {
  formatDayShort,
  formatClock,
  formatMoney,
  formatNumber,
} from '../lib/format';
import { useLang, type TranslationKey } from '../lib/i18n';
import { useAppData } from '../lib/store';

const UNIT_KEY: Record<string, TranslationKey> = {
  g: 'inv.units.g',
  ml: 'inv.units.ml',
  pc: 'inv.units.pc',
};

const REASON_KEY: Record<StockMovement['reason'], TranslationKey> = {
  sale: 'inv.reason.sale',
  purchase: 'inv.reason.purchase',
  waste: 'inv.reason.waste',
  adjustment: 'inv.reason.adjustment',
};

export default function InventoryPage() {
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const { t, lang } = useLang();

  const [catalog, setCatalog] = useState<IngredientsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [moving, setMoving] = useState<Ingredient | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .ingredients()
      .then((result) => {
        if (!cancelled) setCatalog(result);
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

  const rows = useMemo(() => {
    if (!catalog) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog.ingredients;
    return catalog.ingredients.filter((ingredient) =>
      `${ingredient.name_ar} ${ingredient.name_en}`
        .toLowerCase()
        .includes(needle),
    );
  }, [catalog, query]);

  const applyCatalog = (next: IngredientsData) => {
    setCatalog(next);
    setConfirming(null);
  };

  const handleDelete = (ingredient: Ingredient) => {
    api
      .deleteIngredient(ingredient.id)
      .then(applyCatalog)
      .catch(() => setError(true));
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (ingredient: Ingredient) => {
    setEditing(ingredient);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('inv.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('inv.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="btn-primary h-11 min-h-0 px-4 text-[14px]"
        >
          <Plus size={17} />
          {t('inv.new')}
        </button>
      </div>

      <label className="relative flex w-full items-center sm:max-w-[320px]">
        <Search
          size={16}
          className="pointer-events-none absolute start-3 text-ink-2"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('inv.search')}
          aria-label={t('inv.search')}
          className="field ps-9"
        />
      </label>

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-10 rounded-field" />
          <div className="skeleton mt-2 h-10 rounded-field" />
          <div className="skeleton mt-2 h-10 rounded-field" />
        </div>
      ) : error || !catalog ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-ink">
            {t('common.error')}
          </p>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="btn-primary"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-[15px] font-semibold text-ink">
            {catalog.ingredients.length === 0
              ? t('inv.empty')
              : t('menu.noResults')}
          </p>
          <p className="text-[13px] text-ink-2">
            {t('inv.emptyHint')}
          </p>
          <button type="button" onClick={openNew} className="btn-primary mt-2">
            <Plus size={17} />
            {t('inv.new')}
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[14px]">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('inv.ingredient')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('inv.unitCost')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('inv.stock')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('inv.usedIn')}
                </th>
                <th className="w-32 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((ingredient) => {
                const unitLabel = t(
                  UNIT_KEY[ingredient.unit] ?? 'inv.units.pc',
                );
                const locked =
                  ingredient.recipes_using > 0 || ingredient.has_movements;
                const name =
                  lang === 'ar' ? ingredient.name_ar : ingredient.name_en;
                return (
                  <tr
                    key={ingredient.id}
                    className="border-t border-line align-middle"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{name}</p>
                      <p className="text-[12px] text-ink-2">{unitLabel}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {formatMoney(lang, ingredient.unit_cost, currency, 3)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-ink">
                        {formatNumber(lang, ingredient.stock_qty, 1)}{' '}
                        <span className="text-[12px] text-ink-2">
                          {unitLabel}
                        </span>
                      </span>
                      {ingredient.is_low ? (
                        <span className="chip ms-2 bg-surface-2 text-[color:var(--danger)]">
                          {t('inv.low')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {ingredient.recipes_using > 0 ? (
                        <span className="chip bg-surface-2 tabular-nums text-ink-2">
                          {t('inv.recipeCount', {
                            count: ingredient.recipes_using,
                          })}
                        </span>
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setMoving(ingredient)}
                          aria-label={`${t('inv.recordMove')} — ${name}`}
                          className="icon-btn h-9 w-9"
                        >
                          <ArrowDownUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(ingredient)}
                          aria-label={`${t('menu.edit')} — ${name}`}
                          className="icon-btn h-9 w-9"
                        >
                          <Pencil size={14} />
                        </button>
                        {locked ? (
                          <span
                            title={
                              ingredient.recipes_using > 0
                                ? t('inv.deleteBlocked')
                                : t('inv.hasHistory')
                            }
                            className="flex h-9 w-9 items-center justify-center text-ink-2"
                          >
                            <Lock size={14} />
                          </span>
                        ) : confirming === ingredient.id ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(ingredient)}
                            className="btn-quiet h-9 min-h-0 px-2.5 text-[12px] text-[color:var(--danger)]"
                          >
                            {t('menu.confirmDelete')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirming(ingredient.id)}
                            aria-label={t('menu.delete')}
                            className="icon-btn h-9 w-9 text-[color:var(--danger)]"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {catalog ? (
        <div className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-semibold text-ink">
              {t('inv.ledger')}
            </h2>
            <p className="text-[12px] text-ink-2">{t('inv.ledgerHint')}</p>
          </div>
          {catalog.movements.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-2">
              {t('inv.ledgerEmpty')}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {catalog.movements.map((movement) => {
                const unitLabel = t(
                  UNIT_KEY[movement.unit] ?? 'inv.units.pc',
                );
                const name =
                  (lang === 'ar' ? movement.name_ar : movement.name_en) || '—';
                return (
                  <li
                    key={movement.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]"
                  >
                    <span className="font-medium text-ink">{name}</span>
                    <span className="chip bg-surface-2 text-ink-2">
                      {t(REASON_KEY[movement.reason])}
                    </span>
                    <span
                      className={
                        movement.delta < 0
                          ? 'tabular-nums font-semibold text-[color:var(--danger)]'
                          : 'tabular-nums font-semibold text-ink'
                      }
                    >
                      {movement.delta < 0 ? '−' : '+'}
                      {formatNumber(lang, Math.abs(movement.delta), 1)}{' '}
                      {unitLabel}
                    </span>
                    {movement.note ? (
                      <span className="text-ink-2">{movement.note}</span>
                    ) : null}
                    <span className="ms-auto tabular-nums text-[12px] text-ink-2">
                      {movement.created_at
                        ? `${formatDayShort(lang, movement.created_at)} · ${formatClock(lang, movement.created_at)}`
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <IngredientDialog
        open={dialogOpen}
        ingredient={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={applyCatalog}
      />

      <StockMoveDialog
        open={moving !== null}
        ingredient={moving}
        onClose={() => setMoving(null)}
        onSaved={applyCatalog}
      />
    </div>
  );
}
