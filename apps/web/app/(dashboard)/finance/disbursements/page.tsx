'use client';
import { useState, useRef } from 'react';
import { PageHeader } from '../../../../components/ui/page-header';
import { DataTable } from '../../../../components/ui/data-table';
import { RoleGuard } from '../../../../components/auth/role-guard';
import { Badge } from '../../../../components/ui/badge';
import {
  useAllDisbursements,
  useApproveDisbursement,
  useRejectDisbursement,
  useUploadDisbursementReceipt,
} from '../../../../lib/hooks/use-finance';
import { toast } from 'sonner';
import { cn } from '../../../../lib/utils';

type Tab = 'PENDING' | 'APPROVED' | 'SENT' | 'ALL';

const TABS: { id: Tab; label: string }[] = [
  { id: 'PENDING', label: 'Pending Approval' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'SENT', label: 'Sent' },
  { id: 'ALL', label: 'All' },
];

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'info' | 'default' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SENT: 'info',
  PAID: 'success',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RECEIPT_VARIANT: Record<string, 'success' | 'warning' | 'default'> = {
  UPLOADED: 'success',
  MISSING: 'warning',
  NOT_REQUIRED: 'default',
};

function usd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// Receipt review modal
function ReceiptModal({ receiptUrl, onClose }: { receiptUrl: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-aop-dark">Receipt Review</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-5">
          {receiptUrl.endsWith('.pdf') ? (
            <iframe
              src={receiptUrl}
              className="w-full h-[500px] border rounded-lg"
              title="Receipt PDF"
            />
          ) : (
            <img
              src={receiptUrl}
              alt="Receipt"
              className="w-full rounded-lg max-h-[500px] object-contain"
            />
          )}
        </div>
        <div className="px-5 pb-4 flex justify-end">
          <a
            href={receiptUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="text-sm text-gold hover:text-gold underline font-medium"
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

// Reject reason modal
function RejectModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
        <h3 className="font-semibold text-aop-dark mb-3">Reject Disbursement</h3>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter rejection reason…"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none mb-4"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FinanceDisbursementsPage() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const [page, setPage] = useState(1);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  const statusFilter = tab === 'ALL' ? undefined : tab;
  const { data, isLoading, refetch } = useAllDisbursements({
    page,
    limit: 20,
    ...(statusFilter && { status: statusFilter }),
  });
  const disbursements = (data?.data?.disbursements ?? data?.data ?? []) as Record<
    string,
    unknown
  >[];
  const total = data?.data?.total ?? disbursements.length;

  const approve = useApproveDisbursement();
  const reject = useRejectDisbursement();
  const uploadReceipt = useUploadDisbursementReceipt();

  async function handleApprove(id: string) {
    try {
      await approve.mutateAsync(id);
      toast.success('Disbursement approved');
    } catch {
      toast.error('Failed to approve');
    }
  }

  async function handleReject(id: string, reason: string) {
    try {
      await reject.mutateAsync({ id, reason });
      toast.success('Disbursement rejected');
      setRejectingId(null);
    } catch {
      toast.error('Failed to reject');
    }
  }

  async function handleReceiptUpload(disbursementId: string, file: File) {
    try {
      await uploadReceipt.mutateAsync({ disbursementId, file });
      toast.success('Receipt uploaded');
      refetch();
    } catch {
      toast.error('Upload failed');
    }
  }

  const columns = [
    {
      key: 'transactionId',
      header: 'Txn ID',
      render: (r: Record<string, unknown>) => (
        <span className="font-mono text-xs text-gray-500">
          {((r.transactionId ?? r.txnId) as string)?.slice(-8).toUpperCase() ?? '—'}
        </span>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (r: Record<string, unknown>) => (
        <span className="text-sm text-gray-700">
          {((r.agent as Record<string, unknown>)?.companyName as string) ??
            (r.agentName as string) ??
            '—'}
        </span>
      ),
    },
    {
      key: 'trancheNo',
      header: 'Tranche',
      render: (r: Record<string, unknown>) => (
        <span className="font-mono text-sm">#{r.trancheNo as number}</span>
      ),
    },
    {
      key: 'amountUsd',
      header: 'Amount USD',
      render: (r: Record<string, unknown>) => (
        <span className="font-mono font-semibold text-aop-navy">{usd(Number(r.amountUsd))}</span>
      ),
    },
    {
      key: 'requestedAt',
      header: 'Requested',
      render: (r: Record<string, unknown>) => (
        <span className="text-xs text-gray-500">
          {new Date((r.requestedAt ?? r.createdAt) as string).toLocaleDateString('en-GB')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: Record<string, unknown>) => (
        <Badge variant={STATUS_VARIANT[r.status as string] ?? 'default'}>
          {r.status as string}
        </Badge>
      ),
    },
    {
      key: 'receiptUrl',
      header: 'Receipt',
      render: (r: Record<string, unknown>) => {
        if (r.receiptUrl) {
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReceiptUrl(r.receiptUrl as string);
              }}
              className="text-xs text-gold hover:text-gold font-medium underline"
            >
              View
            </button>
          );
        }
        if (r.status === 'APPROVED' || r.status === 'SENT') {
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUploadTarget(r.id as string);
                uploadRef.current?.click();
              }}
              className="text-xs text-amber-600 hover:text-amber-700 font-medium underline"
            >
              Upload
            </button>
          );
        }
        return <span className="text-xs text-gray-300">—</span>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: Record<string, unknown>) => {
        if (r.status !== 'PENDING') return null;
        return (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleApprove(r.id as string)}
              disabled={approve.isPending}
              className="text-xs bg-green-600 text-white px-2.5 py-1 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => setRejectingId(r.id as string)}
              className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 font-medium transition-colors"
            >
              Reject
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS']}>
      <div className="space-y-5">
        <PageHeader
          title="Disbursements"
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Finance', href: '/finance/dashboard' },
            { label: 'Disbursements' },
          ]}
        />

        {/* Tab bar */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex border-b border-gray-100">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setPage(1);
                }}
                className={cn(
                  'flex-1 sm:flex-none px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
                  tab === t.id
                    ? 'border-gold text-gold'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-0">
            <DataTable
              columns={columns as never}
              data={disbursements}
              loading={isLoading}
              emptyMessage={`No ${tab === 'ALL' ? '' : tab.toLowerCase() + ' '}disbursements`}
              pagination={{ page, limit: 20, total: Number(total), onPageChange: setPage }}
            />
          </div>
        </div>

        {/* Hidden receipt upload input */}
        <input
          ref={uploadRef}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadTarget) handleReceiptUpload(uploadTarget, file);
            e.target.value = '';
            setUploadTarget(null);
          }}
        />

        {/* Receipt modal */}
        {receiptUrl && <ReceiptModal receiptUrl={receiptUrl} onClose={() => setReceiptUrl(null)} />}

        {/* Reject modal */}
        {rejectingId && (
          <RejectModal
            onConfirm={(reason) => handleReject(rejectingId, reason)}
            onCancel={() => setRejectingId(null)}
          />
        )}
      </div>
    </RoleGuard>
  );
}
