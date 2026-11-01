import { Minus, Plus } from 'lucide-react';
import type { Lang } from '../../lib/i18n';
import type { PublicMenuProduct } from '../../lib/api';

type Props = {
  product: PublicMenuProduct;
  qty: number;
  lang: Lang;
  price: string;
  addLabel: string;
  removeLabel: string;
  onAdd: () => void;
  onRemove: () => void;
};

/**
 * One line of the guest's menu: the dish, its price and the control that puts it
 * in the basket. The quantity stepper only appears once the guest has added it.
 */
export default function MenuItemRow({
  product,
  qty,
  lang,
  price,
  addLabel,
  removeLabel,
  onAdd,
  onRemove,
}: Props) {
  const name = lang === 'ar' ? product.name_ar : product.name_en;

  return (
    <article className="flex items-center gap-3 border-b border-line py-3.5 last:border-0">
      <span
        aria-hidden
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-surface-2 text-[26px]"
      >
        {product.emoji}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
        <p className="mt-1 text-[13px] font-semibold tabular-nums text-[color:var(--accent)]">
          {price}
        </p>
      </div>

      {qty ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${removeLabel} — ${name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-2 text-ink transition-colors hover:border-[color:var(--accent)]"
          >
            <Minus size={15} strokeWidth={2} />
          </button>
          <span className="w-6 text-center text-[15px] font-semibold tabular-nums text-ink">
            {qty}
          </span>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`${addLabel} — ${name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--accent)] text-[color:var(--accent-ink)] transition-opacity hover:opacity-90"
          >
            <Plus size={15} strokeWidth={2.2} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`${addLabel} — ${name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-ink transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      )}
    </article>
  );
}
