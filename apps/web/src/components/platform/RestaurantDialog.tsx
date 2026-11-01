import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type PlatformRestaurant,
  type RestaurantsData,
} from '../../lib/api';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  /** null opens a new restaurant; a row edits it. */
  restaurant: PlatformRestaurant | null;
  onClose: () => void;
  onSaved: (data: RestaurantsData) => void;
};

/**
 * Opens a restaurant, or edits the two things the owner owns about it: its
 * names and what the software costs it. A new restaurant is handed over with an
 * activation link (see `InviteLinkDialog`), never a password typed for someone.
 */
export default function RestaurantDialog({
  open,
  restaurant,
  onClose,
  onSaved,
}: Props) {
  const { t } = useLang();
  const editing = restaurant !== null;
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [price, setPrice] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameAr(restaurant?.name_ar ?? '');
    setNameEn(restaurant?.name_en ?? '');
    setPrice(String(restaurant?.software_price ?? 0));
    setSaving(false);
    setError(null);
  }, [open, restaurant]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ar = nameAr.trim();
    const en = nameEn.trim();
    const amount = Number(price);
    if (!ar || !en) {
      setError(t('form.required'));
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError(t('platform.priceInvalid'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = restaurant
        ? await api.updateRestaurant(restaurant.id, {
            name_ar: ar,
            name_en: en,
            software_price: amount,
          })
        : await api.createRestaurant({
            name_ar: ar,
            name_en: en,
            software_price: amount,
          });
      onSaved(data);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('409')) setError(t('team.restaurantConflict'));
      else if (message.startsWith('422')) setError(t('team.credentials'));
      else setError(t('team.restaurantFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={editing ? t('platform.editRestaurant') : t('platform.newRestaurant')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-quiet">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="restaurant-form"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? t('menu.saving') : t('menu.save')}
          </button>
        </>
      }
    >
      <form
        id="restaurant-form"
        onSubmit={submit}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('team.restaurantNameAr')}
            </span>
            <input
              className="field"
              dir="rtl"
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

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('platform.price')}
          </span>
          <input
            className="field tabular-nums"
            dir="ltr"
            inputMode="decimal"
            type="number"
            min={0}
            step="any"
            value={price}
            onChange={(event) => {
              setPrice(event.target.value);
              setError(null);
            }}
          />
          <span className="mt-1 block text-[12px] text-ink-2">
            {t('platform.priceHint')}
          </span>
        </label>

        <p className="rounded-field border border-line bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">
          {editing ? t('platform.adminHintEdit') : t('platform.adminByInvite')}
        </p>

        {error ? (
          <p
            role="alert"
            className="text-[13px] font-medium text-[color:var(--danger)]"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
