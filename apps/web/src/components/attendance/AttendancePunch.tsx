import { LogIn, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AttendanceMember } from '../../lib/api';
import { formatClock, formatDuration } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { ROLE_LABEL_KEY, ROLE_TONE } from '../../lib/roles';

type Props = {
  me: AttendanceMember;
  busy: boolean;
  onPunch: (next: 'in' | 'out') => void;
};

/** The signed-in member's own clock: one big target, in or out. */
export default function AttendancePunch({ me, busy, onPunch }: Props) {
  const { t, lang } = useLang();
  const onShift = me.status === 'in';
  const [now, setNow] = useState(() => Date.now());

  // A quiet tick keeps an open shift's duration honest without a refetch.
  useEffect(() => {
    if (!onShift) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [onShift, me.open_since]);

  const openMinutes = me.open_since
    ? Math.max(0, Math.floor((now - new Date(me.open_since).getTime()) / 60_000))
    : 0;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-[19px] font-bold"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {me.name.trim().charAt(0)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-ink">
            {me.name}
          </p>
          <p
            className="mt-0.5 text-[12px] font-semibold"
            style={{ color: ROLE_TONE[me.role] }}
          >
            {t(ROLE_LABEL_KEY[me.role])}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] tabular-nums text-ink-2">
            {onShift && me.open_since ? (
              <>
                <span>
                  {t('attendance.since', {
                    time: formatClock(lang, me.open_since),
                  })}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-ink">
                  {formatDuration(lang, openMinutes)}
                </span>
              </>
            ) : me.checked_in_at ? (
              <>
                <span>
                  {t('attendance.in')}{' '}
                  {formatClock(lang, me.checked_in_at)}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {t('attendance.out')}{' '}
                  {me.checked_out_at ? formatClock(lang, me.checked_out_at) : '—'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-ink">
                  {formatDuration(lang, me.minutes)}
                </span>
              </>
            ) : (
              <span>{t('attendance.notIn')}</span>
            )}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => onPunch(onShift ? 'out' : 'in')}
          className={`${onShift ? 'btn-quiet' : 'btn-primary'} h-14 w-full px-6 text-[16px] sm:w-auto`}
        >
          {onShift ? (
            <LogOut size={19} strokeWidth={1.8} />
          ) : (
            <LogIn size={19} strokeWidth={1.8} />
          )}
          {busy
            ? t('attendance.working')
            : t(onShift ? 'attendance.checkOut' : 'attendance.checkIn')}
        </button>
      </div>
    </section>
  );
}
