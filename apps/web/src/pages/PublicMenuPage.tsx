import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Sheet from '../components/Sheet';
import ExploreGrid from '../components/public/ExploreGrid';
import MenuItemRow from '../components/public/MenuItemRow';
import Ornament from '../components/public/Ornament';
import TimeLeft from '../components/public/TimeLeft';
import {
  publicMenuApi,
  type PublicMenuData,
  type PublicOrderReceipt,
} from '../lib/api';
import { formatCurrency } from '../lib/format';
import { useLang } from '../lib/i18n';

/** The guest's own last ticket on this menu, so a phone that reloads finds it. */
const trackKey = (token: string) => `sufra.tracked.${token}`;

function rememberedOrder(token: string): string | null {
  try {
    return window.localStorage.getItem(trackKey(token));
  } catch {
    return null;
  }
}

function rememberOrder(token: string, number: string) {
  try {
    window.localStorage.setItem(trackKey(token), number);
  } catch {
    // A browser in private mode forgets it; the receipt still links to it.
  }
}

function forgetOrder(token: string) {
  try {
    window.localStorage.removeItem(trackKey(token));
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/**
 * What a guest sees after scanning the stand on the table.
 *
 * The page is deliberately outside the app shell: no sidebar, no session, no
 * store admin — one menu, a cart and a send button. The branch token in the URL
 * is the only credential, and the API trims the payload to what a guest may see.
 *
 * It also carries its own palette (`.guest-menu` in `index.css`): a warm
 * near-black page with a brass accent, built for a phone held at the table and
 * for the tablet propped on the counter.
 */
export default function PublicMenuPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const table = Number(params.get('table')) || 0;
  const { t, lang, setLang } = useLang();

  const [data, setData] = useState<PublicMenuData | null>(null);
  const [failed, setFailed] = useState(false);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [reviewing, setReviewing] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PublicOrderReceipt | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [tracked, setTracked] = useState<string | null>(() =>
    rememberedOrder(token),
  );
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  const sections = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    publicMenuApi
      .menu(token)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        // The guest's phone follows the store's own language until they choose.
        setLang(result.store.default_language === 'en' ? 'en' : 'ar');
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // The token is the page identity: a different one is a different menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const products = useMemo(
    () => new Map((data?.products ?? []).map((row) => [row.id, row])),
    [data],
  );

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ product: products.get(Number(id)), qty }))
        .filter((line) => line.product && line.qty > 0),
    [cart, products],
  );

  const subtotal = lines.reduce(
    (sum, line) => sum + (line.product?.price ?? 0) * line.qty,
    0,
  );
  const taxRate = data?.store.tax_rate ?? 0;
  const tax = Math.round(((subtotal * taxRate) / 100) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);

  const money = (value: number) =>
    formatCurrency(lang, value, data?.store.currency ?? 'EGP');

  /** Every section with the products the search field leaves in it. */
  const sectionsWithRows = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.categories
      .map((category) => {
        const rows = data.products.filter((product) => {
          if (product.category_id !== category.id) return false;
          if (!needle) return true;
          return (
            product.name_ar.toLowerCase().includes(needle) ||
            product.name_en.toLowerCase().includes(needle) ||
            category.name_ar.toLowerCase().includes(needle) ||
            category.name_en.toLowerCase().includes(needle)
          );
        });
        return { category, rows };
      })
      .filter((section) => section.rows.length > 0);
  }, [data, query]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        sectionsWithRows.map((section) => [
          section.category.id,
          section.rows.length,
        ]),
      ),
    [sectionsWithRows],
  );

  // The rail follows the page: whichever section crosses the top of the
  // viewport is the one its chip names.
  useEffect(() => {
    if (!data) return;
    const nodes = data.categories
      .map((category) => sections.current[category.id])
      .filter((node): node is HTMLElement => Boolean(node));
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          setActive(Number((visible.target as HTMLElement).dataset.category));
        }
      },
      { rootMargin: '-56px 0px -65% 0px', threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [data, query]);

  const jumpTo = (id: number) => {
    setActive(id);
    sections.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const add = (id: number) =>
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  const remove = (id: number) =>
    setCart((current) => {
      const next = { ...current };
      const qty = (next[id] ?? 0) - 1;
      if (qty > 0) next[id] = qty;
      else delete next[id];
      return next;
    });

  const send = async () => {
    if (!lines.length) return;
    setSending(true);
    setSendError(null);
    try {
      const order = await publicMenuApi.order(token, {
        table_no: table || null,
        guest_name: guestName.trim(),
        note: note.trim(),
        items: lines.map((line) => ({
          product_id: line.product!.id,
          qty: line.qty,
        })),
      });
      setReceipt(order);
      rememberOrder(token, order.number);
      setTracked(order.number);
      setMinutesLeft(order.eta_minutes);
      setCart({});
      setNote('');
      setReviewing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setSendError(
        message.startsWith('409')
          ? t('m.unavailable')
          : message.startsWith('429')
            ? t('m.throttled')
            : t('m.failed'),
      );
    } finally {
      setSending(false);
    }
  };

  // The ticket outlives the receipt: a guest who goes back to the menu keeps a
  // bar with the number and the minutes left, following it until the plates land.
  useEffect(() => {
    if (!token || !tracked) {
      setMinutesLeft(null);
      return;
    }
    let cancelled = false;
    const read = () =>
      publicMenuApi
        .track(token, tracked)
        .then((order) => {
          if (cancelled) return;
          if (order.status === 'served' || order.status === 'cancelled') {
            forgetOrder(token);
            setTracked(null);
            return;
          }
          setMinutesLeft(order.minutes_left);
        })
        .catch((err) => {
          if (cancelled) return;
          // Only a number this menu does not know is dropped; a flaky network
          // keeps the bar and tries again with the next tick.
          if (err instanceof Error && err.message.startsWith('404')) {
            forgetOrder(token);
            setTracked(null);
          }
        });
    read();
    const timer = window.setInterval(read, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, tracked]);

  if (failed) {
    return (
      <div className="guest-menu flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-[color:var(--accent)] opacity-80">
          <Ornament size={30} />
        </span>
        <p className="text-[17px] font-semibold text-ink">{t('m.invalid')}</p>
        <p className="text-[14px] text-ink-2">{t('m.invalidHint')}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="guest-menu min-h-screen px-4 py-6">
        <div className="skeleton mx-auto h-24 w-full max-w-[860px] rounded-card" />
        <div className="mx-auto mt-4 grid max-w-[860px] grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="skeleton aspect-square rounded-[20px]" />
          <div className="skeleton aspect-square rounded-[20px]" />
          <div className="skeleton hidden aspect-square rounded-[20px] sm:block" />
        </div>
      </div>
    );
  }

  const storeName = lang === 'ar' ? data.store.name_ar : data.store.name_en;
  const branchName = lang === 'ar' ? data.branch.name_ar : data.branch.name_en;
  const NextArrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  // A branch named after its store would print the same words twice.
  const branchLine = [
    branchName === storeName ? '' : branchName,
    data.branch.address,
  ]
    .filter(Boolean)
    .join(' · ');

  if (receipt) {
    return (
      <div className="guest-menu flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full border border-line"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Check size={30} strokeWidth={2.2} />
        </span>
        <div>
          <p className="text-[22px] font-bold text-ink">{t('m.sent')}</p>
          <p className="mt-1 text-[14px] text-ink-2">{t('m.sentHint')}</p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[color:var(--accent)]">
            <Clock size={14} />
            <TimeLeft minutes={receipt.eta_minutes} />
          </p>
        </div>
        <div className="card w-full max-w-[380px] divide-y divide-line px-4 py-3 text-[14px]">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-ink-2">{t('m.orderNumber')}</span>
            <span className="font-semibold tabular-nums text-ink">
              #{receipt.number}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-ink-2">
              {receipt.table_no ? t('m.table') : t('m.takeaway')}
            </span>
            <span className="font-semibold tabular-nums text-ink">
              {receipt.table_no ? `#${receipt.table_no}` : t('m.takeawayShort')}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-ink-2">{t('m.total')}</span>
            <span className="font-semibold tabular-nums text-[color:var(--accent)]">
              {money(receipt.total)}
            </span>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Link
            to={`/m/${token}/order/${receipt.number}`}
            className="btn-primary h-11 min-h-0 gap-1.5 rounded-full px-5 text-[14px]"
          >
            <ClipboardList size={16} />
            {t('m.track')}
          </Link>
          <button
            type="button"
            onClick={() => setReceipt(null)}
            className="btn-quiet h-11 min-h-0 gap-1.5 rounded-full px-5 text-[14px]"
          >
            <RotateCcw size={16} />
            {t('m.newOrder')}
          </button>
        </div>
      </div>
    );
  }

  const showTrack = Boolean(tracked && minutesLeft !== null);
  const Chevron = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <div
      className={`guest-menu min-h-screen text-ink ${
        showTrack && itemCount ? 'pb-44' : 'pb-28'
      }`}
    >
      <header className="relative overflow-hidden border-b border-line bg-surface">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-28 h-60 bg-[radial-gradient(ellipse_at_center,rgba(209,160,94,0.22),transparent_70%)]"
        />
        <div className="relative mx-auto w-full max-w-[860px] px-4 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="chip shrink-0 border border-line bg-surface-2 text-[11px] text-ink-2"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>

            <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <span className="text-[color:var(--accent)]">
                <Ornament size={26} />
              </span>
              <h1 className="truncate text-[20px] font-bold leading-tight text-ink sm:text-[24px]">
                {storeName}
              </h1>
              {branchLine ? (
                <p className="truncate text-[12px] text-ink-2">{branchLine}</p>
              ) : null}
            </div>

            <span className="chip shrink-0 border border-line bg-surface-2 text-[11px] text-ink-2">
              {table ? `${t('m.table')} ${table}` : t('m.takeawayShort')}
            </span>
          </div>

          <div className="relative mt-4">
            <Search
              size={16}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-2"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('m.search')}
              aria-label={t('m.search')}
              className="field rounded-full ps-9 pe-4 text-[14px]"
            />
          </div>
        </div>
      </header>

      <nav
        aria-label={t('m.footer')}
        className="sticky top-0 z-30 border-b border-line bg-[color:var(--bg)]/95 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-[860px] items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {data.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => jumpTo(category.id)}
              className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-[13px] font-semibold transition-colors ${
                active === category.id
                  ? 'text-[color:var(--accent)]'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              {lang === 'ar' ? category.name_ar : category.name_en}
              {active === category.id ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-[color:var(--accent)]"
                />
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[860px] px-4">
        {!query && data.categories.length ? (
          <section className="pt-6">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-[17px] font-bold text-ink sm:text-[20px]">
                {t('m.explore')}
              </h2>
              <span className="hidden text-[12px] text-ink-2 sm:block">
                {t('m.exploreHint')}
              </span>
            </div>
            <ExploreGrid
              categories={data.categories}
              counts={counts}
              lang={lang}
              itemsLabel={(count) => t('m.items', { count })}
              onPick={jumpTo}
            />
            {sectionsWithRows.length ? (
              <button
                type="button"
                onClick={() => jumpTo(sectionsWithRows[0].category.id)}
                className="btn-primary mt-4 w-full rounded-full"
              >
                {t('m.viewAll')}
                <NextArrow size={16} strokeWidth={2.2} />
              </button>
            ) : null}
          </section>
        ) : null}

        {sectionsWithRows.map(({ category, rows }) => (
          <section
            key={category.id}
            data-category={category.id}
            ref={(node) => {
              sections.current[category.id] = node;
            }}
            style={{ scrollMarginTop: 52 }}
            className="pt-7"
          >
            <h2 className="mb-2 flex items-center gap-2 text-[16px] font-bold text-ink sm:text-[18px]">
              <span aria-hidden className="text-[18px]">
                {category.emoji}
              </span>
              {lang === 'ar' ? category.name_ar : category.name_en}
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-2 px-2 text-[11px] font-semibold tabular-nums text-ink-2">
                {rows.length}
              </span>
            </h2>
            <div className="rounded-[20px] border border-line bg-surface px-4">
              {rows.map((product) => (
                <MenuItemRow
                  key={product.id}
                  product={product}
                  qty={cart[product.id] ?? 0}
                  lang={lang}
                  price={money(product.price)}
                  addLabel={t('m.add')}
                  removeLabel={t('m.remove')}
                  onAdd={() => add(product.id)}
                  onRemove={() => remove(product.id)}
                />
              ))}
            </div>
          </section>
        ))}

        {!sectionsWithRows.length ? (
          <p className="card mt-6 p-6 text-center text-[14px] text-ink-2">
            {query ? t('m.noResults') : t('m.emptyMenu')}
          </p>
        ) : null}

        <footer className="mt-10 flex flex-col items-center gap-1.5 border-t border-line py-8 text-center">
          <span className="text-[color:var(--accent)] opacity-80">
            <Ornament size={18} />
          </span>
          <p className="text-[13px] font-semibold text-ink">{storeName}</p>
          <p
            className={`text-[11px] text-ink-2 ${
              lang === 'ar' ? '' : 'uppercase tracking-[0.18em]'
            }`}
          >
            {t('m.footer')} · {t('m.payAtCounter')}
          </p>
        </footer>
      </main>

      {showTrack || itemCount ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[860px] flex-col gap-2">
            {showTrack ? (
              <Link
                to={`/m/${token}/order/${tracked}`}
                className="card flex items-center gap-3 rounded-full border border-line px-3 py-2"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                  }}
                >
                  <ChefHat size={16} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">
                    {t('m.orderNumber')} #{tracked}
                  </span>
                  <TimeLeft
                    minutes={minutesLeft ?? 0}
                    className="block text-[12px] tabular-nums text-ink-2"
                  />
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-[color:var(--accent)]">
                  {t('track.open')}
                  <Chevron size={14} strokeWidth={2.2} />
                </span>
              </Link>
            ) : null}

            {itemCount ? (
              <button
                type="button"
                onClick={() => setReviewing(true)}
                className="btn-primary flex w-full items-center justify-between gap-3 rounded-full px-5"
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag size={17} />
                  {t('m.review', { count: itemCount })}
                </span>
                <span className="tabular-nums">{money(total)}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Sheet
        open={reviewing}
        title={t('m.yourOrder')}
        closeLabel={t('common.close')}
        onClose={() => setReviewing(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="btn-quiet rounded-full"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending || !lines.length}
              className="btn-primary rounded-full"
            >
              {sending ? t('m.sending') : t('m.send')}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {lines.map((line) => (
            <div
              key={line.product!.id}
              className="flex items-center gap-2 border-b border-line pb-2 last:border-0"
            >
              <span className="text-[20px]" aria-hidden>
                {line.product!.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">
                  {lang === 'ar'
                    ? line.product!.name_ar
                    : line.product!.name_en}
                </p>
                <p className="text-[12px] tabular-nums text-ink-2">
                  {money(line.product!.price * line.qty)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => remove(line.product!.id)}
                  aria-label={t('m.remove')}
                  className="icon-btn h-8 w-8 rounded-full"
                >
                  <Minus size={14} />
                </button>
                <span className="w-5 text-center text-[14px] font-semibold tabular-nums">
                  {line.qty}
                </span>
                <button
                  type="button"
                  onClick={() => add(line.product!.id)}
                  aria-label={t('m.add')}
                  className="icon-btn h-8 w-8 rounded-full"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2 text-[14px]">
          <div className="flex items-center justify-between text-ink-2">
            <span>{t('m.subtotal')}</span>
            <span className="tabular-nums">{money(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-ink-2">
            <span>{t('m.tax', { rate: taxRate })}</span>
            <span className="tabular-nums">{money(tax)}</span>
          </div>
          <div className="flex items-center justify-between text-[15px] font-semibold text-ink">
            <span>{t('m.total')}</span>
            <span className="tabular-nums text-[color:var(--accent)]">
              {money(total)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <label className="text-[13px] font-medium text-ink-2" htmlFor="guest">
            {t('m.name')}
          </label>
          <input
            id="guest"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            maxLength={120}
            placeholder={t('m.nameHint')}
            className="field"
          />
          <label className="mt-1 text-[13px] font-medium text-ink-2" htmlFor="note">
            {t('m.note')}
          </label>
          <input
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={180}
            placeholder={t('m.noteHint')}
            className="field"
          />
        </div>

        {sendError ? (
          <p role="alert" className="mt-3 text-[13px] font-medium text-[color:var(--danger)]">
            {sendError}
          </p>
        ) : null}
      </Sheet>
    </div>
  );
}
