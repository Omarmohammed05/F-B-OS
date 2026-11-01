import { Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type Ingredient,
  type IngredientUnit,
  type IngredientsData,
} from '../../lib/api';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  ingredient: Ingredient | null;
  onClose: () => void;
  onSaved: (data: IngredientsData) => void;
};

export default function IngredientDialog({
  open,
  ingredient,
  onClose,
  onSaved,
}: Props) {
  const { t } = useLang();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [unit, setUnit] = useState<IngredientUnit>('g');
  const [unitCost, setUnitCost] = useState('');
  const [stock, setStock] = useState('');
  const [parLevel, setParLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameAr(ingredient?.name_ar ?? '');
    setNameEn(ingredient?.name_en ?? '');
    setUnit(ingredient?.unit ?? 'g');
    setUnitCost(ingredient ? String(ingredient.unit_cost) : '');
    setStock(ingredient ? String(ingredient.stock_qty) : '');
    setParLevel(ingredient ? String(ingredient.par_level) : '');
    setSaving(false);
    setError(null);
    setConfirmDelete(false);
  }, [open, ingredient]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ar = nameAr.trim();
    const en = nameEn.trim();
    const cost = Number(unitCost);
    const quantity = stock === '' ? 0 : Number(stock);
    const par = parLevel === '' ? 0 : Number(parLevel);

    if (!ar || !en) {
      setError(t('form.required'));
      return;
    }
    if (
      !Number.isFinite(cost) ||
      cost < 0 ||
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      !Number.isFinite(par) ||
      par < 0
    ) {
      setError(t('form.amount'));
      return;
    }

    setSaving(true);
    setError(null);
    const payload = {
      name_ar: ar,
      name_en: en,
      unit,
      unit_cost: cost,
      stock_qty: quantity,
      par_level: par,
    };
    try {
      const data = ingredient
        ? await api.updateIngredient(ingredient.id, payload)
        : await api.createIngredient(payload);
      onSaved(data);
      onClose();
    } catch {
      setError(t('menu.invalid'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!ingredient) return;
    setSaving(true);
    try {
      const data = await api.deleteIngredient(ingredient.id);
      onSaved(data);
      onClose();
    } catch {
      setError(t('menu.invalid'));
    } finally {
      setSaving(false);
    }
  };

  const locked = (ingredient?.recipes_using ?? 0) > 0;

  return (
    <Sheet
      open={open}
      title={ingredient ? t('inv.edit') : t('inv.new')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          {ingredient ? (
            locked ? (
              <span
                title={t('inv.deleteBlocked')}
                className="me-auto flex items-center gap-1.5 text-[12px] text-ink-2"
              >
                <Trash2 size={14} />
                {t('inv.deleteBlocked')}
              </span>
            ) : confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="btn-quiet me-auto text-[color:var(--danger)]"
              >
                {t('menu.confirmDelete')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label={t('menu.delete')}
                className="icon-btn me-auto text-[color:var(--danger)]"
              >
                <Trash2 size={16} />
              </button>
            )
          ) : null}
          <button type="button" onClick={onClose} className="btn-quiet">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="ingredient-form"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? t('menu.saving') : t('menu.save')}
          </button>
        </>
      }
    >
      <form
        id="ingredient-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('menu.nameAr')}
            </span>
            <input
              className="field"
              dir="rtl"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('menu.nameEn')}
            </span>
            <input
              className="field"
              dir="ltr"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('inv.unit')}
            </span>
            <select
              className="field"
              value={unit}
              onChange={(event) =>
                setUnit(event.target.value as IngredientUnit)
              }
            >
              <option value="g">{t('inv.units.g')}</option>
              <option value="ml">{t('inv.units.ml')}</option>
              <option value="pc">{t('inv.units.pc')}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('inv.unitCost')}
            </span>
            <input
              className="field tabular-nums"
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              dir="ltr"
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('inv.stock')}
            </span>
            <input
              className="field tabular-nums"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              dir="ltr"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('inv.parLevel')}
            </span>
            <input
              className="field tabular-nums"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              dir="ltr"
              name="par_level"
              value={parLevel}
              onChange={(event) => setParLevel(event.target.value)}
            />
            <span className="mt-1 block text-[12px] text-ink-2">
              {t('inv.parLevelHint')}
            </span>
          </label>
        </div>

        {error ? (
          <p className="text-[13px] font-medium text-[color:var(--danger)]">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
