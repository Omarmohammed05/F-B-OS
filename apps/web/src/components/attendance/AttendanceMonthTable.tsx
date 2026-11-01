import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  api,
  type AttendanceMonth,
  type AttendanceMonthMember,
} from '../../lib/api';
import {
  formatCurrency,
  formatDuration,
  formatMonth,
  formatNumber,
} from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { ROLE_LABEL_KEY, ROLE_TONE } from '../../lib/roles';

type Draft = { shift_start: string; grace_minutes: string };

/** This month as the API reads it, in the reader's own timezone. */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`;
}

/** Move the month by one, keeping it a plain YYYY-MM. */
function shiftMonth(month: string, direction: number) {
  const [year, index] = month.split('-').map(Number);
  const base = new Date(year, index - 1 + direction, 1);
  return `${base.getFullYear()}-${`${base.getMonth() + 1}`.padStart(2, '0')}`;
}

/** A person's own window as the two fields show it; '' means the store's. */
function draftOf(member: AttendanceMonthMember): Draft {
  return {
    shift_start: member.shift_start,
    grace_minutes:
      member.grace_minutes === null ? '' : String(member.grace_minutes),
  };
}

function draftsOf(data: AttendanceMonth) {
  return Object.fromEntries(
    data.members.map((member) => [member.id, draftOf(member)]),
  );
}

type Props = {
  /** Only an admin sets a person's shift time; everyone else reads the table. */
  canEdit: boolean;
};

/** The whole month in one table: days, hours, lateness and what it costs. */
export default function AttendanceMonthTable({ canEdit }: Props) {
  const { t, lang } = useLang();

  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<AttendanceMonth | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api
      .attendanceMonth(month)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setDrafts(draftsOf(result));
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
  }, [month, nonce]);

  const dirty = (member: AttendanceMonthMember) => {
    const draft = drafts[member.id];
    if (!draft) return false;
    const saved = draftOf(member);
    return (
      draft.shift_start !== saved.shift_start ||
      draft.grace_minutes !== saved.grace_minutes
    );
  };

  const save = (member: AttendanceMonthMember) => {
    const draft = drafts[member.id];
    if (!draft) return;
    const grace = draft.grace_minutes.trim();
    const minutes = grace === '' ? null : Number(grace);
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 180)) {
      setNotice(t('attendance.monthGraceBad'));
      return;
    }
    setBusyId(member.id);
    setNotice(null);
    api
      .updateAttendanceRule(member.id, {
        shift_start: draft.shift_start,
        grace_minutes: minutes,
        month,
      })
      .then((result) => {
        setData(result);
        setDrafts(draftsOf(result));
        setNotice(t('attendance.monthSaved', { name: member.name }));
      })
      .catch(() => setNotice(t('attendance.failed')))
      .finally(() => setBusyId(null));
  };

  const rules = data?.rules;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t('attendance.prevMonth')}
            onClick={() => setMonth((value) => shiftMonth(value, -1))}
            className="icon-btn h-10 w-10"
          >
            {lang === 'ar' ? (
              <ChevronRight size={17} />
            ) : (
              <ChevronLeft size={17} />
            )}
          </button>
          <p className="min-w-[132px] text-center text-[15px] font-semibold text-ink">
            {formatMonth(lang, month)}
          </p>
          <button
            type="button"
            aria-label={t('attendance.nextMonth')}
            onClick={() => setMonth((value) => shiftMonth(value, 1))}
            className="icon-btn h-10 w-10"
          >
            {lang === 'ar' ? (
              <ChevronLeft size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
          </button>
        </div>

        {month === thisMonth() ? null : (
          <button
            type="button"
            onClick={() => setMonth(thisMonth())}
            className="btn-quiet h-10 min-h-0 px-3 text-[13px]"
          >
            {t('attendance.thisMonth')}
          </button>
        )}
      </div>

      <p className="text-[13px] text-ink-2">{t('attendance.monthHint')}</p>

      {notice ? (
        <p
          role="status"
          className="rounded-field border border-line px-4 py-3 text-[13px] font-medium text-ink"
        >
          {notice}
        </p>
      ) : null}

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-10 rounded-field" />
          <div className="skeleton mt-2 h-40 rounded-field" />
        </div>
      ) : failed || !data || !rules ? (
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
      ) : data.members.length === 0 ? (
        <div className="card flex flex-col items-start gap-2 p-6">
          <p className="text-[15px] font-semibold text-ink">
            {t('attendance.empty')}
          </p>
          <p className="text-[13px] text-ink-2">{t('attendance.emptyHint')}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-start text-[12px] font-medium text-ink-2">
                <th className="px-3 py-3 text-start font-medium">
                  {t('attendance.monthMember')}
                </th>
                <th className="px-2 py-3 text-start font-medium">
                  {t('attendance.monthShift')}
                </th>
                <th className="px-2 py-3 text-start font-medium">
                  {t('attendance.monthGrace')}
                </th>
                <th className="px-2 py-3 text-end font-medium">
                  {t('attendance.monthDays')}
                </th>
                <th className="px-2 py-3 text-end font-medium">
                  {t('attendance.monthHours')}
                </th>
                <th className="px-2 py-3 text-end font-medium">
                  {t('attendance.monthLate')}
                </th>
                <th className="px-3 py-3 text-end font-medium">
                  {t('attendance.deductionCol')}
                </th>
                {canEdit ? <th className="w-12 px-2 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.members.map((member) => {
                const draft = drafts[member.id] ?? draftOf(member);
                const changed = dirty(member);
                const working = busyId === member.id;
                return (
                  <tr key={member.id}>
                    <td className="px-3 py-2">
                      <p className="truncate text-[14px] font-semibold text-ink">
                        {member.name}
                      </p>
                      <p
                        className="mt-0.5 text-[12px] font-semibold"
                        style={{ color: ROLE_TONE[member.role] }}
                      >
                        {t(ROLE_LABEL_KEY[member.role])}
                      </p>
                    </td>

                    <td className="px-2 py-2">
                      {canEdit ? (
                        <input
                          type="time"
                          className="field h-9 w-[104px] tabular-nums"
                          dir="ltr"
                          aria-label={t('attendance.monthShiftFor', {
                            name: member.name,
                          })}
                          value={draft.shift_start}
                          placeholder={rules.shift_start || '08:00'}
                          onChange={(event) =>
                            setDrafts((all) => ({
                              ...all,
                              [member.id]: {
                                ...draft,
                                shift_start: event.target.value,
                              },
                            }))
                          }
                        />
                      ) : (
                        <span className="tabular-nums text-ink">
                          {member.shift_start || rules.shift_start || '—'}
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-2">
                      {canEdit ? (
                        <input
                          className="field h-9 w-[76px] tabular-nums"
                          dir="ltr"
                          inputMode="numeric"
                          type="number"
                          min={0}
                          max={180}
                          aria-label={t('attendance.monthGraceFor', {
                            name: member.name,
                          })}
                          value={draft.grace_minutes}
                          placeholder={String(rules.grace_minutes)}
                          onChange={(event) =>
                            setDrafts((all) => ({
                              ...all,
                              [member.id]: {
                                ...draft,
                                grace_minutes: event.target.value,
                              },
                            }))
                          }
                        />
                      ) : (
                        <span className="tabular-nums text-ink">
                          {formatNumber(
                            lang,
                            member.grace_minutes ?? rules.grace_minutes,
                          )}
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-2 text-end tabular-nums text-ink">
                      {formatNumber(lang, member.days)}
                    </td>
                    <td className="px-2 py-2 text-end tabular-nums text-ink">
                      {member.minutes
                        ? formatDuration(lang, member.minutes)
                        : '—'}
                    </td>
                    <td
                      className="px-2 py-2 text-end tabular-nums"
                      style={{
                        color:
                          member.late_minutes > 0
                            ? 'var(--warning)'
                            : 'var(--text-2)',
                      }}
                    >
                      {member.late_minutes
                        ? t('attendance.monthLateValue', {
                            minutes: formatNumber(lang, member.late_minutes),
                            days: formatNumber(lang, member.late_days),
                          })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {member.exempt ? (
                        <span className="chip bg-surface-2 text-[11px] text-ink-2">
                          {t('attendance.monthExempt')}
                        </span>
                      ) : member.deduction > 0 ? (
                        <span className="font-semibold text-ink">
                          {formatCurrency(lang, member.deduction, rules.currency)}
                        </span>
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                    </td>

                    {canEdit ? (
                      <td className="px-2 py-2 text-end">
                        {changed ? (
                          <button
                            type="button"
                            disabled={working}
                            aria-label={t('attendance.monthSaveFor', {
                              name: member.name,
                            })}
                            onClick={() => save(member)}
                            className="icon-btn h-9 w-9"
                          >
                            <Check size={16} strokeWidth={1.8} />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-[12px] font-semibold text-ink">
                <td className="px-3 py-3">{t('attendance.monthTotal')}</td>
                <td className="px-2 py-3" />
                <td className="px-2 py-3" />
                <td className="px-2 py-3 text-end tabular-nums">
                  {formatNumber(lang, data.summary.days)}
                </td>
                <td className="px-2 py-3 text-end tabular-nums">
                  {formatDuration(lang, data.summary.minutes)}
                </td>
                <td className="px-2 py-3 text-end tabular-nums">
                  {data.summary.late_minutes
                    ? t('attendance.monthLateValue', {
                        minutes: formatNumber(
                          lang,
                          data.summary.late_minutes,
                        ),
                        days: formatNumber(lang, data.summary.late_days),
                      })
                    : '—'}
                </td>
                <td className="px-3 py-3 text-end tabular-nums">
                  {data.summary.deduction > 0
                    ? formatCurrency(
                        lang,
                        data.summary.deduction,
                        rules.currency,
                      )
                    : '—'}
                </td>
                {canEdit ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
