import { Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import StaffDialog from '../components/team/StaffDialog';
import { api, type StaffMember, type TeamData } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';
import { ROLE_LABEL_KEY, ROLE_TONE } from '../lib/roles';

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

export default function TeamPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  // Accounts are created by admins; everyone else sees the roster read-only.
  const isAdmin = user?.role === 'admin';

  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .team()
      .then((result) => {
        if (!cancelled) setTeam(result);
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
    if (!team) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return team.staff;
    return team.staff.filter((member) =>
      `${member.name} ${member.phone} ${member.role} ${member.username}`
        .toLowerCase()
        .includes(needle),
    );
  }, [team, query]);

  const applyTeam = (next: TeamData) => {
    setTeam(next);
    setError(false);
  };

  const toggleActive = (member: StaffMember) => {
    setBusyId(member.id);
    api
      .updateStaff(member.id, { is_active: !member.is_active })
      .then(applyTeam)
      .catch(() => setError(true))
      .finally(() => setBusyId(null));
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('team.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('team.subtitle')}</p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={openNew}
            className="btn-primary h-11 min-h-0 px-4 text-[14px]"
          >
            <Plus size={17} />
            {t('team.new')}
          </button>
        ) : null}
      </div>

      {team ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label={t('team.title')}
            value={formatNumber(lang, team.summary.total)}
          />
          <Stat
            label={t('team.active')}
            value={formatNumber(lang, team.summary.active)}
          />
          <Stat
            label={t('team.role.admin')}
            value={formatNumber(lang, team.summary.roles.admin)}
          />
        </div>
      ) : null}

      {!isAdmin ? (
        <p className="rounded-field border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          {t('team.adminOnly')}
        </p>
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
          placeholder={t('team.search')}
          aria-label={t('team.search')}
          className="field ps-9"
        />
      </label>

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-10 rounded-field" />
          <div className="skeleton mt-2 h-10 rounded-field" />
          <div className="skeleton mt-2 h-10 rounded-field" />
        </div>
      ) : !team ? (
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
            {team.staff.length === 0 ? t('team.empty') : t('crm.noResults')}
          </p>
          <p className="text-[13px] text-ink-2">{t('team.emptyHint')}</p>
          {team.staff.length === 0 && isAdmin ? (
            <button type="button" onClick={openNew} className="btn-primary mt-2">
              <Plus size={17} />
              {t('team.new')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('team.name')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('team.role')}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {t('team.status')}
                </th>
                <th className="w-16 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => (
                <tr
                  key={member.id}
                  className="border-t border-line align-middle"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{member.name}</p>
                    <p className="text-[12px] tabular-nums text-ink-2" dir="ltr">
                      {member.has_login ? `@${member.username}` : member.phone || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="chip"
                      style={{
                        color: ROLE_TONE[member.role],
                        background: `color-mix(in srgb, ${ROLE_TONE[member.role]} 14%, transparent)`,
                      }}
                    >
                      {t(ROLE_LABEL_KEY[member.role])}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => toggleActive(member)}
                        disabled={busyId === member.id}
                        aria-pressed={member.is_active}
                        className="inline-flex items-center gap-2 text-[13px] font-medium disabled:opacity-50"
                        style={{
                          color: member.is_active
                            ? 'var(--success)'
                            : 'var(--text-2)',
                        }}
                      >
                        <span
                          className="relative inline-block h-5 w-9 rounded-full transition-colors"
                          style={{
                            background: member.is_active
                              ? 'var(--success)'
                              : 'var(--line)',
                          }}
                        >
                          <span
                            className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                            style={{
                              insetInlineStart: member.is_active ? 18 : 2,
                            }}
                          />
                        </span>
                        {member.is_active ? t('team.active') : t('team.inactive')}
                      </button>
                    ) : (
                      <span className="text-[13px] text-ink-2">
                        {member.is_active ? t('team.active') : t('team.inactive')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(member);
                            setDialogOpen(true);
                          }}
                          aria-label={t('team.edit')}
                          className="icon-btn h-9 w-9"
                        >
                          <Pencil size={14} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && team ? (
        <p className="text-[13px] font-medium text-[color:var(--danger)]">
          {t('team.invalid')}
        </p>
      ) : null}

      <StaffDialog
        open={dialogOpen}
        member={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={applyTeam}
      />
    </div>
  );
}
