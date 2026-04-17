'use client';
import { useState } from 'react';
import { useAuthStore } from '../../../lib/store/auth.store';
import { useAgentDisbursements } from '../../../lib/hooks/use-finance';
import { requestDisbursement, uploadDisbursementReceipt } from '../../../lib/api/finance';
import { useTransactions } from '../../../lib/hooks/use-transactions';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
  PAID: { label: 'Paid', cls: 'bg-blue-100 text-blue-700' },
};

export default function AgentDisbursementsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const agentId =
    ((user as unknown as Record<string, unknown>)?.agentId as string) ?? user?.id ?? null;

  const { data: rawDisbursements, isLoading, refetch } = useAgentDisbursements(agentId);
  const disbursements = (rawDisbursements as unknown as Record<string, unknown>[]) ?? [];

  const { data: txData } = useTransactions({ limit: 50 });
  const activeTransactions = (
    (txData?.data?.transactions ?? []) as unknown as Record<string, unknown>[]
  ).filter((t) => !['CANCELLED', 'SETTLED'].includes(t.status as string));

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Request form state
  const [reqTxnId, setReqTxnId] = useState('');
  const [reqTranche, setReqTranche] = useState('');
  const [reqAmount, setReqAmount] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setReqTxnId('');
    setReqTranche('');
    setReqAmount('');
    setReqNote('');
  }

  async function handleRequest() {
    if (!reqTxnId || !reqTranche || !reqAmount) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      await requestDisbursement(reqTxnId, {
        trancheNo: Number(reqTranche),
        amountUsd: Number(reqAmount),
        ...(reqNote && { note: reqNote }),
      });
      await qc.invalidateQueries({ queryKey: ['finance', 'agent-disbursements', agentId] });
      toast.success('Disbursement request submitted');
      setShowRequestModal(false);
      resetForm();
      refetch();
    } catch {
      toast.error('Request failed — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReceiptUpload(disbursementId: string, file: File) {
    setUploadingId(disbursementId);
    try {
      await uploadDisbursementReceipt(disbursementId, file);
      toast.success('Receipt uploaded');
      refetch();
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-aop-dark">Disbursements</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your expense requests</p>
        </div>
        <button
          onClick={() => setShowRequestModal(true)}
          className="bg-gold text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-transform"
        >
          + Request
        </button>
      </div>

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-aop-navy">
              {disbursements.filter((d) => d.status === 'PENDING').length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Pending</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-green-600">
              {disbursements.filter((d) => d.status === 'APPROVED' || d.status === 'PAID').length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Approved / Paid</div>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : disbursements.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">💸</p>
          <p className="text-sm">No disbursements yet</p>
          <p className="text-xs mt-1">Tap "+ Request" to submit an expense request</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {disbursements.map((d) => {
            const cfg = STATUS_CONFIG[d.status as string] ?? STATUS_CONFIG.PENDING;
            const needsReceipt = d.status === 'APPROVED' && !d.receiptUrl;
            const isUploading = uploadingId === (d.id as string);
            return (
              <div
                key={d.id as string}
                className={cn(
                  'bg-white border rounded-xl p-4 shadow-sm',
                  needsReceipt ? 'border-amber-200' : 'border-gray-100',
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">
                      Tranche {d.trancheNo as number}
                    </p>
                    <p className="font-mono text-xs text-gray-400 mt-0.5">
                      {((d.transactionId as string) ?? (d.txnId as string) ?? '')
                        .slice(-8)
                        .toUpperCase()}
                    </p>
                  </div>
                  <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', cfg.cls)}>
                    {cfg.label}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold text-aop-navy">
                    ${Number(d.amountUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date((d.requestedAt ?? d.createdAt) as string).toLocaleDateString('en-GB')}
                  </p>
                </div>

                {!!d.note && (
                  <p className="text-xs text-gray-500 mt-1.5 italic">"{d.note as string}"</p>
                )}

                {/* Receipt upload for approved disbursements */}
                {!!needsReceipt && (
                  <div className="mt-3 pt-3 border-t border-amber-100">
                    <p className="text-xs text-amber-700 font-medium mb-2">
                      Receipt required — please upload your expense receipt
                    </p>
                    <label
                      className={cn(
                        'flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl py-3 cursor-pointer transition-colors',
                        isUploading
                          ? 'border-gold bg-amber-50 opacity-70 pointer-events-none'
                          : 'border-amber-200 hover:border-gold hover:bg-amber-50',
                      )}
                    >
                      {isUploading ? (
                        <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>🧾</span>
                          <span className="text-xs font-medium text-amber-700">
                            Take photo or upload receipt
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        capture="environment"
                        className="sr-only"
                        disabled={!!uploadingId}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleReceiptUpload(d.id as string, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                )}

                {!!d.receiptUrl && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      ✓ Receipt submitted
                    </p>
                  </div>
                )}

                {d.status === 'REJECTED' && !!d.rejectionReason && (
                  <div className="mt-2 pt-2 border-t border-red-100">
                    <p className="text-xs text-red-600">Reason: {d.rejectionReason as string}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Request modal — bottom sheet */}
      {showRequestModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end"
          onClick={() => {
            setShowRequestModal(false);
            resetForm();
          }}
        >
          <div
            className="bg-white w-full rounded-t-2xl p-5 space-y-4 max-w-lg mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto -mt-1 mb-1" />

            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-aop-dark">Request Disbursement</h2>
              <button
                onClick={() => {
                  setShowRequestModal(false);
                  resetForm();
                }}
                className="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Transaction *
              </label>
              <select
                value={reqTxnId}
                onChange={(e) => setReqTxnId(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold bg-white"
              >
                <option value="">Select transaction…</option>
                {activeTransactions.map((t) => (
                  <option key={t.id as string} value={t.id as string}>
                    {(t.id as string).slice(-8).toUpperCase()} —{' '}
                    {((t.client as Record<string, unknown>)?.fullName as string) ?? 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Tranche No. *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={reqTranche}
                  onChange={(e) => setReqTranche(e.target.value)}
                  placeholder="1"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Amount (USD) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={reqAmount}
                  onChange={(e) => setReqAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Note (optional)
              </label>
              <textarea
                rows={2}
                value={reqNote}
                onChange={(e) => setReqNote(e.target.value)}
                placeholder="Describe the expense…"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none"
              />
            </div>

            <button
              onClick={handleRequest}
              disabled={submitting || !reqTxnId || !reqTranche || !reqAmount}
              className="w-full bg-gold text-white font-semibold py-3 rounded-xl disabled:opacity-50 active:scale-98 transition-all"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </span>
              ) : (
                'Submit Request'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
