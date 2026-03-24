'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../../components/ui/page-header';
import { DataTable } from '../../../components/ui/data-table';
import { PhaseBadge, RagBadge } from '../../../components/ui/status-badge';
import { CurrencyAmount } from '../../../components/ui/currency-amount';
import { CreateTransactionModal } from '../../../components/transactions/create-transaction-modal';
import { useTransactions, useExportTransactionsCsv } from '../../../lib/hooks/use-transactions';
import { useAgents } from '../../../lib/hooks/use-admin';

const PHASES = ['PHASE_1', 'PHASE_2', 'PHASE_3', 'PHASE_4', 'PHASE_5', 'PHASE_6', 'PHASE_7'];
const PHASE_LABELS: Record<string, string> = {
  PHASE_1: 'KYC',
  PHASE_2: 'Price Lock',
  PHASE_3: 'Logistics',
  PHASE_4: 'Refinery',
  PHASE_5: 'Disbursement',
  PHASE_6: 'Settlement',
  PHASE_7: 'Regulatory',
};
const STATUSES = [
  'ACTIVE',
  'IN_TRANSIT',
  'AT_REFINERY',
  'PENDING_DISBURSEMENT',
  'SETTLED',
  'CANCELLED',
];
const SLA_DAYS: Record<string, number> = {
  PHASE_1: 3,
  PHASE_2: 5,
  PHASE_3: 2,
  PHASE_4: 5,
  PHASE_5: 7,
  PHASE_6: 3,
  PHASE_7: 2,
};
const KG_TO_TROY_OZ = 32.1507;

function countryFlag(cc: string): string {
  if (!cc || cc.length !== 2) return '🌍';
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function getRag(phase: string, createdAt: string): 'GREEN' | 'AMBER' | 'RED' {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  const sla = SLA_DAYS[phase] ?? 5;
  if (days < sla * 0.7) return 'GREEN';
  if (days < sla) return 'AMBER';
  return 'RED';
}

export default function TransactionsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [country, setCountry] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filterParams = {
    page,
    limit: 20,
    ...(selectedPhases.length > 0 && { phase: selectedPhases.join(',') }),
    ...(country && { countryCode: country }),
    ...(selectedAgent && { agentId: selectedAgent }),
    ...(selectedStatus && { status: selectedStatus }),
    ...(dateFrom && { createdFrom: dateFrom }),
    ...(dateTo && { createdTo: dateTo }),
  };

  const { data, isLoading } = useTransactions(filterParams);
  const { data: agentsData } = useAgents({ isActive: true });
  const exportCsv = useExportTransactionsCsv();

  const transactions = data?.data?.transactions ?? [];
  const total = data?.data?.total ?? 0;
  const agents = (agentsData ?? []) as Array<{ id: string; companyName: string }>;

  const activeFilterCount = [
    selectedPhases.length > 0,
    !!country,
    !!selectedAgent,
    !!selectedStatus,
    !!dateFrom || !!dateTo,
  ].filter(Boolean).length;

  function togglePhase(phase: string) {
    setSelectedPhases((prev) =>
      prev.includes(phase) ? prev.filter((p) => p !== phase) : [...prev, phase],
    );
    setPage(1);
  }

  function clearFilters() {
    setSelectedPhases([]);
    setCountry('');
    setSelectedAgent('');
    setSelectedStatus('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  async function handleExport() {
    const blob = await exportCsv.mutateAsync(filterParams);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = [
    {
      key: 'id',
      header: 'ID',
      sortable: true,
      render: (r: Record<string, unknown>) => (
        <span className="font-mono text-xs text-aop-navy">{(r.id as string).slice(-10)}</span>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      render: (r: Record<string, unknown>) => (
        <span className="text-sm">
          {((r.client as Record<string, unknown>)?.fullName as string) ?? '—'}
        </span>
      ),
    },
    {
      key: 'countryCode',
      header: 'Country',
      sortable: true,
      render: (r: Record<string, unknown>) => (
        <span className="flex items-center gap-1">
          <span>{countryFlag(r.countryCode as string)}</span>
          <span className="text-xs text-gray-600">{r.countryCode as string}</span>
        </span>
      ),
    },
    {
      key: 'phase',
      header: 'Phase',
      render: (r: Record<string, unknown>) => <PhaseBadge phase={r.phase as string} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (r: Record<string, unknown>) => (
        <span className="text-xs text-gray-600">
          {(r.status as string)?.replace(/_/g, ' ') ?? '—'}
        </span>
      ),
    },
    {
      key: 'goldWeightFine',
      header: 'Weight (kg)',
      sortable: true,
      render: (r: Record<string, unknown>) =>
        r.goldWeightFine ? (
          <span className="font-mono text-sm">{Number(r.goldWeightFine).toFixed(3)}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'estimatedValue',
      header: 'Est. Value (USD)',
      render: (r: Record<string, unknown>) => {
        const fine = Number(r.goldWeightFine ?? 0);
        const price = Number(r.lmePriceLocked ?? 0);
        if (!fine || !price) return <span className="text-gray-400 text-xs">—</span>;
        return <CurrencyAmount amountUsd={fine * KG_TO_TROY_OZ * price} />;
      },
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (r: Record<string, unknown>) => (
        <span className="text-xs text-gray-600">
          {((r.agent as Record<string, unknown>)?.companyName as string) ?? '—'}
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
    {
      key: 'sla',
      header: 'SLA',
      render: (r: Record<string, unknown>) => (
        <RagBadge status={getRag(r.phase as string, r.createdAt as string)} />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Transactions"
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Transactions' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exportCsv.isPending}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              ↓ {exportCsv.isPending ? 'Exporting…' : 'Export CSV'}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
            >
              + New Transaction
            </button>
          </div>
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
              <span className="bg-gold text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold">
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
          <div className="border-t border-gray-100 px-4 py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Phase</label>
              <div className="flex flex-wrap gap-1.5">
                {PHASES.map((p) => (
                  <button
                    key={p}
                    onClick={() => togglePhase(p)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedPhases.includes(p)
                        ? 'bg-aop-navy text-white border-aop-navy'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {PHASE_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Country (ISO code)
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
              <label className="block text-xs font-medium text-gray-500 mb-2">Agent</label>
              <select
                value={selectedAgent}
                onChange={(e) => {
                  setSelectedAgent(e.target.value);
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

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Created from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Created to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
          </div>
        )}
      </div>

      <DataTable
        columns={columns as never}
        data={transactions as Record<string, unknown>[]}
        loading={isLoading}
        onRowClick={(row) => router.push(`/transactions/${row.id as string}`)}
        pagination={{ page, limit: 20, total, onPageChange: setPage }}
      />

      <CreateTransactionModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
