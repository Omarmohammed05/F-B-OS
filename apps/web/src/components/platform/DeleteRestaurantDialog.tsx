import { useEffect, useState } from 'react';
import {
  api,
  type PlatformRestaurant,
  type RestaurantsData,
} from '../../lib/api';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  restaurant: PlatformRestaurant | null;
  onClose: () => void;
  onDone: (data: RestaurantsData) => void;
};

/**
 * Removing a restaurant asks the owner what happens to its history first: keep
 * it for the books, or erase it with the restaurant. Nothing is discarded
 * silently — both choices are spelled out before the confirm button.
 */
export default function DeleteRestaurantDialog({
  open,
  restaurant,
  onClose,
  onDone,
}: Props) {
  const { t, lang } = useLang();
  const [keepData, setKeepData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKeepData(true);
    setSaving(false);
    setError(null);
  }, [open, restaurant]);

  const submit = async () => {
    if (!restaurant) return;
    setSaving(true);
    setError(null);
    try {
      onDone(await api.deleteRestaurant(restaurant.id, keepData));
      onClose();
    } catch (err) {
      setError(
        String(err).startsWith('409')
          ? t('platform.deleteBlocked')
          : t('platform.deleteFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const name = restaurant
    ? lang === 'ar'
      ? restaurant.name_ar
      : restaurant.name_en
    : '';

  return (
    <Sheet
      open={open}
      title={t('platform.deleteTitle')}
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
            className="btn-primary bg-[color:var(--danger)]"
          >
            {saving ? t('menu.saving') : t('platform.deleteConfirm')}
          </button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-ink">
        {t('platform.deleteFor', { restaurant: name })}
      </p>
      <div
        role="radiogroup"
        aria-label={t('platform.deleteTitle')}
        className="mt-4 flex flex-col gap-2"
      >
        {[
          {
            value: true,
            title: t('platform.keepData'),
            hint: t('platform.keepDataHint'),
          },
          {
            value: false,
            title: t('platform.eraseData'),
            hint: t('platform.eraseDataHint'),
          },
        ].map((choice) => {
          const active = keepData === choice.value;
          return (
            <button
              key={String(choice.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setKeepData(choice.value);
                setError(null);
              }}
              className="rounded-field border px-3 py-3 text-start transition-colors"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--line)',
                background: active
                  ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
                  : 'var(--surface)',
              }}
            >
              <span className="block text-[14px] font-semibold text-ink">
                {choice.title}
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-2">
                {choice.hint}
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-3 text-[13px] font-medium text-[color:var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
