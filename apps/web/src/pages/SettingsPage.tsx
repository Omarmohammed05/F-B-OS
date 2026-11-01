import { Check } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api, type SettingsData } from '../lib/api';
import { useLang } from '../lib/i18n';
import { useAppData } from '../lib/store';

const ACCENTS = [
  '#0A84FF',
  '#30B95C',
  '#FF9F0A',
  '#FF375F',
  '#BF5AF2',
  '#5E5CE6',
];

const CURRENCIES = ['EGP', 'SAR', 'AED', 'KWD', 'USD', 'EUR'];

type Draft = {
  name_ar: string;
  name_en: string;
  accent_color: string;
  currency: string;
  tax_rate: string;
  table_count: string;
  shift_start: string;
  grace_minutes: string;
  deduction_per_minute: string;
};

function toDraft(settings: SettingsData): Draft {
  return {
    name_ar: settings.store.name_ar,
    name_en: settings.store.name_en,
    accent_color: settings.store.accent_color,
    currency: settings.store.currency,
    tax_rate: String(settings.store.tax_rate),
    table_count: String(settings.service.table_count),
    shift_start: settings.attendance.shift_start,
    grace_minutes: String(settings.attendance.grace_minutes),
    deduction_per_minute: String(settings.attendance.deduction_per_minute),
  };
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink-2">
        {text}
      </span>
      {children}
    </label>
  );
}

export default function SettingsPage() {
  const { t } = useLang();
  const { reload } = useAppData();

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    api
      .settings()
      .then((result) => {
        if (cancelled) return;
        setSettings(result);
        setDraft(toDraft(result));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2400);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const dirty = Boolean(
    draft && settings && JSON.stringify(draft) !== JSON.stringify(toDraft(settings)),
  );

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setError(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    const nameAr = draft.name_ar.trim();
    const nameEn = draft.name_en.trim();
    const taxRate = Number(draft.tax_rate);
    const tableCount = Number(draft.table_count);
    const graceMinutes = Number(draft.grace_minutes);
    const deductionRate = Number(draft.deduction_per_minute);

    if (!nameAr || !nameEn) {
      setError(t('settings.required'));
      return;
    }
    if (
      !Number.isFinite(taxRate) ||
      taxRate < 0 ||
      taxRate > 100 ||
      !Number.isInteger(tableCount) ||
      tableCount < 0 ||
      tableCount > 200
    ) {
      setError(t('settings.range'));
      return;
    }
    if (
      !Number.isInteger(graceMinutes) ||
      graceMinutes < 0 ||
      graceMinutes > 180 ||
      !Number.isFinite(deductionRate) ||
      deductionRate < 0 ||
      deductionRate > 10000
    ) {
      setError(t('settings.lateRange'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const next = await api.updateSettings({
        name_ar: nameAr,
        name_en: nameEn,
        accent_color: draft.accent_color,
        currency: draft.currency,
        tax_rate: taxRate,
        table_count: tableCount,
        shift_start: draft.shift_start,
        grace_minutes: graceMinutes,
        deduction_per_minute: deductionRate,
      });
      setSettings(next);
      setDraft(toDraft(next));
      document.documentElement.style.setProperty(
        '--accent',
        next.store.accent_color,
      );
      reload();
      setSaved(true);
    } catch (err) {
      setError(
        String(err).includes('409') ? t('settings.busyTables') : t('settings.invalid'),
      );
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
        {t('settings.title')}
      </h1>
      <p className="mt-1 text-[14px] text-ink-2">{t('settings.subtitle')}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="card p-5 text-[14px] text-ink-2">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (loadFailed || !draft || !settings) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="text-[14px] text-ink-2">{t('settings.loadError')}</p>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="btn-quiet h-11 min-h-0 px-4 text-[14px]"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const currencies = CURRENCIES.includes(draft.currency)
    ? CURRENCIES
    : [draft.currency, ...CURRENCIES];

  return (
    <div className="flex flex-col gap-4">
      {header}

      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
        <Section title={t('settings.profile')} hint={t('settings.accentHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text={t('settings.nameAr')}>
              <input
                className="field"
                dir="rtl"
                value={draft.name_ar}
                onChange={(event) => update({ name_ar: event.target.value })}
              />
            </Label>
            <Label text={t('settings.nameEn')}>
              <input
                className="field"
                dir="ltr"
                value={draft.name_en}
                onChange={(event) => update({ name_en: event.target.value })}
              />
            </Label>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">
              {t('settings.accent')}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {ACCENTS.map((color) => {
                const active =
                  draft.accent_color.toUpperCase() === color.toUpperCase();
                return (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    aria-pressed={active}
                    onClick={() => update({ accent_color: color })}
                    className="flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-150 hover:scale-105"
                    style={{
                      background: color,
                      boxShadow: active
                        ? `0 0 0 2px var(--surface), 0 0 0 4px ${color}`
                        : undefined,
                    }}
                  >
                    {active ? (
                      <Check size={16} strokeWidth={2.4} className="text-white" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title={t('settings.sales')} hint={t('settings.currencyHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text={t('settings.currency')}>
              <select
                className="field"
                value={draft.currency}
                onChange={(event) => update({ currency: event.target.value })}
              >
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Label>
            <Label text={t('settings.taxRate')}>
              <div className="relative">
                <input
                  className="field pe-8 tabular-nums"
                  dir="ltr"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={draft.tax_rate}
                  onChange={(event) => update({ tax_rate: event.target.value })}
                />
                <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[13px] text-ink-2">
                  %
                </span>
              </div>
            </Label>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
            {t('settings.taxHint')}
          </p>
        </Section>

        <Section title={t('settings.service')} hint={t('settings.tablesHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text={t('settings.tables')}>
              <input
                className="field tabular-nums"
                dir="ltr"
                inputMode="numeric"
                type="number"
                min={0}
                max={200}
                value={draft.table_count}
                onChange={(event) => update({ table_count: event.target.value })}
              />
            </Label>
            {settings.service.open_tables > 0 ? (
              <p className="flex items-end pb-3 text-[13px] text-ink-2">
                {t('settings.openTables', {
                  count: settings.service.open_tables,
                })}
              </p>
            ) : null}
          </div>
        </Section>

        <Section
          title={t('settings.attendance')}
          hint={t('settings.attendanceHint')}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Label text={t('settings.shiftStart')}>
              <input
                className="field tabular-nums"
                dir="ltr"
                type="time"
                aria-label={t('settings.shiftStart')}
                value={draft.shift_start}
                onChange={(event) => update({ shift_start: event.target.value })}
              />
            </Label>
            <Label text={t('settings.grace')}>
              <input
                className="field tabular-nums"
                dir="ltr"
                inputMode="numeric"
                type="number"
                min={0}
                max={180}
                aria-label={t('settings.grace')}
                value={draft.grace_minutes}
                onChange={(event) => update({ grace_minutes: event.target.value })}
              />
            </Label>
            <Label text={t('settings.deduction')}>
              <div className="relative">
                <input
                  className="field pe-14 tabular-nums"
                  dir="ltr"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step="any"
                  aria-label={t('settings.deduction')}
                  value={draft.deduction_per_minute}
                  onChange={(event) =>
                    update({ deduction_per_minute: event.target.value })
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[13px] text-ink-2">
                  {draft.currency}
                </span>
              </div>
            </Label>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
            {t('settings.lateHint')}
          </p>
        </Section>

        <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2.5 shadow-lg">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn-primary h-11 min-h-0 px-5 text-[14px] disabled:opacity-40"
          >
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(toDraft(settings));
              setError(null);
            }}
            disabled={!dirty || saving}
            className="btn-quiet h-11 min-h-0 px-4 text-[14px] disabled:opacity-40"
          >
            {t('settings.discard')}
          </button>
          <span className="ms-auto text-[13px] font-medium">
            {error ? (
              <span className="text-[color:var(--danger)]">{error}</span>
            ) : saved ? (
              <span className="inline-flex items-center gap-1.5 text-[color:var(--success)]">
                <Check size={15} />
                {t('settings.saved')}
              </span>
            ) : dirty ? (
              <span className="text-ink-2">{t('settings.unsaved')}</span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
