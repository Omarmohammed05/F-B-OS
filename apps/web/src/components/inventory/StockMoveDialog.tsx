import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type Ingredient,
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

type Mode = 'purchase' | 'waste';

export default function StockMoveDialog({
  open,
  ingredient,
  onClose,
  onSaved,
}: Props) {
  const { t } = useLang();
  const [mode, setMode] = useState<Mode>('purchase');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('purchase');
    setQty('');
    setNote('');
    setSaving(false);
    setError(null);
  }, [open, ingredient]);

  const unitLabel = ingredient ? t(`inv.units.${ingredient.unit}`) : '';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ingredient) return;
    const amount = Number(qty);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('form.amount'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await api.addStockMovement(ingredient.id, {
        qty: amount,
        reason: mode,
        note: note.trim(),
      });
      onSaved(data);
      onClose();
    } catch {
      setError(t('inv.moveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={t('inv.stockMove')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-quiet">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="stock-move-form"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? t('menu.saving') : t('inv.record')}
          </button>
        </>
      }
    >
      <form
        id="stock-move-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        <p className="text-[14px] text-ink-2">
          {ingredient
            ? `${t('inv.onHandNow')}: ${ingredient.stock_qty} ${unitLabel}`
            : ''}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {(['purchase', 'waste'] as Mode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className={
                mode === option
                  ? 'btn-primary h-11 min-h-0 px-3 text-[14px]'
                  : 'btn-quiet h-11 min-h-0 justify-center px-3 text-[14px]'
              }
            >
              {option === 'purchase' ? t('inv.purchase') : t('inv.waste')}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('inv.moveQty')} ({unitLabel})
          </span>
          <input
            className="field tabular-nums"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            dir="ltr"
            name="qty"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('inv.moveNote')}
          </span>
          <input
            className="field"
            name="note"
            value={note}
            maxLength={120}
            onChange={(event) => setNote(event.target.value)}
            placeholder={mode === 'purchase' ? t('inv.purchaseHint') : t('inv.wasteHint')}
          />
        </label>

        {error ? (
          <p className="text-[13px] font-medium text-[color:var(--danger)]">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
