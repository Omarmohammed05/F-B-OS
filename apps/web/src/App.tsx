import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { AppDataProvider } from './lib/store';
import CustomersPage from './pages/CustomersPage';
import Dashboard from './pages/Dashboard';
import InventoryPage from './pages/InventoryPage';
import MenuPage from './pages/MenuPage';
import ModulePage from './pages/ModulePage';
import NotFound from './pages/NotFound';
import OrdersPage from './pages/OrdersPage';
import PosPage from './pages/PosPage';
import RecipePage from './pages/RecipePage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import SetupPage from './pages/SetupPage';
import TeamPage from './pages/TeamPage';

export default function App() {
  return (
    <AppDataProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="menu/:productId/recipe" element={<RecipePage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path=":module" element={<ModulePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppDataProvider>
  );
}
