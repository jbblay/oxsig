'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useClerk, useUser as useClerkUser } from '@clerk/nextjs';
import {
  E2E_AUTH_ACCOUNTS,
  readE2EAuthAccountKey,
  type E2EAuthAccountKey,
} from './e2e-auth-contract';

export interface User {
  id: string;
  publicKey?: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  sessionIdentityId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  profileError: string | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeProfile(data: any): User {
  return {
    id: data.id,
    publicKey: data.publicKey ?? data.public_key ?? undefined,
    email: data.email ?? undefined,
    displayName: data.displayName ?? data.display_name ?? data.email ?? undefined,
    avatarUrl: data.avatarUrl ?? data.avatar_url ?? undefined,
    role: data.role ?? 'user',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded, isSignedIn } = useClerkUser();
  const { signOut } = useClerk();
  const [profile, setProfile] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const fetchUserProfile = useCallback(async () => {
    if (!isSignedIn) {
      setProfile(null);
      setProfileError(null);
      return;
    }

    setProfileLoading(true);
    try {
      const response = await fetch('/api/users/me', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error(`Profile request failed (${response.status})`);
      const payload = await response.json();
      setProfile(normalizeProfile(payload.user ?? payload));
      setProfileError(null);
    } catch (error) {
      setProfile(null);
      setProfileError(error instanceof Error ? error.message : 'Could not load profile');
    } finally {
      setProfileLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    void fetchUserProfile();
  }, [isLoaded, clerkUser?.id, fetchUserProfile]);

  const fallbackUser = useMemo<User | null>(() => {
    if (!isSignedIn || !clerkUser) return null;
    const email = clerkUser.primaryEmailAddress?.emailAddress;
    return {
      id: clerkUser.id,
      email,
      displayName: clerkUser.fullName || clerkUser.username || email || 'Oxsig user',
      avatarUrl: clerkUser.imageUrl,
      role: 'user',
    };
  }, [isSignedIn, clerkUser]);

  const logout = async () => {
    setProfile(null);
    setProfileError(null);
    await signOut({ redirectUrl: '/' });
  };

  const value: AuthContextType = {
    user: profile ?? fallbackUser,
    sessionIdentityId: clerkUser?.id ?? null,
    isAuthenticated: Boolean(isSignedIn),
    isLoading: !isLoaded || profileLoading,
    profileError,
    logout,
    refresh: fetchUserProfile,
    fetchUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function E2EAuthProvider({ children }: { children: ReactNode }) {
  const [accountKey, setAccountKey] = useState<E2EAuthAccountKey | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const next = typeof document === 'undefined' ? null : readE2EAuthAccountKey(document.cookie);
    setAccountKey(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const account = accountKey ? E2E_AUTH_ACCOUNTS[accountKey] : null;
  const user = useMemo<User | null>(() => account ? {
    id: account.userId,
    email: account.email,
    displayName: account.name,
    role: 'user',
  } : null, [account]);

  const logout = useCallback(async () => {
    setAccountKey(null);
  }, []);

  const value: AuthContextType = {
    user,
    sessionIdentityId: account?.identityId ?? null,
    isAuthenticated: !!account,
    isLoading: !loaded,
    profileError: null,
    logout,
    refresh,
    fetchUserProfile: refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
