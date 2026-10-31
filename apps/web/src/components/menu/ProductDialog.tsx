import { Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type MenuCategory,
  type MenuData,
  type MenuProduct,
} from '../../lib/api';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

const EMOJI_CHOICES = [
  '☕',
  '🥛',
  '🧊',
  '🧋',
  '🍰',
  '🥐',
  '🥪',
  '🍗',
  '🍵',
  '🍽️',
];

type Props = {
  open: boolean;
  product: MenuProduct | null;
  categories: MenuCategory[];
  onClose: () => void;
  onSaved: (menu: MenuData) => void;
};

export default function ProductDialog({
  open,
  product,
  categories,
  onClose,
  onSaved,
}: Props) {
  const { t, lang } = useLang();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [emoji, setEmoji] = useState('🍽️');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameAr(product?.name_ar ?? '');
    setNameEn(product?.name_en ?? '');
    setEmoji(product?.emoji ?? '🍽️');
    setPrice(product ? String(product.price) : '');
    setCategoryId(String(product?.category_id ?? categories[0]?.id ?? ''));
    setAvailable(product?.is_available ?? true);
    setError(null);
    setSaving(false);
    setConfirmDelete(false);
  }, [open, product, categories]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ar = nameAr.trim();
    const en = nameEn.trim();
    const priceValue = Number(price);

    if (!ar || !en) {
      setError(t('form.required'));
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setError(t('form.price'));
      return;
    }
    if (!categoryId) {
      setError(t('menu.invalid'));
      return;
    }

    setSaving(true);
    setError(null);
    const payload = {
      name_ar: ar,
      name_en: en,
      emoji: emoji.trim() || '🍽️',
      price: priceValue,
      category_id: Number(categoryId),
      is_available: available,
    };
    try {
      const menu = product
        ? await api.updateProduct(product.id, payload)
        : await api.createProduct(payload);
      onSaved(menu);
      onClose();
    } catch {
      setError(t('menu.invalid'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const menu = await api.deleteProduct(product.id);
      onSaved(menu);
      onClose();
    } catch {
      setError(t('menu.invalid'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={product ? t('menu.editProduct') : t('menu.newProductTitle')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          {product ? (
            confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="btn-quiet me-auto text-[color:var(--danger)]"
              >
                {t('menu.confirmDelete')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label={t('menu.delete')}
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
            form="product-form"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? t('menu.saving') : t('menu.save')}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
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

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('menu.category')}
            </span>
            <select
              className="field"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.emoji}{' '}
                  {lang === 'ar' ? category.name_ar : category.name_en}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {t('menu.price')}
            </span>
            <input
              className="field tabular-nums"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              dir="ltr"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('menu.emoji')}
          </span>
          <div className="flex items-center gap-2">
            <input
              className="field w-16 text-center text-[20px]"
              maxLength={4}
              dir="ltr"
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {EMOJI_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setEmoji(choice)}
                  aria-label={choice}
                  className={`flex h-9 w-9 items-center justify-center rounded-[10px] text-[18px] transition-colors ${
                    emoji === choice
                      ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
                      : 'bg-surface-2 hover:bg-line/50'
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={available}
          onClick={() => setAvailable((value) => !value)}
          className="flex items-center justify-between gap-3 rounded-field border border-line px-3 py-2.5 text-start"
        >
          <span className="text-[14px] font-medium text-ink">
            {available ? t('menu.available') : t('menu.unavailable')}
          </span>
          <span
            className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              available ? 'justify-end' : 'justify-start'
            }`}
            style={{
              background: available ? 'var(--accent)' : 'var(--line)',
            }}
          >
            <span className="h-5 w-5 rounded-full bg-white shadow" />
          </span>
        </button>

        {error ? (
          <p className="text-[13px] font-medium text-[color:var(--danger)]">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
