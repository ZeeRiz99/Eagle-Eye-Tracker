import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, clearTokens, getAccessToken, setTokens } from '../api/client';

export type Role = 'parent' | 'student';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  familyGroupId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (params: { name: string; email: string; password: string; role: Role }) => Promise<void>;
  logout: () => Promise<void>;
  setFamilyGroupId: (familyGroupId: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      // A stored token doesn't tell us who the user is without a /me endpoint;
      // for now we just clear stale sessions on cold start and require re-login.
      if (!token) setLoading(false);
      else setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<{ user: AuthUser; accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    await setTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
  }, []);

  const register = useCallback(
    async (params: { name: string; email: string; password: string; role: Role }) => {
      const result = await apiFetch<{ user: AuthUser; accessToken: string; refreshToken: string }>(
        '/auth/register',
        { method: 'POST', body: params, auth: false }
      );
      await setTokens(result.accessToken, result.refreshToken);
      setUser({ ...result.user, familyGroupId: result.user.familyGroupId ?? null });
    },
    []
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  const setFamilyGroupId = useCallback((familyGroupId: string) => {
    setUser((current) => (current ? { ...current, familyGroupId } : current));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setFamilyGroupId }),
    [user, loading, login, register, logout, setFamilyGroupId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
