import type { ChecklistReport } from '../../lib/api';
import { formatDayShort, formatNumber } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { ROLE_LABEL_KEY, ROLE_TONE } from '../../lib/roles';

/**
 * Week and month view: one row per person with a cell per day, so a manager
 * reads a stretch of shifts at a glance. A future day carries no expectation.
 */
export default function PeriodReport({ report }: { report: ChecklistReport }) {
  const { t, lang } = useLang();

  return (
    <div className="card divide-y divide-[color:var(--line)]">
      {report.members.map((member) => (
        <div key={member.id} className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px] font-semibold text-ink-2"
              >
                {member.name.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">
                  {member.name}
                </p>
                <span
                  className="text-[12px] font-semibold"
                  style={{ color: ROLE_TONE[member.role] }}
                >
                  {t(ROLE_LABEL_KEY[member.role])}
                  {member.is_active ? '' : ` · ${t('team.inactive')}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] tabular-nums text-ink-2">
                {formatNumber(lang, member.done)}/
                {formatNumber(lang, member.expected)}
              </span>
              <span
                className="chip tabular-nums"
                style={{
                  background:
                    member.percent === 100 && member.expected > 0
                      ? 'color-mix(in srgb, var(--success) 16%, transparent)'
                      : 'var(--surface-2)',
                  color:
                    member.percent === 100 && member.expected > 0
                      ? 'var(--success)'
                      : 'var(--text-2)',
                }}
              >
                {formatNumber(lang, member.percent)}%
              </span>
            </div>
          </div>

          <div className="mt-2 flex w-full gap-[2px] sm:gap-[3px]">
            {member.days.map((point) => {
              const state =
                point.expected === 0
                  ? 'future'
                  : point.done === 0
                    ? 'none'
                    : point.done >= point.expected
                      ? 'complete'
                      : 'partial';
              return (
                <span
                  key={point.date}
                  title={`${formatDayShort(lang, point.date)} — ${formatNumber(
                    lang,
                    point.done,
                  )}/${formatNumber(lang, point.expected)}`}
                  className="h-[18px] min-w-[6px] flex-1 rounded-[4px]"
                  style={{
                    maxWidth: 26,
                    background:
                      state === 'complete'
                        ? 'var(--success)'
                        : state === 'partial'
                          ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
                          : state === 'none'
                            ? 'var(--surface-2)'
                            : 'transparent',
                    border: state === 'future' ? '1px dashed var(--line)' : 'none',
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[12px] text-ink-2">
        <Legend color="var(--success)" label={t('checklists.legend.complete')} />
        <Legend
          color="color-mix(in srgb, var(--accent) 45%, transparent)"
          label={t('checklists.legend.partial')}
        />
        <Legend color="var(--surface-2)" label={t('checklists.legend.none')} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="h-3 w-3 rounded-[3px] border border-line"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
