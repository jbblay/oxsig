/**
 * React Authentication Hook
 * Provides authentication state and methods to React components
 */

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authService, type User } from './auth-client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (publicKey: string, signature: string, challenge?: string) => Promise<void>;
  register: (data: {
    publicKey: string;
    displayName?: string;
    email?: string;
    signature?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize auth state from stored tokens
    const currentUser = authService.getUser();
    setUser(currentUser);
    setIsLoading(false);

    // Set up token refresh interval
    const refreshInterval = setInterval(async () => {
      if (authService.isAuthenticated()) {
        try {
          await authService.refresh();
        } catch (error) {
          console.error('Auto-refresh failed:', error);
          setUser(null);
        }
      }
    }, 20 * 60 * 1000); // Refresh every 20 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  const login = async (publicKey: string, signature: string, challenge?: string) => {
    setIsLoading(true);
    try {
      const response = await authService.login(publicKey, signature, challenge);
      setUser(response.user);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: Parameters<typeof authService.register>[0]) => {
    setIsLoading(true);
    try {
      const user = await authService.register(data);
      return user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async () => {
    try {
      await authService.refresh();
      const currentUser = authService.getUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Refresh failed:', error);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: authService.isAuthenticated(),
        isLoading,
        login,
        register,
        logout,
        refresh,
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
