'use client';
import { use, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useTransaction,
  useTransactionEvents,
  useAddComment,
} from '../../../../lib/hooks/use-transactions';
import {
  useAgentNextAction,
  useDisbursements,
  useUploadDisbursementReceipt,
} from '../../../../lib/hooks/use-finance';
import { uploadDocument } from '../../../../lib/api/documents';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { PhaseBadge } from '../../../../components/ui/status-badge';
import { cn } from '../../../../lib/utils';
import { toast } from 'sonner';

const PHASE_LABELS: Record<string, string> = {
  PHASE_1: 'KYC',
  PHASE_2: 'Price Lock',
  PHASE_3: 'Logistics',
  PHASE_4: 'Refinery',
  PHASE_5: 'Disbursement',
  PHASE_6: 'Settlement',
  PHASE_7: 'Regulatory',
};

// Per-phase document types agent can upload
const PHASE_DOC_TYPES: Record<string, { type: string; label: string }[]> = {
  PHASE_1: [
    { type: 'NATIONAL_ID', label: 'National ID / Passport' },
    { type: 'MINING_LICENCE', label: 'Mining Licence' },
  ],
  PHASE_3: [
    { type: 'EXPORT_PERMIT', label: 'Export Permit' },
    { type: 'PACKING_LIST', label: 'Packing List' },
  ],
  PHASE_4: [{ type: 'ASSAY_CERTIFICATE', label: 'Assay Certificate' }],
  PHASE_5: [{ type: 'EXPENSE_RECEIPT', label: 'Expense Receipt' }],
  PHASE_7: [{ type: 'REGULATORY_CLEARANCE', label: 'Regulatory Clearance Document' }],
};

const EVENT_ICON: Record<string, string> = {
  PHASE_CHANGE: '🔄',
  DOCUMENT_UPLOADED: '📄',
  COMMENT: '💬',
  DISBURSEMENT: '💸',
  KYC_APPROVED: '✅',
  KYC_REJECTED: '❌',
  DEFAULT: '📌',
};

type Tab = 'action' | 'documents' | 'timeline' | 'comments';

export default function AgentTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuthStore();

  const { data: tx, isLoading, refetch } = useTransaction(id);
  const { data: nextAction, isLoading: actionLoading } = useAgentNextAction(id);
  const { data: disbursements = [] } = useDisbursements(id);
  const { data: events = [] } = useTransactionEvents(id);
  const addComment = useAddComment(id);
  const uploadReceipt = useUploadDisbursementReceipt();

  const [activeTab, setActiveTab] = useState<Tab>('action');
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'comments') {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, events]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded-lg animate-pulse w-3/4" />
        <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-3xl mb-2">🔍</p>
        <p className="text-sm">Transaction not found</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-gold underline">
          Go back
        </button>
      </div>
    );
  }

  const phase = tx.phase as string;
  const docTypes = PHASE_DOC_TYPES[phase] ?? [];
  const commentEvents = (events as unknown as Record<string, unknown>[]).filter(
    (e) => e.type === 'COMMENT',
  );

  async function handleDocUpload(docType: string, file: File) {
    setUploadingDoc(docType);
    try {
      await uploadDocument(tx!.id as string, docType, file);
      toast.success('Document uploaded — Head Office will review it shortly');
      refetch();
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setUploadingDoc(null);
    }
  }

  async function handleReceiptUpload(disbursementId: string, file: File) {
    setUploadingReceipt(disbursementId);
    try {
      await uploadReceipt.mutateAsync({ disbursementId, file });
      toast.success('Receipt uploaded successfully');
    } catch {
      toast.error('Receipt upload failed — please try again');
    } finally {
      setUploadingReceipt(null);
    }
  }

  async function handleSendComment() {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      await addComment.mutateAsync(comment.trim());
      setComment('');
    } catch {
      toast.error('Failed to send comment');
    } finally {
      setSubmittingComment(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'action', label: 'Action', icon: '👉' },
    { id: 'documents', label: 'Docs', icon: '📄' },
    { id: 'timeline', label: 'Timeline', icon: '📋' },
    { id: 'comments', label: 'Chat', icon: '💬' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-400 mb-2 flex items-center gap-1"
        >
          <span>‹</span> Dashboard
        </button>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs text-gray-400 mb-0.5">
              {(tx.id as string).slice(-8).toUpperCase()}
            </p>
            <h1 className="text-lg font-bold text-aop-dark truncate">
              {((tx.client as Record<string, unknown>)?.fullName as string) ?? 'Unknown Client'}
            </h1>
          </div>
          <PhaseBadge phase={phase} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex-1 flex flex-col items-center py-2 rounded-lg text-xs font-medium transition-colors',
              activeTab === t.id ? 'bg-white text-aop-navy shadow-sm' : 'text-gray-500',
            )}
          >
            <span className="text-base mb-0.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ACTION TAB ── */}
      {activeTab === 'action' && (
        <div className="space-y-4">
          {/* Big action card */}
          <div className="bg-aop-navy text-white rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-gold rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-gold uppercase tracking-wider">
                What do I need to do?
              </span>
            </div>
            {actionLoading ? (
              <div className="h-12 bg-white/10 rounded-lg animate-pulse" />
            ) : (
              <p className="text-sm leading-relaxed text-white/90">
                {((nextAction as Record<string, unknown>)?.description as string) ??
                  ((nextAction as Record<string, unknown>)?.action as string) ??
                  'Check with Head Office for instructions on this phase.'}
              </p>
            )}
          </div>

          {/* Current phase */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Transaction Details
            </h3>
            <dl className="space-y-2.5 text-sm">
              {(
                [
                  ['Phase', PHASE_LABELS[phase] ?? phase],
                  ['Client', ((tx.client as Record<string, unknown>)?.fullName as string) ?? '—'],
                  ['Country', (tx.countryCode as string) ?? '—'],
                  [
                    'Gold Weight',
                    tx.goldWeightGross ? `${Number(tx.goldWeightGross).toFixed(3)} kg gross` : '—',
                  ],
                  ['Created', new Date(tx.createdAt as string).toLocaleDateString('en-GB')],
                ] as [string, string][]
              ).map(([l, v]) => (
                <div key={l} className="flex justify-between gap-2">
                  <dt className="text-gray-400 shrink-0">{l}</dt>
                  <dd className="font-medium text-right text-gray-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Quick nav to upload if there are docs to upload */}
          {docTypes.length > 0 && (
            <button
              onClick={() => setActiveTab('documents')}
              className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-left flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-amber-800 text-sm">Documents required</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {docTypes.length} document type{docTypes.length > 1 ? 's' : ''} to upload
                </p>
              </div>
              <span className="text-amber-400 text-xl">›</span>
            </button>
          )}
        </div>
      )}

      {/* ── DOCUMENTS TAB ── */}
      {activeTab === 'documents' && (
        <div className="space-y-3">
          {docTypes.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">No documents to upload in this phase</p>
            </div>
          ) : (
            docTypes.map(({ type, label }) => (
              <div key={type} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="font-medium text-gray-800 text-sm mb-3">{label}</p>
                <label
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl py-6 cursor-pointer transition-colors',
                    uploadingDoc === type
                      ? 'border-gold bg-amber-50 opacity-70 pointer-events-none'
                      : 'border-gray-200 hover:border-gold hover:bg-amber-50/30',
                  )}
                >
                  {uploadingDoc === type ? (
                    <>
                      <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-gray-500">Uploading…</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">📷</span>
                      <span className="text-xs font-medium text-gray-600">
                        Take photo or choose file
                      </span>
                      <span className="text-xs text-gray-400">JPEG, PNG, PDF accepted</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    className="sr-only"
                    disabled={!!uploadingDoc}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDocUpload(type, file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            ))
          )}

          {/* Disbursement receipts if PHASE_5 */}
          {phase === 'PHASE_5' &&
            (disbursements as unknown as Record<string, unknown>[]).length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                  Disbursement Receipts
                </h3>
                {(disbursements as unknown as Record<string, unknown>[]).map((d) => (
                  <div
                    key={d.id as string}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium text-sm text-gray-800">
                          Tranche {d.trancheNo as number}
                        </p>
                        <p className="text-xs text-gray-400">
                          ${Number(d.amountUsd).toLocaleString()} USD
                        </p>
                      </div>
                      <span
                        className={cn(
                          'text-xs font-semibold px-2 py-1 rounded-full',
                          d.status === 'APPROVED'
                            ? 'bg-green-100 text-green-700'
                            : d.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500',
                        )}
                      >
                        {d.status as string}
                      </span>
                    </div>
                    {d.status === 'APPROVED' && !d.receiptUrl && (
                      <label
                        className={cn(
                          'flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl py-4 cursor-pointer transition-colors',
                          uploadingReceipt === d.id
                            ? 'border-gold bg-amber-50 opacity-70 pointer-events-none'
                            : 'border-gray-200 hover:border-gold hover:bg-amber-50/30',
                        )}
                      >
                        {uploadingReceipt === d.id ? (
                          <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span className="text-lg">🧾</span>
                            <span className="text-xs font-medium text-gray-600">
                              Upload receipt
                            </span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          capture="environment"
                          className="sr-only"
                          disabled={uploadingReceipt === (d.id as string)}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleReceiptUpload(d.id as string, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                    {!!d.receiptUrl && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <span>✓</span> Receipt uploaded
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* ── TIMELINE TAB ── */}
      {activeTab === 'timeline' && (
        <div>
          {(events as unknown as Record<string, unknown>[]).filter((e) => e.type !== 'COMMENT')
            .length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">No events yet</p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-100" />
              <div className="space-y-5">
                {(events as unknown as Record<string, unknown>[])
                  .filter((e) => e.type !== 'COMMENT')
                  .map((e) => (
                    <div key={e.id as string} className="relative">
                      <span className="absolute -left-4 top-0 w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center text-xs">
                        {EVENT_ICON[e.type as string] ?? EVENT_ICON.DEFAULT}
                      </span>
                      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 ml-2">
                        <p className="text-sm text-gray-700">
                          {(e.description as string) ?? (e.type as string)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(e.createdAt as string).toLocaleString('en-GB')}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── COMMENTS TAB ── */}
      {activeTab === 'comments' && (
        <div className="flex flex-col gap-3">
          {/* Messages */}
          <div className="space-y-3 min-h-[200px]">
            {commentEvents.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm">No messages yet — start the conversation</p>
              </div>
            ) : (
              commentEvents.map((e) => {
                const isMe = (e.userId as string) === user?.id;
                return (
                  <div
                    key={e.id as string}
                    className={cn('flex gap-2', isMe ? 'flex-row-reverse' : 'flex-row')}
                  >
                    <div className="w-7 h-7 rounded-full bg-aop-navy text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {(((e.user as Record<string, unknown>)?.email as string) ??
                        '?')[0].toUpperCase()}
                    </div>
                    <div
                      className={cn(
                        'max-w-[75%] space-y-1',
                        isMe ? 'items-end' : 'items-start',
                        'flex flex-col',
                      )}
                    >
                      <div
                        className={cn(
                          'rounded-2xl px-3 py-2 text-sm',
                          isMe
                            ? 'bg-aop-navy text-white rounded-tr-sm'
                            : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-tl-sm',
                        )}
                      >
                        {(e.message as string) ?? (e.description as string)}
                      </div>
                      <p className="text-xs text-gray-400 px-1">
                        {new Date(e.createdAt as string).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={commentsEndRef} />
          </div>

          {/* Input */}
          <div className="sticky bottom-0 bg-gray-50 pt-2 pb-1">
            <div className="flex gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 shadow-sm">
              <textarea
                rows={1}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendComment();
                  }
                }}
                placeholder="Type a message…"
                className="flex-1 text-sm resize-none focus:outline-none bg-transparent text-gray-800 placeholder:text-gray-400"
              />
              <button
                onClick={handleSendComment}
                disabled={!comment.trim() || submittingComment}
                className="text-gold disabled:opacity-40 transition-opacity self-end pb-0.5"
              >
                {submittingComment ? (
                  <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-lg">➤</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
