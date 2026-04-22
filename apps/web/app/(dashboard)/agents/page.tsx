'use client';
import { useState } from 'react';
import { PageHeader } from '../../../components/ui/page-header';
import { DataTable } from '../../../components/ui/data-table';
import { Badge } from '../../../components/ui/badge';
import { useAgents, useCreateAgent } from '../../../lib/hooks/use-admin';
import { RoleGuard } from '../../../components/auth/role-guard';
import { toast } from 'sonner';

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

const EMPTY_FORM = {
  companyName: '',
  countryCode: '',
  contactName: '',
  contactEmail: '',
  licenceNo: '',
  bankName: '',
  bankAccount: '',
  swiftBic: '',
};

export default function AgentsPage() {
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { data: agents, isLoading } = useAgents({ page, limit: 20 });
  const createAgent = useCreateAgent();
  const agentList = (agents ?? []) as unknown as Record<string, unknown>[];

  function setField(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createAgent.mutateAsync(form);
      toast.success('Agent created successfully');
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch {
      toast.error('Failed to create agent');
    }
  }

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
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
              <h3 className="text-lg font-semibold text-aop-dark mb-4">Add Agent</h3>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Company Name *
                    </label>
                    <input
                      required
                      value={form.companyName}
                      onChange={(e) => setField('companyName', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Country Code *
                    </label>
                    <input
                      required
                      maxLength={2}
                      placeholder="KE"
                      value={form.countryCode}
                      onChange={(e) => setField('countryCode', e.target.value.toUpperCase())}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Licence No *
                    </label>
                    <input
                      required
                      value={form.licenceNo}
                      onChange={(e) => setField('licenceNo', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Contact Name *
                    </label>
                    <input
                      required
                      value={form.contactName}
                      onChange={(e) => setField('contactName', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(e) => setField('contactEmail', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Bank Name
                    </label>
                    <input
                      value={form.bankName}
                      onChange={(e) => setField('bankName', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Bank Account
                    </label>
                    <input
                      value={form.bankAccount}
                      onChange={(e) => setField('bankAccount', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      SWIFT / BIC
                    </label>
                    <input
                      value={form.swiftBic}
                      onChange={(e) => setField('swiftBic', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setForm(EMPTY_FORM);
                    }}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createAgent.isPending}
                    className="px-4 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold-dark disabled:opacity-50"
                  >
                    {createAgent.isPending ? 'Creating…' : 'Create Agent'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        <PageHeader
          title="Agent Network"
          breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Agents' }]}
          actions={
            <button
              onClick={() => setShowCreate(true)}
              className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
            >
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
