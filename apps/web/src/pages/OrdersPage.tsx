import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import OrderCard from '../components/orders/OrderCard';
import OrderDetailSheet from '../components/orders/OrderDetailSheet';
import { api, type Order, type OrderStatus } from '../lib/api';
import { formatCurrency, formatNumber } from '../lib/format';
import { useLang, type TranslationKey } from '../lib/i18n';
import { useAppData } from '../lib/store';

const COLUMNS: { status: OrderStatus; labelKey: TranslationKey }[] = [
  { status: 'new', labelKey: 'orders.column.new' },
  { status: 'preparing', labelKey: 'orders.column.preparing' },
  { status: 'served', labelKey: 'orders.column.served' },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[12px] font-medium text-ink-2">{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}

export default function OrdersPage() {
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const { t, lang } = useLang();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .orders()
      .then((result) => {
        if (!cancelled) setOrders(result.orders);
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

  // A board that stays honest while the counter keeps selling.
  useEffect(() => {
    const timer = window.setInterval(() => {
      api
        .orders()
        .then((result) => setOrders(result.orders))
        .catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  const changeStatus = (order: Order, status: OrderStatus) => {
    setBusyId(order.id);
    setActionError(false);
    api
      .updateOrder(order.id, status)
      .then((updated) => {
        setOrders((current) =>
          current.map((row) => (row.id === updated.id ? updated : row)),
        );
      })
      .catch(() => setActionError(true))
      .finally(() => setBusyId(null));
  };

  const open = orders.filter(
    (order) => order.status === 'new' || order.status === 'preparing',
  ).length;
  const served = orders.filter((order) => order.status === 'served');
  const sales = served.reduce((sum, order) => sum + order.total, 0);
  const cancelled = orders.filter((order) => order.status === 'cancelled');
  const selected = orders.find((order) => order.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-9 w-48 rounded-[10px]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="skeleton h-[74px] rounded-card" />
          <div className="skeleton h-[74px] rounded-card" />
          <div className="skeleton h-[74px] rounded-card" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="skeleton h-[220px] rounded-card" />
          <div className="skeleton h-[220px] rounded-card" />
          <div className="skeleton h-[220px] rounded-card" />
        </div>
      </div>
    );
  }

  if (error) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('orders.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('orders.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setNonce((value) => value + 1)}
          className="btn-quiet h-11 min-h-0 gap-1.5 px-4 text-[14px]"
        >
          <RefreshCw size={16} />
          {t('orders.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label={t('orders.openTickets')}
          value={formatNumber(lang, open)}
        />
        <Stat
          label={t('orders.servedToday')}
          value={formatNumber(lang, served.length)}
        />
        <Stat
          label={t('orders.salesToday')}
          value={formatCurrency(lang, sales, currency)}
        />
      </div>

      {actionError ? (
        <p className="text-[13px] font-medium" style={{ color: 'var(--danger)' }}>
          {t('orders.failed')}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => {
          const rows = orders.filter((order) => order.status === column.status);
          return (
            <section key={column.status} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2 px-1">
                <h2 className="text-[14px] font-semibold text-ink">
                  {t(column.labelKey)}
                </h2>
                <span className="chip bg-surface-2 tabular-nums text-ink-2">
                  {formatNumber(lang, rows.length)}
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="rounded-card border border-dashed border-line px-3 py-6 text-center text-[13px] text-ink-2">
                  {t('orders.empty')}
                </p>
              ) : (
                rows.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    currency={currency}
                    busy={busyId === order.id}
                    onOpen={() => setSelectedId(order.id)}
                    onAdvance={
                      order.status === 'new' || order.status === 'preparing'
                        ? () =>
                            changeStatus(
                              order,
                              order.status === 'new' ? 'preparing' : 'served',
                            )
                        : undefined
                    }
                    onCancel={
                      order.status === 'new' || order.status === 'preparing'
                        ? () => changeStatus(order, 'cancelled')
                        : undefined
                    }
                  />
                ))
              )}
            </section>
          );
        })}
      </div>

      {cancelled.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[14px] font-semibold text-ink">
            {t('orders.cancelled')}
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {cancelled.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                currency={currency}
                onOpen={() => setSelectedId(order.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <OrderDetailSheet
        order={selected}
        currency={currency}
        busy={selected ? busyId === selected.id : false}
        onClose={() => setSelectedId(null)}
        onAdvance={() => {
          if (!selected) return;
          changeStatus(
            selected,
            selected.status === 'new' ? 'preparing' : 'served',
          );
        }}
        onCancel={() => {
          if (!selected) return;
          changeStatus(selected, 'cancelled');
        }}
      />
    </div>
  );
}
