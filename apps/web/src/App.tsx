import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import RequireAuth from './components/RequireAuth';
import { AuthProvider, useAuth } from './lib/auth';
import { AppDataProvider } from './lib/store';
import { isOwner } from './lib/roles';
import OwnerOnly from './components/OwnerOnly';
import ActivatePage from './pages/ActivatePage';
import AttendancePage from './pages/AttendancePage';
import ChecklistPage from './pages/ChecklistPage';
import CustomersPage from './pages/CustomersPage';
import Dashboard from './pages/Dashboard';
import IncomePage from './pages/IncomePage';
import InventoryPage from './pages/InventoryPage';
import LoginPage from './pages/LoginPage';
import LoyaltyPage from './pages/LoyaltyPage';
import MenuPage from './pages/MenuPage';
import NotFound from './pages/NotFound';
import OnboardingPage from './pages/OnboardingPage';
import OrdersPage from './pages/OrdersPage';
import PlatformPage from './pages/PlatformPage';
import PosPage from './pages/PosPage';
import PublicMenuPage from './pages/PublicMenuPage';
import QrMenuPage from './pages/QrMenuPage';
import RecipePage from './pages/RecipePage';
import ReportsPage from './pages/ReportsPage';
import RestaurantsPage from './pages/RestaurantsPage';
import SettingsPage from './pages/SettingsPage';
import SetupPage from './pages/SetupPage';
import TeamPage from './pages/TeamPage';

/**
 * `/` is whoever's home: the platform owner opens the restaurants, a
 * restaurant's people open their own dashboard.
 */
function Home() {
  const { user } = useAuth();
  return isOwner(user?.role) ? <PlatformPage /> : <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        {/* A restaurant's activation link: no session yet, that is the point. */}
        <Route path="activate/:token" element={<ActivatePage />} />
        {/* The stand on the table: a guest's menu, no account of any kind. */}
        <Route path="m/:token" element={<PublicMenuPage />} />

        <Route element={<RequireAuth />}>
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route
            element={
              <AppDataProvider>
                <AppShell />
              </AppDataProvider>
            }
          >
            {/* The platform owner's own screens: overview, restaurants, income. */}
            <Route
              path="platform"
              element={
                <OwnerOnly>
                  <PlatformPage />
                </OwnerOnly>
              }
            />
            <Route
              path="restaurants"
              element={
                <OwnerOnly>
                  <RestaurantsPage />
                </OwnerOnly>
              }
            />
            <Route
              path="income"
              element={
                <OwnerOnly>
                  <IncomePage />
                </OwnerOnly>
              }
            />
            <Route index element={<Dashboard />} />
            <Route path="setup" element={<SetupPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="qr-menu" element={<QrMenuPage />} />
            <Route path="menu/:productId/recipe" element={<RecipePage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="loyalty" element={<LoyaltyPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="checklists" element={<ChecklistPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
