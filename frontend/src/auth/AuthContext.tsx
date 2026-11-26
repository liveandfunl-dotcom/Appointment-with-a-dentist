import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';

import { getMe, logoutRequest } from '../api/auth';
import { ApiError } from '../api/client';
import type { Me } from '../api/types';

export type { Me, Role } from '../api/types';

interface AuthValue {
  user: Me | null;
  loading: boolean;
  /** Перечитать пользователя через `GET /api/auth/me` (например, после входа). */
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function fetchMe(): Promise<Me | null> {
  try {
    return await getMe();
  } catch (e) {
    if (e instanceof ApiError) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      setUser(await fetchMe());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const logout = useCallback(async () => {
    await logoutRequest();
    // Сначала уходим на открытую страницу, иначе Guard отправит гостя на /login.
    // react-router обновляет location внутри transition, поэтому очистку пользователя
    // ставим в тот же transition: оба обновления попадают в один рендер.
    navigate('/doctors');
    startTransition(() => setUser(null));
  }, [navigate]);

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
