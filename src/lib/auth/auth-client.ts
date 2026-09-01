/**
 * Frontend Authentication Client
 * Handles all authentication operations with the backend API
 */

import { apiClient } from '../api/client';

export interface User {
  id: string;
  publicKey: string;
  displayName?: string;
  email?: string;
  role?: string;
}

export interface AuthTokens {
  accessToken?: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

/**
 * Authentication service
 */
export class AuthService {
  private static instance: AuthService;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private user: User | null = null;

  private constructor() {
    // Load tokens from localStorage on initialization
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshToken = localStorage.getItem('refreshToken');
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          this.user = JSON.parse(userStr);
        } catch (e) {
          console.error('Failed to parse stored user:', e);
        }
      }
    }
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Register a new user
   */
  async register(data: {
    publicKey: string;
    displayName?: string;
    email?: string;
    signature: string;
    challenge: string;
  }): Promise<User> {
    const response = await apiClient.post<{ user: User }>('/api/auth/did/register', data);
    if (response.error) {
      throw new Error(response.error.message || 'Registration failed');
    }
    const user = response.data!.user;
    this.user = user;
    if (typeof window !== 'undefined') localStorage.setItem('user', JSON.stringify(user));
    return user;
  }

  /**
   * Login with public key and signature
   */
  async login(publicKey: string, signature: string, challenge?: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/api/auth/did/login', {
      publicKey,
      signature,
      challenge,
    });

    if (response.error) {
      throw new Error(response.error.message || 'Login failed');
    }

    const data = response.data!;

    // Store tokens and user
    this.accessToken = data.accessToken || null;
    this.refreshToken = data.refreshToken || null;
    this.user = data.user;

    if (typeof window !== 'undefined') {
      if (data.accessToken) localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
    }

    return data;
  }

  /**
   * Refresh access token
   */
  async refresh(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiClient.post<{ accessToken: string; expiresIn: number }>(
      '/api/auth/refresh',
      {
        refreshToken: this.refreshToken,
      }
    );

    if (response.error) {
      // Refresh failed, clear all auth data
      this.clearAuth();
      throw new Error(response.error.message || 'Token refresh failed');
    }

    const data = response.data!;
    this.accessToken = data.accessToken;

    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', data.accessToken);
    }

    return data.accessToken;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    this.clearAuth();
  }

  /**
   * Clear authentication data
   */
  private clearAuth(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;

    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    return this.user;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.user;
  }

  /**
   * Get authorization header value
   */
  getAuthHeader(): string | null {
    return this.accessToken ? `Bearer ${this.accessToken}` : null;
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();

// Convenient exports
export const auth = {
  register: (data: Parameters<AuthService['register']>[0]) => authService.register(data),
  login: (publicKey: string, signature: string, challenge?: string) =>
    authService.login(publicKey, signature, challenge),
  logout: () => authService.logout(),
  refresh: () => authService.refresh(),
  getUser: () => authService.getUser(),
  getToken: () => authService.getAccessToken(),
  isAuthenticated: () => authService.isAuthenticated(),
  getAuthHeader: () => authService.getAuthHeader(),
};
