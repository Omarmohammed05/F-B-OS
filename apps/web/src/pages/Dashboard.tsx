import { Download } from 'lucide-react';
import KpiStrip from '../components/KpiStrip';
import PaymentDonut from '../components/PaymentDonut';
import PopularItems from '../components/PopularItems';
import RecentActivity from '../components/RecentActivity';
import RevenueChart from '../components/RevenueChart';
import { useLang } from '../lib/i18n';
import { useAppData } from '../lib/store';

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="skeleton h-9 w-64 rounded-[10px]" />
      <div className="skeleton h-28 rounded-card" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-[300px] rounded-card lg:col-span-2" />
        <div className="skeleton h-[300px] rounded-card" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-[280px] rounded-card lg:col-span-2" />
        <div className="skeleton h-[280px] rounded-card" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, loading, error, reload } = useAppData();
  const { t, lang } = useLang();

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="card flex flex-col items-start gap-3 p-6">
        <p className="text-[15px] font-semibold text-ink">{t('common.error')}</p>
        <button type="button" onClick={reload} className="btn-primary">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const { tenant, metrics, revenue, popular, activity, payments } = data;
  const currency = tenant.currency;
  const storeName = lang === 'ar' ? tenant.name_ar : tenant.name_en;

  const exportCsv = () => {
    const header = ['order', 'item', 'unit_price', 'table', 'qty', 'status'];
    const lines = activity.map((row) =>
      [
        row.number,
        `"${lang === 'ar' ? row.item_ar : row.item_en}"`,
        row.unit_price,
        row.table_name,
        row.qty,
        row.status,
      ].join(','),
    );
    const blob = new Blob([`\uFEFF${[header.join(','), ...lines].join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fbos-recent-activity.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t('dash.welcome', { store: storeName })}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('dash.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip border border-line bg-surface text-ink-2">
            {t('dash.dateRange')}
          </span>
          <button
            type="button"
            onClick={exportCsv}
            className="btn-quiet h-10 min-h-0 px-3 text-[13px]"
          >
            <Download size={15} strokeWidth={1.8} />
            {t('dash.export')}
          </button>
        </div>
      </div>

      <KpiStrip metrics={metrics} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <RevenueChart points={revenue} currency={currency} />
        </div>
        <PopularItems items={popular} currency={currency} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <RecentActivity rows={activity} currency={currency} />
        </div>
        <PaymentDonut
          payments={payments}
          currency={currency}
          orderCount={metrics.total_orders}
        />
      </div>
    </div>
  );
}
