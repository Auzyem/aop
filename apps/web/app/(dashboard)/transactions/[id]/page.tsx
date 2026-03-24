'use client';
import { useState, useEffect, useRef } from 'react';
import { use } from 'react';
import { PageHeader } from '../../../../components/ui/page-header';
import { PhaseTimeline } from '../../../../components/ui/phase-timeline';
import { Badge } from '../../../../components/ui/badge';
import { PhaseBadge } from '../../../../components/ui/status-badge';
import { CurrencyAmount } from '../../../../components/ui/currency-amount';
import {
  useTransaction,
  useTransactionEvents,
  useAddComment,
  usePhaseChecklist,
  useAdvancePhase,
} from '../../../../lib/hooks/use-transactions';
import {
  useDocuments,
  useChecklist,
  useUploadDocument,
  useApproveDocument,
  useRejectDocument,
  useDownloadAllDocuments,
} from '../../../../lib/hooks/use-documents';
import {
  useCostItems,
  useDisbursements,
  useAgentBalance,
  useCostApprovalStatus,
  useApproveCostEstimate,
  useRejectCostEstimate,
} from '../../../../lib/hooks/use-finance';
import { useLMEPrice } from '../../../../lib/websocket';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { cn } from '../../../../lib/utils';

const TABS = ['Overview', 'Documents', 'Finance', 'Timeline', 'Comments'] as const;
type Tab = (typeof TABS)[number];
const KG_TO_TROY_OZ = 32.1507;

// ── Helpers ────────────────────────────────────────────────────────────────

function DocStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    APPROVED: 'success',
    REJECTED: 'danger',
    PENDING_REVIEW: 'warning',
    UPLOADED: 'warning',
    MISSING: 'default',
  };
  return <Badge variant={map[status] ?? 'default'}>{status.replace(/_/g, ' ')}</Badge>;
}

function GateItem({ item }: { item: { item: string; status: string; blocker?: string } }) {
  const isComplete = item.status === 'COMPLETE';
  const isBlocked = item.status === 'BLOCKED';
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border text-sm',
        isComplete && 'bg-green-50 border-green-200',
        isBlocked && 'bg-red-50 border-red-200',
        !isComplete && !isBlocked && 'bg-gray-50 border-gray-200',
      )}
    >
      <span
        className={cn(
          'text-base flex-shrink-0 mt-0.5',
          isComplete && 'text-green-600',
          isBlocked && 'text-red-500',
          !isComplete && !isBlocked && 'text-gray-400',
        )}
      >
        {isComplete ? '✓' : isBlocked ? '✗' : '○'}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-medium',
            isComplete && 'text-green-800',
            isBlocked && 'text-red-800',
            !isComplete && !isBlocked && 'text-gray-700',
          )}
        >
          {item.item}
        </p>
        {item.blocker && <p className="text-xs text-red-600 mt-0.5">{item.blocker}</p>}
      </div>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────

function OverviewTab({ tx, id }: { tx: Record<string, unknown>; id: string }) {
  const { accessToken } = useAuthStore();
  const wsPrice = useLMEPrice(accessToken);
  const { data: gateChecklist, isLoading: gateLoading } = usePhaseChecklist(id);
  const advancePhase = useAdvancePhase(id);

  const livePrice = wsPrice?.priceUsdPerTroyOz ?? Number(tx.lmePriceLocked ?? 0);
  const fine = Number(tx.goldWeightFine ?? 0);
  const toz = fine * KG_TO_TROY_OZ;
  const grossValue = toz * livePrice;
  const netValue = grossValue * 0.985;

  const checklist = gateChecklist ?? [];
  const allPassed = checklist.length > 0 && checklist.every((item) => item.status === 'COMPLETE');
  const blockers = checklist
    .filter((item) => item.status === 'BLOCKED')
    .map((item) => item.blocker ?? item.item);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Phase gate */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-aop-dark">Phase Gate Checklist</h3>
          <div className="group relative">
            <button
              disabled={!allPassed || advancePhase.isPending}
              onClick={() => advancePhase.mutate(undefined)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                allPassed && !advancePhase.isPending
                  ? 'bg-gold text-white hover:bg-gold-dark'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              )}
            >
              {advancePhase.isPending ? 'Advancing…' : 'Advance to Next Phase'}
            </button>
            {!allPassed && blockers.length > 0 && (
              <div className="absolute right-0 top-full mt-2 hidden group-hover:block z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 shadow-xl">
                <p className="font-semibold mb-1">Blockers:</p>
                <ul className="space-y-0.5">
                  {blockers.map((b, i) => (
                    <li key={i}>• {b}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        {gateLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : checklist.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No checklist items for current phase
          </p>
        ) : (
          <div className="space-y-2">
            {checklist.map((item) => (
              <GateItem key={item.item} item={item} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Transaction details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-aop-dark mb-4">Transaction Details</h3>
          <dl className="space-y-2.5 text-sm">
            {(
              [
                ['Client', ((tx.client as Record<string, unknown>)?.fullName as string) ?? '—'],
                ['Agent', ((tx.agent as Record<string, unknown>)?.companyName as string) ?? '—'],
                ['Country', (tx.countryCode as string) ?? '—'],
                ['Phase', <PhaseBadge key="ph" phase={tx.phase as string} />],
                ['Status', (tx.status as string)?.replace(/_/g, ' ')],
                [
                  'Gold Gross',
                  tx.goldWeightGross ? `${Number(tx.goldWeightGross).toFixed(3)} kg` : '—',
                ],
                [
                  'Gold Fine',
                  tx.goldWeightFine ? `${Number(tx.goldWeightFine).toFixed(3)} kg` : '—',
                ],
                [
                  'Assay Purity',
                  tx.assayPurity ? `${(Number(tx.assayPurity) * 100).toFixed(3)}%` : '—',
                ],
                ['Refinery', ((tx.refinery as Record<string, unknown>)?.name as string) ?? '—'],
                [
                  'LME Locked',
                  tx.lmePriceLocked ? (
                    <CurrencyAmount key="lme" amountUsd={Number(tx.lmePriceLocked)} />
                  ) : (
                    '—'
                  ),
                ],
              ] as [string, React.ReactNode][]
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <dt className="text-gray-500 flex-shrink-0">{label}</dt>
                <dd className="font-medium text-gray-800 text-right ml-4">
                  {value as React.ReactNode}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Indicative valuation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-aop-dark">Indicative Valuation</h3>
            {!tx.lmePriceLocked && wsPrice ? (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />{' '}
                Live
              </span>
            ) : tx.lmePriceLocked ? (
              <Badge variant="info">Price Locked</Badge>
            ) : null}
          </div>
          {fine > 0 && livePrice > 0 ? (
            <dl className="space-y-2.5 text-sm">
              {(
                [
                  ['Fine Troy Oz', `${toz.toFixed(3)} toz`],
                  [
                    'LME Price',
                    `$${livePrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}/toz`,
                  ],
                  ['Gross Value', <CurrencyAmount key="g" amountUsd={grossValue} />],
                  ['Company Fee (1.5%)', <CurrencyAmount key="f" amountUsd={grossValue * 0.015} />],
                  ['Est. Net Remittance', <CurrencyAmount key="n" amountUsd={netValue} />],
                ] as [string, React.ReactNode][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-medium text-gray-800">{value as React.ReactNode}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">
              {fine === 0 ? 'Gold weight not yet confirmed' : 'Awaiting price data'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Documents Tab ──────────────────────────────────────────────────────────

function DocumentsTab({ id }: { id: string }) {
  const { data: checklist, isLoading: checklistLoading } = useChecklist(id);
  const { data: docs, isLoading: docsLoading } = useDocuments(id);
  const uploadDoc = useUploadDocument(id);
  const approveDoc = useApproveDocument(id);
  const rejectDoc = useRejectDocument(id);
  const downloadAll = useDownloadAllDocuments();
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const checklistItems = (checklist?.items ?? []) as Record<string, unknown>[];
  const uploadedDocs = (docs ?? []) as Record<string, unknown>[];

  async function handleDownloadAll() {
    const blob = await downloadAll.mutateAsync(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `documents-${id.slice(-8)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-aop-dark">Document Checklist</h3>
        <button
          onClick={handleDownloadAll}
          disabled={downloadAll.isPending || uploadedDocs.length === 0}
          className="flex items-center gap-1.5 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          ↓ {downloadAll.isPending ? 'Preparing…' : 'Download All (ZIP)'}
        </button>
      </div>

      {checklistLoading || docsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {checklistItems.map((item) => {
            const docType = item.documentType as string;
            const matchingDocs = uploadedDocs.filter((d) => d.documentType === docType);
            const isUploading = uploadingFor === docType;

            return (
              <div
                key={docType}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span>
                      {item.status === 'APPROVED'
                        ? '✅'
                        : item.status === 'REJECTED'
                          ? '❌'
                          : item.uploaded
                            ? '🕐'
                            : item.required
                              ? '⭕'
                              : '○'}
                    </span>
                    <span className="text-sm font-medium text-gray-800">
                      {docType.replace(/_/g, ' ')}
                    </span>
                    {!!item.required && <Badge variant="gold">Required</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <DocStatusBadge
                      status={
                        item.status === 'APPROVED'
                          ? 'APPROVED'
                          : item.status === 'REJECTED'
                            ? 'REJECTED'
                            : item.uploaded
                              ? 'PENDING_REVIEW'
                              : 'MISSING'
                      }
                    />
                    <label
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors bg-aop-navy text-white hover:bg-aop-dark',
                        isUploading && 'opacity-60 pointer-events-none',
                      )}
                    >
                      {isUploading ? 'Uploading…' : '↑ Upload'}
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setUploadingFor(docType);
                          try {
                            await uploadDoc.mutateAsync({ documentType: docType, file: f });
                          } finally {
                            setUploadingFor(null);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {matchingDocs.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {matchingDocs.map((doc) => (
                      <div
                        key={doc.id as string}
                        className="px-4 py-2.5 flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">📄</span>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-700 truncate">
                              {(doc.fileName as string) ?? 'Document'}
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(doc.createdAt as string).toLocaleString('en-GB')}
                              {doc.uploader
                                ? ` · ${String((doc.uploader as Record<string, unknown>).email ?? '')}`
                                : null}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <DocStatusBadge status={(doc.status as string) ?? 'UPLOADED'} />
                          <span className="text-xs text-gold cursor-pointer hover:text-gold-dark">
                            ↓ Download
                          </span>
                          {['PENDING_REVIEW', 'UPLOADED'].includes(doc.status as string) && (
                            <>
                              <button
                                onClick={() => approveDoc.mutate({ docId: doc.id as string })}
                                disabled={approveDoc.isPending}
                                className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectingId(doc.id as string)}
                                className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {rejectingId && matchingDocs.some((d) => d.id === rejectingId) && (
                  <div className="px-4 py-3 bg-red-50 border-t border-red-100 flex items-center gap-2">
                    <input
                      autoFocus
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Rejection reason (required)"
                      className="flex-1 border border-red-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                    <button
                      disabled={!rejectReason.trim() || rejectDoc.isPending}
                      onClick={() => {
                        rejectDoc.mutate({ docId: rejectingId, reason: rejectReason });
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                      className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                      className="text-xs text-gray-500"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Finance Tab ─────────────────────────────────────────────────────────────

function FinanceTab({ tx, id }: { tx: Record<string, unknown>; id: string }) {
  const agentId = (tx.agent as Record<string, unknown> | null)?.id as string | undefined;
  const { data: costs, isLoading: costsLoading } = useCostItems(id);
  const { data: disbursements } = useDisbursements(id);
  const { data: agentBalance } = useAgentBalance(agentId ?? null);
  const { data: approvalStatus } = useCostApprovalStatus(id);
  const approveCosts = useApproveCostEstimate(id);
  const rejectCosts = useRejectCostEstimate(id);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const costList = (costs ?? []) as Record<string, unknown>[];
  const disbList = (disbursements ?? []) as Record<string, unknown>[];
  const totalEst = costList.reduce((s, c) => s + Number(c.estimatedUsd ?? 0), 0);
  const totalAct = costList.reduce((s, c) => s + Number(c.actualUsd ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Cost breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-aop-dark">Cost Breakdown</h3>
          <div className="flex items-center gap-2">
            {approvalStatus && approvalStatus.status !== 'PENDING' && (
              <span
                className={cn(
                  'text-xs font-medium px-2.5 py-1 rounded-full',
                  approvalStatus.status === 'APPROVED'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700',
                )}
              >
                {approvalStatus.status === 'APPROVED' ? '✓ Approved' : '✗ Rejected'}
              </span>
            )}
            {(!approvalStatus || approvalStatus.status === 'PENDING') && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => approveCosts.mutate()}
                  disabled={approveCosts.isPending}
                  className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Approve Estimate
                </button>
                <button
                  onClick={() => setShowRejectForm(!showRejectForm)}
                  className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>

        {showRejectForm && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
            <input
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rejection reason"
              className="flex-1 border border-red-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
            />
            <button
              disabled={!rejectReason.trim() || rejectCosts.isPending}
              onClick={() => {
                rejectCosts.mutate(rejectReason);
                setShowRejectForm(false);
                setRejectReason('');
              }}
              className="text-xs bg-red-600 text-white px-3 py-1 rounded disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setShowRejectForm(false);
                setRejectReason('');
              }}
              className="text-xs text-gray-500"
            >
              Cancel
            </button>
          </div>
        )}

        {costsLoading ? (
          <div className="p-4">
            <div className="h-32 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Category', 'Estimated', 'Actual', 'Variance', 'Receipt'].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide',
                        i > 0 ? 'text-right' : 'text-left',
                        i === 4 && 'text-center',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {costList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-400 text-sm">
                      No cost items yet
                    </td>
                  </tr>
                ) : (
                  costList.map((c) => {
                    const est = Number(c.estimatedUsd ?? 0);
                    const act = Number(c.actualUsd ?? 0);
                    const variance = act - est;
                    return (
                      <tr key={c.id as string}>
                        <td className="px-5 py-3 text-gray-700">{c.category as string}</td>
                        <td className="px-5 py-3 text-right font-mono">
                          {est ? <CurrencyAmount amountUsd={est} /> : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          {act ? <CurrencyAmount amountUsd={act} /> : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3 text-right font-mono text-xs',
                            variance > 0
                              ? 'text-red-600'
                              : variance < 0
                                ? 'text-green-600'
                                : 'text-gray-400',
                          )}
                        >
                          {act && est
                            ? `${variance >= 0 ? '+' : ''}$${Math.abs(variance).toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {c.receiptStatus ? (
                            <Badge variant={c.receiptStatus === 'RECEIVED' ? 'success' : 'warning'}>
                              {c.receiptStatus as string}
                            </Badge>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {costList.length > 0 && (
                <tfoot className="bg-gray-50 text-sm font-semibold border-t-2 border-gray-200">
                  <tr>
                    <td className="px-5 py-3 text-gray-700">Total</td>
                    <td className="px-5 py-3 text-right font-mono">
                      <CurrencyAmount amountUsd={totalEst} />
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      <CurrencyAmount amountUsd={totalAct} />
                    </td>
                    <td
                      className={cn(
                        'px-5 py-3 text-right font-mono text-xs',
                        totalAct - totalEst > 0 ? 'text-red-600' : 'text-green-600',
                      )}
                    >
                      {totalAct
                        ? `${totalAct - totalEst >= 0 ? '+' : ''}$${Math.abs(totalAct - totalEst).toFixed(2)}`
                        : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Disbursements */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-aop-dark">Disbursement Tranches</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Tranche #', 'Amount', 'Status', 'Bank Ref', 'Receipts'].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide',
                      i === 1 ? 'text-right' : 'text-left',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {disbList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400 text-sm">
                    No disbursements yet
                  </td>
                </tr>
              ) : (
                disbList.map((d) => (
                  <tr key={d.id as string}>
                    <td className="px-5 py-3 text-gray-700 font-medium">
                      #{d.trancheNo as number}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      <CurrencyAmount amountUsd={Number(d.amountUsd)} />
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={
                          d.status === 'PAID'
                            ? 'success'
                            : d.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {d.status as string}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">
                      {(d.bankRef as string) ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {d.receiptsCount ? `${d.receiptsCount} file(s)` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent balance */}
      {agentId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-aop-dark mb-4">Agent Balance Outstanding</h3>
          {agentBalance ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {(
                [
                  ['Total Disbursed', (agentBalance as Record<string, unknown>).totalDisbursedUsd],
                  ['Total Receipted', (agentBalance as Record<string, unknown>).totalReceiptedUsd],
                  ['Outstanding', (agentBalance as Record<string, unknown>).outstandingUsd],
                ] as [string, unknown][]
              ).map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="font-semibold text-aop-dark">
                    {typeof val === 'number' ? <CurrencyAmount amountUsd={val} /> : '—'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-16 bg-gray-100 rounded animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Timeline Tab ────────────────────────────────────────────────────────────

function TimelineTab({ id }: { id: string }) {
  const { data: events, isLoading } = useTransactionEvents(id);
  const eventList = (events ?? []) as Record<string, unknown>[];

  const TYPE_ICON: Record<string, string> = {
    PHASE_CHANGE: '🔄',
    DOCUMENT_UPLOADED: '📄',
    DOCUMENT_APPROVED: '✅',
    DOCUMENT_REJECTED: '❌',
    COMMENT: '💬',
    ALERT: '⚠️',
    DISBURSEMENT: '💸',
    SETTLEMENT: '🏦',
    GENERAL: '📋',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-aop-dark mb-5">Event Timeline</h3>
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : eventList.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">No events recorded yet</p>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-4">
            {eventList.map((e, idx) => (
              <div key={(e.id as string) ?? idx} className="flex gap-4 relative">
                <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-sm flex-shrink-0 z-10">
                  {TYPE_ICON[e.type as string] ?? '📋'}
                </div>
                <div className="flex-1 pb-1 pt-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-800">
                      {(e.message as string) ?? (e.type as string)?.replace(/_/g, ' ')}
                    </p>
                    <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                      {new Date(e.createdAt as string).toLocaleString('en-GB')}
                    </span>
                  </div>
                  {!!e.user && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      by {String((e.user as Record<string, unknown>).email ?? '')}
                      {!!(e.user as Record<string, unknown>).role && (
                        <span className="ml-1 opacity-70">
                          · {String((e.user as Record<string, unknown>).role)}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comments Tab ────────────────────────────────────────────────────────────

function CommentsTab({ id }: { id: string }) {
  const { data: events } = useTransactionEvents(id);
  const addComment = useAddComment(id);
  const [comment, setComment] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const comments = ((events ?? []) as Record<string, unknown>[]).filter(
    (e) => e.type === 'COMMENT',
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  async function submit() {
    if (!comment.trim()) return;
    await addComment.mutateAsync(comment.trim());
    setComment('');
  }

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col"
      style={{ minHeight: 420 }}
    >
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-aop-dark">
          Comments <span className="text-xs text-gray-400 font-normal">({comments.length})</span>
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-h-96">
        {comments.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-10">No comments yet — be the first!</p>
        ) : (
          comments.map((e) => {
            const userEmail = (e.user as Record<string, unknown>)?.email as string;
            const userRole = (e.user as Record<string, unknown>)?.role as string;
            return (
              <div key={e.id as string} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {userEmail?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 bg-gray-50 rounded-xl rounded-tl-none px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-sm font-medium text-aop-dark">
                      {userEmail ?? 'Unknown'}
                    </span>
                    {userRole && <Badge variant="default">{userRole.replace(/_/g, ' ')}</Badge>}
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(e.createdAt as string).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{e.message as string}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-gray-100 px-5 py-3 flex gap-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment… (Enter to send, Shift+Enter for new line)"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          onClick={submit}
          disabled={!comment.trim() || addComment.isPending}
          className="self-end px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-gold-dark transition-colors"
        >
          {addComment.isPending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const { data: tx, isLoading } = useTransaction(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-16 bg-gray-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-5xl mb-3">🔍</p>
        <p className="text-lg font-medium text-gray-700">Transaction not found</p>
        <a
          href="/transactions"
          className="text-sm text-gold hover:text-gold-dark mt-2 inline-block"
        >
          ← Back to transactions
        </a>
      </div>
    );
  }

  const txRecord = tx as Record<string, unknown>;

  return (
    <div>
      <PageHeader
        title={`TXN-${(tx.id as string).slice(-8).toUpperCase()}`}
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Transactions', href: '/transactions' },
          { label: (tx.id as string).slice(-8).toUpperCase() },
        ]}
      />

      <PhaseTimeline currentPhase={tx.phase as string} />

      <div className="border-b border-gray-200 mb-6 mt-4 flex gap-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
              activeTab === tab
                ? 'border-gold text-gold'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' && <OverviewTab tx={txRecord} id={id} />}
      {activeTab === 'Documents' && <DocumentsTab id={id} />}
      {activeTab === 'Finance' && <FinanceTab tx={txRecord} id={id} />}
      {activeTab === 'Timeline' && <TimelineTab id={id} />}
      {activeTab === 'Comments' && <CommentsTab id={id} />}
    </div>
  );
}
