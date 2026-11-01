import { useEffect, useState } from 'react';
import { api, type Restaurant } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (created: Restaurant) => void;
};

/** Opens another restaurant, so an admin can hand its team their sign-ins. */
export default function RestaurantDialog({ open, onClose, onCreated }: Props) {
  const { t } = useLang();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameAr('');
    setNameEn('');
    setSaving(false);
    setError(null);
  }, [open]);

  const submit = async () => {
    const ar = nameAr.trim();
    const en = nameEn.trim();
    if (!ar || !en) {
      setError(t('form.required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await api.createRestaurant({ name_ar: ar, name_en: en });
      onCreated(data.created);
      onClose();
    } catch (err) {
      setError(
        String(err).startsWith('409')
          ? t('team.restaurantConflict')
          : t('team.restaurantFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={t('team.restaurantTitle')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-quiet">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? t('menu.saving') : t('menu.save')}
          </button>
        </>
      }
    >
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
        {t('team.restaurantHint')}
      </p>
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('team.restaurantNameAr')}
          </span>
          <input
            className="field"
            value={nameAr}
            onChange={(event) => {
              setNameAr(event.target.value);
              setError(null);
            }}
            maxLength={120}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('team.restaurantNameEn')}
          </span>
          <input
            className="field"
            dir="ltr"
            value={nameEn}
            onChange={(event) => {
              setNameEn(event.target.value);
              setError(null);
            }}
            maxLength={120}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-red-500">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
