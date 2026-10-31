import { CheckCheck, ChefHat, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Order } from '../../lib/api';
import { formatClock, formatCurrency } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { CHANNEL_KEY, PAYMENT_KEY } from '../../lib/orders';
import Sheet from '../Sheet';
import StatusChip from '../StatusChip';

type Props = {
  order: Order | null;
  currency: string;
  busy?: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onCancel: () => void;
};

export default function OrderDetailSheet({
  order,
  currency,
  busy,
  onClose,
  onAdvance,
  onCancel,
}: Props) {
  const { t, lang } = useLang();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [order?.id]);

  if (!order) return null;

  const open = order.status === 'new' || order.status === 'preparing';

  const handleCancel = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onCancel();
  };

  return (
    <Sheet
      open
      title={t('orders.details')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        open ? (
          <>
            <button
              type="button"
              onClick={onAdvance}
              disabled={busy}
              className="btn-primary h-11 min-h-0 flex-1 gap-1.5 px-4 text-[14px] disabled:opacity-50"
            >
              {order.status === 'new' ? (
                <ChefHat size={16} />
              ) : (
                <CheckCheck size={16} />
              )}
              {order.status === 'new' ? t('orders.start') : t('orders.serve')}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="btn-quiet h-11 min-h-0 gap-1.5 px-4 text-[14px] disabled:opacity-50"
              style={
                confirming
                  ? {
                      color: 'var(--danger)',
                      borderColor: 'var(--danger)',
                    }
                  : undefined
              }
            >
              <X size={16} />
              {confirming ? t('orders.confirmCancel') : t('orders.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="btn-quiet h-11 min-h-0 px-4 text-[14px]"
          >
            {t('common.close')}
          </button>
        )
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[20px] font-bold tabular-nums text-ink">
          #{order.number}
        </p>
        <StatusChip status={order.status} />
      </div>
      <p className="mt-0.5 text-[12px] tabular-nums text-ink-2">
        {formatClock(lang, order.placed_at)}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-ink-2">{t('orders.channel')}</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {t(CHANNEL_KEY[order.channel])}
          </dd>
        </div>
        {order.table_no ? (
          <div>
            <dt className="text-ink-2">{t('orders.table')}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-ink">
              {order.table_no}
            </dd>
          </div>
        ) : null}
        {order.customer_name ? (
          <div>
            <dt className="text-ink-2">{t('orders.customer')}</dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {order.customer_name}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-ink-2">{t('orders.payment')}</dt>
          <dd
            className="mt-0.5 font-semibold"
            style={{
              color: order.payment_method ? 'var(--text)' : 'var(--warning)',
            }}
          >
            {order.payment_method
              ? t(PAYMENT_KEY[order.payment_method])
              : t('orders.unpaid')}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
          {t('orders.items')}
        </p>
        <ul className="mt-2 divide-y divide-line">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2.5 py-2.5 text-[13px]"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-2 text-[16px]"
              >
                {item.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">
                  {lang === 'ar' ? item.name_ar : item.name_en}
                </span>
                <span className="text-[12px] tabular-nums text-ink-2">
                  {item.qty} × {formatCurrency(lang, item.unit_price, currency)}
                </span>
              </span>
              <span className="tabular-nums font-semibold text-ink">
                {formatCurrency(lang, item.line_total, currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
        <div className="flex items-center justify-between">
          <dt className="text-ink-2">{t('pos.subtotal')}</dt>
          <dd className="tabular-nums text-ink">
            {formatCurrency(lang, order.subtotal, currency)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-ink-2">{t('orders.tax')}</dt>
          <dd className="tabular-nums text-ink">
            {formatCurrency(lang, order.tax, currency)}
          </dd>
        </div>
        <div className="mt-1 flex items-center justify-between text-[15px] font-bold text-ink">
          <dt>{t('pos.total')}</dt>
          <dd className="tabular-nums">
            {formatCurrency(lang, order.total, currency)}
          </dd>
        </div>
      </dl>

      {order.note ? (
        <p className="mt-3 rounded-field bg-surface-2 px-3 py-2 text-[13px] text-ink">
          <span className="font-semibold text-ink-2">{t('orders.note')}: </span>
          {order.note}
        </p>
      ) : null}
    </Sheet>
  );
}
