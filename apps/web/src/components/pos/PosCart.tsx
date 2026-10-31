import { Minus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type {
  MenuProduct,
  OrderChannel,
  OrderInput,
  PaymentMethod,
} from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import { useLang } from '../../lib/i18n';

export type CartLine = { product: MenuProduct; qty: number };

type Props = {
  lines: CartLine[];
  currency: string;
  taxRate: number;
  tableCount: number;
  onChangeQty: (productId: number, delta: number) => void;
  onClear: () => void;
  onSubmit: (input: Omit<OrderInput, 'items'>) => Promise<unknown>;
};

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-3 gap-1 rounded-field bg-surface-2 p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className="h-9 rounded-[9px] text-[13px] font-semibold transition-colors duration-150"
            style={
              selected
                ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                : { color: 'var(--text-2)' }
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function PosCart({
  lines,
  currency,
  taxRate,
  tableCount,
  onChangeQty,
  onClear,
  onSubmit,
}: Props) {
  const { t, lang } = useLang();
  const [channel, setChannel] = useState<OrderChannel>('dine_in');
  const [tableNo, setTableNo] = useState('');
  const [customer, setCustomer] = useState('');
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = lines.reduce(
    (sum, line) => sum + line.product.price * line.qty,
    0,
  );
  const tax = (subtotal * taxRate) / 100;
  const total = subtotal + tax;

  const handleSubmit = async () => {
    if (lines.length === 0) return;
    if (!payment) {
      setError(t('pos.needPayment'));
      return;
    }
    if (channel === 'dine_in' && !tableNo) {
      setError(t('pos.needTable'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        channel,
        table_no: channel === 'dine_in' ? Number(tableNo) : null,
        customer_name: customer.trim(),
        payment_method: payment,
      });
      setTableNo('');
      setCustomer('');
      setPayment(null);
    } catch {
      setError(t('pos.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="card flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-semibold text-ink">{t('pos.cart')}</h2>
        {lines.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            {t('pos.clear')}
          </button>
        ) : null}
      </div>

      <div className="min-h-[88px] flex-1 overflow-y-auto px-4">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-2 py-6 text-center">
            <p className="text-[14px] font-semibold text-ink">
              {t('pos.emptyCart')}
            </p>
            <p className="text-[13px] text-ink-2">{t('pos.emptyCartHint')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map(({ product, qty }) => {
              const name = lang === 'ar' ? product.name_ar : product.name_en;
              return (
                <li key={product.id} className="flex items-center gap-2 py-2.5">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[17px]"
                  >
                    {product.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {name}
                    </p>
                    <p className="text-[12px] tabular-nums text-ink-2">
                      {formatCurrency(lang, product.price * qty, currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onChangeQty(product.id, -1)}
                      aria-label={`${name} · ${t('pos.remove')}`}
                      className="icon-btn h-8 w-8"
                    >
                      {qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                    </button>
                    <span className="w-5 text-center text-[13px] font-semibold tabular-nums text-ink">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChangeQty(product.id, 1)}
                      aria-label={`${name} · +1`}
                      className="icon-btn h-8 w-8"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] font-semibold text-ink-2">
            {t('pos.channel')}
          </p>
          <Segmented
            label={t('pos.channel')}
            value={channel}
            onChange={(value) => setChannel(value as OrderChannel)}
            options={[
              { value: 'dine_in', label: t('pos.dineIn') },
              { value: 'takeaway', label: t('pos.takeaway') },
              { value: 'delivery', label: t('pos.delivery') },
            ]}
          />
        </div>

        {channel === 'dine_in' ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink-2">
              {t('pos.table')}
            </span>
            <select
              value={tableNo}
              onChange={(event) => setTableNo(event.target.value)}
              className="field"
              aria-label={t('pos.table')}
            >
              <option value="">{t('pos.chooseTable')}</option>
              {Array.from({ length: tableCount }, (_, index) => index + 1).map(
                (number) => (
                  <option key={number} value={number}>
                    {t('pos.table')} {number}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink-2">
              {t('pos.customer')}
            </span>
            <input
              type="text"
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              placeholder={t('pos.customerPlaceholder')}
              className="field"
            />
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] font-semibold text-ink-2">
            {t('pos.payment')}
          </p>
          <Segmented
            label={t('pos.payment')}
            value={payment ?? ''}
            onChange={(value) => setPayment(value as PaymentMethod)}
            options={[
              { value: 'cash', label: t('pos.cash') },
              { value: 'card', label: t('pos.card') },
              { value: 'wallet', label: t('pos.wallet') },
            ]}
          />
        </div>

        <dl className="flex flex-col gap-1 text-[13px]">
          <div className="flex items-center justify-between">
            <dt className="text-ink-2">{t('pos.subtotal')}</dt>
            <dd className="tabular-nums text-ink">
              {formatCurrency(lang, subtotal, currency)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-2">
              {t('pos.tax', { rate: taxRate })}
            </dt>
            <dd className="tabular-nums text-ink">
              {formatCurrency(lang, tax, currency)}
            </dd>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2 text-[15px] font-bold text-ink">
            <dt>{t('pos.total')}</dt>
            <dd className="tabular-nums">
              {formatCurrency(lang, total, currency)}
            </dd>
          </div>
        </dl>

        {error ? (
          <p className="text-[13px] font-medium" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={lines.length === 0 || submitting}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t('pos.placing') : t('pos.place')}
        </button>
      </div>
    </aside>
  );
}
