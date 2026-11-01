import { LogIn, LogOut } from 'lucide-react';
import type { AttendanceDay, AttendanceMember } from '../../lib/api';
import { formatClock, formatDuration } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { ROLE_LABEL_KEY, ROLE_TONE } from '../../lib/roles';

type Props = {
  day: AttendanceDay;
  /** False when this viewer may not punch that member (their own is above). */
  canPunch: (member: AttendanceMember) => boolean;
  busyId: number | null;
  onPunch: (member: AttendanceMember, next: 'in' | 'out') => void;
};

/** The day board: who arrived, who left, and who is still on the floor. */
export default function AttendanceBoard({
  day,
  canPunch,
  busyId,
  onPunch,
}: Props) {
  const { t, lang } = useLang();

  const label = (member: AttendanceMember) => {
    if (member.status === 'in')
      return day.is_today
        ? t('attendance.onShift')
        : t('attendance.noCheckout');
    if (member.status === 'out') return t('attendance.left');
    return t('attendance.notIn');
  };

  const tone = (member: AttendanceMember) => {
    if (member.status === 'in')
      return day.is_today ? 'var(--success)' : 'var(--warning)';
    return 'var(--text-2)';
  };

  return (
    <ul className="card divide-y divide-line">
      {day.members.map((member) => {
        const punchable = canPunch(member);
        const working = busyId === member.id;
        const color = tone(member);
        return (
          <li
            key={member.id}
            className="flex items-center gap-3 px-4 py-3"
            style={{ minHeight: 60 }}
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px] font-semibold text-ink-2"
            >
              {member.name.trim().charAt(0)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">
                {member.name}
              </p>
              <p
                className="mt-0.5 truncate text-[12px] font-semibold"
                style={{ color: ROLE_TONE[member.role] }}
              >
                {t(ROLE_LABEL_KEY[member.role])}
              </p>
            </div>

            <div className="hidden min-w-[104px] text-end text-[12px] tabular-nums text-ink-2 sm:block">
              <p>
                {t('attendance.in')}{' '}
                {member.checked_in_at
                  ? formatClock(lang, member.checked_in_at)
                  : '—'}
              </p>
              <p>
                {t('attendance.out')}{' '}
                {member.checked_out_at
                  ? formatClock(lang, member.checked_out_at)
                  : '—'}
              </p>
            </div>

            <span
              className="chip shrink-0"
              style={{
                color,
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
              }}
            >
              {label(member)}
            </span>

            <span className="hidden w-[72px] shrink-0 text-end text-[13px] font-semibold tabular-nums text-ink sm:block">
              {member.status === 'none' ? '—' : formatDuration(lang, member.minutes)}
            </span>

            {punchable ? (
              <button
                type="button"
                disabled={working}
                aria-label={t(
                  member.status === 'in'
                    ? 'attendance.tapOut'
                    : 'attendance.tapIn',
                  { name: member.name },
                )}
                onClick={() =>
                  onPunch(member, member.status === 'in' ? 'out' : 'in')
                }
                className="icon-btn h-9 w-9 shrink-0"
              >
                {member.status === 'in' ? (
                  <LogOut size={16} strokeWidth={1.8} />
                ) : (
                  <LogIn size={16} strokeWidth={1.8} />
                )}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
