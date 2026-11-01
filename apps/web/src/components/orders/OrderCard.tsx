import { CheckCheck, ChefHat, X } from 'lucide-react';
import type { Order } from '../../lib/api';
import { formatClock, formatCurrency } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { CHANNEL_KEY, PAYMENT_KEY } from '../../lib/orders';

type Props = {
  order: Order;
  currency: string;
  busy?: boolean;
  onOpen: () => void;
  onAdvance?: () => void;
  onCancel?: () => void;
};

export default function OrderCard({
  order,
  currency,
  busy,
  onOpen,
  onAdvance,
  onCancel,
}: Props) {
  const { t, lang } = useLang();

  const summary = order.items
    .map(
      (item) =>
        `${item.qty}× ${lang === 'ar' ? item.name_ar : item.name_en}`,
    )
    .join(' · ');

  return (
    <article className="card flex flex-col gap-3 p-3.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col gap-2 text-start"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-ink">
            #{order.number}
          </span>
          <span className="text-[12px] tabular-nums text-ink-2">
            {formatClock(lang, order.placed_at)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="chip bg-surface-2 text-ink-2">
            {t(CHANNEL_KEY[order.channel])}
          </span>
          {order.table_no ? (
            <span className="chip bg-surface-2 text-ink-2">
              {t('pos.table')} {order.table_no}
            </span>
          ) : null}
          {order.customer_name ? (
            <span className="chip bg-surface-2 text-ink-2">
              {order.customer_name}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 truncate text-[13px] text-ink-2">
          {summary}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink-2">
            {t('orders.itemsCount', { count: order.item_count })}
          </span>
          <span className="text-[15px] font-bold tabular-nums text-ink">
            {formatCurrency(lang, order.total, currency)}
          </span>
        </span>
      </button>

      {order.payment_method ? (
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
          {t('orders.payment')} · {t(PAYMENT_KEY[order.payment_method])}
        </p>
      ) : (
        <p
          className="text-[12px] font-medium"
          style={{ color: 'var(--warning)' }}
        >
          {t('orders.unpaid')}
        </p>
      )}

      {onAdvance || onCancel ? (
        <div className="flex items-center gap-2 border-t border-line pt-2.5">
          {onAdvance ? (
            <button
              type="button"
              onClick={onAdvance}
              disabled={busy}
              className="btn-primary h-9 min-h-0 flex-1 gap-1.5 px-3 text-[13px] disabled:opacity-50"
            >
              {order.status === 'new' ? (
                <ChefHat size={15} />
              ) : (
                <CheckCheck size={15} />
              )}
              {order.status === 'new' ? t('orders.start') : t('orders.serve')}
            </button>
          ) : null}
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="btn-quiet h-9 min-h-0 gap-1.5 px-3 text-[13px] disabled:opacity-50"
            >
              <X size={15} />
              {t('orders.cancel')}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
