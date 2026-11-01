import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type MenuCategory, type MenuData } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  categories: MenuCategory[];
  onClose: () => void;
  onSaved: (menu: MenuData) => void;
};

export default function CategoryManager({
  open,
  categories,
  onClose,
  onSaved,
}: Props) {
  const { t, lang } = useLang();
  const [editing, setEditing] = useState<MenuCategory | 'new' | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [emoji, setEmoji] = useState('🍽️');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setError(null);
    setConfirming(null);
  }, [open]);

  const startNew = () => {
    setEditing('new');
    setNameAr('');
    setNameEn('');
    setEmoji('🍽️');
    setError(null);
  };

  const startEdit = (category: MenuCategory) => {
    setEditing(category);
    setNameAr(category.name_ar);
    setNameEn(category.name_en);
    setEmoji(category.emoji);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ar = nameAr.trim();
    const en = nameEn.trim();
    if (!ar || !en) {
      setError(t('form.required'));
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { name_ar: ar, name_en: en, emoji: emoji.trim() || '🍽️' };
    try {
      const menu =
        editing && editing !== 'new'
          ? await api.updateCategory(editing.id, payload)
          : await api.createCategory(payload);
      onSaved(menu);
      setEditing(null);
    } catch {
      setError(t('menu.invalid'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: MenuCategory) => {
    try {
      const menu = await api.deleteCategory(category.id);
      onSaved(menu);
      setConfirming(null);
    } catch {
      setError(t('menu.invalid'));
    }
  };

  return (
    <Sheet
      open={open}
      title={t('menu.categories')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        editing ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="btn-quiet me-auto"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="category-form"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? t('menu.saving') : t('menu.save')}
            </button>
          </>
        ) : (
          <button type="button" onClick={startNew} className="btn-primary w-full">
            <Plus size={17} />
            {t('menu.newCategory')}
          </button>
        )
      }
    >
      {editing ? (
        <form
          id="category-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink-2">
                {t('menu.nameAr')}
              </span>
              <input
                className="field"
                dir="rtl"
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink-2">
                {t('menu.nameEn')}
              </span>
              <input
                className="field"
                dir="ltr"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('menu.emoji')}
            </span>
            <input
              className="field w-20 text-center text-[20px]"
              maxLength={4}
              dir="ltr"
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
            />
          </label>
          {error ? (
            <p className="text-[13px] font-medium text-[color:var(--danger)]">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="flex flex-col gap-1.5">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center gap-2.5 rounded-field border border-line px-3 py-2"
            >
              <span className="text-[20px]">{category.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">
                  {lang === 'ar' ? category.name_ar : category.name_en}
                </p>
                <p className="text-[12px] tabular-nums text-ink-2">
                  {t('menu.searchAll', { count: category.product_count })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startEdit(category)}
                aria-label={t('menu.edit')}
                className="icon-btn h-9 w-9"
              >
                <Pencil size={14} />
              </button>
              {category.product_count > 0 ? (
                <span
                  title={t('menu.blockedCategory')}
                  className="flex h-9 w-9 items-center justify-center text-ink-2"
                >
                  <Lock size={14} />
                </span>
              ) : confirming === category.id ? (
                <button
                  type="button"
                  onClick={() => handleDelete(category)}
                  className="btn-quiet h-9 min-h-0 px-2.5 text-[12px] text-[color:var(--danger)]"
                >
                  {t('menu.confirmDelete')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(category.id)}
                  aria-label={t('menu.delete')}
                  className="icon-btn h-9 w-9 text-[color:var(--danger)]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {error ? (
            <p className="mt-1 text-[13px] font-medium text-[color:var(--danger)]">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
