import { Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import CustomerDialog from '../components/customers/CustomerDialog';
import CustomerSheet from '../components/customers/CustomerSheet';
import {
  api,
  type Customer,
  type CustomersData,
} from '../lib/api';
import { formatCurrency, formatDayShort, formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';
import { useAppData } from '../lib/store';

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

export default function CustomersPage() {
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const { t, lang } = useLang();

  const [book, setBook] = useState<CustomersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .customers()
      .then((result) => {
        if (!cancelled) setBook(result);
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

  const rows = useMemo(() => {
    if (!book) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return book.customers;
    return book.customers.filter((customer) =>
      `${customer.name} ${customer.phone} ${customer.email}`
        .toLowerCase()
        .includes(needle),
    );
  }, [book, query]);

  const applyBook = (next: CustomersData) => {
    setBook(next);
    setViewing(null);
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('crm.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('crm.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="btn-primary h-11 min-h-0 px-4 text-[14px]"
        >
          <Plus size={17} />
          {t('crm.new')}
        </button>
      </div>

      {book ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label={t('crm.summary.guests')}
            value={formatNumber(lang, book.summary.total)}
          />
          <Stat
            label={t('crm.summary.repeat')}
            value={formatNumber(lang, book.summary.repeat)}
          />
          <Stat
            label={t('crm.summary.spend')}
            value={formatCurrency(lang, book.summary.lifetime_spend, currency)}
          />
        </div>
      ) : null}

      <label className="relative flex w-full items-center sm:max-w-[320px]">
        <Search
          size={16}
          className="pointer-events-none absolute start-3 text-ink-2"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('crm.search')}
          aria-label={t('crm.search')}
          className="field ps-9"
        />
      </label>

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-10 rounded-field" />
          <div className="skeleton mt-2 h-10 rounded-field" />
          <div className="skeleton mt-2 h-10 rounded-field" />
        </div>
      ) : error || !book ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-ink">
            {t('common.error')}
          </p>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="btn-primary"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-[15px] font-semibold text-ink">
            {book.customers.length === 0 ? t('crm.empty') : t('crm.noResults')}
          </p>
          <p className="text-[13px] text-ink-2">{t('crm.emptyHint')}</p>
          {book.customers.length === 0 ? (
            <button type="button" onClick={openNew} className="btn-primary mt-2">
              <Plus size={17} />
              {t('crm.new')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[14px]">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('crm.name')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('crm.visits')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('crm.spend')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('crm.lastVisit')}
                </th>
                <th className="w-16 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-t border-line align-middle"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setViewing(customer)}
                      className="text-start font-medium text-ink hover:underline"
                    >
                      {customer.name}
                    </button>
                    <p className="text-[12px] text-ink-2" dir="ltr">
                      {customer.phone || customer.email || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink">
                    {formatNumber(lang, customer.visits)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink">
                    {formatCurrency(lang, customer.spend, currency)}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {customer.last_visit
                      ? formatDayShort(lang, customer.last_visit)
                      : t('crm.never')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => openEdit(customer)}
                        aria-label={t('crm.edit')}
                        className="icon-btn h-9 w-9"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerDialog
        open={dialogOpen}
        customer={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={applyBook}
      />

      <CustomerSheet
        customer={viewing}
        currency={currency}
        onClose={() => setViewing(null)}
        onEdit={() => {
          if (!viewing) return;
          setEditing(viewing);
          setViewing(null);
          setDialogOpen(true);
        }}
      />
    </div>
  );
}
