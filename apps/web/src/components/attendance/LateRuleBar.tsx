import { Link } from 'react-router-dom';
import type { AttendanceDay } from '../../lib/api';
import { formatCurrency, formatNumber } from '../../lib/format';
import { useLang } from '../../lib/i18n';

type Props = {
  day: AttendanceDay;
  /** Only an admin can change the shift start, so only they get the link. */
  canEdit: boolean;
};

/** The store's lateness rule and what it costs the day, above the board. */
export default function LateRuleBar({ day, canEdit }: Props) {
  const { t, lang } = useLang();
  const rules = day.rules;

  if (!rules.shift_start) {
    if (!canEdit) return null;
    return (
      <section className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <p className="text-[13px] text-ink-2">{t('attendance.noRule')}</p>
        <Link to="/settings" className="btn-quiet h-9 min-h-0 px-3 text-[13px]">
          {t('attendance.setRule')}
        </Link>
      </section>
    );
  }

  const amount = formatCurrency(lang, rules.deduction_per_minute, rules.currency);

  return (
    <section className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">
          {t('attendance.rule', {
            time: rules.shift_start,
            grace: formatNumber(lang, rules.grace_minutes),
          })}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-2">
          {t('attendance.ruleRate', { amount })}
        </p>
      </div>

      <div className="text-end">
        <p className="text-[12px] font-medium text-ink-2">
          {t('attendance.lateToday')}
        </p>
        <p className="mt-0.5 text-[16px] font-bold tabular-nums text-ink">
          {day.summary.deduction > 0
            ? formatCurrency(lang, day.summary.deduction, rules.currency)
            : '—'}
        </p>
        {day.summary.late_count > 0 ? (
          <p className="text-[12px] text-ink-2">
            {t('attendance.lateCount', {
              count: formatNumber(lang, day.summary.late_count),
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
