'use client';
import { useState } from 'react';
import { Sidebar } from '../../components/layout/sidebar';
import { Topbar } from '../../components/layout/topbar';
import { AuthGuard } from '../../components/auth/auth-guard';
import { useLMEPrice } from '../../lib/websocket';
import { useAuthStore } from '../../lib/store/auth.store';
import { cn } from '../../lib/utils';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { accessToken } = useAuthStore();
  const lmePrice = useLMEPrice(accessToken);

  return (
    <AuthGuard>
      <Topbar lmePrice={lmePrice} />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main
        className={cn(
          'min-h-screen bg-gray-50 pt-16 transition-all duration-200',
          sidebarCollapsed ? 'pl-16' : 'pl-60',
        )}
      >
        <div className="max-w-7xl mx-auto p-6">{children}</div>
      </main>
    </AuthGuard>
  );
}
