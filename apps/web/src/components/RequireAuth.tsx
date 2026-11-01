import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';

/** Everything behind the sign-in wall, and the tour before anything else. */
export default function RequireAuth() {
  const { user, loading } = useAuth();
  const { t } = useLang();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <span className="text-[14px] text-ink-2">{t('common.loading')}</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // A first sign-in opens the tour; it can be reopened from the user menu.
  if (user.needs_onboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
