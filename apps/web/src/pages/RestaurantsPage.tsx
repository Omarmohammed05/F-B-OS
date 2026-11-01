import { Ban, Link2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import DeleteRestaurantDialog from '../components/platform/DeleteRestaurantDialog';
import InviteLinkDialog from '../components/platform/InviteLinkDialog';
import RestaurantDialog from '../components/platform/RestaurantDialog';
import { api, type PlatformRestaurant, type RestaurantsData } from '../lib/api';
import { formatCurrency, formatMonth, formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[12px] font-medium text-ink-2">{label}</p>
      <p className="mt-1 text-[20px] font-bold tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-ink-2">{hint}</p> : null}
    </div>
  );
}

function StatusChip({ row }: { row: PlatformRestaurant }) {
  const { t } = useLang();
  const [label, tone] = row.is_deleted
    ? ['platform.statusArchived', 'var(--text-2)']
    : row.is_blocked
      ? ['platform.statusBlocked', 'var(--warning)']
      : ['platform.statusActive', 'var(--success)'];
  return (
    <span
      className="chip"
      style={{
        color: tone,
        background: `color-mix(in srgb, ${tone} 14%, transparent)`,
      }}
    >
      {t(label as 'platform.statusActive')}
    </span>
  );
}

/**
 * The platform owner's restaurants: every customer of the software, what it
 * costs them, who runs each one, and the two switches — block and remove.
 */
export default function RestaurantsPage() {
  const { t, lang } = useLang();
  const [data, setData] = useState<RestaurantsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformRestaurant | null>(null);
  const [deleting, setDeleting] = useState<PlatformRestaurant | null>(null);
  const [invite, setInvite] = useState<{ name: string; token: string } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .restaurants()
      .then((result) => {
        if (!cancelled) setData(result);
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

  const money = (value: number) =>
    formatCurrency(lang, value, data?.currency ?? 'EGP');

  const nameOf = (row: PlatformRestaurant) =>
    lang === 'ar' ? row.name_ar : row.name_en;

  /** A create answers with the new row, so its activation link opens at once. */
  const applySaved = (next: RestaurantsData) => {
    setData(next);
    const created = next.created_id
      ? next.restaurants.find((row) => row.id === next.created_id)
      : undefined;
    if (created?.invite_token) {
      setInvite({ name: nameOf(created), token: created.invite_token });
    }
  };

  const openInvite = (row: PlatformRestaurant) => {
    if (row.invite_token) {
      setInvite({ name: nameOf(row), token: row.invite_token });
      return;
    }
    setBusyId(row.id);
    api
      .newRestaurantInvite(row.id)
      .then((next) => {
        setData(next);
        const fresh = next.restaurants.find((item) => item.id === row.id);
        if (fresh?.invite_token) {
          setInvite({ name: nameOf(row), token: fresh.invite_token });
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setBusyId(null));
  };

  const toggleBlock = (row: PlatformRestaurant) => {
    setBusyId(row.id);
    api
      .blockRestaurant(row.id, !row.is_blocked)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setBusyId(null));
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row: PlatformRestaurant) => {
    setEditing(row);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('platform.restaurantsTitle')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {t('platform.restaurantsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="btn-primary h-11 min-h-0 px-4 text-[14px]"
        >
          <Plus size={17} />
          {t('platform.newRestaurant')}
        </button>
      </div>

      {data ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat
            label={t('platform.statRestaurants')}
            value={formatNumber(lang, data.summary.total)}
            hint={t('platform.statBlocked', {
              count: formatNumber(lang, data.summary.blocked),
            })}
          />
          <Stat
            label={t('platform.statActive')}
            value={formatNumber(lang, data.summary.active)}
          />
          <Stat
            label={t('platform.statMonthlyPrice')}
            value={money(data.summary.monthly_price)}
          />
          <Stat
            label={t('platform.statIncomeMonth')}
            value={money(data.summary.income_month)}
            hint={t('platform.statMonth', {
              month: formatMonth(lang, data.month),
            })}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-12 rounded-field" />
          <div className="skeleton mt-2 h-12 rounded-field" />
          <div className="skeleton mt-2 h-12 rounded-field" />
        </div>
      ) : !data ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-ink">
            {t('platform.loadError')}
          </p>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="btn-primary"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[14px]">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('platform.restaurant')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('platform.status')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('platform.price')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('platform.thisMonth')}
                </th>
                <th className="w-28 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.restaurants.map((row) => (
                <tr key={row.id} className="border-t border-line align-middle">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{nameOf(row)}</p>
                    <p className="text-[12px] text-ink-2" dir="ltr">
                      {row.admin
                        ? `@${row.admin.username}`
                        : row.id === data.owner_tenant_id
                          ? t('platform.ownRestaurant')
                          : t('platform.invitePending')}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip row={row} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink">
                    {money(row.software_price)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="tabular-nums text-ink">
                      {money(row.income_month)}
                    </p>
                    <p className="text-[12px] tabular-nums text-ink-2">
                      {t('platform.sales', { amount: money(row.sales_month) })}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {row.admin || row.id === data.owner_tenant_id ? null : (
                        <button
                          type="button"
                          onClick={() => openInvite(row)}
                          disabled={busyId === row.id}
                          aria-label={`${t('platform.inviteOpen')} — ${nameOf(row)}`}
                          title={t('platform.inviteOpen')}
                          className="icon-btn h-9 w-9 disabled:opacity-40"
                          style={{ color: 'var(--accent)' }}
                        >
                          <Link2 size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        aria-label={`${t('platform.editRestaurant')} — ${nameOf(row)}`}
                        className="icon-btn h-9 w-9"
                      >
                        <Pencil size={14} />
                      </button>
                      {row.is_deleted ? null : (
                        <button
                          type="button"
                          onClick={() => toggleBlock(row)}
                          disabled={
                            busyId === row.id ||
                            row.id === data.owner_tenant_id
                          }
                          title={
                            row.id === data.owner_tenant_id
                              ? t('platform.ownRestaurantHint')
                              : undefined
                          }
                          aria-label={`${
                            row.is_blocked
                              ? t('platform.unblock')
                              : t('platform.block')
                          } — ${nameOf(row)}`}
                          className="icon-btn h-9 w-9 disabled:opacity-40"
                          style={{
                            color: row.is_blocked
                              ? 'var(--success)'
                              : 'var(--warning)',
                          }}
                        >
                          {row.is_blocked ? (
                            <ShieldCheck size={15} />
                          ) : (
                            <Ban size={15} />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleting(row)}
                        disabled={row.id === data.owner_tenant_id}
                        aria-label={`${t('platform.delete')} — ${nameOf(row)}`}
                        title={
                          row.id === data.owner_tenant_id
                            ? t('platform.ownRestaurantHint')
                            : undefined
                        }
                        className="icon-btn h-9 w-9 text-[color:var(--danger)] disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && data ? (
        <p className="text-[13px] font-medium text-[color:var(--danger)]">
          {t('team.invalid')}
        </p>
      ) : null}

      <RestaurantDialog
        open={dialogOpen}
        restaurant={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={applySaved}
      />

      <DeleteRestaurantDialog
        open={deleting !== null}
        restaurant={deleting}
        onClose={() => setDeleting(null)}
        onDone={setData}
      />

      <InviteLinkDialog
        open={invite !== null}
        restaurant={invite?.name ?? ''}
        token={invite?.token ?? ''}
        onClose={() => setInvite(null)}
      />
    </div>
  );
}
