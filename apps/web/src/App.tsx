import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import RequireAuth from './components/RequireAuth';
import { AuthProvider } from './lib/auth';
import { AppDataProvider } from './lib/store';
import OwnerOnly from './components/OwnerOnly';
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
import PosPage from './pages/PosPage';
import RecipePage from './pages/RecipePage';
import ReportsPage from './pages/ReportsPage';
import RestaurantsPage from './pages/RestaurantsPage';
import SettingsPage from './pages/SettingsPage';
import SetupPage from './pages/SetupPage';
import TeamPage from './pages/TeamPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route
            element={
              <AppDataProvider>
                <AppShell />
              </AppDataProvider>
            }
          >
            {/* The platform owner's own screens: restaurants and income. */}
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
            <Route path="menu/:productId/recipe" element={<RecipePage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="loyalty" element={<LoyaltyPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
