'use client';
import { useAuthStore } from '../../../lib/store/auth.store';
import { useTransactions } from '../../../lib/hooks/use-transactions';
import { PhaseBadge, RagBadge } from '../../../components/ui/status-badge';
import { useRouter } from 'next/navigation';
import { cn } from '../../../lib/utils';

const SLA_DAYS: Record<string, number> = {
  PHASE_1: 3,
  PHASE_2: 5,
  PHASE_3: 2,
  PHASE_4: 5,
  PHASE_5: 7,
  PHASE_6: 3,
  PHASE_7: 2,
};
const PHASE_LABELS: Record<string, string> = {
  PHASE_1: 'KYC',
  PHASE_2: 'Price Lock',
  PHASE_3: 'Logistics',
  PHASE_4: 'Refinery',
  PHASE_5: 'Disbursement',
  PHASE_6: 'Settlement',
  PHASE_7: 'Regulatory',
};

// Plain-language next action per phase
const NEXT_ACTION: Record<string, string> = {
  PHASE_1: 'Submit KYC documents and client identification',
  PHASE_2: 'Awaiting price lock from Head Office',
  PHASE_3: 'Upload Export Permit, Packing List and logistics documents',
  PHASE_4: 'Deliver gold to refinery — upload Assay Certificate when received',
  PHASE_5: 'Submit expense receipts for outstanding disbursements',
  PHASE_6: 'Awaiting final settlement — no action required',
  PHASE_7: 'Submit regulatory clearance documents',
};

function getRag(phase: string, createdAt: string): 'GREEN' | 'AMBER' | 'RED' {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  const sla = SLA_DAYS[phase] ?? 5;
  if (days < sla * 0.7) return 'GREEN';
  if (days < sla) return 'AMBER';
  return 'RED';
}

function needsAgentAction(phase: string): boolean {
  return ['PHASE_1', 'PHASE_3', 'PHASE_4', 'PHASE_5', 'PHASE_7'].includes(phase);
}

export default function AgentDashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { data, isLoading } = useTransactions({ limit: 50 });
  const transactions = data?.data?.transactions ?? [];

  const active = (transactions as unknown as Record<string, unknown>[]).filter(
    (t) => !['CANCELLED', 'SETTLED'].includes(t.status as string),
  );
  const actionRequired = active.filter((t) => {
    const rag = getRag(t.phase as string, t.createdAt as string);
    return needsAgentAction(t.phase as string) && (rag === 'RED' || rag === 'AMBER');
  });
  const awaitingDocReview = active.filter((t) => t.phase === 'PHASE_1' || t.phase === 'PHASE_3');

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="pt-1">
        <h1 className="text-xl font-bold text-aop-dark">
          Hi, {user?.email?.split('@')[0] ?? 'Agent'} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Field Agent Dashboard</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        {isLoading ? (
          [1, 2].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)
        ) : (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
              <div className="text-3xl font-bold text-aop-navy">{active.length}</div>
              <div className="text-xs text-gray-500 mt-1">Active Transactions</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
              <div className="text-3xl font-bold text-amber-500">{awaitingDocReview.length}</div>
              <div className="text-xs text-gray-500 mt-1">Awaiting Doc Review</div>
            </div>
          </>
        )}
      </div>

      {/* Action Required section */}
      {!isLoading && actionRequired.length > 0 && (
        <div>
          <h2 className="font-semibold text-red-600 text-sm mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Action Required ({actionRequired.length})
          </h2>
          <div className="space-y-2.5">
            {actionRequired.map((t) => {
              const rag = getRag(t.phase as string, t.createdAt as string);
              return (
                <button
                  key={t.id as string}
                  onClick={() => router.push(`/agent/transactions/${t.id as string}`)}
                  className="w-full bg-red-50 border border-red-200 rounded-xl p-4 text-left active:scale-98 transition-transform"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-gray-500">
                      {(t.id as string).slice(-8).toUpperCase()}
                    </span>
                    <RagBadge status={rag} />
                  </div>
                  <div className="font-semibold text-gray-800 text-sm mb-1">
                    {((t.client as Record<string, unknown>)?.fullName as string) ??
                      'Unknown Client'}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <PhaseBadge phase={t.phase as string} />
                  </div>
                  <p className="text-xs text-red-700 bg-white rounded-lg px-3 py-2 border border-red-100">
                    👉 {NEXT_ACTION[t.phase as string] ?? 'Check with Head Office'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* All active transactions */}
      <div>
        <h2 className="font-semibold text-aop-dark text-sm mb-3">My Transactions</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">No active transactions</p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((t) => {
              const rag = getRag(t.phase as string, t.createdAt as string);
              const hasAction = needsAgentAction(t.phase as string);
              return (
                <button
                  key={t.id as string}
                  onClick={() => router.push(`/agent/transactions/${t.id as string}`)}
                  className={cn(
                    'w-full bg-white border rounded-xl p-4 text-left transition-colors active:scale-98 shadow-sm',
                    hasAction
                      ? 'border-amber-200 hover:bg-amber-50'
                      : 'border-gray-100 hover:bg-gray-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-gray-400">
                          {(t.id as string).slice(-8).toUpperCase()}
                        </span>
                        <RagBadge status={rag} />
                      </div>
                      <div className="font-semibold text-gray-800 text-sm truncate">
                        {((t.client as Record<string, unknown>)?.fullName as string) ?? '—'}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {PHASE_LABELS[t.phase as string] ?? (t.phase as string)}
                      </div>
                    </div>
                    <span className="text-gray-400 text-lg ml-2">›</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
