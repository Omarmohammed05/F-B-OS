import { KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type StaffInput,
  type StaffMember,
  type StaffRole,
  type TeamData,
} from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { ROLE_LABEL_KEY, ROLES } from '../../lib/roles';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  member: StaffMember | null;
  onClose: () => void;
  onSaved: (data: TeamData) => void;
};

export default function StaffDialog({
  open,
  member,
  onClose,
  onSaved,
}: Props) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [active, setActive] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const creating = member === null;

  useEffect(() => {
    if (!open) return;
    setName(member?.name ?? '');
    setPhone(member?.phone ?? '');
    setRole(member?.role ?? 'cashier');
    setActive(member?.is_active ?? true);
    setUsername(member?.username ?? '');
    setPassword('');
    setSaving(false);
    setError(null);
    setConfirmDelete(false);
  }, [open, member]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) {
      setError(t('form.required'));
      return;
    }

    const wantsLogin = creating || Boolean(member?.has_login);
    if (wantsLogin && creating && (username.trim() || password)) {
      if (!username.trim() || !password) {
        setError(t('team.credentials'));
        return;
      }
    }
    if (password && password.length < 8) {
      setError(t('team.passwordShort'));
      return;
    }

    setSaving(true);
    setError(null);
    const payload: StaffInput = {
      name: cleaned,
      phone: phone.trim(),
      role,
      is_active: active,
    };
    if (creating) {
      payload.username = username.trim();
      payload.password = password;
    } else if (password) {
      payload.password = password;
    }

    try {
      const data = member
        ? await api.updateStaff(member.id, payload)
        : await api.createStaff(payload);
      onSaved(data);
      onClose();
    } catch (err) {
      const message = String(err);
      if (message.startsWith('409')) setError(t('team.conflict'));
      else if (message.startsWith('422')) setError(t('team.credentials'));
      else setError(t('team.invalid'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!member) return;
    setSaving(true);
    try {
      const data = await api.deleteStaff(member.id);
      onSaved(data);
      onClose();
    } catch (err) {
      const message = String(err);
      if (message.startsWith('409')) setError(t('team.conflict'));
      else setError(t('team.invalid'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={member ? t('team.edit') : t('team.new')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          {member ? (
            confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="btn-quiet me-auto text-[color:var(--danger)]"
              >
                {t('team.deleteConfirm')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label={t('team.delete')}
                className="icon-btn me-auto text-[color:var(--danger)]"
              >
                <Trash2 size={16} />
              </button>
            )
          ) : null}
          <button type="button" onClick={onClose} className="btn-quiet">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="staff-form"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? t('menu.saving') : t('menu.save')}
          </button>
        </>
      }
    >
      <form id="staff-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('team.name')}
            </span>
            <input
              className="field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('team.phone')}
            </span>
            <input
              className="field tabular-nums"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('team.role')}
            </span>
            <select
              className="field"
              value={role}
              onChange={(event) => setRole(event.target.value as StaffRole)}
            >
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {t(ROLE_LABEL_KEY[value])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="h-5 w-5 rounded border-line"
            />
            <span className="text-[14px] text-ink">{t('team.active')}</span>
          </label>
        </div>

        <div className="rounded-field border border-line bg-surface-2 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <KeyRound size={14} className="text-ink-2" />
            {t('team.loginSection')}
          </p>
          <p className="mt-1 text-[12px] text-ink-2">
            {creating ? t('team.loginHintNew') : t('team.loginHintEdit')}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {creating ? (
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
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="cashier.ahmed"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink-2">
                {creating ? t('team.password') : t('team.newPassword')}
              </span>
              <input
                className="field"
                dir="ltr"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
        </div>

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
