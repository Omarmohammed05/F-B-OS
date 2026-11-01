import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { useAppData } from '../lib/store';

export default function SetupPage() {
  const { data, loading, applySetup } = useAppData();
  const { t, lang } = useLang();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState(false);

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-8 w-48 rounded-[10px]" />
        <div className="skeleton h-64 rounded-card" />
      </div>
    );
  }

  const { setup } = data;
  const percent =
    setup.total > 0 ? Math.round((setup.completed / setup.total) * 100) : 0;

  const toggle = async (key: string, nextDone: boolean) => {
    setPendingKey(key);
    setError(false);
    try {
      const next = await api.updateSetup(key, nextDone);
      applySetup(next);
    } catch {
      setError(true);
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} className="rtl:rotate-180" />
        {t('setup.back')}
      </Link>

      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
          {t('setup.heading')}
        </h1>
        <p className="mt-1 max-w-[60ch] text-[14px] text-ink-2">
          {t('setup.lede')}
        </p>
      </div>

      <section className="card p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <p className="text-[15px] font-semibold text-ink">
            {t('setup.progress', {
              done: setup.completed,
              total: setup.total,
            })}
          </p>
          <span className="text-[13px] font-semibold text-ink-2">
            {percent}%
          </span>
        </div>
        <div
          className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%`, background: 'var(--accent)' }}
          />
        </div>
      </section>

      {setup.completed === setup.total && setup.total > 0 ? (
        <section
          className="card flex items-start gap-3 p-4"
          style={{ borderColor: 'var(--success)' }}
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: 'var(--success)' }}
          >
            <Check size={15} />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-ink">
              {t('setup.completeTitle')}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {t('setup.completeBody')}
            </p>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="text-[13px] font-medium" style={{ color: 'var(--danger)' }}>
          {t('common.error')}
        </p>
      ) : null}

      <section className="card divide-y divide-line">
        {setup.tasks.map((task) => {
          const busy = pendingKey === task.key;
          return (
            <div
              key={task.key}
              className="flex items-start gap-3 p-4 transition-opacity duration-150 sm:gap-4 sm:px-5"
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={task.is_done}
                aria-label={t('setup.toggle')}
                data-testid={`setup-task-${task.key}`}
                disabled={busy}
                onClick={() => toggle(task.key, !task.is_done)}
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border transition-colors duration-150 ${
                  task.is_done
                    ? 'border-transparent text-white'
                    : 'border-line bg-surface'
                }`}
                style={
                  task.is_done ? { background: 'var(--accent)' } : undefined
                }
              >
                {task.is_done ? <Check size={14} strokeWidth={3} /> : null}
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">
                  {lang === 'ar' ? task.title_ar : task.title_en}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
                  {lang === 'ar' ? task.summary_ar : task.summary_en}
                </p>
              </div>

              {task.is_done ? (
                <span
                  className="chip shrink-0"
                  style={{
                    color: 'var(--success)',
                    background:
                      'color-mix(in srgb, var(--success) 14%, transparent)',
                  }}
                >
                  {t('setup.doneOn')}
                </span>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
