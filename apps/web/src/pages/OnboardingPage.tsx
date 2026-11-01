import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Monitor,
  Sparkles,
  UserCog,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLang, type TranslationKey } from '../lib/i18n';

type Step = {
  icon: LucideIcon;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
};

// One stop per job the app does, in the order a new store meets them.
const STEPS: Step[] = [
  {
    icon: LayoutDashboard,
    titleKey: 'tour.dash.title',
    bodyKey: 'tour.dash.body',
  },
  { icon: Monitor, titleKey: 'tour.pos.title', bodyKey: 'tour.pos.body' },
  {
    icon: UtensilsCrossed,
    titleKey: 'tour.menu.title',
    bodyKey: 'tour.menu.body',
  },
  { icon: Boxes, titleKey: 'tour.stock.title', bodyKey: 'tour.stock.body' },
  {
    icon: Sparkles,
    titleKey: 'tour.guests.title',
    bodyKey: 'tour.guests.body',
  },
  {
    icon: BarChart3,
    titleKey: 'tour.reports.title',
    bodyKey: 'tour.reports.body',
  },
  { icon: UserCog, titleKey: 'tour.team.title', bodyKey: 'tour.team.body' },
];

export default function OnboardingPage() {
  const { t, lang, setLang } = useLang();
  const { user, finishTour } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  const close = async () => {
    setBusy(true);
    try {
      await finishTour();
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 py-5 sm:px-8">
        <span className="text-[20px] font-bold tracking-tight text-ink">
          {t('brand')}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            aria-label={t('top.language')}
            className="btn-quiet h-10 min-h-0 px-3 text-[13px]"
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="btn-quiet h-10 min-h-0 px-3 text-[13px] text-ink-2 disabled:opacity-60"
          >
            {t('tour.skip')}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col justify-center px-4 pb-16">
        <p className="mb-3 text-[14px] text-ink-2">
          {t('tour.welcome', { name: user?.name ?? '' })}
        </p>

        <section className="card p-6 sm:p-8" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              <Icon size={22} strokeWidth={1.7} />
            </span>
            <span className="chip border border-line bg-surface-2 tabular-nums text-ink-2">
              {t('tour.counter', { current: step + 1, total: STEPS.length })}
            </span>
          </div>

          <h1 className="mt-5 text-[24px] font-bold tracking-tight text-ink sm:text-[28px]">
            {t(current.titleKey)}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            {t(current.bodyKey)}
          </p>

          <div className="mt-6 flex items-center gap-1.5">
            {STEPS.map((item, index) => (
              <button
                key={item.titleKey}
                type="button"
                onClick={() => setStep(index)}
                aria-label={t(item.titleKey)}
                aria-current={index === step}
                className="h-1.5 flex-1 rounded-full transition-colors duration-150"
                style={{
                  background:
                    index <= step ? 'var(--accent)' : 'var(--line)',
                }}
              />
            ))}
          </div>
        </section>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            disabled={step === 0 || busy}
            className="btn-quiet disabled:opacity-40"
          >
            {t('tour.back')}
          </button>
          <button
            type="button"
            onClick={() => (last ? close() : setStep((value) => value + 1))}
            disabled={busy}
            className="btn-primary min-w-[152px] disabled:opacity-60"
          >
            {last ? t('tour.finish') : t('tour.next')}
          </button>
        </div>
      </main>
    </div>
  );
}
