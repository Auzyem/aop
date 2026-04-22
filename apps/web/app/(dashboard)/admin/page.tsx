'use client';
import { useState } from 'react';
import { PageHeader } from '../../../components/ui/page-header';
import { DataTable } from '../../../components/ui/data-table';
import { Badge } from '../../../components/ui/badge';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { RoleGuard } from '../../../components/auth/role-guard';
import {
  useUsers,
  useCreateUser,
  useDeactivateUser,
  useResetUserTotp,
  useAuditLog,
  useExportAuditCsv,
} from '../../../lib/hooks/use-admin';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

const TABS = ['Users', 'Audit Log'] as const;
type Tab = (typeof TABS)[number];

const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'TRADE_MANAGER',
  'OPERATIONS',
  'VIEWER',
] as const;

const EMPTY_USER = {
  email: '',
  password: '',
  role: 'VIEWER' as string,
  countryCode: '',
  agentId: '',
};

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
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_USER);

  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: auditLog, isLoading: auditLoading } = useAuditLog({ limit: 100 });
  const deactivate = useDeactivateUser();
  const resetTotp = useResetUserTotp();
  const exportCsv = useExportAuditCsv();
  const createUser = useCreateUser();

  function setUserField(key: keyof typeof EMPTY_USER, value: string) {
    setNewUser((u) => ({ ...u, [key]: value }));
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createUser.mutateAsync({
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        countryCode: newUser.countryCode,
        ...(newUser.agentId ? { agentId: newUser.agentId } : {}),
      });
      toast.success('User created successfully');
      setShowCreate(false);
      setNewUser(EMPTY_USER);
    } catch {
      toast.error('Failed to create user');
    }
  }

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
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-semibold text-aop-dark mb-4">Create User</h3>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    required
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setUserField('email', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Password *</label>
                  <input
                    required
                    type="password"
                    minLength={12}
                    value={newUser.password}
                    onChange={(e) => setUserField('password', e.target.value)}
                    placeholder="Min 12 chars, upper, number, symbol"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
                    <select
                      required
                      value={newUser.role}
                      onChange={(e) => setUserField('role', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Country Code *
                    </label>
                    <input
                      required
                      maxLength={2}
                      placeholder="KE"
                      value={newUser.countryCode}
                      onChange={(e) => setUserField('countryCode', e.target.value.toUpperCase())}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Agent ID <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    value={newUser.agentId}
                    onChange={(e) => setUserField('agentId', e.target.value)}
                    placeholder="Leave blank for internal staff"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setNewUser(EMPTY_USER);
                    }}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createUser.isPending}
                    className="px-4 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold-dark disabled:opacity-50"
                  >
                    {createUser.isPending ? 'Creating…' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        <PageHeader
          title="Administration"
          breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Admin' }]}
          actions={
            tab === 'Users' ? (
              <button
                onClick={() => setShowCreate(true)}
                className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
              >
                + Create User
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
