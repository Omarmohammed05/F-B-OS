import Ornament from './Ornament';

type Category = {
  id: number;
  name_ar: string;
  name_en: string;
  emoji: string;
};

type Props = {
  categories: Category[];
  counts: Record<number, number>;
  lang: 'ar' | 'en';
  itemsLabel: (count: number) => string;
  onPick: (id: number) => void;
};

/**
 * The tiled "explore the menu" board: one card per category, the way a printed
 * menu opens. Tapping a tile jumps to that section further down the page.
 */
export default function ExploreGrid({
  categories,
  counts,
  lang,
  itemsLabel,
  onPick,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onPick(category.id)}
          className="group relative aspect-square overflow-hidden rounded-[20px] border border-line text-center transition-colors hover:border-[color:var(--accent)]"
        >
          <span
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(209,160,94,0.22),transparent_65%)]"
          />
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center pb-8 text-[44px] opacity-90 transition-transform duration-300 group-hover:scale-105"
          >
            {category.emoji}
          </span>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/45 to-transparent"
          />
          <span className="absolute inset-x-0 top-3 flex justify-center text-[color:var(--accent)]">
            <Ornament size={16} />
          </span>
          <span className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 px-2 pb-2.5">
            <span className="text-[13px] font-semibold leading-tight text-white">
              {lang === 'ar' ? category.name_ar : category.name_en}
            </span>
            <span className="text-[11px] tabular-nums text-white/60">
              {itemsLabel(counts[category.id] ?? 0)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
