import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, api, type AuthUser } from './api';
import { cacheKeys, clearCache, readCache, saveCache } from './offline';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  startDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  finishTour: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The signed-in member, read from the API once on load. The session itself is an
 * HttpOnly cookie, so this only ever holds who is signed in — never a token.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((result) => {
        if (!cancelled) setUser(result);
        // Remember who was here, so the till still opens with no connection.
        saveCache(cacheKeys.user, result);
      })
      .catch((error) => {
        if (cancelled) return;
        // A server that answers 401 means signed out; a connection that never
        // answered keeps the last member, which is what an offline shift reads.
        if (!(error instanceof ApiError)) {
          const cached = readCache<AuthUser>(cacheKeys.user);
          if (cached) {
            setUser(cached);
            return;
          }
        }
        clearCache(cacheKeys.user);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const member = await api.login(username, password);
    // Remembered right away, so the till opens offline after this sign-in even
    // when `/api/auth/me` never gets an answer.
    saveCache(cacheKeys.user, member);
    setUser(member);
  }, []);

  // The demo visitor: a real session on the sample store, read-only server-side.
  const startDemo = useCallback(async () => {
    const member = await api.startDemo();
    saveCache(cacheKeys.user, member);
    setUser(member);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // A device that leaves someone signed in offline must forget them here.
      clearCache(cacheKeys.user);
      setUser(null);
    }
  }, []);

  const finishTour = useCallback(async () => {
    const member = await api.finishOnboarding();
    saveCache(cacheKeys.user, member);
    setUser(member);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, startDemo, signOut, finishTour }),
    [user, loading, signIn, startDemo, signOut, finishTour],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
