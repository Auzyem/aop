'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../../components/ui/page-header';
import { AlertsPanel } from '../../../components/dashboard/alerts-panel';
import { RagBadge } from '../../../components/ui/status-badge';
import { useTransactions } from '../../../lib/hooks/use-transactions';
import { useLMEDashboard } from '../../../lib/hooks/use-lme';
import { useLMEPrice } from '../../../lib/websocket';
import { useAuthStore } from '../../../lib/store/auth.store';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

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
const SLA_DAYS: Record<string, number> = {
  PHASE_1: 3,
  PHASE_2: 5,
  PHASE_3: 2,
  PHASE_4: 5,
  PHASE_5: 7,
  PHASE_6: 3,
  PHASE_7: 2,
};
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

function RagTooltip({ phase, createdAt }: { phase: string; createdAt: string }) {
  const days = ((Date.now() - new Date(createdAt).getTime()) / 86400000).toFixed(1);
  const sla = SLA_DAYS[phase] ?? 5;
  return (
    <span className="group relative inline-flex">
      <RagBadge status={getRag(phase, createdAt)} />
      <span
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex
        whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-20 shadow-lg"
      >
        {days}d / {sla}d SLA
      </span>
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const wsPrice = useLMEPrice(accessToken);

  const { data: txnData, isLoading: txnLoading } = useTransactions({ limit: 200 });
  const { data: lmeData, isLoading: lmeLoading } = useLMEDashboard();

  const transactions = txnData?.data?.transactions ?? [];

  const stats = useMemo(() => {
    const active = transactions.filter(
      (t: Record<string, unknown>) => !['CANCELLED', 'SETTLED'].includes(t.status as string),
    );
    const inTransit = transactions.filter(
      (t: Record<string, unknown>) => t.status === 'IN_TRANSIT',
    );
    const settledThisMonth = transactions.filter((t: Record<string, unknown>) => {
      if (t.status !== 'SETTLED') return false;
      const d = new Date(t.updatedAt as string);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const currentPrice = wsPrice?.priceUsdPerKg ?? lmeData?.currentPrice?.priceUsdPerKg ?? 0;
    const totalVolume = active.reduce((s: number, t: Record<string, unknown>) => {
      return s + Number(t.goldWeightFine ?? 0) * currentPrice;
    }, 0);
    return {
      active: active.length,
      inTransit: inTransit.length,
      settledThisMonth: settledThisMonth.length,
      totalVolume,
    };
  }, [transactions, wsPrice, lmeData]);

  const byPhase = useMemo(() => {
    const map: Record<string, Record<string, unknown>[]> = {};
    for (const p of PHASES) map[p] = [];
    for (const t of transactions.filter(
      (t: Record<string, unknown>) => !['CANCELLED', 'SETTLED'].includes(t.status as string),
    )) {
      const p = t.phase as string;
      if (map[p]) map[p].push(t as Record<string, unknown>);
    }
    return map;
  }, [transactions]);

  const { chartData, amFixTimes, pmFixTimes } = useMemo(() => {
    const raw = ((lmeData?.priceHistory ?? []) as unknown as Record<string, unknown>[]).slice(-48);
    const history = raw.map((p) => ({
      time: new Date(p.recordedAt as string).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      price: Number(p.price),
      priceType: p.priceType as string,
    }));
    const am = history.filter((p) => p.priceType === 'AM_FIX').map((p) => p.time);
    const pm = history.filter((p) => p.priceType === 'PM_FIX').map((p) => p.time);
    // Append live WebSocket price as trailing point
    if (wsPrice && history.length > 0) {
      const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      if (history[history.length - 1]?.time !== now) {
        history.push({ time: now, price: wsPrice.priceUsdPerKg, priceType: 'INTRADAY' });
      }
    }
    return { chartData: history, amFixTimes: am, pmFixTimes: pm };
  }, [lmeData, wsPrice]);

  return (
    <div>
      <PageHeader title="Operations Dashboard" />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {txnLoading
          ? [1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 h-24 animate-pulse"
              />
            ))
          : (
              [
                {
                  label: 'Active Transactions',
                  value: String(stats.active),
                  icon: '🔄',
                  color: 'text-aop-navy',
                },
                {
                  label: 'In Transit',
                  value: String(stats.inTransit),
                  icon: '🚚',
                  color: 'text-amber-600',
                },
                {
                  label: 'Settled This Month',
                  value: String(stats.settledThisMonth),
                  icon: '✅',
                  color: 'text-green-600',
                },
                {
                  label: 'Total Volume (USD)',
                  value:
                    stats.totalVolume > 0 ? `$${(stats.totalVolume / 1_000_000).toFixed(2)}M` : '—',
                  icon: '🏅',
                  color: 'text-gold-dark',
                },
              ] as { label: string; value: string; icon: string; color: string }[]
            ).map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
      </div>

      {/* Pipeline + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-aop-dark mb-3">Transaction Pipeline</h2>
          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-max pb-2">
              {PHASES.map((phase) => {
                const phaseTxns = byPhase[phase] ?? [];
                const totalKg = phaseTxns.reduce((s, t) => s + Number(t.goldWeightFine ?? 0), 0);
                return (
                  <div
                    key={phase}
                    className="w-44 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col"
                  >
                    <div className="bg-aop-dark text-white text-xs font-semibold px-3 py-2 rounded-t-xl">
                      <div className="flex items-center justify-between">
                        <span>{PHASE_LABELS[phase]}</span>
                        <span className="bg-gold rounded-full text-white text-xs px-1.5 py-0.5 leading-none">
                          {phaseTxns.length}
                        </span>
                      </div>
                      {totalKg > 0 && (
                        <div className="text-gold-mid text-xs mt-0.5">{totalKg.toFixed(2)} kg</div>
                      )}
                    </div>
                    <div className="flex-1 p-2 space-y-2 max-h-64 overflow-y-auto">
                      {txnLoading ? (
                        <div className="h-12 bg-gray-100 rounded animate-pulse" />
                      ) : phaseTxns.length === 0 ? (
                        <div className="text-center text-xs text-gray-300 py-4">Empty</div>
                      ) : (
                        phaseTxns.map((t) => (
                          <div
                            key={t.id as string}
                            className="bg-gray-50 rounded-lg p-2 cursor-pointer hover:bg-gold-light transition-colors border border-gray-100"
                            onClick={() => router.push(`/transactions/${t.id as string}`)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-mono text-aop-navy truncate">
                                {(t.id as string).slice(-8)}
                              </span>
                              <RagTooltip phase={phase} createdAt={t.createdAt as string} />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm leading-none">
                                {countryFlag(t.countryCode as string)}
                              </span>
                              <span className="text-xs text-gray-600 truncate">
                                {((t.client as Record<string, unknown>)?.fullName as string) ?? '—'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {t.goldWeightFine ? `${Number(t.goldWeightFine).toFixed(2)} kg` : '—'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* LME chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-aop-dark">LME Gold (24h)</h2>
            {wsPrice && (
              <span className="text-xs font-mono font-semibold text-gold">
                ${wsPrice.priceUsdPerKg.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                /kg
              </span>
            )}
          </div>
          {lmeLoading ? (
            <div className="h-48 bg-gray-100 rounded animate-pulse" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    domain={['auto', 'auto']}
                    width={58}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                  />
                  <Tooltip
                    formatter={(v: number) => [
                      `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                      'USD/toz',
                    ]}
                    labelStyle={{ fontSize: 11 }}
                    contentStyle={{ fontSize: 11 }}
                  />
                  {amFixTimes.map((t) => (
                    <ReferenceLine
                      key={`am-${t}`}
                      x={t}
                      stroke="#3b82f6"
                      strokeDasharray="4 2"
                      label={{
                        value: 'AM',
                        position: 'insideTopRight',
                        fontSize: 8,
                        fill: '#3b82f6',
                      }}
                    />
                  ))}
                  {pmFixTimes.map((t) => (
                    <ReferenceLine
                      key={`pm-${t}`}
                      x={t}
                      stroke="#8b5cf6"
                      strokeDasharray="4 2"
                      label={{
                        value: 'PM',
                        position: 'insideTopRight',
                        fontSize: 8,
                        fill: '#8b5cf6',
                      }}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#C9963F"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-5 border-b-2 border-blue-500 border-dashed inline-block" />
                  AM Fix
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-5 border-b-2 border-purple-500 border-dashed inline-block" />
                  PM Fix
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Alerts panel */}
      <AlertsPanel />
    </div>
  );
}
