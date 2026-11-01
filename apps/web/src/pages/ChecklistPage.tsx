import { ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import { useEffect, useState } from 'react';
import ChecklistItemsSheet from '../components/checklists/ChecklistItemsSheet';
import DayBoard from '../components/checklists/DayBoard';
import PeriodReport from '../components/checklists/PeriodReport';
import {
  api,
  type ChecklistDay,
  type ChecklistMember,
  type ChecklistPeriod,
  type ChecklistReport,
  type ChecklistTask,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDayLong, formatDayShort, formatMonth, formatNumber } from '../lib/format';
import { useLang, type TranslationKey } from '../lib/i18n';
import { canManageStore, canSupervise } from '../lib/roles';

const VIEWS: ChecklistPeriod[] = ['day', 'week', 'month'];

const VIEW_LABEL: Record<ChecklistPeriod, TranslationKey> = {
  day: 'checklists.view.day',
  week: 'checklists.view.week',
  month: 'checklists.view.month',
};

/** Today as the date input and the API read it, in the reader's own timezone. */
function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Move the anchor by one day, week or month, keeping it a plain YYYY-MM-DD. */
function shiftAnchor(iso: string, view: ChecklistPeriod, direction: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const base = new Date(year, month - 1, day);
  if (view === 'day') base.setDate(base.getDate() + direction);
  else if (view === 'week') base.setDate(base.getDate() + 7 * direction);
  else base.setMonth(base.getMonth() + direction, 1);
  const nextMonth = `${base.getMonth() + 1}`.padStart(2, '0');
  const nextDay = `${base.getDate()}`.padStart(2, '0');
  return `${base.getFullYear()}-${nextMonth}-${nextDay}`;
}

export default function ChecklistPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const canManage = canManageStore(user?.role);
  const supervises = canSupervise(user?.role);

  const [view, setView] = useState<ChecklistPeriod>('day');
  const [anchor, setAnchor] = useState(todayIso);
  const [day, setDay] = useState<ChecklistDay | null>(null);
  const [report, setReport] = useState<ChecklistReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const call =
      view === 'day'
        ? api.checklist(anchor).then((result) => {
            if (!cancelled) setDay(result);
          })
        : api.checklistReport(view, anchor).then((result) => {
            if (!cancelled) setReport(result);
          });
    call
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, anchor, nonce]);

  const toggle = (member: ChecklistMember, taskId: number, done: boolean) => {
    const key = `${member.id}-${taskId}`;
    setBusyKey(key);
    api
      .toggleChecklistItem({
        task_id: taskId,
        staff_id: member.id,
        date: anchor,
        done,
      })
      .then(setDay)
      .catch(() => setError(true))
      .finally(() => setBusyKey(null));
  };

  const applyTasks = (tasks: ChecklistTask[]) => {
    setDay((current) => (current ? { ...current, tasks } : current));
  };

  const closeSheet = () => {
    setSheetOpen(false);
    // The board's member lists come from the item list, so reread it.
    setNonce((value) => value + 1);
  };

  const activeTasks = day?.tasks.filter((task) => task.is_active) ?? [];
  const dayPercent =
    day && day.summary.total
      ? Math.round((day.summary.done / day.summary.total) * 100)
      : 0;
  const periodLabel = (() => {
    if (view === 'month') return formatMonth(lang, anchor.slice(0, 7));
    if (view === 'week' && report)
      return t('checklists.period.range', {
        start: formatDayShort(lang, report.start),
        end: formatDayShort(lang, report.end),
      });
    return formatDayLong(lang, anchor);
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('checklists.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {t('checklists.subtitle')}
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="btn-quiet h-11 min-h-0 px-4 text-[14px]"
          >
            <ListChecks size={17} />
            {t('checklists.manage')}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label={t('checklists.title')}
          className="inline-flex rounded-field border border-line bg-surface-2 p-1"
        >
          {VIEWS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`h-9 rounded-[10px] px-3 text-[13px] font-semibold transition-colors duration-150 ${
                view === value
                  ? 'bg-surface text-[color:var(--accent)]'
                  : 'text-ink-2'
              }`}
            >
              {t(VIEW_LABEL[value])}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t('checklists.prev')}
            onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}
            className="icon-btn h-10 w-10"
          >
            {lang === 'ar' ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
          <input
            type="date"
            className="field h-10 w-[150px]"
            aria-label={periodLabel}
            value={anchor}
            onChange={(event) => {
              if (event.target.value) setAnchor(event.target.value);
            }}
          />
          <button
            type="button"
            aria-label={t('checklists.next')}
            onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}
            className="icon-btn h-10 w-10"
          >
            {lang === 'ar' ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
          </button>
          {anchor === todayIso() ? null : (
            <button
              type="button"
              onClick={() => setAnchor(todayIso())}
              className="btn-quiet h-10 min-h-0 px-3 text-[13px]"
            >
              {t('checklists.today')}
            </button>
          )}
        </div>
      </div>

      <p className="text-[13px] font-medium text-ink-2">{periodLabel}</p>

      {loading ? (
        <div className="card p-4">
          <div className="skeleton h-10 rounded-field" />
          <div className="skeleton mt-2 h-24 rounded-field" />
          <div className="skeleton mt-2 h-24 rounded-field" />
        </div>
      ) : error ? (
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
      ) : view === 'day' && day ? (
        activeTasks.length === 0 && day.members.length > 0 ? (
          <EmptyState
            title={t('checklists.emptyTasks')}
            hint={t('checklists.emptyTasksHint')}
            action={
              canManage
                ? { label: t('checklists.manage'), onClick: () => setSheetOpen(true) }
                : undefined
            }
          />
        ) : day.members.length === 0 ? (
          <EmptyState
            title={t('checklists.emptyTeam')}
            hint={t('checklists.emptyTeamHint')}
          />
        ) : (
          <>
            <Summary
              percent={dayPercent}
              detail={t('checklists.progress', {
                done: formatNumber(lang, day.summary.done),
                total: formatNumber(lang, day.summary.total),
              })}
              extra={t('checklists.complete', {
                count: formatNumber(lang, day.summary.complete),
              })}
            />
            {supervises ? null : (
              <p className="rounded-field border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
                {t('checklists.onlyOwn')}
              </p>
            )}
            <DayBoard
              day={day}
              busyKey={busyKey}
              canTick={(member) => supervises || member.id === user?.id}
              onToggle={toggle}
            />
          </>
        )
      ) : report ? (
        report.tasks_total === 0 || report.members.length === 0 ? (
          <EmptyState
            title={t('checklists.emptyTasks')}
            hint={t('checklists.emptyTasksHint')}
            action={
              canManage
                ? { label: t('checklists.manage'), onClick: () => setSheetOpen(true) }
                : undefined
            }
          />
        ) : (
          <>
            <Summary
              percent={report.summary.percent}
              detail={t('checklists.progress', {
                done: formatNumber(lang, report.summary.done),
                total: formatNumber(lang, report.summary.expected),
              })}
              extra={`${t('checklists.taskTotal', {
                count: formatNumber(lang, report.tasks_total),
              })} · ${t('checklists.countedDays', {
                count: formatNumber(lang, report.counted_days),
              })}`}
            />
            <PeriodReport report={report} />
          </>
        )
      ) : null}

      <ChecklistItemsSheet
        open={sheetOpen}
        tasks={day?.tasks ?? []}
        onClose={closeSheet}
        onSaved={applyTasks}
      />
    </div>
  );
}

function Summary({
  percent,
  detail,
  extra,
}: {
  percent: number;
  detail: string;
  extra: string;
}) {
  const { t, lang } = useLang();
  return (
    <div className="card flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-[92px]">
        <p className="text-[12px] font-medium text-ink-2">
          {t('checklists.completion')}
        </p>
        <p className="text-[26px] font-bold tabular-nums tracking-tight text-ink">
          {formatNumber(lang, percent)}%
        </p>
      </div>
      <div className="min-w-[180px] flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${percent}%`,
              background: percent === 100 ? 'var(--success)' : 'var(--accent)',
            }}
          />
        </div>
        <p className="mt-2 text-[13px] tabular-nums text-ink-2">
          {detail} · {extra}
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="max-w-[420px] text-[13px] text-ink-2">{hint}</p>
      {action ? (
        <button type="button" onClick={action.onClick} className="btn-primary mt-2">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
