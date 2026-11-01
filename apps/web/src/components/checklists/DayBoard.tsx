import { Check } from 'lucide-react';
import type { ChecklistDay, ChecklistMember } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { ROLE_LABEL_KEY, ROLE_TONE } from '../../lib/roles';

type Props = {
  day: ChecklistDay;
  /** False when this viewer may not touch that member's list. */
  canTick: (member: ChecklistMember) => boolean;
  busyKey: string | null;
  onToggle: (member: ChecklistMember, taskId: number, done: boolean) => void;
};

export default function DayBoard({ day, canTick, busyKey, onToggle }: Props) {
  const { t, lang } = useLang();
  const titles = new Map(
    day.tasks.map((task) => [
      task.id,
      lang === 'ar' ? task.title_ar : task.title_en,
    ]),
  );

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {day.members.map((member) => {
        const percent = member.total ? (member.done / member.total) * 100 : 0;
        const editable = canTick(member);
        return (
          <section key={member.id} className="card p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[15px] font-semibold text-ink-2"
              >
                {member.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">
                  {member.name}
                </p>
                <span
                  className="mt-0.5 inline-flex text-[12px] font-semibold"
                  style={{ color: ROLE_TONE[member.role] }}
                >
                  {t(ROLE_LABEL_KEY[member.role])}
                </span>
              </div>
              <span
                className="chip shrink-0 tabular-nums"
                style={{
                  background:
                    member.total && member.done === member.total
                      ? 'color-mix(in srgb, var(--success) 16%, transparent)'
                      : 'var(--surface-2)',
                  color:
                    member.total && member.done === member.total
                      ? 'var(--success)'
                      : 'var(--text-2)',
                }}
              >
                {formatNumber(lang, member.done)}/
                {formatNumber(lang, member.total)}
              </span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${percent}%`,
                  background:
                    percent === 100 ? 'var(--success)' : 'var(--accent)',
                }}
              />
            </div>

            {member.total === 0 ? (
              <p className="mt-3 text-[13px] text-ink-2">
                {t('checklists.noTasks')}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {member.items.map((item) => {
                  const key = `${member.id}-${item.task_id}`;
                  const label = titles.get(item.task_id) ?? '';
                  return (
                    <li key={item.task_id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={item.done}
                        aria-label={`${label} — ${member.name}`}
                        disabled={!editable || busyKey === key}
                        onClick={() =>
                          onToggle(member, item.task_id, !item.done)
                        }
                        title={editable ? undefined : t('checklists.onlyOwn')}
                        className="flex w-full items-center gap-3 rounded-field px-2 py-2 text-start transition-colors duration-150 enabled:hover:bg-surface-2 disabled:cursor-not-allowed"
                        style={{ minHeight: 44 }}
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-colors duration-150"
                          style={{
                            borderColor: item.done
                              ? 'var(--success)'
                              : 'var(--line)',
                            background: item.done
                              ? 'var(--success)'
                              : 'transparent',
                            color: '#fff',
                          }}
                        >
                          {item.done ? <Check size={13} strokeWidth={3} /> : null}
                        </span>
                        <span
                          className={`text-[14px] ${
                            item.done
                              ? 'text-ink-2 line-through'
                              : 'text-ink'
                          }`}
                        >
                          {label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
