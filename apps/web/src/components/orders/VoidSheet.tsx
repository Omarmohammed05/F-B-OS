import { LockKeyhole } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Order } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  /** The ticket being voided; null keeps the sheet closed. */
  order: Order | null;
  onClose: () => void;
  onVoided: (updated: Order) => void;
};

/**
 * The manager's signature on a void.
 *
 * A void takes a ticket off the day's sales, and the till's session is whoever
 * is standing there — so the API wants a PIN that belongs to a manager. The
 * token it answers is single use: this sheet voids exactly the ticket in front
 * of it, and the ticket keeps the approver's name.
 */
export default function VoidSheet({ order, onClose, onVoided }: Props) {
  const { t } = useLang();
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPin('');
    setReason('');
    setSaving(false);
    setError(null);
  }, [order?.id]);

  if (!order) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pin.length < 4) {
      setError(t('void.pinHint'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const approval = await api.verifyPin(pin);
      const updated = await api.updateOrder(order.id, 'cancelled', {
        approval: approval.token,
        reason: reason.trim(),
      });
      onVoided(updated);
      onClose();
    } catch (err) {
      const message = String(err);
      if (message.startsWith('401')) setError(t('void.pinWrong'));
      else if (message.startsWith('409')) setError(t('void.noPin'));
      else if (message.startsWith('429')) setError(t('void.tooMany'));
      else setError(t('void.failed'));
      setPin('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      title={t('void.title')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="btn-quiet h-11 min-h-0 px-4 text-[14px]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="void-form"
            disabled={saving}
            className="btn-primary h-11 min-h-0 flex-1 px-4 text-[14px] disabled:opacity-50"
            style={{ background: 'var(--danger)', color: '#fff' }}
          >
            {saving ? t('menu.saving') : t('void.confirm')}
          </button>
        </>
      }
    >
      <form id="void-form" onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-[13px] text-ink-2">{t('void.body')}</p>
        <p className="rounded-field bg-surface-2 px-3 py-2 text-[13px] font-semibold text-ink">
          #{order.number} · {t('orders.itemsCount', { count: order.item_count })}
        </p>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('void.reason')}
          </span>
          <input
            className="field"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('void.reasonPlaceholder')}
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
            <LockKeyhole size={14} />
            {t('void.pin')}
          </span>
          <input
            className="field tabular-nums text-[20px] tracking-[0.25em]"
            dir="ltr"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={8}
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, '').slice(0, 8))
            }
            placeholder="••••"
          />
        </label>

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
