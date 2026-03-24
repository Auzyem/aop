'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../lib/store/auth.store';
import type { UserRole } from '../../lib/types';

interface RoleGuardProps {
  children: React.ReactNode;
  /** Roles that are allowed to view this content */
  allowedRoles: UserRole[];
}

/**
 * Wraps content and redirects to /403 if the authenticated user's role
 * is not in the allowedRoles list.
 */
export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  const hasAccess = isAuthenticated && user?.role && allowedRoles.includes(user.role as UserRole);

  useEffect(() => {
    if (isAuthenticated && !hasAccess) {
      router.replace('/403');
    }
  }, [isAuthenticated, hasAccess, router]);

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-gold border-t-transparent rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}
