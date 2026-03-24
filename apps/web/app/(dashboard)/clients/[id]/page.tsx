'use client';
import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../../../components/ui/page-header';
import {
  KycStatusBadge,
  SanctionsStatusBadge,
  PhaseBadge,
} from '../../../../components/ui/status-badge';
import { Badge } from '../../../../components/ui/badge';
import { CurrencyAmount } from '../../../../components/ui/currency-amount';
import {
  useClient,
  useClientKyc,
  useSanctionsScreen,
  useApproveKyc,
  useRejectKyc,
  useKycChecklist,
  useUpdatePepEdd,
  useUpdateClient,
  useClientTransactions,
  useClientScreeningHistory,
  useUploadKycDocument,
  useApproveKycDocument,
  useRejectKycDocument,
} from '../../../../lib/hooks/use-clients';
import { cn } from '../../../../lib/utils';
import { toast } from 'sonner';

const TABS = ['Profile', 'KYC Documents', 'Transactions', 'Screening History'] as const;
type Tab = (typeof TABS)[number];

const KYC_DOC_TYPES = [
  { type: 'NATIONAL_ID', label: 'National ID / Passport' },
  { type: 'MINING_LICENCE', label: 'Mining Licence' },
  { type: 'BUSINESS_REGISTRATION', label: 'Business Registration' },
  { type: 'BENEFICIAL_OWNERSHIP', label: 'Beneficial Ownership Declaration' },
  { type: 'PROOF_OF_ADDRESS', label: 'Proof of Address' },
  { type: 'BANK_STATEMENT', label: 'Bank Statement' },
];

const riskVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  VERY_HIGH: 'danger',
};

// ── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({ client, id }: { client: Record<string, unknown>; id: string }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showRejectKyc, setShowRejectKyc] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const screen = useSanctionsScreen(id);
  const approveKyc = useApproveKyc(id);
  const rejectKyc = useRejectKyc(id);
  const updateClient = useUpdateClient(id);
  const updatePepEdd = useUpdatePepEdd(id);
  const { data: checklist, isLoading: checklistLoading } = useKycChecklist(id);

  const gateList = checklist ?? [];
  const allGatePassed = gateList.length > 0 && gateList.every((item) => item.status === 'COMPLETE');
  const blockers = gateList
    .filter((item) => item.status !== 'COMPLETE')
    .map((item) => item.blocker ?? item.item);

  function startEdit() {
    setForm({
      fullName: String(client.fullName ?? ''),
      nationality: String(client.nationality ?? ''),
      countryCode: String(client.countryCode ?? ''),
      nationalId: String(client.nationalId ?? ''),
      miningLicenceNo: String(client.miningLicenceNo ?? ''),
      businessRegNo: String(client.businessRegNo ?? ''),
    });
    setEditing(true);
  }

  async function saveEdit() {
    await updateClient.mutateAsync(form);
    toast.success('Client updated');
    setEditing(false);
  }

  async function handleScreen() {
    try {
      const result = await screen.mutateAsync();
      toast.success(`Screening complete — ${result.outcome}`);
    } catch {
      toast.error('Screening failed');
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Details card */}
      <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-aop-dark">Client Details</h3>
          {!editing ? (
            <button
              onClick={startEdit}
              className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ✏️ Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="text-xs border border-gray-300 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={updateClient.isPending}
                className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg hover:bg-gold-dark disabled:opacity-50 transition-colors"
              >
                {updateClient.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {(
              [
                ['fullName', 'Full Name'],
                ['nationality', 'Nationality'],
                ['countryCode', 'Country (ISO)'],
                ['nationalId', 'National ID'],
                ['miningLicenceNo', 'Mining Licence No.'],
                ['businessRegNo', 'Business Reg. No.'],
              ] as [string, string][]
            ).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <input
                  value={form[key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {(
              [
                ['Full Name', client.fullName],
                ['Entity Type', client.entityType],
                ['Nationality', client.nationality],
                ['Country', client.countryCode],
                ['National ID', client.nationalId],
                ['Mining Licence', client.miningLicenceNo],
                ['Business Reg.', client.businessRegNo],
                ['Assigned Agent', (client.agent as Record<string, unknown>)?.companyName ?? '—'],
              ] as [string, unknown][]
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{(value as string) ?? '—'}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* PEP / EDD toggles */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-6">
          {(
            [
              { key: 'isPEP', label: '🚩 PEP Flag', value: !!client.isPEP },
              { key: 'isEDD', label: '⚠️ EDD Required', value: !!client.isEDD },
            ] as { key: 'isPEP' | 'isEDD'; label: string; value: boolean }[]
          ).map(({ key, label, value }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={async () => {
                  await updatePepEdd.mutateAsync({ [key]: !value });
                  toast.success(`${label} ${!value ? 'enabled' : 'disabled'}`);
                }}
                className={cn(
                  'w-10 h-5 rounded-full relative transition-colors cursor-pointer',
                  value ? 'bg-red-500' : 'bg-gray-300',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                    value ? 'left-5' : 'left-0.5',
                  )}
                />
              </div>
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions sidebar */}
      <div className="space-y-4">
        {/* Status card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h3 className="font-semibold text-aop-dark mb-3">Status</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">KYC Status</span>
            <KycStatusBadge status={client.kycStatus as string} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Sanctions</span>
            <SanctionsStatusBadge status={client.sanctionsStatus as string} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Risk Rating</span>
            <Badge variant={riskVariant[client.riskRating as string] ?? 'default'}>
              {(client.riskRating as string) ?? '—'}
            </Badge>
          </div>
        </div>

        {/* KYC gate checklist */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-aop-dark mb-3 text-sm">KYC Gate Checklist</h3>
          {checklistLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : gateList.length === 0 ? (
            <p className="text-xs text-gray-400">No checklist available</p>
          ) : (
            <div className="space-y-1.5">
              {gateList.map((item) => (
                <div key={item.item} className="flex items-start gap-2 text-xs">
                  <span
                    className={cn(
                      'mt-0.5 shrink-0',
                      item.status === 'COMPLETE'
                        ? 'text-green-600'
                        : item.status === 'BLOCKED'
                          ? 'text-red-500'
                          : 'text-gray-400',
                    )}
                  >
                    {item.status === 'COMPLETE' ? '✓' : item.status === 'BLOCKED' ? '✗' : '○'}
                  </span>
                  <span
                    className={cn(
                      item.status === 'COMPLETE'
                        ? 'text-green-700'
                        : item.status === 'BLOCKED'
                          ? 'text-red-700'
                          : 'text-gray-600',
                    )}
                  >
                    {item.item}
                    {item.blocker && (
                      <span className="block text-red-500 mt-0.5">{item.blocker}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-2.5">
          <h3 className="font-semibold text-aop-dark mb-3 text-sm">Actions</h3>
          <button
            onClick={handleScreen}
            disabled={screen.isPending}
            className="w-full border border-aop-navy text-aop-navy rounded-lg py-2 text-sm font-medium hover:bg-aop-navy hover:text-white transition-colors disabled:opacity-50"
          >
            {screen.isPending ? '🔍 Screening…' : '🔍 Run Sanctions Screen'}
          </button>

          {client.kycStatus !== 'APPROVED' && (
            <div className="group relative">
              <button
                disabled={!allGatePassed || approveKyc.isPending}
                onClick={async () => {
                  await approveKyc.mutateAsync();
                  toast.success('KYC Approved');
                }}
                className={cn(
                  'w-full rounded-lg py-2 text-sm font-medium transition-colors',
                  allGatePassed
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed',
                )}
              >
                {approveKyc.isPending ? 'Approving…' : '✅ Approve KYC'}
              </button>
              {!allGatePassed && blockers.length > 0 && (
                <div className="absolute bottom-full mb-2 left-0 right-0 hidden group-hover:block z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
                  <p className="font-semibold mb-1">Blockers:</p>
                  <ul className="space-y-0.5">
                    {blockers.map((b, i) => (
                      <li key={i}>• {b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {client.kycStatus !== 'REJECTED' && (
            <button
              onClick={() => setShowRejectKyc(!showRejectKyc)}
              className="w-full border border-red-300 text-red-600 rounded-lg py-2 text-sm font-medium hover:bg-red-50 transition-colors"
            >
              ✗ Reject KYC
            </button>
          )}

          {showRejectKyc && (
            <div className="bg-red-50 rounded-lg p-3 space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="Rejection reason (required)"
                className="w-full border border-red-300 rounded px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button
                  disabled={!rejectReason.trim() || rejectKyc.isPending}
                  onClick={async () => {
                    await rejectKyc.mutateAsync(rejectReason);
                    toast.error('KYC Rejected');
                    setShowRejectKyc(false);
                    setRejectReason('');
                  }}
                  className="flex-1 bg-red-600 text-white text-xs py-1.5 rounded disabled:opacity-50 hover:bg-red-700 transition-colors"
                >
                  Confirm Rejection
                </button>
                <button
                  onClick={() => {
                    setShowRejectKyc(false);
                    setRejectReason('');
                  }}
                  className="text-xs text-gray-500 px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KYC Documents Tab ────────────────────────────────────────────────────────

function KycDocumentsTab({ id }: { id: string }) {
  const { data: kycData, isLoading } = useClientKyc(id);
  const uploadDoc = useUploadKycDocument(id);
  const approveDoc = useApproveKycDocument(id);
  const rejectDoc = useRejectKycDocument(id);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const records = (kycData?.records ?? []) as Record<string, unknown>[];

  function getDocRecord(docType: string) {
    return records.find((r) => r.documentType === docType);
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {KYC_DOC_TYPES.map(({ type, label }) => {
          const doc = getDocRecord(type);
          const isUploading = uploadingFor === type;
          return (
            <div
              key={type}
              className={cn(
                'bg-white rounded-xl border shadow-sm p-4 flex flex-col',
                doc ? 'border-gray-200' : 'border-dashed border-gray-300',
              )}
            >
              <div className="text-3xl mb-2">{doc ? '📄' : '🗂️'}</div>
              <p className="text-xs font-semibold text-gray-700 mb-1 leading-tight">{label}</p>

              {doc ? (
                <>
                  <Badge
                    variant={
                      doc.status === 'APPROVED'
                        ? 'success'
                        : doc.status === 'REJECTED'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {doc.status as string}
                  </Badge>
                  <p className="text-xs text-gray-400 mt-2">
                    {doc.uploadedAt
                      ? new Date(doc.uploadedAt as string).toLocaleDateString('en-GB')
                      : ''}
                  </p>
                  {doc.uploaderEmail && (
                    <p className="text-xs text-gray-400 truncate">{doc.uploaderEmail as string}</p>
                  )}
                  <div className="mt-auto pt-3 flex gap-1 flex-wrap">
                    <button className="text-xs text-gold hover:text-gold-dark transition-colors">
                      ↓ Download
                    </button>
                    {doc.status !== 'APPROVED' && (
                      <button
                        onClick={() => approveDoc.mutate({ docId: doc.id as string })}
                        disabled={approveDoc.isPending}
                        className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded hover:bg-green-200 transition-colors"
                      >
                        Approve
                      </button>
                    )}
                    {doc.status !== 'REJECTED' && (
                      <button
                        onClick={() => setRejectingId(doc.id as string)}
                        className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded hover:bg-red-200 transition-colors"
                      >
                        Reject
                      </button>
                    )}
                  </div>

                  {/* Inline reject form */}
                  {rejectingId === doc.id && (
                    <div className="mt-2 space-y-1.5">
                      <input
                        autoFocus
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason"
                        className="w-full border border-red-300 rounded px-2 py-1 text-xs focus:outline-none"
                      />
                      <div className="flex gap-1">
                        <button
                          disabled={!rejectReason.trim() || rejectDoc.isPending}
                          onClick={() => {
                            rejectDoc.mutate({ docId: rejectingId!, reason: rejectReason });
                            setRejectingId(null);
                            setRejectReason('');
                          }}
                          className="flex-1 bg-red-600 text-white text-xs py-1 rounded disabled:opacity-50"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason('');
                          }}
                          className="text-xs text-gray-500 px-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-auto pt-3">
                  <label
                    className={cn(
                      'flex flex-col items-center gap-1 border border-dashed border-gray-300 rounded-lg p-3 cursor-pointer',
                      'hover:border-gold hover:bg-gold-light/20 transition-colors text-center',
                      isUploading && 'opacity-60 pointer-events-none',
                    )}
                  >
                    <span className="text-lg">↑</span>
                    <span className="text-xs text-gray-400">
                      {isUploading ? 'Uploading…' : 'Upload'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setUploadingFor(type);
                        try {
                          await uploadDoc.mutateAsync({ documentType: type, file: f });
                        } finally {
                          setUploadingFor(null);
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading } = useClientTransactions(id);
  const txns = (data ?? []) as Record<string, unknown>[];

  const KG_TO_TROY_OZ = 32.1507;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (txns.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-3xl mb-2">📋</p>
        <p>No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-aop-dark text-white">
          <tr>
            {['ID', 'Phase', 'Weight (kg)', 'Est. Value', 'Status', 'Created'].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {txns.map((t) => {
            const fine = Number(t.goldWeightFine ?? 0);
            const price = Number(t.lmePriceLocked ?? 0);
            const estValue = fine * KG_TO_TROY_OZ * price;
            return (
              <tr
                key={t.id as string}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => router.push(`/transactions/${t.id as string}`)}
              >
                <td className="px-4 py-3 font-mono text-xs text-aop-navy">
                  {(t.id as string).slice(-8)}
                </td>
                <td className="px-4 py-3">
                  <PhaseBadge phase={t.phase as string} />
                </td>
                <td className="px-4 py-3 font-mono">{fine ? fine.toFixed(3) : '—'}</td>
                <td className="px-4 py-3">
                  {estValue > 0 ? <CurrencyAmount amountUsd={estValue} /> : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {(t.status as string)?.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(t.createdAt as string).toLocaleDateString('en-GB')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Screening History Tab ────────────────────────────────────────────────────

function ScreeningHistoryTab({ id }: { id: string }) {
  const { data, isLoading } = useClientScreeningHistory(id);
  const [expanded, setExpanded] = useState<string | null>(null);
  const screenings = (data ?? []) as Array<{
    id: string;
    provider: string;
    outcome: string;
    hitCount?: number;
    screenedAt: string;
    rawResult?: unknown;
  }>;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const outcomeConfig: Record<string, { color: string; bg: string; icon: string }> = {
    CLEAR: { color: 'text-green-700', bg: 'bg-green-50', icon: '✅' },
    HIT: { color: 'text-red-700', bg: 'bg-red-50', icon: '🚨' },
    POSSIBLE_MATCH: { color: 'text-amber-700', bg: 'bg-amber-50', icon: '⚠️' },
    PENDING: { color: 'text-gray-700', bg: 'bg-gray-50', icon: '🕐' },
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-aop-dark text-white">
          <tr>
            {['Date', 'Provider', 'Outcome', 'Hits', 'Raw Result'].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {screenings.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-8 text-gray-400">
                No screening history
              </td>
            </tr>
          ) : (
            screenings.map((s) => {
              const cfg = outcomeConfig[s.outcome] ?? outcomeConfig.PENDING;
              return (
                <>
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs">
                      {new Date(s.screenedAt).toLocaleString('en-GB')}
                    </td>
                    <td className="px-4 py-3">{s.provider}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn('flex items-center gap-1.5 font-medium text-sm', cfg.color)}
                      >
                        <span>{cfg.icon}</span> {s.outcome.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">{s.hitCount ?? 0}</td>
                    <td className="px-4 py-3">
                      {!!s.rawResult && (
                        <button
                          onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                          className="text-xs text-gold hover:text-gold-dark transition-colors"
                        >
                          {expanded === s.id ? '▲ Hide' : '▼ Show JSON'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === s.id && s.rawResult && (
                    <tr key={`${s.id}-raw`}>
                      <td colSpan={5} className="px-4 pb-3">
                        <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto font-mono max-h-64 overflow-y-auto">
                          {JSON.stringify(s.rawResult, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<Tab>('Profile');
  const { data: client, isLoading } = useClient(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 h-72 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-72 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-5xl mb-3">🔍</p>
        <p className="text-lg font-medium">Client not found</p>
        <a href="/clients" className="text-sm text-gold hover:text-gold-dark mt-2 inline-block">
          ← Back to clients
        </a>
      </div>
    );
  }

  const clientRecord = client as Record<string, unknown>;

  return (
    <div>
      <PageHeader
        title={String(client.fullName)}
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Clients', href: '/clients' },
          { label: String(client.fullName) },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <KycStatusBadge status={String(client.kycStatus)} />
            <SanctionsStatusBadge status={String(client.sanctionsStatus)} />
          </div>
        }
      />

      <div className="border-b border-gray-200 mb-6 flex gap-0 overflow-x-auto">
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

      {activeTab === 'Profile' && <ProfileTab client={clientRecord} id={id} />}
      {activeTab === 'KYC Documents' && <KycDocumentsTab id={id} />}
      {activeTab === 'Transactions' && <TransactionsTab id={id} />}
      {activeTab === 'Screening History' && <ScreeningHistoryTab id={id} />}
    </div>
  );
}
