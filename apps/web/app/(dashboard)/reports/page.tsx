'use client';
import { useState } from 'react';
import { PageHeader } from '../../../components/ui/page-header';
import { Badge } from '../../../components/ui/badge';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import {
  useReports,
  useGenerateReport,
  useSubmitReport,
  useDownloadReport,
} from '../../../lib/hooks/use-reporting';
import { useSuspiciousTransactions } from '../../../lib/hooks/use-reporting';
import { RoleGuard } from '../../../components/auth/role-guard';
import { toast } from 'sonner';
import type { RegulatoryReport } from '../../../lib/api/reporting';

const REPORT_TYPES = [
  { value: 'MONTHLY_TRANSACTION', label: 'Monthly Transaction Activity' },
  { value: 'OECD_DUE_DILIGENCE', label: 'OECD Due Diligence' },
  { value: 'CLIENT_KYC_STATUS', label: 'Client KYC Status' },
  { value: 'PORTFOLIO_SUMMARY', label: 'Portfolio Summary' },
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  READY: 'success',
  GENERATING: 'warning',
  FAILED: 'danger',
  SUBMITTED: 'info',
  GENERATING_: 'warning',
};

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{status}</Badge>;
}

export default function ReportsPage() {
  const { data: reports, isLoading } = useReports();
  const { data: suspicious } = useSuspiciousTransactions();
  const generate = useGenerateReport();
  const submit = useSubmitReport();
  const download = useDownloadReport();
  const [selectedType, setSelectedType] = useState('MONTHLY_TRANSACTION');
  const [confirmSubmit, setConfirmSubmit] = useState<RegulatoryReport | null>(null);

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync({ reportType: selectedType });
      toast.success('Report generation started');
    } catch {
      toast.error('Failed to start report generation');
    }
  };

  const handleDownload = async (report: RegulatoryReport) => {
    try {
      const { url } = await download.mutateAsync(report.id);
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to get download link');
    }
  };

  const handleSubmit = async (report: RegulatoryReport) => {
    try {
      await submit.mutateAsync(report.id);
      toast.success('Report submitted to regulator');
    } catch {
      toast.error('Failed to submit report');
    } finally {
      setConfirmSubmit(null);
    }
  };

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER']}>
      <div>
        <PageHeader
          title="Regulatory Reports"
          breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Reports' }]}
          actions={
            <div className="flex items-center gap-2">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleGenerate}
                disabled={generate.isPending}
                className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark disabled:opacity-50 transition-colors"
              >
                {generate.isPending ? 'Starting...' : '+ Generate Report'}
              </button>
            </div>
          }
        />

        {/* Suspicious transactions alert */}
        {suspicious && (suspicious as unknown[]).length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-red-800 text-sm">
                {(suspicious as unknown[]).length} Suspicious Transaction
                {(suspicious as unknown[]).length > 1 ? 's' : ''} Flagged
              </p>
              <p className="text-red-600 text-xs mt-1">
                These transactions require STR review. Click to generate draft reports.
              </p>
            </div>
          </div>
        )}

        {/* Reports table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-aop-dark text-white">
              <tr>
                <th className="text-left px-4 py-3">Report Type</th>
                <th className="text-left px-4 py-3">Period</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Generated</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (reports ?? []).map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{r.reportType.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(r.periodStart).toLocaleDateString()} —{' '}
                        {new Date(r.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(r.generatedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {r.status === 'READY' && (
                            <>
                              <button
                                onClick={() => handleDownload(r)}
                                className="text-xs text-aop-navy hover:underline"
                              >
                                ↓ Download
                              </button>
                              <button
                                onClick={() => setConfirmSubmit(r)}
                                className="text-xs text-gold hover:underline"
                              >
                                Submit →
                              </button>
                            </>
                          )}
                          {r.status === 'SUBMITTED' && (
                            <span className="text-xs text-gray-400">
                              Submitted{' '}
                              {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : ''}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              {!isLoading && (reports ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    No reports generated yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <ConfirmDialog
          open={!!confirmSubmit}
          title="Submit Report to Regulator"
          message={`Are you sure you want to submit "${confirmSubmit?.reportType.replace(/_/g, ' ')}" to the regulator? This action cannot be undone.`}
          confirmLabel="Submit"
          onConfirm={() => confirmSubmit && handleSubmit(confirmSubmit)}
          onCancel={() => setConfirmSubmit(null)}
        />
      </div>
    </RoleGuard>
  );
}
