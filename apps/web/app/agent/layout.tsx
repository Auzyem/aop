'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '../../components/auth/auth-guard';
import { cn } from '../../lib/utils';

function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    function update() {
      setOffline(!navigator.onLine);
    }
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="bg-amber-500 text-white text-xs font-semibold text-center py-2 px-4 flex items-center justify-center gap-2">
      <span>📵</span>
      <span>Offline mode — uploads will sync when you reconnect</span>
    </div>
  );
}

const NAV_ITEMS = [
  { href: '/agent/dashboard', icon: '🏠', label: 'Dashboard' },
  { href: '/agent/disbursements', icon: '💸', label: 'Disbursements' },
] as const;

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto relative">
        {/* Top header */}
        <header className="bg-aop-dark text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-md">
          <span className="font-bold text-gold text-lg">⚜️ AOP</span>
          <span className="text-xs text-gray-300 font-medium">Field Agent Portal</span>
        </header>

        {/* Offline banner */}
        <OfflineBanner />

        {/* Page content */}
        <main className="flex-1 p-4 pb-24">{children}</main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-200 flex z-20 shadow-lg">
          {NAV_ITEMS.map(({ href, icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors',
                  active ? 'text-gold' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <span className="text-xl mb-0.5">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </AuthGuard>
  );
}
