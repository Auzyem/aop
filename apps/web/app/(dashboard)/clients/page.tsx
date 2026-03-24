'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../../components/ui/page-header';
import { DataTable } from '../../../components/ui/data-table';
import { KycStatusBadge, SanctionsStatusBadge } from '../../../components/ui/status-badge';
import { Badge } from '../../../components/ui/badge';
import { NewClientWizard } from '../../../components/clients/new-client-wizard';
import { useClients } from '../../../lib/hooks/use-clients';
import { useAgents } from '../../../lib/hooks/use-admin';

const KYC_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'];
const RISK_RATINGS = ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'];
const riskVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  VERY_HIGH: 'danger',
};

function countryFlag(cc: string): string {
  if (!cc || cc.length !== 2) return '🌍';
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

export default function ClientsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [showWizard, setShowWizard] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [kycStatus, setKycStatus] = useState('');
  const [riskRating, setRiskRating] = useState('');
  const [country, setCountry] = useState('');
  const [agentId, setAgentId] = useState('');

  const filterParams = {
    page,
    limit: 20,
    ...(kycStatus && { kycStatus }),
    ...(riskRating && { riskRating }),
    ...(country && { countryCode: country }),
    ...(agentId && { assignedAgentId: agentId }),
  };

  const { data, isLoading } = useClients(filterParams);
  const { data: agentsData } = useAgents({ isActive: true });

  const clients = data?.data?.clients ?? [];
  const total = data?.data?.total ?? 0;
  const agents = (agentsData ?? []) as Array<{ id: string; companyName: string }>;
  const activeFilterCount = [!!kycStatus, !!riskRating, !!country, !!agentId].filter(
    Boolean,
  ).length;

  function clearFilters() {
    setKycStatus('');
    setRiskRating('');
    setCountry('');
    setAgentId('');
    setPage(1);
  }

  const columns = [
    {
      key: 'fullName',
      header: 'Name',
      sortable: true,
      render: (r: Record<string, unknown>) => (
        <div>
          <div className="font-medium text-gray-800">{r.fullName as string}</div>
          <div className="text-xs text-gray-400">{r.entityType as string}</div>
        </div>
      ),
    },
    {
      key: 'countryCode',
      header: 'Country',
      sortable: true,
      render: (r: Record<string, unknown>) => (
        <span className="flex items-center gap-1">
          <span>{countryFlag(r.countryCode as string)}</span>
          <span className="text-sm text-gray-600">{r.countryCode as string}</span>
        </span>
      ),
    },
    {
      key: 'kycStatus',
      header: 'KYC',
      render: (r: Record<string, unknown>) => <KycStatusBadge status={r.kycStatus as string} />,
    },
    {
      key: 'riskRating',
      header: 'Risk',
      render: (r: Record<string, unknown>) => (
        <Badge variant={riskVariant[r.riskRating as string] ?? 'default'}>
          {r.riskRating as string}
        </Badge>
      ),
    },
    {
      key: 'sanctionsStatus',
      header: 'Sanctions',
      render: (r: Record<string, unknown>) => (
        <SanctionsStatusBadge status={r.sanctionsStatus as string} />
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (r: Record<string, unknown>) => (
        <span className="text-xs text-gray-500">
          {((r.agent as Record<string, unknown>)?.companyName as string) ?? '—'}
        </span>
      ),
    },
    {
      key: 'transactionCount',
      header: 'Transactions',
      render: (r: Record<string, unknown>) => (
        <span className="text-sm font-mono text-center block">
          {String(r.transactionCount ?? 0)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (r: Record<string, unknown>) => (
        <span className="text-xs text-gray-500">
          {new Date(r.createdAt as string).toLocaleDateString('en-GB')}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Clients"
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Clients' }]}
        actions={
          <button
            onClick={() => setShowWizard(true)}
            className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
          >
            + New Client
          </button>
        }
      />

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <span>⚙ Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-gold text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                {activeFilterCount}
              </span>
            )}
            <span className="text-gray-400 text-xs">{showFilters ? '▲' : '▼'}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {showFilters && (
          <div className="border-t border-gray-100 px-4 py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">KYC Status</label>
              <select
                value={kycStatus}
                onChange={(e) => {
                  setKycStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              >
                <option value="">All</option>
                {KYC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Risk Rating</label>
              <select
                value={riskRating}
                onChange={(e) => {
                  setRiskRating(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              >
                <option value="">All</option>
                {RISK_RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Country (ISO)
              </label>
              <input
                type="text"
                maxLength={2}
                placeholder="e.g. GH"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value.toUpperCase());
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Agent</label>
              <select
                value={agentId}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              >
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.companyName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <DataTable
        columns={columns as never}
        data={clients as unknown as Record<string, unknown>[]}
        loading={isLoading}
        onRowClick={(row) => router.push(`/clients/${row.id as string}`)}
        pagination={{ page, limit: 20, total, onPageChange: setPage }}
      />

      <NewClientWizard open={showWizard} onClose={() => setShowWizard(false)} />
    </div>
  );
}
