import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export default function Sheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
  footer,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-sheet border border-line bg-surface p-5 shadow-2xl sm:max-w-[520px] sm:rounded-card"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[18px] font-bold tracking-tight text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="icon-btn h-9 w-9"
          >
            <X size={16} />
          </button>
        </div>
        {children}
        {footer ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
