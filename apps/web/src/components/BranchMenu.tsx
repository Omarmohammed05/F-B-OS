import { Check, ChevronDown, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { api, type Branch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { canManageStore } from '../lib/roles';
import { useAppData } from '../lib/store';
import Sheet from './Sheet';

type Props = {
  storeName: string;
  branches: Branch[];
  activeId: number;
  onNavigate?: () => void;
};

type Draft = {
  name_ar: string;
  name_en: string;
  address: string;
  phone: string;
};

const EMPTY: Draft = { name_ar: '', name_en: '', address: '', phone: '' };

export default function BranchMenu({
  storeName,
  branches,
  activeId,
  onNavigate,
}: Props) {
  const { t, lang } = useLang();
  const { reload } = useAppData();
  const { user } = useAuth();
  // Locations are store structure: the admin and the platform owner add them.
  const canAdd = canManageStore(user?.role);
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(0);
  const [error, setError] = useState('');

  const label = (branch: Branch) => (lang === 'ar' ? branch.name_ar : branch.name_en);
  const active = branches.find((branch) => branch.id === activeId);

  const switchTo = async (branch: Branch) => {
    if (branch.id === activeId) {
      setOpen(false);
      return;
    }
    setSwitching(branch.id);
    setError('');
    try {
      await api.activateBranch(branch.id);
      // Tickets, dashboard and reports are scoped to the branch, so start the
      // app again on the location the counter just picked.
      window.location.reload();
    } catch {
      setSwitching(0);
      setError(t('branch.switchError'));
    }
  };

  const openForm = () => {
    setOpen(false);
    setError('');
    setDraft(EMPTY);
    setFormOpen(true);
  };

  const submit = async () => {
    const nameAr = draft.name_ar.trim();
    const nameEn = draft.name_en.trim();
    if (!nameAr || !nameEn) {
      setError(t('branch.required'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createBranch({
        name_ar: nameAr,
        name_en: nameEn,
        address: draft.address.trim(),
        phone: draft.phone.trim(),
      });
      setFormOpen(false);
      setDraft(EMPTY);
      reload();
      // Show the branch the store just gained, ready to be picked.
      setOpen(true);
    } catch (err) {
      const message = String(err);
      setError(
        message.includes('409')
          ? t('branch.exists')
          : message.includes('403')
            ? t('branch.forbidden')
            : t('branch.error'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t('branch.switch')}
          className="flex w-full items-center gap-2.5 rounded-field border border-line bg-surface-2 px-3 py-2.5 text-start transition-colors duration-150 hover:bg-line/40"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Store size={16} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-ink">
              {storeName}
            </span>
            <span className="block truncate text-[12px] text-ink-2">
              {active ? label(active) : t('branch.none')}
            </span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-ink-2" />
        </button>

        {open ? (
          <div
            role="menu"
            aria-label={t('branch.switch')}
            className="absolute inset-x-0 top-full z-40 mt-1.5 rounded-field border border-line bg-surface p-1.5 shadow-lg"
          >
            <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
              {t('branch.current')}
            </p>
            {branches.map((branch) => {
              const isActive = branch.id === activeId;
              return (
                <button
                  key={branch.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  disabled={switching !== 0}
                  onClick={() => switchTo(branch)}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-start text-[13px] transition-colors duration-150 hover:bg-surface-2 ${
                    isActive ? 'font-semibold text-ink' : 'font-medium text-ink'
                  }`}
                >
                  <Store size={15} className="shrink-0 text-ink-2" />
                  <span className="min-w-0 flex-1 truncate">{label(branch)}</span>
                  {isActive ? (
                    <Check size={15} className="shrink-0 text-accent" />
                  ) : null}
                </button>
              );
            })}

            {canAdd ? (
              <>
                <div className="my-1 border-t border-line" />

                <button
                  type="button"
                  onClick={openForm}
                  className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-start text-[13px] font-semibold text-accent transition-colors duration-150 hover:bg-surface-2"
                >
                  <Plus size={15} className="shrink-0" />
                  {t('store.addBranch')}
                </button>
              </>
            ) : null}

            {error && !formOpen ? (
              <p role="alert" className="px-2.5 pb-1 pt-1 text-[12px] text-red-500">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <Sheet
        open={formOpen}
        title={t('branch.title')}
        closeLabel={t('common.close')}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="btn btn-primary h-11 px-4 text-[14px] disabled:opacity-60"
            >
              {saving ? t('branch.saving') : t('branch.save')}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="btn-quiet h-11 min-h-0 px-4 text-[14px]"
            >
              {t('common.cancel')}
            </button>
          </>
        }
      >
        <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
          {t('branch.hint')}
        </p>
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('branch.nameAr')}
            </span>
            <input
              className="field"
              value={draft.name_ar}
              onChange={(event) => {
                setDraft((current) => ({ ...current, name_ar: event.target.value }));
                setError('');
              }}
              maxLength={120}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('branch.nameEn')}
            </span>
            <input
              className="field"
              dir="ltr"
              value={draft.name_en}
              onChange={(event) => {
                setDraft((current) => ({ ...current, name_en: event.target.value }));
                setError('');
              }}
              maxLength={120}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('branch.address')}
            </span>
            <input
              className="field"
              value={draft.address}
              onChange={(event) =>
                setDraft((current) => ({ ...current, address: event.target.value }))
              }
              maxLength={160}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('branch.phone')}
            </span>
            <input
              className="field"
              dir="ltr"
              inputMode="tel"
              value={draft.phone}
              onChange={(event) =>
                setDraft((current) => ({ ...current, phone: event.target.value }))
              }
              maxLength={40}
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-red-500">
            {error}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
