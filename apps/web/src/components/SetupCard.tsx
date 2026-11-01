import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLang } from '../lib/i18n';

type Props = {
  completed: number;
  total: number;
};

export default function SetupCard({ completed, total }: Props) {
  const { t } = useLang();
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-card border border-line bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
          {t('setup.cardTitle')}
        </p>
        {completed === total && total > 0 ? (
          <Check size={14} className="text-[color:var(--success)]" />
        ) : null}
      </div>
      <p className="mt-1.5 text-[13px] font-medium text-ink">
        {t('setup.progress', { done: completed, total })}
      </p>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"
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
      <Link
        to="/setup"
        className="btn-primary mt-3 h-9 w-full min-h-0 text-[13px]"
      >
        {t('setup.cta')}
      </Link>
    </div>
  );
}
