import { X } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import { useAppData } from '../lib/store';
import DemoNotice from './DemoNotice';
import OfflineStatus from './OfflineStatus';
import Sidebar from './Sidebar';
import TabBar from './TabBar';
import Topbar from './Topbar';

export default function AppShell() {
  const { t, lang } = useLang();
  const { data } = useAppData();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const storeName = data
    ? lang === 'ar'
      ? data.tenant.name_ar
      : data.tenant.name_en
    : '—';
  const setup = data?.setup ?? { completed: 0, total: 0 };
  const branches = data?.branches ?? [];
  const activeBranchId = data?.active_id ?? 0;

  return (
    <div className="min-h-screen bg-bg text-ink">
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[264px] lg:block">
        <Sidebar
          storeName={storeName}
          branches={branches}
          activeBranchId={activeBranchId}
          setup={setup}
        />
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('nav.dashboard')}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="absolute inset-y-0 start-0 w-[280px] bg-surface shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="icon-btn absolute end-2 top-3 z-10 h-9 w-9"
            >
              <X size={16} />
            </button>
            <Sidebar
              storeName={storeName}
              branches={branches}
              activeBranchId={activeBranchId}
              setup={setup}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="lg:ps-[264px]">
        <Topbar
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenPos={() => navigate('/pos')}
        />
        <main className="mx-auto w-full max-w-[1280px] px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      <DemoNotice />
      <OfflineStatus />
      <TabBar />
    </div>
  );
}
