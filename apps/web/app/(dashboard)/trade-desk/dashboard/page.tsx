'use client';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../../../components/ui/page-header';
import { RoleGuard } from '../../../../components/auth/role-guard';
import { LMEPriceBadge } from '../../../../components/ui/lme-price-badge';
import {
  useLMEHistory,
  useLMEDashboard,
  usePriceAlerts,
  useTransactionsAwaitingLock,
  useRefineryPipeline,
} from '../../../../lib/hooks/use-lme';
import { useLMEPrice } from '../../../../lib/websocket';
import { useAuthStore } from '../../../../lib/store/auth.store';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import type { LmePriceData } from '../../../../lib/websocket';

const KG_TO_TROY_OZ = 32.1507;

function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 shadow-sm border ${accent ? 'bg-aop-navy border-aop-navy text-white' : 'bg-white border-gray-100'}`}
    >
      <p className={`text-xs font-medium mb-1 ${accent ? 'text-gray-300' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className={`text-xl font-bold font-mono ${accent ? 'text-gold' : 'text-aop-dark'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-0.5 ${accent ? 'text-gray-400' : 'text-gray-400'}`}>{sub}</p>
      )}
    </div>
  );
}

function Skeleton({ h = 'h-6', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-gray-100 rounded-lg animate-pulse`} />;
}

export default function TradeDeskDashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const livePrice = useLMEPrice(accessToken) as LmePriceData | null;

  // 7-day history (168 hourly points)
  const { data: history, isLoading: historyLoading } = useLMEHistory({
    limit: 168,
    priceType: 'SPOT',
  });
  const { data: dashboard } = useLMEDashboard();
  const { data: priceAlerts = [], isLoading: alertsLoading } = usePriceAlerts();
  const { data: awaitingLock = [], isLoading: awaitingLoading } = useTransactionsAwaitingLock();
  const { data: refineryPipeline = [], isLoading: refineryLoading } = useRefineryPipeline();

  const chartData = ((history ?? []) as Record<string, unknown>[]).map((p) => ({
    time: new Date(p.recordedAt as string).toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    price: Number(p.price),
  }));

  const prices = chartData.map((d) => d.price).filter(Boolean);
  const high7d = prices.length ? Math.max(...prices) : null;
  const low7d = prices.length ? Math.min(...prices) : null;

  const dash = dashboard as Record<string, unknown> | null;
  const currentPrices = (dash?.currentPrices ?? {}) as Record<string, Record<string, unknown>>;
  const amFix = currentPrices?.AM_FIX?.price ? Number(currentPrices.AM_FIX.price) : null;
  const pmFix = currentPrices?.PM_FIX?.price ? Number(currentPrices.PM_FIX.price) : null;
  const spot =
    livePrice?.priceUsdPerTroyOz ??
    (currentPrices?.SPOT?.price ? Number(currentPrices.SPOT.price) : null);

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER']}>
      <div className="space-y-6">
        <PageHeader
          title="Trade Desk"
          breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Trade Desk' }]}
          actions={<LMEPriceBadge price={livePrice} />}
        />

        {/* Today's stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatTile label="Current Spot" value={spot ? usd(spot) : '—'} sub="/toz" accent />
          <StatTile label="AM Fix" value={amFix ? usd(amFix) : '—'} sub="London" />
          <StatTile label="PM Fix" value={pmFix ? usd(pmFix) : '—'} sub="London" />
          <StatTile label="7-Day High" value={high7d ? usd(high7d) : '—'} sub="/toz" />
          <StatTile label="7-Day Low" value={low7d ? usd(low7d) : '—'} sub="/toz" />
        </div>

        {/* Full-width LME area chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-aop-dark mb-4 text-sm">LME SPOT Price — Last 7 Days</h3>
          {historyLoading ? (
            <div className="h-64 bg-gray-100 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D2B55" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0D2B55" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={23} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                  width={72}
                />
                <Tooltip
                  formatter={(v: number) => [`${usd(v)}/toz`, 'SPOT']}
                  contentStyle={{ fontSize: 12 }}
                />
                {livePrice && (
                  <ReferenceLine
                    y={livePrice.priceUsdPerTroyOz}
                    stroke="#C9963F"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Live',
                      fill: '#C9963F',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#0D2B55"
                  strokeWidth={2}
                  fill="url(#priceGradient)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bottom row: alerts + awaiting lock + refinery */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Price Alerts */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-aop-dark text-sm">Active Price Alerts</h3>
              {priceAlerts.length > 0 && (
                <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                  {priceAlerts.length}
                </span>
              )}
            </div>
            {alertsLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} h="h-10" />
                ))}
              </div>
            ) : priceAlerts.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-xs">No active alerts</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {priceAlerts.map((alert) => {
                  const up = alert.direction === 'UP';
                  return (
                    <div
                      key={alert.id}
                      onClick={() => router.push(`/trade-desk/price-lock/${alert.transactionId}`)}
                      className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs text-gray-500">
                          {alert.transactionId.slice(-8).toUpperCase()}
                        </span>
                        <span
                          className={`text-xs font-bold ${up ? 'text-green-600' : 'text-red-600'}`}
                        >
                          {up ? '↑' : '↓'} {alert.changePct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          Original: <span className="font-mono">{usd(alert.originalPrice)}</span>
                        </span>
                        <span>
                          Now:{' '}
                          <span
                            className={`font-mono font-medium ${up ? 'text-green-700' : 'text-red-700'}`}
                          >
                            {usd(alert.currentPrice)}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(alert.alertedAt).toLocaleString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transactions awaiting price lock */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-aop-dark text-sm">Awaiting Price Lock</h3>
              {awaitingLock.length > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                  {awaitingLock.length}
                </span>
              )}
            </div>
            {awaitingLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} h="h-14" />
                ))}
              </div>
            ) : awaitingLock.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-xs">
                No transactions awaiting lock
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {awaitingLock.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/trade-desk/price-lock/${t.id}`)}
                    className="px-5 py-3 hover:bg-amber-50 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-gray-500">
                        {t.id.slice(-8).toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 group-hover:bg-white px-2 py-0.5 rounded-full border border-amber-200 transition-colors">
                        Lock Price →
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{t.client?.fullName ?? '—'}</p>
                    {t.goldWeightFine && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {(t.goldWeightFine * KG_TO_TROY_OZ).toFixed(2)} toz fine
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Refinery pipeline */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-aop-dark text-sm">Refinery Pipeline</h3>
              <p className="text-xs text-gray-400 mt-0.5">Phase 4 & 5 transactions</p>
            </div>
            {refineryLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} h="h-14" />
                ))}
              </div>
            ) : refineryPipeline.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-xs">
                No transactions in refinery
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {refineryPipeline.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/transactions/${t.id}`)}
                    className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-gray-500">
                        {t.id.slice(-8).toUpperCase()}
                      </span>
                      {t.deliveryStatus && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          {t.deliveryStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800">{t.client?.fullName ?? '—'}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                      {t.refineryName && <span>{t.refineryName}</span>}
                      {t.goldWeightFine && (
                        <span>· {Number(t.goldWeightFine).toFixed(3)} kg fine</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
