'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthState } from '../types';
import { login as apiLogin, loginWithTOTP as apiLoginTOTP, logout as apiLogout } from '../api/auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const result = await apiLogin(email, password);
        if (result.requiresTOTP) return { requiresTOTP: true };
        if (result.accessToken && result.user) {
          localStorage.setItem('aop_access_token', result.accessToken);
          set({ user: result.user, accessToken: result.accessToken, isAuthenticated: true });
        }
        return { requiresTOTP: false };
      },

      loginWithTOTP: async (email, password, totpCode) => {
        const result = await apiLoginTOTP(email, password, totpCode);
        localStorage.setItem('aop_access_token', result.accessToken);
        set({ user: result.user, accessToken: result.accessToken, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem('aop_access_token');
        apiLogout();
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      setTokens: (accessToken, user) => {
        localStorage.setItem('aop_access_token', accessToken);
        set({ user, accessToken, isAuthenticated: true });
      },
    }),
    {
      name: 'aop-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
