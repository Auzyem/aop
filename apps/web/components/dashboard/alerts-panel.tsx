'use client';
import { useAlerts, useDismissAlert } from '../../lib/hooks/use-transactions';
import { useRouter } from 'next/navigation';
import { cn } from '../../lib/utils';

const SEVERITY_CONFIG = {
  HIGH: {
    icon: '🔴',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-800',
  },
  MEDIUM: {
    icon: '🟡',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800',
  },
  LOW: {
    icon: '🔵',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-800',
  },
};

const TYPE_LABEL: Record<string, string> = {
  PRICE_ALERT: 'Price Alert',
  SLA_BREACH: 'SLA Breach',
  UNRECONCILED_DISBURSEMENT: 'Unreconciled',
  GENERAL: 'General',
};

export function AlertsPanel() {
  const router = useRouter();
  const { data: alerts, isLoading } = useAlerts();
  const dismiss = useDismissAlert();

  const list = alerts ?? [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-aop-dark flex items-center gap-2">
          Alerts
          {list.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
              {list.length}
            </span>
          )}
        </h2>
      </div>

      <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
        {isLoading && (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <span className="text-3xl mb-2">✅</span>
            <p className="text-sm">No active alerts</p>
          </div>
        )}

        {!isLoading &&
          list.map((alert) => {
            const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.LOW;
            return (
              <div
                key={alert.id}
                className={cn('flex items-start gap-3 px-4 py-3 transition-colors', cfg.bg)}
              >
                <span className="text-lg flex-shrink-0 mt-0.5">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', cfg.badge)}>
                      {TYPE_LABEL[alert.type] ?? alert.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(alert.createdAt).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className={cn('text-sm', cfg.text)}>{alert.description}</p>
                  {alert.txnId && (
                    <button
                      onClick={() => router.push(`/transactions/${alert.txnId}`)}
                      className="text-xs text-gold hover:text-gold-dark underline mt-0.5"
                    >
                      View transaction
                    </button>
                  )}
                </div>
                <button
                  onClick={() => dismiss.mutate(alert.id)}
                  disabled={dismiss.isPending}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none mt-0.5"
                  title="Dismiss alert"
                >
                  &times;
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
