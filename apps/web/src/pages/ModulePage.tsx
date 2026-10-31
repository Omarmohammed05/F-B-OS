import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Monitor,
  ReceiptText,
  SlidersHorizontal,
  Sparkles,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import { moduleFromPath, type ModuleKey } from '../lib/modules';
import NotFound from './NotFound';

const ICONS: Record<ModuleKey, LucideIcon> = {
  pos: Monitor,
  orders: ReceiptText,
  menu: UtensilsCrossed,
  inventory: Boxes,
  customers: Users,
  loyalty: Sparkles,
  reports: BarChart3,
  team: UserCog,
  settings: SlidersHorizontal,
};

export default function ModulePage() {
  const { module: moduleParam } = useParams();
  const meta = moduleFromPath(moduleParam);
  const { t } = useLang();

  if (!meta) return <NotFound />;

  const Icon = ICONS[meta.key];

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} className="rtl:rotate-180" />
        {t('module.back')}
      </Link>

      <section className="card mx-auto mt-4 w-full max-w-[720px] p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            <Icon size={22} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
                {t(meta.titleKey)}
              </h1>
              <span className="chip bg-surface-2 text-ink-2">
                {t('module.comingSoon')}
              </span>
              <span className="chip bg-surface-2 text-ink-2">
                {t('module.phase', { phase: meta.phase })}
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
              {t(meta.blurbKey)}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
            {t('module.planned')}
          </p>
          <p className="mt-1.5 text-[14px] text-ink">{t(meta.scopeKey)}</p>
        </div>

        <div className="mt-6">
          <Link to="/" className="btn-primary">
            {t('module.back')}
          </Link>
        </div>
      </section>
    </div>
  );
}
