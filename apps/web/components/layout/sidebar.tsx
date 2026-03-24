'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/store/auth.store';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠', roles: ['all'] },
  { href: '/clients', label: 'Clients', icon: '👥', roles: ['all'] },
  { href: '/transactions', label: 'Transactions', icon: '🔄', roles: ['all'] },
  { href: '/documents', label: 'Documents', icon: '📄', roles: ['all'] },
  {
    href: '/finance',
    label: 'Finance',
    icon: '💰',
    roles: ['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER'],
  },
  {
    href: '/trade-desk',
    label: 'Trade Desk',
    icon: '📈',
    roles: ['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER'],
  },
  {
    href: '/reports',
    label: 'Reports',
    icon: '📊',
    roles: ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER'],
  },
  {
    href: '/agents',
    label: 'Agents',
    icon: '🤝',
    roles: ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER'],
  },
  { href: '/admin', label: 'Admin', icon: '⚙️', roles: ['SUPER_ADMIN', 'ADMIN'] },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const allowed = NAV_ITEMS.filter(
    (item) => item.roles.includes('all') || (user?.role && item.roles.includes(user.role)),
  );

  return (
    <aside
      className={cn(
        'fixed left-0 top-16 bottom-0 z-30 bg-aop-dark text-white transition-all duration-200 flex flex-col',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <nav className="flex-1 overflow-y-auto py-4">
        {allowed.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                active
                  ? 'bg-gold text-white font-semibold'
                  : 'text-gray-300 hover:bg-aop-navy/60 hover:text-white',
              )}
            >
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={onToggle}
        className="p-4 text-gray-400 hover:text-white border-t border-aop-navy/50 text-sm"
      >
        {collapsed ? '→' : '← Collapse'}
      </button>
    </aside>
  );
}
