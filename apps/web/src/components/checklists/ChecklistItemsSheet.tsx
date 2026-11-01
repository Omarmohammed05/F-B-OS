import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type ChecklistRole,
  type ChecklistTask,
} from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { ROLE_LABEL_KEY, ROLES } from '../../lib/roles';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  tasks: ChecklistTask[];
  onClose: () => void;
  onSaved: (tasks: ChecklistTask[]) => void;
};

/**
 * The store's standing list. An item with ticks in the record is switched off
 * instead of deleted, so a past week's report never loses an answer.
 */
export default function ChecklistItemsSheet({
  open,
  tasks,
  onClose,
  onSaved,
}: Props) {
  const { t, lang } = useLang();
  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [role, setRole] = useState<ChecklistRole>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setTitleAr('');
    setTitleEn('');
    setRole('');
    setEditingId(null);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    setSaving(false);
    setBusyId(null);
    setConfirmId(null);
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ar = titleAr.trim();
    const en = titleEn.trim();
    if (!ar || !en) {
      setError(t('form.required'));
      return;
    }
    setSaving(true);
    setError(null);
    const body = { title_ar: ar, title_en: en, role };
    const call =
      editingId === null
        ? api.createChecklistTask(body)
        : api.updateChecklistTask(editingId, body);
    call
      .then((result) => {
        onSaved(result.tasks);
        resetForm();
      })
      .catch(() => setError(t('checklists.failed')))
      .finally(() => setSaving(false));
  };

  const startEdit = (task: ChecklistTask) => {
    setEditingId(task.id);
    setTitleAr(task.title_ar);
    setTitleEn(task.title_en);
    setRole(task.role);
    setError(null);
  };

  const toggleActive = (task: ChecklistTask) => {
    setBusyId(task.id);
    api
      .updateChecklistTask(task.id, { is_active: !task.is_active })
      .then((result) => onSaved(result.tasks))
      .catch(() => setError(t('checklists.failed')))
      .finally(() => setBusyId(null));
  };

  const remove = (task: ChecklistTask) => {
    if (confirmId !== task.id) {
      setConfirmId(task.id);
      return;
    }
    setBusyId(task.id);
    api
      .deleteChecklistTask(task.id)
      .then((result) => {
        onSaved(result.tasks);
        setConfirmId(null);
      })
      .catch(() => setError(t('checklists.failed')))
      .finally(() => setBusyId(null));
  };

  const roleLabel = (value: ChecklistRole) =>
    value ? t(ROLE_LABEL_KEY[value]) : t('checklists.role.all');

  return (
    <Sheet
      open={open}
      title={t('checklists.sheetTitle')}
      closeLabel={t('common.close')}
      onClose={onClose}
    >
      <ul className="flex flex-col divide-y divide-[color:var(--line)]">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-[14px] font-medium ${
                  task.is_active ? 'text-ink' : 'text-ink-2 line-through'
                }`}
              >
                {lang === 'ar' ? task.title_ar : task.title_en}
              </p>
              <p className="text-[12px] text-ink-2">
                {roleLabel(task.role)}
                {task.is_active ? '' : ` · ${t('checklists.hidden')}`}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={task.is_active}
              aria-label={`${t('team.active')} — ${
                lang === 'ar' ? task.title_ar : task.title_en
              }`}
              disabled={busyId === task.id}
              onClick={() => toggleActive(task)}
              className="relative h-6 w-10 shrink-0 rounded-full border border-line transition-colors duration-150"
              style={{
                background: task.is_active ? 'var(--success)' : 'var(--surface-2)',
              }}
            >
              <span
                aria-hidden="true"
                className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow"
                style={{
                  insetInlineStart: task.is_active ? 20 : 2,
                  transition: 'inset-inline-start 150ms',
                }}
              >
                {task.is_active ? (
                  <Check
                    size={11}
                    strokeWidth={3}
                    className="m-auto text-[color:var(--success)]"
                  />
                ) : null}
              </span>
            </button>
            <button
              type="button"
              aria-label={`${t('checklists.editItem')} — ${
                lang === 'ar' ? task.title_ar : task.title_en
              }`}
              onClick={() => startEdit(task)}
              className="icon-btn h-9 w-9"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              aria-label={`${t('checklists.remove')} — ${
                lang === 'ar' ? task.title_ar : task.title_en
              }`}
              disabled={task.has_checks || busyId === task.id}
              onClick={() => remove(task)}
              className={`icon-btn h-9 w-9 ${
                confirmId === task.id
                  ? 'border-[color:var(--danger)] text-[color:var(--danger)]'
                  : ''
              }`}
              title={
                task.has_checks ? t('checklists.hasHistory') : t('checklists.remove')
              }
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      {confirmId !== null ? (
        <p className="mt-2 text-[12px] font-medium text-[color:var(--danger)]">
          {t('checklists.removeConfirm')}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-4 border-t border-line pt-4">
        <p className="mb-2 text-[13px] font-semibold text-ink">
          {editingId === null
            ? t('checklists.newItem')
            : t('checklists.editItem')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-2">
              {t('checklists.titleAr')}
            </span>
            <input
              className="field"
              value={titleAr}
              onChange={(event) => setTitleAr(event.target.value)}
              aria-label={t('checklists.titleAr')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-2">
              {t('checklists.titleEn')}
            </span>
            <input
              className="field"
              dir="ltr"
              value={titleEn}
              onChange={(event) => setTitleEn(event.target.value)}
              aria-label={t('checklists.titleEn')}
            />
          </label>
        </div>
        <label className="mt-2 block">
          <span className="mb-1 block text-[12px] font-medium text-ink-2">
            {t('checklists.role')}
          </span>
          <select
            className="field"
            value={role}
            onChange={(event) => setRole(event.target.value as ChecklistRole)}
            aria-label={t('checklists.role')}
          >
            <option value="">{t('checklists.role.all')}</option>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {t(ROLE_LABEL_KEY[value])}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="mt-2 text-[13px] font-medium text-[color:var(--danger)]">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary h-11 min-h-0 px-4 text-[14px]"
          >
            <Plus size={16} />
            {editingId === null ? t('checklists.add') : t('checklists.save')}
          </button>
          {editingId !== null ? (
            <button
              type="button"
              onClick={resetForm}
              className="btn-quiet h-11 min-h-0 px-4 text-[14px]"
            >
              {t('common.cancel')}
            </button>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}
