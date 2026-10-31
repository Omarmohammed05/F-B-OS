import { useLang } from '../lib/i18n';

export type OrderStatus = 'preparing' | 'served' | 'cancelled' | 'new';

const tones: Record<OrderStatus, string> = {
  preparing: 'var(--warning)',
  served: 'var(--success)',
  cancelled: 'var(--danger)',
  new: 'var(--accent)',
};

const labelKeys = {
  preparing: 'status.preparing',
  served: 'status.served',
  cancelled: 'status.cancelled',
  new: 'status.new',
} as const;

export default function StatusChip({ status }: { status: OrderStatus }) {
  const { t } = useLang();
  const color = tones[status] ?? tones.new;

  return (
    <span
      className="chip"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      {t(labelKeys[status] ?? labelKeys.new)}
    </span>
  );
}
