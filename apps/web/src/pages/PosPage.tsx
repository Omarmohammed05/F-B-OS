import { CheckCircle2, CloudOff, Printer, ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PosCart, { type CartLine } from '../components/pos/PosCart';
import PosProductGrid from '../components/pos/PosProductGrid';
import PosReceipt, { type ReceiptTicket } from '../components/pos/PosReceipt';
import {
  ApiError,
  api,
  type Customer,
  type MenuProduct,
  type Order,
  type OrderInput,
  type PosCatalog,
} from '../lib/api';
import { useLang } from '../lib/i18n';
import {
  cacheKeys,
  queueOrder,
  readCache,
  saveCache,
  useSyncState,
  type PosCache,
} from '../lib/offline';
import { useAppData } from '../lib/store';

export default function PosPage() {
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const { t, lang } = useLang();
  const { online } = useSyncState();

  const [catalog, setCatalog] = useState<PosCatalog | null>(null);
  // The guest book, so the counter can pick a saved client instead of retyping.
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // The catalog came off the device because the server did not answer.
  const [cachedMenu, setCachedMenu] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [placed, setPlaced] = useState<ReceiptTicket | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([api.pos(), api.customers()])
      .then(([result, book]) => {
        if (cancelled) return;
        setCatalog(result);
        setCustomers(book.customers);
        setCachedMenu(false);
        saveCache(cacheKeys.pos, {
          catalog: result,
          customers: book.customers,
        } satisfies PosCache);
      })
      .catch(() => {
        if (cancelled) return;
        // No connection is not an empty menu: the shift carries on with the
        // catalog the device saved on its last good read.
        const cached = readCache<PosCache>(cacheKeys.pos);
        if (cached) {
          setCatalog(cached.catalog);
          setCustomers(cached.customers);
          setCachedMenu(true);
          return;
        }
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const lines = useMemo<CartLine[]>(() => {
    if (!catalog) return [];
    return Object.entries(cart)
      .map(([productId, qty]) => {
        const product = catalog.products.find(
          (item) => item.id === Number(productId),
        );
        return product ? { product, qty } : null;
      })
      .filter((line): line is CartLine => line !== null);
  }, [catalog, cart]);

  const addProduct = (product: MenuProduct) => {
    setPlaced(null);
    setCart((current) => ({
      ...current,
      [product.id]: (current[product.id] ?? 0) + 1,
    }));
  };

  const changeQty = (productId: number, delta: number) => {
    setCart((current) => {
      const next = { ...current };
      const qty = (next[productId] ?? 0) + delta;
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  };

  /** The slip as the till built it, before (or instead of) the server's answer. */
  const ticketFromCart = (
    input: Omit<OrderInput, 'items'>,
    number: string,
    pending: boolean,
  ): ReceiptTicket => {
    const subtotal = lines.reduce(
      (sum, line) => sum + line.product.price * line.qty,
      0,
    );
    const tax = (subtotal * (catalog?.tax_rate ?? 0)) / 100;
    const saved = customers.find((guest) => guest.id === input.customer_id);
    return {
      number,
      pending,
      channel: input.channel,
      table_no: input.table_no ?? null,
      payment_method: input.payment_method,
      customer_name: input.customer_name || saved?.name || '',
      items: lines.map((line) => ({
        name: lang === 'ar' ? line.product.name_ar : line.product.name_en,
        qty: line.qty,
        price: line.product.price,
      })),
      subtotal,
      tax,
      total: subtotal + tax,
      placed_at: new Date().toISOString(),
    };
  };

  const ticketFromOrder = (order: Order): ReceiptTicket => ({
    number: order.number,
    pending: false,
    channel: order.channel,
    table_no: order.table_no,
    payment_method: order.payment_method,
    customer_name: order.customer_name,
    items: order.items.map((item) => ({
      name: lang === 'ar' ? item.name_ar : item.name_en,
      qty: item.qty,
      price: item.unit_price,
    })),
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    placed_at: order.placed_at ?? new Date().toISOString(),
  });

  const submitOrder = async (input: Omit<OrderInput, 'items'>) => {
    const payload: OrderInput = {
      ...input,
      items: lines.map((line) => ({
        product_id: line.product.id,
        qty: line.qty,
      })),
    };

    if (!online) {
      // The counter takes the order anyway; the outbox replays it with an
      // idempotency key once the connection is back.
      const queued = queueOrder(payload);
      setPlaced(ticketFromCart(input, queued.number, true));
      setCart({});
      return queued;
    }

    try {
      const order = await api.createOrder(payload);
      setPlaced(ticketFromOrder(order));
    } catch (error) {
      // A refusal is the server's answer (sold out, closed table): say so.
      // A 5xx or a 401/403/429 is not a verdict on the ticket — a proxy with no
      // API behind it answers one of those — so it waits on the device instead.
      const refused =
        error instanceof ApiError &&
        error.status < 500 &&
        error.status !== 401 &&
        error.status !== 429;
      if (refused) throw error;
      // No answer at all: keep the ticket on the device instead of losing it.
      const queued = queueOrder(payload);
      setPlaced(ticketFromCart(input, queued.number, true));
      setCachedMenu(true);
    }
    setCart({});
  };

  const storeName = data
    ? lang === 'ar'
      ? data.tenant.name_ar
      : data.tenant.name_en
    : '';
  const branch = data?.branches.find((row) => row.id === data.active_id);
  const branchName = branch
    ? lang === 'ar'
      ? branch.name_ar
      : branch.name_en
    : '';

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-9 w-56 rounded-[10px]" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-3">
            <div className="skeleton h-11 rounded-field" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="skeleton h-[112px] rounded-card" />
              <div className="skeleton h-[112px] rounded-card" />
              <div className="skeleton h-[112px] rounded-card" />
            </div>
          </div>
          <div className="skeleton h-[420px] rounded-card" />
        </div>
      </div>
    );
  }

  if (error || !catalog) {
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
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
          {t('pos.title')}
        </h1>
        <p className="mt-1 text-[14px] text-ink-2">{t('pos.subtitle')}</p>
      </div>

      {cachedMenu ? (
        <div className="card flex items-start gap-2 px-4 py-3">
          <CloudOff
            size={17}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--danger)' }}
          />
          <p className="text-[13px] leading-relaxed text-ink-2">
            {t('offline.catalog')}
          </p>
        </div>
      ) : null}

      {placed ? (
        <div
          role="status"
          className="card flex flex-wrap items-center gap-3 px-4 py-3"
          style={{
            background: placed.pending
              ? 'color-mix(in srgb, var(--danger) 8%, var(--surface))'
              : 'color-mix(in srgb, var(--success) 10%, var(--surface))',
          }}
        >
          {placed.pending ? (
            <CloudOff
              size={18}
              className="shrink-0"
              style={{ color: 'var(--danger)' }}
            />
          ) : (
            <CheckCircle2
              size={18}
              className="shrink-0"
              style={{ color: 'var(--success)' }}
            />
          )}
          <p className="min-w-0 flex-1 text-[14px] font-semibold text-ink">
            {placed.pending
              ? t('offline.queued', { number: `#${placed.number}` })
              : t('pos.placed', { number: `#${placed.number}` })}
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-quiet no-print h-9 min-h-0 gap-1.5 px-3 text-[13px]"
          >
            <Printer size={15} />
            {t('receipt.print')}
          </button>
          {placed.pending ? null : (
            <Link
              to="/orders"
              className="btn-quiet no-print h-9 min-h-0 gap-1.5 px-3 text-[13px]"
            >
              <ReceiptText size={15} />
              {t('pos.viewOrders')}
            </Link>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <PosProductGrid
          catalog={catalog}
          currency={currency}
          cart={cart}
          onAdd={addProduct}
        />
        <PosCart
          lines={lines}
          currency={currency}
          taxRate={catalog.tax_rate}
          tableCount={catalog.table_count}
          customers={customers}
          onChangeQty={changeQty}
          onClear={() => setCart({})}
          onSubmit={submitOrder}
        />
      </div>

      {/* Only on paper — the screen shows the status strip above. */}
      {placed ? (
        <PosReceipt
          ticket={placed}
          storeName={storeName}
          branchName={branchName}
          currency={currency}
        />
      ) : null}
    </div>
  );
}
