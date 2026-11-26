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

import { api, ApiError } from '../api/client';

export type Role = 'doctor' | 'admin' | 'root';

/** Ответ `GET /api/auth/me`. */
export interface Me {
  id: number;
  surname: string;
  name: string;
  role: Role;
}

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
    return await api.get<Me>('/api/auth/me');
  } catch (e) {
    if (e instanceof ApiError) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    fetchMe().then(
      (me) => {
        if (cancelled) return;
        setUser(me);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setUser(null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setUser(await fetchMe());
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
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
