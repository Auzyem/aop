'use client';
import { useState } from 'react';
import { PageHeader } from '../../../components/ui/page-header';
import { DataTable } from '../../../components/ui/data-table';
import { Badge } from '../../../components/ui/badge';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { RoleGuard } from '../../../components/auth/role-guard';
import {
  useUsers,
  useDeactivateUser,
  useResetUserTotp,
  useAuditLog,
  useExportAuditCsv,
} from '../../../lib/hooks/use-admin';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

const TABS = ['Users', 'Audit Log'] as const;
type Tab = (typeof TABS)[number];

const ROLE_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'default'> = {
  SUPER_ADMIN: 'danger' as never,
  ADMIN: 'warning',
  COMPLIANCE_OFFICER: 'info',
  TRADE_MANAGER: 'info',
  OPERATIONS: 'default',
  VIEWER: 'default',
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('Users');
  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);

  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: auditLog, isLoading: auditLoading } = useAuditLog({ limit: 100 });
  const deactivate = useDeactivateUser();
  const resetTotp = useResetUserTotp();
  const exportCsv = useExportAuditCsv();

  const userList = (users ?? []) as unknown as Record<string, unknown>[];
  const auditList = (auditLog ?? []) as unknown as Record<string, unknown>[];

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await deactivate.mutateAsync(deactivateTarget);
      toast.success('User deactivated');
    } catch {
      toast.error('Failed to deactivate user');
    } finally {
      setDeactivateTarget(null);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportCsv.mutateAsync(undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export audit log');
    }
  };

  const userColumns = [
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (r: Record<string, unknown>) => (
        <span className="font-medium">{r.email as string}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (r: Record<string, unknown>) => (
        <Badge variant={ROLE_VARIANT[r.role as string] ?? 'default'}>
          {(r.role as string).replace(/_/g, ' ')}
        </Badge>
      ),
    },
    { key: 'countryCode', header: 'Country' },
    {
      key: 'isActive',
      header: 'Status',
      render: (r: Record<string, unknown>) => (
        <Badge variant={r.isActive ? 'success' : 'danger'}>
          {r.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'totpEnabled',
      header: '2FA',
      render: (r: Record<string, unknown>) => (
        <span className={r.totpEnabled ? 'text-green-600' : 'text-gray-400'}>
          {r.totpEnabled ? '✓ On' : '○ Off'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r: Record<string, unknown>) => (
        <div className="flex gap-2 justify-end">
          {Boolean(r.isActive) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeactivateTarget(r.id as string);
              }}
              className="text-xs text-red-600 hover:underline"
            >
              Deactivate
            </button>
          )}
          {Boolean(r.totpEnabled) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetTotp.mutate(r.id as string, {
                  onSuccess: () => toast.success('TOTP reset'),
                  onError: () => toast.error('Failed to reset TOTP'),
                });
              }}
              className="text-xs text-aop-navy hover:underline"
            >
              Reset 2FA
            </button>
          )}
        </div>
      ),
    },
  ];

  const auditColumns = [
    {
      key: 'createdAt',
      header: 'Time',
      render: (r: Record<string, unknown>) => new Date(r.createdAt as string).toLocaleString(),
    },
    {
      key: 'user',
      header: 'User',
      render: (r: Record<string, unknown>) =>
        ((r.user as Record<string, unknown>)?.email as string) ?? '—',
    },
    { key: 'action', header: 'Action', sortable: true },
    { key: 'resource', header: 'Resource', sortable: true },
    {
      key: 'resourceId',
      header: 'Resource ID',
      render: (r: Record<string, unknown>) => (
        <span className="font-mono text-xs">{(r.resourceId as string) ?? '—'}</span>
      ),
    },
    { key: 'ipAddress', header: 'IP' },
  ];

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
      <div>
        <PageHeader
          title="Administration"
          breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Admin' }]}
          actions={
            tab === 'Users' ? (
              <button className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors">
                + Invite User
              </button>
            ) : (
              <button
                onClick={handleExport}
                disabled={exportCsv.isPending}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                ↓ Export CSV
              </button>
            )
          }
        />

        <div className="border-b border-gray-200 mb-6 flex gap-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                tab === t
                  ? 'border-gold text-gold'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Users' && (
          <DataTable
            columns={userColumns as never}
            data={userList}
            loading={usersLoading}
            emptyMessage="No users found"
          />
        )}

        {tab === 'Audit Log' && (
          <DataTable
            columns={auditColumns as never}
            data={auditList}
            loading={auditLoading}
            emptyMessage="No audit events"
          />
        )}

        <ConfirmDialog
          open={!!deactivateTarget}
          title="Deactivate User"
          message="Are you sure you want to deactivate this user? They will lose access immediately."
          confirmLabel="Deactivate"
          danger
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      </div>
    </RoleGuard>
  );
}
