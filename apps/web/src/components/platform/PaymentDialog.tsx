import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type IncomeData,
  type PlatformRestaurant,
} from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  restaurants: PlatformRestaurant[];
  currency: string;
  onClose: () => void;
  onSaved: (data: IncomeData) => void;
};

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Records money the owner actually collected from one restaurant. */
export default function PaymentDialog({
  open,
  restaurants,
  currency,
  onClose,
  onSaved,
}: Props) {
  const { t, lang } = useLang();
  const [restaurantId, setRestaurantId] = useState(0);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = restaurants.find((row) => !row.is_deleted);
    setRestaurantId(first?.id ?? 0);
    setAmount(first ? String(first.software_price) : '');
    setPaidOn(today());
    setNote('');
    setSaving(false);
    setError(null);
  }, [open, restaurants]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!restaurantId) {
      setError(t('platform.pickRestaurant'));
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError(t('platform.priceInvalid'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await api.recordPayment(restaurantId, {
          amount: value,
          paid_on: paidOn || undefined,
          note: note.trim(),
        }),
      );
      onClose();
    } catch {
      setError(t('platform.paymentFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={t('platform.recordPayment')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-quiet">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="payment-form"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? t('menu.saving') : t('menu.save')}
          </button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('platform.restaurant')}
          </span>
          <select
            className="field"
            value={restaurantId}
            onChange={(event) => {
              const next = Number(event.target.value);
              setRestaurantId(next);
              const row = restaurants.find((item) => item.id === next);
              if (row && row.software_price > 0) {
                setAmount(String(row.software_price));
              }
              setError(null);
            }}
          >
            {restaurants
              .filter((row) => !row.is_deleted)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {lang === 'ar' ? row.name_ar : row.name_en}
                </option>
              ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('platform.amount')}
            </span>
            <input
              className="field tabular-nums"
              dir="ltr"
              inputMode="decimal"
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              autoFocus
            />
            {Number(amount) > 0 ? (
              <span className="mt-1 block text-[12px] text-ink-2">
                {formatCurrency(lang, Number(amount), currency)}
              </span>
            ) : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('platform.paidOn')}
            </span>
            <input
              className="field tabular-nums"
              dir="ltr"
              type="date"
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('platform.note')}
          </span>
          <input
            className="field"
            value={note}
            maxLength={160}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('platform.noteHint')}
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="text-[13px] font-medium text-[color:var(--danger)]"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
