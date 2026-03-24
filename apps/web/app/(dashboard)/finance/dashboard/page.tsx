'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../../../components/ui/page-header';
import { RoleGuard } from '../../../../components/auth/role-guard';
import {
  usePortfolioSummary,
  useMonthlyPnl,
  useRevenueByCountry,
  useCostExposure,
  useUnreconciledBalances,
} from '../../../../lib/hooks/use-finance';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ─── helpers ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const KG_TO_TROY_OZ = 32.1507;

function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const to = fmt(now);
  if (preset === 'this_month') {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(start), to: fmt(end) };
  }
  if (preset === 'this_quarter') {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { from: fmt(qStart), to };
  }
  return { from: '', to: '' };
}

const PIE_COLORS = [
  '#C9963F',
  '#0D2B55',
  '#1A1A2E',
  '#6B7280',
  '#D97706',
  '#059669',
  '#DC2626',
  '#7C3AED',
];

// ─── date range picker ─────────────────────────────────────────────────────
const PRESETS = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'custom', label: 'Custom' },
] as const;
type Preset = (typeof PRESETS)[number]['id'];

// ─── stat card ─────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  color = 'text-aop-dark',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── skeleton ──────────────────────────────────────────────────────────────
function Skeleton({ h = 'h-8', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-gray-100 rounded-lg animate-pulse`} />;
}

export default function FinanceDashboardPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const dateParams = useMemo(() => {
    if (preset === 'custom')
      return customFrom && customTo ? { from: customFrom, to: customTo } : undefined;
    return getDateRange(preset);
  }, [preset, customFrom, customTo]);

  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary(dateParams);
  const { data: monthly = [], isLoading: monthlyLoading } = useMonthlyPnl();
  const { data: byCountry = [], isLoading: countryLoading } = useRevenueByCountry();
  const { data: costExposure = [], isLoading: exposureLoading } = useCostExposure();
  const { data: unreconciled = [], isLoading: unreconciledLoading } = useUnreconciledBalances();

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS']}>
      <div className="space-y-6">
        <PageHeader
          title="Finance Dashboard"
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Finance', href: '/finance/dashboard' },
            { label: 'Dashboard' },
          ]}
        />

        {/* Date range picker */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  preset === p.id ? 'bg-aop-navy text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-gold"
              />
              <span className="text-gray-400">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
          )}
        </div>

        {/* P&L Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryLoading ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <Skeleton h="h-8" />
                <Skeleton h="h-4 mt-2" w="w-1/2" />
              </div>
            ))
          ) : (
            <>
              <StatCard
                label="Total Gross Proceeds"
                value={usd(summary?.totalGrossProceeds ?? 0)}
                color="text-aop-navy"
              />
              <StatCard
                label="Total Costs"
                value={usd(summary?.totalCosts ?? 0)}
                color="text-red-600"
              />
              <StatCard
                label="Company Fees"
                value={usd(summary?.companyFees ?? 0)}
                color="text-gold"
              />
              <StatCard
                label="Net Profit"
                value={usd(summary?.netProfit ?? 0)}
                color={(summary?.netProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}
              />
            </>
          )}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly P&L bar chart */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-aop-dark mb-4 text-sm">
              Monthly P&L — Rolling 12 Months
            </h3>
            {monthlyLoading ? (
              <div className="h-56 bg-gray-100 rounded animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={monthly} barGap={2} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [usd(v), name]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="grossProceeds" name="Gross" fill="#0D2B55" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="costs" name="Costs" fill="#DC2626" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="netProfit" name="Net" fill="#C9963F" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Revenue by country pie */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-aop-dark mb-4 text-sm">Revenue by Country</h3>
            {countryLoading ? (
              <div className="h-56 bg-gray-100 rounded animate-pulse" />
            ) : byCountry.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <PieChart>
                  <Pie
                    data={byCountry}
                    dataKey="revenueUsd"
                    nameKey="countryCode"
                    cx="50%"
                    cy="45%"
                    outerRadius={70}
                    label={({ countryCode, percent }: { countryCode: string; percent: number }) =>
                      `${countryCode} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {byCountry.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [usd(v), 'Revenue']}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Active Cost Exposure */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-aop-dark text-sm">Active Cost Exposure</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              In-flight transactions with estimated financials
            </p>
          </div>
          {exposureLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} h="h-10" />
              ))}
            </div>
          ) : costExposure.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No active transactions</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[
                      'Txn ID',
                      'Client',
                      'Phase',
                      'Est. Gross',
                      'Est. Costs',
                      'Est. Net',
                      'Co. Fee',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {costExposure.map((row) => (
                    <tr
                      key={row.transactionId}
                      onClick={() => router.push(`/transactions/${row.transactionId}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {row.transactionId.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{row.clientName}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                          {row.phase.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">{usd(row.estGrossUsd)}</td>
                      <td className="px-4 py-3 font-mono text-red-600">{usd(row.estCostsUsd)}</td>
                      <td
                        className={`px-4 py-3 font-mono font-semibold ${row.estNetUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {usd(row.estNetUsd)}
                      </td>
                      <td className="px-4 py-3 font-mono text-gold">{usd(row.companyFeeUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Unreconciled agent balances */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-aop-dark text-sm">
              Agents with Unreconciled Balances
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Overdue &gt;48h highlighted in red</p>
          </div>
          {unreconciledLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} h="h-10" />
              ))}
            </div>
          ) : unreconciled.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              <span className="text-2xl block mb-1">✓</span>
              All agent balances reconciled
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Agent', 'Unreconciled Amount', 'Oldest Transaction', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {unreconciled.map((row) => {
                    const overdue = row.oldestTransactionDaysAgo > 2;
                    return (
                      <tr key={row.agentId} className={overdue ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3 font-medium text-gray-800">{row.agentName}</td>
                        <td
                          className={`px-4 py-3 font-mono font-semibold ${overdue ? 'text-red-600' : 'text-gray-700'}`}
                        >
                          {usd(row.unreconciledAmountUsd)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.oldestTransactionDaysAgo}d ago
                        </td>
                        <td className="px-4 py-3">
                          {overdue ? (
                            <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              OVERDUE
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              PENDING
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
