/**
 * React Authentication Hook
 * Provides authentication state and methods to React components
 * Supports dual authentication: Email/Password and DID/Internet Identity
 */

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authService, type User } from './auth-client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authMethod: 'email' | 'did' | null;
  // DID/Internet Identity methods
  login: (publicKey: string, signature: string, challenge?: string) => Promise<void>;
  register: (data: {
    publicKey: string;
    displayName?: string;
    email?: string;
    signature?: string;
  }) => Promise<User>;
  // Email/Password methods
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMethod, setAuthMethod] = useState<'email' | 'did' | null>(null);

  // Fetch user profile from /api/users/me (for email auth)
  const fetchUserProfile = async () => {
    try {
      const response = await fetch('/api/users/me', {
        credentials: 'include', // Include httpOnly cookies
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser({
          id: userData.id,
          publicKey: userData.public_key || '',
          email: userData.email,
          displayName: userData.display_name || userData.email,
          role: userData.role,
        });
        setAuthMethod('email');
        return;
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    }
  };

  useEffect(() => {
    // Initialize auth state
    const initAuth = async () => {
      // Check for JWT cookie auth first (email/password)
      await fetchUserProfile();
      
      // Fall back to DID auth from localStorage
      if (!user) {
        const currentUser = authService.getUser();
        if (currentUser) {
          setUser(currentUser);
          setAuthMethod('did');
        }
      }
      
      setIsLoading(false);
    };

    initAuth();

    // Set up token refresh interval for DID auth
    const refreshInterval = setInterval(async () => {
      if (authService.isAuthenticated()) {
        try {
          await authService.refresh();
        } catch (error) {
          console.error('Auto-refresh failed:', error);
          if (authMethod === 'did') {
            setUser(null);
            setAuthMethod(null);
          }
        }
      }
    }, 20 * 60 * 1000); // Refresh every 20 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // Email/Password authentication
  const loginWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      setUser({
        id: data.user.id,
        publicKey: data.user.public_key || '',
        email: data.user.email,
        displayName: data.user.display_name || data.user.email,
        role: data.user.role,
      });
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
        body: JSON.stringify({ email, password, display_name: displayName }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Registration failed');
      }

      const data = await response.json();
      setUser({
        id: data.user.id,
        publicKey: data.user.public_key || '',
        email: data.user.email,
        displayName: data.user.display_name || data.user.email,
        role: data.user.role,
      });
      setAuthMethod('email');
    } finally {
      setIsLoading(false);
    }
  };

  // DID/Internet Identity authentication
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
      const user = await authService.register(data);
      setAuthMethod('did');
      return user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      // Logout from email auth
      if (authMethod === 'email') {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      }
      
      // Logout from DID auth
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
        await fetchUserProfile();
      } else if (authMethod === 'did') {
        await authService.refresh();
        const currentUser = authService.getUser();
        setUser(currentUser);
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
