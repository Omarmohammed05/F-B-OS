import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type DashboardData, type SetupState } from './api';

type AppDataContextValue = {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  applySetup: (setup: SetupState) => void;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .dashboard()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        document.documentElement.style.setProperty(
          '--accent',
          result.tenant.accent_color || '#0A84FF',
        );
      })
      .catch(() => {
        if (!cancelled) setError('failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const applySetup = useCallback((setup: SetupState) => {
    setData((current) => (current ? { ...current, setup } : current));
  }, []);

  const value = useMemo<AppDataContextValue>(
    () => ({
      data,
      loading,
      error,
      reload: () => setNonce((value) => value + 1),
      applySetup,
    }),
    [data, loading, error, applySetup],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used inside AppDataProvider');
  }
  return context;
}
