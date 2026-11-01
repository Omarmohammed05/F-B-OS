import { KeyRound } from 'lucide-react';
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
 * names and what the software costs it. The first admin is created here too, so
 * a new restaurant can be handed over in one step.
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
  const [adminName, setAdminName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameAr(restaurant?.name_ar ?? '');
    setNameEn(restaurant?.name_en ?? '');
    setPrice(String(restaurant?.software_price ?? 0));
    setAdminName('');
    setUsername('');
    setPassword('');
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
    if (!editing && (username.trim() || password)) {
      if (!username.trim() || !password) {
        setError(t('team.credentials'));
        return;
      }
      if (password.length < 8) {
        setError(t('team.passwordShort'));
        return;
      }
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
            admin_name: adminName.trim(),
            admin_username: username.trim(),
            admin_password: password,
          });
      onSaved(data);
      onClose();
    } catch (err) {
      const message = String(err);
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
            step={50}
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

        {editing ? (
          <p className="rounded-field border border-line bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">
            {t('platform.adminHintEdit')}
          </p>
        ) : (
          <div className="rounded-field border border-line bg-surface-2 p-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <KeyRound size={14} className="text-ink-2" />
              {t('platform.firstAdmin')}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
              {t('platform.firstAdminHint')}
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-ink-2">
                  {t('team.name')}
                </span>
                <input
                  className="field"
                  value={adminName}
                  onChange={(event) => setAdminName(event.target.value)}
                  maxLength={120}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-ink-2">
                    {t('team.username')}
                  </span>
                  <input
                    className="field"
                    dir="ltr"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setError(null);
                    }}
                    placeholder="admin.bistro"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-ink-2">
                    {t('team.password')}
                  </span>
                  <input
                    className="field"
                    dir="ltr"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

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
