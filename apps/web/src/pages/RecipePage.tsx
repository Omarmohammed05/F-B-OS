import { ArrowLeft, Check, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  type Ingredient,
  type RecipeData,
  type RecipeLineInput,
} from '../lib/api';
import { formatCurrency, formatMoney, formatNumber } from '../lib/format';
import { useLang, type TranslationKey } from '../lib/i18n';
import { useAppData } from '../lib/store';

type IngredientInfo = Pick<
  Ingredient,
  'name_ar' | 'name_en' | 'unit' | 'unit_cost'
>;

const UNIT_KEY: Record<string, TranslationKey> = {
  g: 'inv.units.g',
  ml: 'inv.units.ml',
  pc: 'inv.units.pc',
};

function toLines(recipe: RecipeData): RecipeLineInput[] {
  return recipe.lines.map((line) => ({
    ingredient_id: line.ingredient_id,
    qty: line.qty,
  }));
}

export default function RecipePage() {
  const { productId } = useParams();
  const id = Number(productId);
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const { t, lang } = useLang();

  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<RecipeLineInput[]>([]);
  const [baseline, setBaseline] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [query, setQuery] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setNotFound(false);
    Promise.all([api.recipe(id), api.ingredients()])
      .then(([nextRecipe, catalog]) => {
        if (cancelled) return;
        setRecipe(nextRecipe);
        setIngredients(catalog.ingredients);
        const initial = toLines(nextRecipe);
        setLines(initial);
        setBaseline(JSON.stringify(initial));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : '';
        if (message.includes('404')) setNotFound(true);
        else setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, nonce]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const ingredientById = useMemo(() => {
    const map = new Map<number, IngredientInfo>();
    ingredients.forEach((ingredient) => map.set(ingredient.id, ingredient));
    recipe?.lines.forEach((line) => {
      if (!map.has(line.ingredient_id)) map.set(line.ingredient_id, line);
    });
    return map;
  }, [ingredients, recipe]);

  const totals = useMemo(() => {
    const cost = lines.reduce((sum, line) => {
      const ingredient = ingredientById.get(line.ingredient_id);
      return sum + (ingredient?.unit_cost ?? 0) * line.qty;
    }, 0);
    const price = recipe?.product.price ?? 0;
    return {
      cost,
      price,
      margin: price - cost,
      foodCost: price > 0 ? (cost / price) * 100 : 0,
    };
  }, [lines, ingredientById, recipe]);

  const dirty = JSON.stringify(lines) !== baseline;

  const catalogForPicker = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const used = new Set(lines.map((line) => line.ingredient_id));
    return ingredients.filter((ingredient) => {
      if (used.has(ingredient.id)) return false;
      if (!needle) return true;
      return `${ingredient.name_ar} ${ingredient.name_en}`
        .toLowerCase()
        .includes(needle);
    });
  }, [ingredients, lines, query]);

  const addIngredient = (ingredient: Ingredient) => {
    setLines((current) => [
      ...current,
      {
        ingredient_id: ingredient.id,
        qty: ingredient.unit === 'pc' ? 1 : 10,
      },
    ]);
    setSaved(false);
  };

  const updateQty = (ingredientId: number, value: string) => {
    const qty = Number(value);
    setLines((current) =>
      current.map((line) =>
        line.ingredient_id === ingredientId
          ? { ...line, qty: Number.isFinite(qty) ? qty : 0 }
          : line,
      ),
    );
    setSaved(false);
  };

  const removeLine = (ingredientId: number) => {
    setLines((current) =>
      current.filter((line) => line.ingredient_id !== ingredientId),
    );
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      const next = await api.saveRecipe(
        id,
        lines.filter((line) => line.qty > 0),
      );
      setRecipe(next);
      const savedLines = toLines(next);
      setLines(savedLines);
      setBaseline(JSON.stringify(savedLines));
      setSaved(true);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-8 w-32 rounded-[10px]" />
        <div className="skeleton h-14 w-64 rounded-[12px]" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="skeleton h-[320px] rounded-card lg:col-span-2" />
          <div className="skeleton h-[260px] rounded-card" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="card mx-auto mt-6 flex max-w-[520px] flex-col items-start gap-3 p-6">
        <p className="text-[15px] font-semibold text-ink">
          {t('recipe.notFound')}
        </p>
        <Link to="/menu" className="btn-primary">
          {t('recipe.back')}
        </Link>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="card flex flex-col items-start gap-3 p-6">
        <p className="text-[15px] font-semibold text-ink">
          {t('recipe.loadError')}
        </p>
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

  const product = recipe.product;
  const productName = lang === 'ar' ? product.name_ar : product.name_en;
  const foodTone =
    totals.foodCost > 35
      ? 'var(--danger)'
      : totals.foodCost > 30
        ? 'var(--warning)'
        : 'var(--success)';

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/menu"
        className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} className="rtl:rotate-180" />
        {t('recipe.back')}
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-surface-2 text-[24px]">
          {product.emoji}
        </span>
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[28px]">
            {productName}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{t('recipe.subtitle')}</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="chip border border-line bg-surface tabular-nums text-ink-2">
            {t('recipe.price')} {formatCurrency(lang, product.price, currency)}
          </span>
          {!product.is_available ? (
            <span className="chip bg-surface-2 text-ink-2">
              {t('menu.unavailable')}
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-bold tracking-tight text-ink">
                {t('recipe.ingredients')}
              </h2>
              <span className="chip bg-surface-2 tabular-nums text-ink-2">
                {lines.length}
              </span>
            </div>

            {lines.length === 0 ? (
              <div className="rounded-field border border-dashed border-line px-4 py-8 text-center">
                <p className="text-[14px] font-semibold text-ink">
                  {t('recipe.empty')}
                </p>
                <p className="mt-1 text-[13px] text-ink-2">
                  {t('recipe.emptyHint')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {lines.map((line) => {
                  const ingredient = ingredientById.get(line.ingredient_id);
                  if (!ingredient) return null;
                  const unitLabel = t(
                    UNIT_KEY[ingredient.unit] ?? 'inv.units.pc',
                  );
                  return (
                    <div
                      key={line.ingredient_id}
                      className="flex flex-wrap items-center gap-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-ink">
                          {lang === 'ar'
                            ? ingredient.name_ar
                            : ingredient.name_en}
                        </p>
                        <p className="text-[12px] tabular-nums text-ink-2">
                          {formatMoney(
                            lang,
                            ingredient.unit_cost,
                            currency,
                            3,
                          )}{' '}
                          / {unitLabel}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          dir="ltr"
                          value={line.qty}
                          onChange={(event) =>
                            updateQty(line.ingredient_id, event.target.value)
                          }
                          aria-label={`${t('recipe.qty')} · ${
                            lang === 'ar'
                              ? ingredient.name_ar
                              : ingredient.name_en
                          }`}
                          className="field h-10 w-24 tabular-nums"
                        />
                        <span className="w-10 text-[12px] text-ink-2">
                          {unitLabel}
                        </span>
                      </div>
                      <span className="w-24 text-end text-[14px] font-semibold tabular-nums text-ink">
                        {formatCurrency(
                          lang,
                          ingredient.unit_cost * line.qty,
                          currency,
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(line.ingredient_id)}
                        aria-label={t('recipe.remove')}
                        className="icon-btn h-9 w-9 text-[color:var(--danger)]"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-bold tracking-tight text-ink">
                {t('recipe.add')}
              </h2>
              <Link
                to="/inventory"
                className="text-[13px] font-medium text-[color:var(--accent)] hover:opacity-80"
              >
                {t('recipe.manage')}
              </Link>
            </div>

            <label className="relative flex items-center">
              <Search
                size={16}
                className="pointer-events-none absolute start-3 text-ink-2"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('recipe.search')}
                aria-label={t('recipe.search')}
                className="field ps-9"
              />
            </label>

            {catalogForPicker.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-2">
                {ingredients.length === 0
                  ? t('recipe.noIngredientsCatalog')
                  : t('recipe.noIngredients')}
              </p>
            ) : (
              <div className="mt-2 divide-y divide-line">
                {catalogForPicker.map((ingredient) => (
                  <div
                    key={ingredient.id}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">
                        {lang === 'ar'
                          ? ingredient.name_ar
                          : ingredient.name_en}
                      </p>
                      <p className="text-[12px] tabular-nums text-ink-2">
                        {formatMoney(lang, ingredient.unit_cost, currency, 3)}{' '}
                        /{' '}
                        {t(UNIT_KEY[ingredient.unit] ?? 'inv.units.pc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addIngredient(ingredient)}
                      className="btn-quiet h-9 min-h-0 gap-1.5 px-3 text-[13px]"
                    >
                      <Plus size={15} />
                      {t('recipe.add')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside>
          <div className="card p-5 lg:sticky lg:top-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
              {t('recipe.totalCost')}
            </p>
            <p className="mt-1 text-[32px] font-bold tabular-nums tracking-tight text-ink">
              {formatCurrency(lang, totals.cost, currency)}
            </p>

            <dl className="mt-4 flex flex-col gap-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-2">{t('recipe.price')}</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {formatCurrency(lang, totals.price, currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-2">{t('recipe.margin')}</dt>
                <dd
                  className="font-semibold tabular-nums"
                  style={{
                    color:
                      totals.margin >= 0 ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {formatCurrency(lang, totals.margin, currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-2">{t('recipe.foodCost')}</dt>
                <dd
                  className="font-semibold tabular-nums"
                  style={{ color: foodTone }}
                >
                  {formatNumber(lang, totals.foodCost, 1)}%
                </dd>
              </div>
            </dl>

            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (totals.foodCost / 60) * 100)}%`,
                    background: foodTone,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[12px] text-ink-2">{t('recipe.target')}</p>
            </div>

            {saveError ? (
              <p className="mt-3 text-[13px] font-medium text-[color:var(--danger)]">
                {t('menu.invalid')}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="btn-primary mt-4 w-full"
            >
              {saved ? (
                <>
                  <Check size={17} />
                  {t('recipe.saved')}
                </>
              ) : saving ? (
                t('menu.saving')
              ) : (
                t('recipe.save')
              )}
            </button>
            {dirty && !saving ? (
              <p className="mt-2 text-center text-[12px] text-ink-2">
                {t('recipe.unsaved')}
              </p>
            ) : null}

            <Link
              to="/inventory"
              className="btn-quiet mt-2 w-full text-[13px]"
            >
              {t('recipe.manage')}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
