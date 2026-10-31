import { formatClock, formatCurrency } from '../lib/format';
import { useLang } from '../lib/i18n';
import type { DashboardData } from '../lib/api';
import StatusChip from './StatusChip';

type Props = {
  rows: DashboardData['activity'];
  currency: string;
};

export default function RecentActivity({ rows, currency }: Props) {
  const { t, lang } = useLang();

  return (
    <section className="card flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <h2 className="text-[15px] font-semibold text-ink">
          {t('activity.title')}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-start">
          <thead>
            <tr className="table-head border-y border-line text-start">
              <th className="px-4 py-2 text-start font-semibold">
                {t('activity.order')}
              </th>
              <th className="px-4 py-2 text-start font-semibold">
                {t('activity.item')}
              </th>
              <th className="px-4 py-2 text-end font-semibold">
                {t('activity.unitPrice')}
              </th>
              <th className="px-4 py-2 text-start font-semibold">
                {t('activity.table')}
              </th>
              <th className="px-4 py-2 text-end font-semibold">
                {t('activity.qty')}
              </th>
              <th className="px-4 py-2 text-start font-semibold">
                {t('activity.status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.number}
                className="border-b border-line last:border-b-0 transition-colors duration-150 hover:bg-surface-2"
              >
                <td className="px-4 py-3 text-[13px] font-semibold text-ink">
                  {row.number}
                  <span className="ms-1.5 text-[11px] font-normal text-ink-2">
                    {formatClock(lang, row.placed_at)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] text-ink">
                  {lang === 'ar' ? row.item_ar : row.item_en}
                </td>
                <td className="px-4 py-3 text-end text-[13px] text-ink-2">
                  {formatCurrency(lang, row.unit_price, currency)}
                </td>
                <td className="px-4 py-3 text-[13px] text-ink-2">
                  {row.table_name}
                </td>
                <td className="px-4 py-3 text-end text-[13px] text-ink-2">
                  {row.qty}
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
