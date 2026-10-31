import { CheckCircle2, ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PosCart, { type CartLine } from '../components/pos/PosCart';
import PosProductGrid from '../components/pos/PosProductGrid';
import {
  api,
  type MenuProduct,
  type Order,
  type OrderInput,
  type PosCatalog,
} from '../lib/api';
import { useLang } from '../lib/i18n';
import { useAppData } from '../lib/store';

export default function PosPage() {
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const { t } = useLang();

  const [catalog, setCatalog] = useState<PosCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [placed, setPlaced] = useState<Order | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .pos()
      .then((result) => {
        if (!cancelled) setCatalog(result);
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

  const submitOrder = async (input: Omit<OrderInput, 'items'>) => {
    const order = await api.createOrder({
      ...input,
      items: lines.map((line) => ({
        product_id: line.product.id,
        qty: line.qty,
      })),
    });
    setCart({});
    setPlaced(order);
    return order;
  };

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

      {placed ? (
        <div
          role="status"
          className="card flex flex-wrap items-center gap-3 px-4 py-3"
          style={{
            background:
              'color-mix(in srgb, var(--success) 10%, var(--surface))',
          }}
        >
          <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
          <p className="min-w-0 flex-1 text-[14px] font-semibold text-ink">
            {t('pos.placed', { number: `#${placed.number}` })}
          </p>
          <Link
            to="/orders"
            className="btn-quiet h-9 min-h-0 gap-1.5 px-3 text-[13px]"
          >
            <ReceiptText size={15} />
            {t('pos.viewOrders')}
          </Link>
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
          onChangeQty={changeQty}
          onClear={() => setCart({})}
          onSubmit={submitOrder}
        />
      </div>
    </div>
  );
}
