'use client';
import { useState } from 'react';
import { PageHeader } from '../../../components/ui/page-header';
import { DataTable } from '../../../components/ui/data-table';
import { Badge } from '../../../components/ui/badge';
import { useAgents } from '../../../lib/hooks/use-admin';
import { RoleGuard } from '../../../components/auth/role-guard';

function ScoreBar({ value }: { value: number | null | undefined }) {
  const pct = Math.round((value ?? 0) * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8">{pct}%</span>
    </div>
  );
}

export default function AgentsPage() {
  const [page, setPage] = useState(1);
  const { data: agents, isLoading } = useAgents({ page, limit: 20 });
  const agentList = (agents ?? []) as unknown as Record<string, unknown>[];

  const columns = [
    {
      key: 'companyName',
      header: 'Company',
      sortable: true,
      render: (r: Record<string, unknown>) => (
        <span className="font-medium">{r.companyName as string}</span>
      ),
    },
    { key: 'contactEmail', header: 'Email', sortable: true },
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
      key: 'docAccuracyScore',
      header: 'Doc Accuracy',
      render: (r: Record<string, unknown>) => (
        <ScoreBar value={r.docAccuracyScore as number | null} />
      ),
    },
    {
      key: 'performanceScore',
      header: 'Performance',
      render: (r: Record<string, unknown>) => (
        <ScoreBar value={r.performanceScore as number | null} />
      ),
    },
    {
      key: 'commissionRate',
      header: 'Commission',
      render: (r: Record<string, unknown>) =>
        r.commissionRate != null ? `${(Number(r.commissionRate) * 100).toFixed(2)}%` : '—',
    },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
      render: (r: Record<string, unknown>) => new Date(r.createdAt as string).toLocaleDateString(),
    },
  ];

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER']}>
      <div>
        <PageHeader
          title="Agent Network"
          breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Agents' }]}
          actions={
            <button className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors">
              + Add Agent
            </button>
          }
        />

        <DataTable
          columns={columns as never}
          data={agentList}
          loading={isLoading}
          emptyMessage="No agents registered yet"
          pagination={{
            page,
            limit: 20,
            total: agentList.length + (page - 1) * 20,
            onPageChange: setPage,
          }}
        />
      </div>
    </RoleGuard>
  );
}
