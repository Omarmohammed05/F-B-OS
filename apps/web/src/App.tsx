import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { AppDataProvider } from './lib/store';
import Dashboard from './pages/Dashboard';
import InventoryPage from './pages/InventoryPage';
import MenuPage from './pages/MenuPage';
import ModulePage from './pages/ModulePage';
import NotFound from './pages/NotFound';
import RecipePage from './pages/RecipePage';
import SetupPage from './pages/SetupPage';

export default function App() {
  return (
    <AppDataProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="menu/:productId/recipe" element={<RecipePage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path=":module" element={<ModulePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppDataProvider>
  );
}
