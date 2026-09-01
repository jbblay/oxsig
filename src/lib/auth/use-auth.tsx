/**
 * React Authentication Hook
 * Provides authentication state and methods to React components.
 */

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authService, type User } from './auth-client';
import { wsManager } from '@/lib/websocket';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authMethod: 'email' | 'did' | null;
  login: (publicKey: string, signature: string, challenge?: string) => Promise<void>;
  register: (data: {
    publicKey: string;
    displayName?: string;
    email?: string;
    signature?: string;
  }) => Promise<User>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(data: any): User {
  return {
    id: data.id,
    publicKey: data.publicKey ?? data.public_key ?? '',
    email: data.email,
    displayName: data.displayName ?? data.display_name ?? data.email,
    role: data.role ?? 'user',
  };
}

async function requestEmailProfile(allowRefresh = true): Promise<User | null> {
  try {
    let response = await fetch('/api/users/me', {
      credentials: 'include',
      cache: 'no-store',
    });

    if (response.status === 401 && allowRefresh) {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshResponse.ok) {
        response = await fetch('/api/users/me', {
          credentials: 'include',
          cache: 'no-store',
        });
      }
    }

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const profile = payload.user ?? payload;

    if (!profile?.id) {
      return null;
    }

    return normalizeUser(profile);
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMethod, setAuthMethod] = useState<'email' | 'did' | null>(null);

  const fetchUserProfile = async () => {
    const profile = await requestEmailProfile();
    if (profile) {
      setUser(profile);
      setAuthMethod('email');
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      const emailUser = await requestEmailProfile();

      if (cancelled) return;

      if (emailUser) {
        setUser(emailUser);
        setAuthMethod('email');
      } else {
        const currentUser = authService.getUser();
        if (currentUser) {
          setUser(currentUser);
          setAuthMethod('did');
        }
      }

      setIsLoading(false);
    };

    void initAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep short-lived email access cookies renewed while the user is active.
  useEffect(() => {
    if (authMethod !== 'email') return;

    const refreshInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          setUser(null);
          setAuthMethod(null);
        }
      } catch (error) {
        console.error('Email session refresh failed:', error);
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [authMethod]);

  // Preserve the existing local-token refresh behavior for DID auth.
  useEffect(() => {
    if (authMethod !== 'did') return;

    const refreshInterval = setInterval(async () => {
      try {
        await authService.refresh();
      } catch (error) {
        console.error('DID auto-refresh failed:', error);
        setUser(null);
        setAuthMethod(null);
      }
    }, 20 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [authMethod]);

  useEffect(() => {
    if (user?.id) {
      wsManager.connect(user.id).catch((error) => {
        console.error('Failed to connect WebSocket:', error);
      });
    } else {
      wsManager.disconnect();
    }
  }, [user]);

  const loginWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Login failed');
      }

      setUser(normalizeUser(data.user));
      setAuthMethod('email');
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (email: string, password: string, displayName?: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Registration failed');
      }

      setUser(normalizeUser(data.user));
      setAuthMethod('email');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (publicKey: string, signature: string, challenge?: string) => {
    setIsLoading(true);
    try {
      const response = await authService.login(publicKey, signature, challenge);
      setUser(response.user);
      setAuthMethod('did');
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: Parameters<typeof authService.register>[0]) => {
    setIsLoading(true);
    try {
      const registeredUser = await authService.register(data);
      setUser(registeredUser);
      setAuthMethod('did');
      return registeredUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      if (authMethod === 'email') {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      }

      if (authMethod === 'did') {
        await authService.logout();
      }

      setUser(null);
      setAuthMethod(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async () => {
    try {
      if (authMethod === 'email') {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Email session refresh failed');
        }

        const profile = await requestEmailProfile(false);
        if (!profile) {
          throw new Error('Failed to restore user profile after refresh');
        }

        setUser(profile);
      } else if (authMethod === 'did') {
        await authService.refresh();
        setUser(authService.getUser());
      }
    } catch (error) {
      console.error('Refresh failed:', error);
      setUser(null);
      setAuthMethod(null);
    }
  };

  const isAuthenticated = user !== null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        authMethod,
        login,
        register,
        loginWithEmail,
        registerWithEmail,
        logout,
        refresh,
        fetchUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
