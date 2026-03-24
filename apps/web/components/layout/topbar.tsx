'use client';
import React from 'react';
import { useAuthStore } from '../../lib/store/auth.store';
import { useNotificationStore } from '../../lib/store/notification.store';
import { LMEPriceBadge } from '../ui/lme-price-badge';
import type { LmePriceData } from '../../lib/websocket';

interface TopbarProps {
  lmePrice: LmePriceData | null;
}

export function Topbar({ lmePrice }: TopbarProps) {
  const { user, logout } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-aop-dark border-b border-aop-navy/50 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="text-gold font-bold text-xl">⚜️ AOP</div>
        <span className="text-white/60 text-sm hidden md:inline">Aurum Operations Platform</span>
      </div>

      <div className="flex items-center gap-4">
        <LMEPriceBadge price={lmePrice} />

        <button className="relative text-white/70 hover:text-white transition-colors">
          🔔
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-white font-bold text-xs">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="hidden md:block">
            <div className="text-white text-xs">{user?.email}</div>
            <div className="text-gold text-xs">{user?.role?.replace('_', ' ')}</div>
          </div>
          <button
            onClick={logout}
            className="ml-2 text-gray-400 hover:text-white text-xs transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
