'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface User {
  id: string;
  displayName?: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authMethod: 'email' | null;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  fetchUserProfile: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(value: any): User {
  return {
    id: value.id,
    displayName: value.displayName ?? value.display_name ?? undefined,
    email: value.email,
    role: value.role ?? 'user',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const fetchUserProfile = useCallback(async (): Promise<User | null> => {
    try {
      const response = await fetch('/api/users/me', { credentials: 'include' });
      if (!response.ok) return null;
      const data = await response.json();
      const nextUser = normalizeUser(data.user ?? data);
      setUser(nextUser);
      return nextUser;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const operation = (async () => {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        setUser(null);
        throw new Error('Session expired');
      }
      const nextUser = await fetchUserProfile();
      if (!nextUser) throw new Error('Unable to load the refreshed session');
    })();
    refreshInFlight.current = operation;
    try {
      await operation;
    } finally {
      refreshInFlight.current = null;
    }
  }, [fetchUserProfile]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const currentUser = await fetchUserProfile();
      if (!currentUser) {
        await refresh().catch(() => undefined);
      }
      if (active) setIsLoading(false);
    };
    void initialize();
    return () => { active = false; };
  }, [fetchUserProfile, refresh]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refresh, user]);

  useEffect(() => {
    if (!user) return;
    const refreshVisibleSession = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined);
    };
    window.addEventListener('focus', refreshVisibleSession);
    document.addEventListener('visibilitychange', refreshVisibleSession);
    return () => {
      window.removeEventListener('focus', refreshVisibleSession);
      document.removeEventListener('visibilitychange', refreshVisibleSession);
    };
  }, [refresh, user]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Login failed');
      setUser(normalizeUser(data.user));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const registerWithEmail = useCallback(async (
    email: string,
    password: string,
    displayName?: string,
  ) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Registration failed');
      setUser(normalizeUser(data.user));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: user !== null,
    isLoading,
    authMethod: user ? 'email' : null,
    loginWithEmail,
    registerWithEmail,
    logout,
    refresh,
    fetchUserProfile,
  }), [fetchUserProfile, isLoading, loginWithEmail, logout, refresh, registerWithEmail, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
