import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type Customer, type Order } from '../../lib/api';
import { formatClock, formatCurrency, formatDayShort, formatNumber } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';
import StatusChip from '../StatusChip';

type Props = {
  customer: Customer | null;
  currency: string;
  onClose: () => void;
  onEdit: () => void;
};

export default function CustomerSheet({
  customer,
  currency,
  onClose,
  onEdit,
}: Props) {
  const { t, lang } = useLang();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api
      .customer(customer.id)
      .then((result) => {
        if (!cancelled) setOrders(result.orders);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  if (!customer) return null;

  return (
    <Sheet
      open
      title={customer.name}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onEdit}
            className="btn-quiet h-11 min-h-0 gap-1.5 px-4 text-[14px]"
          >
            <Pencil size={15} />
            {t('crm.edit')}
          </button>
          <button type="button" onClick={onClose} className="btn-primary">
            {t('common.close')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: t('crm.visits'), value: formatNumber(lang, customer.visits) },
            {
              label: t('crm.spend'),
              value: formatCurrency(lang, customer.spend, currency),
            },
            {
              label: t('crm.lastVisit'),
              value: customer.last_visit
                ? formatDayShort(lang, customer.last_visit)
                : '—',
            },
          ].map((cell) => (
            <div key={cell.label} className="rounded-field bg-surface-2 px-2 py-2.5">
              <p className="text-[11px] font-medium text-ink-2">{cell.label}</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink">
                {cell.value}
              </p>
            </div>
          ))}
        </div>

        {customer.phone || customer.email ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
            {customer.phone ? (
              <span dir="ltr" className="tabular-nums">
                {customer.phone}
              </span>
            ) : null}
            {customer.email ? <span dir="ltr">{customer.email}</span> : null}
          </div>
        ) : null}

        {customer.notes ? (
          <p className="rounded-field bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            {customer.notes}
          </p>
        ) : null}

        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">
            {t('crm.history')}
          </h3>
          {loading ? (
            <div className="skeleton h-20 rounded-field" />
          ) : failed ? (
            <p className="text-[13px] text-[color:var(--danger)]">
              {t('common.error')}
            </p>
          ) : orders.length === 0 ? (
            <p className="text-[13px] text-ink-2">{t('crm.noOrders')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-ink">
                      #{order.number}
                      <span className="ms-2 text-[12px] font-normal text-ink-2">
                        {order.placed_at
                          ? `${formatDayShort(lang, order.placed_at)} · ${formatClock(
                              lang,
                              order.placed_at,
                            )}`
                          : ''}
                      </span>
                    </p>
                    <p className="truncate text-[12px] text-ink-2">
                      {t('orders.itemsCount', { count: order.item_count })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip status={order.status} />
                    <span className="tabular-nums text-[14px] font-semibold text-ink">
                      {formatCurrency(lang, order.total, currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
