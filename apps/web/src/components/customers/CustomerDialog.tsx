import { Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Customer, type CustomersData } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: (data: CustomersData) => void;
};

export default function CustomerDialog({
  open,
  customer,
  onClose,
  onSaved,
}: Props) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? '');
    setPhone(customer?.phone ?? '');
    setEmail(customer?.email ?? '');
    setNotes(customer?.notes ?? '');
    setSaving(false);
    setError(null);
    setConfirmDelete(false);
  }, [open, customer]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) {
      setError(t('form.required'));
      return;
    }

    setSaving(true);
    setError(null);
    const payload = {
      name: cleaned,
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim(),
    };
    try {
      const data = customer
        ? await api.updateCustomer(customer.id, payload)
        : await api.createCustomer(payload);
      onSaved(data);
      onClose();
    } catch {
      setError(t('crm.invalid'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      const data = await api.deleteCustomer(customer.id);
      onSaved(data);
      onClose();
    } catch {
      setError(t('crm.invalid'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={customer ? t('crm.edit') : t('crm.new')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          {customer ? (
            confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="btn-quiet me-auto text-[color:var(--danger)]"
              >
                {t('crm.deleteConfirm')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label={t('crm.delete')}
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
            form="customer-form"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? t('menu.saving') : t('menu.save')}
          </button>
        </>
      }
    >
      <form
        id="customer-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('crm.name')}
          </span>
          <input
            className="field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('crm.phone')}
            </span>
            <input
              className="field tabular-nums"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('crm.email')}
            </span>
            <input
              className="field"
              dir="ltr"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('crm.notes')}
          </span>
          <textarea
            className="field h-auto min-h-[76px] py-2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        {error ? (
          <p className="text-[13px] font-medium text-[color:var(--danger)]">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
