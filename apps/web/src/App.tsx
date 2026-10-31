import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { AppDataProvider } from './lib/store';
import Dashboard from './pages/Dashboard';
import ModulePage from './pages/ModulePage';
import NotFound from './pages/NotFound';
import SetupPage from './pages/SetupPage';

export default function App() {
  return (
    <AppDataProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path=":module" element={<ModulePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppDataProvider>
  );
}
