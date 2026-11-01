import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import AttendanceBoard from '../components/attendance/AttendanceBoard';
import AttendancePunch from '../components/attendance/AttendancePunch';
import LateRuleBar from '../components/attendance/LateRuleBar';
import { api, type AttendanceDay, type AttendanceMember } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDayLong, formatDuration, formatNumber } from '../lib/format';
import { useLang } from '../lib/i18n';
import { canManageStore, canSupervise } from '../lib/roles';

/** Today as the date input and the API read it, in the reader's own timezone. */
function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Move the day by one, keeping it a plain YYYY-MM-DD. */
function shiftDay(iso: string, direction: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const base = new Date(year, month - 1, day);
  base.setDate(base.getDate() + direction);
  const nextMonth = `${base.getMonth() + 1}`.padStart(2, '0');
  const nextDay = `${base.getDate()}`.padStart(2, '0');
  return `${base.getFullYear()}-${nextMonth}-${nextDay}`;
}

export default function AttendancePage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const supervises = canSupervise(user?.role);
  const manages = canManageStore(user?.role);

  const [anchor, setAnchor] = useState(todayIso);
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | 'me' | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .attendance(anchor)
      .then((result) => {
        if (!cancelled) setDay(result);
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
  }, [anchor, nonce]);

  const punch = (staffId: number | undefined, next: 'in' | 'out') => {
    setBusyId(staffId ?? 'me');
    setNotice(null);
    const body = staffId ? { staff_id: staffId } : {};
    const call = next === 'in' ? api.checkIn(body) : api.checkOut(body);
    call
      .then(setDay)
      .catch(() => setNotice(t('attendance.failed')))
      .finally(() => setBusyId(null));
  };

  const me = day?.is_today ? day.me : null;
  const showTeam = !supervises && day?.is_today;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('attendance.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {t('attendance.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t('attendance.prev')}
            onClick={() => setAnchor(shiftDay(anchor, -1))}
            className="icon-btn h-10 w-10"
          >
            {lang === 'ar' ? (
              <ChevronRight size={17} />
            ) : (
              <ChevronLeft size={17} />
            )}
          </button>
          <input
            type="date"
            className="field h-10 w-[150px]"
            aria-label={t('attendance.title')}
            value={anchor}
            onChange={(event) => {
              if (event.target.value) setAnchor(event.target.value);
            }}
          />
          <button
            type="button"
            aria-label={t('attendance.next')}
            onClick={() => setAnchor(shiftDay(anchor, 1))}
            className="icon-btn h-10 w-10"
          >
            {lang === 'ar' ? (
              <ChevronLeft size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
          </button>
          {anchor === todayIso() ? null : (
            <button
              type="button"
              onClick={() => setAnchor(todayIso())}
              className="btn-quiet h-10 min-h-0 px-3 text-[13px]"
            >
              {t('attendance.today')}
            </button>
          )}
        </div>
      </div>

      <p className="text-[13px] font-medium text-ink-2">
        {formatDayLong(lang, anchor)}
      </p>

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-16 rounded-field" />
          <div className="skeleton mt-2 h-44 rounded-field" />
        </div>
      ) : error || !day ? (
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
      ) : (
        <>
          {me ? (
            <AttendancePunch
              me={me}
              busy={busyId === 'me'}
              onPunch={(next) => punch(undefined, next)}
            />
          ) : day.is_today ? (
            <p className="rounded-field border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
              {t('attendance.ownerNote')}
            </p>
          ) : (
            <p className="rounded-field border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
              {t('attendance.pastDay')}
            </p>
          )}

          <section className="card grid grid-cols-3">
            <div className="px-4 py-4">
              <p className="text-[12px] font-medium text-ink-2">
                {t('attendance.onShiftNow')}
              </p>
              <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight text-ink">
                {formatNumber(lang, day.summary.on_shift)}
              </p>
            </div>
            <div className="border-s border-line px-4 py-4">
              <p className="text-[12px] font-medium text-ink-2">
                {t('attendance.checkedIn')}
              </p>
              <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight text-ink">
                {formatNumber(lang, day.summary.checked_in)}
              </p>
            </div>
            <div className="border-s border-line px-4 py-4">
              <p className="text-[12px] font-medium text-ink-2">
                {t('attendance.hours')}
              </p>
              <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight text-ink">
                {formatDuration(lang, day.summary.minutes)}
              </p>
            </div>
          </section>

          <LateRuleBar day={day} canEdit={manages} />

          {notice ? (
            <p
              role="alert"
              className="rounded-field border border-line px-4 py-3 text-[13px] font-medium"
              style={{ color: 'var(--danger)' }}
            >
              {notice}
            </p>
          ) : null}

          {day.members.length === 0 ? (
            <div className="card flex flex-col items-start gap-2 p-6">
              <p className="text-[15px] font-semibold text-ink">
                {t('attendance.empty')}
              </p>
              <p className="text-[13px] text-ink-2">
                {t('attendance.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">
                  {t('attendance.team')}
                </h2>
                {showTeam ? (
                  <p className="text-[12px] text-ink-2">
                    {t('attendance.selfOnly')}
                  </p>
                ) : null}
              </div>
              <AttendanceBoard
                day={day}
                busyId={typeof busyId === 'number' ? busyId : null}
                canPunch={(member) =>
                  day.is_today && supervises && member.id !== user?.id
                }
                onPunch={(member: AttendanceMember, next) =>
                  punch(member.id, next)
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
