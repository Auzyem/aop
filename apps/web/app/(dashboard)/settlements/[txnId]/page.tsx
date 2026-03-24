'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTransaction } from '../../../../lib/hooks/use-transactions';
import {
  useSettlement,
  useCalculateSettlement,
  useConfirmSettlement,
  useClearDiscrepancyFlag,
  useDownloadSettlementStatement,
  useGenerateRemittanceInstruction,
  useUpdateRemittanceStatus,
} from '../../../../lib/hooks/use-settlement';
import { RoleGuard } from '../../../../components/auth/role-guard';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { REMITTANCE_STATUSES, type RemittanceStatus } from '../../../../lib/api/settlement';
import type { Settlement } from '../../../../lib/api/settlement';
import { toast } from 'sonner';

const KG_TO_TROY_OZ = 32.1507;

// ─── formatting ────────────────────────────────────────────────────────────
function usd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n);
}

/** Negative amounts in red parentheses, positive in provided className */
function Amount({ value, className = '' }: { value: number; className?: string }) {
  if (value < 0) {
    return <span className="text-red-600 font-mono">({usd(Math.abs(value))})</span>;
  }
  return <span className={`font-mono ${className}`}>{usd(value)}</span>;
}

// ─── settlement line item row ───────────────────────────────────────────────
function LineRow({
  label,
  amount,
  indent = false,
  note,
}: {
  label: string;
  amount: number | null;
  indent?: boolean;
  note?: string;
}) {
  return (
    <tr className="border-b border-gray-100">
      <td
        className={`py-2.5 text-sm ${indent ? 'pl-8 text-gray-500' : 'text-gray-700 font-medium'}`}
      >
        {label}
        {note && <span className="ml-1 text-xs text-gray-400">({note})</span>}
      </td>
      <td className="py-2.5 text-right">
        {amount !== null ? (
          <Amount value={amount} />
        ) : (
          <span className="text-gray-300 text-xs font-mono">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    CALCULATED: 'bg-blue-100 text-blue-700',
    CONFIRMED: 'bg-green-100 text-green-700',
    SETTLED: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  );
}

// ─── remittance label ───────────────────────────────────────────────────────
const REMITTANCE_LABELS: Record<string, string> = {
  INSTRUCTION_GENERATED: 'Instruction Generated',
  SUBMITTED: 'Submitted to Bank',
  CONFIRMED_SENT: 'Confirmed Sent',
  MINER_CONFIRMED: 'Miner Confirmed Receipt',
};

export default function SettlementPage({ params }: { params: Promise<{ txnId: string }> }) {
  const { txnId } = use(params);
  const router = useRouter();

  const { data: tx, isLoading: txLoading } = useTransaction(txnId);
  const { data: settlement, isLoading: settlementLoading } = useSettlement(txnId);
  const calculate = useCalculateSettlement(txnId);
  const confirm = useConfirmSettlement(txnId);
  const clearDiscrepancy = useClearDiscrepancyFlag(txnId);
  const downloadStatement = useDownloadSettlementStatement();
  const generateRemittance = useGenerateRemittanceInstruction(txnId);
  const updateRemittance = useUpdateRemittanceStatus(txnId);

  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [discrepancyNote, setDiscrepancyNote] = useState('');
  const [clearingDiscrepancy, setClearingDiscrepancy] = useState(false);
  const [remittanceStatus, setRemittanceStatus] = useState('');

  const txRecord = tx as Record<string, unknown> | null;
  const client = txRecord?.client as Record<string, unknown> | null;
  const s = settlement as Settlement | null;

  async function handleDownload() {
    try {
      const blob = await downloadStatement.mutateAsync(txnId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settlement-statement-${txnId.slice(-8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download statement');
    }
  }

  async function handleApprove() {
    setShowApproveDialog(false);
    try {
      await confirm.mutateAsync();
      toast.success('Settlement approved');
    } catch {
      toast.error('Failed to approve settlement');
    }
  }

  async function handleClearDiscrepancy() {
    if (!discrepancyNote.trim()) {
      toast.error('Please enter a note');
      return;
    }
    setClearingDiscrepancy(false);
    try {
      await clearDiscrepancy.mutateAsync(discrepancyNote.trim());
      toast.success('Discrepancy cleared');
      setDiscrepancyNote('');
    } catch {
      toast.error('Failed to clear discrepancy');
    }
  }

  async function handleGenerateRemittance() {
    try {
      await generateRemittance.mutateAsync();
      toast.success('Remittance instruction generated');
    } catch {
      toast.error('Failed to generate remittance instruction');
    }
  }

  async function handleUpdateRemittance() {
    if (!remittanceStatus) return;
    try {
      await updateRemittance.mutateAsync(remittanceStatus as RemittanceStatus);
      toast.success('Remittance status updated');
    } catch {
      toast.error('Failed to update status');
    }
  }

  if (txLoading || settlementLoading) {
    return (
      <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS']}>
        <div className="max-w-3xl mx-auto space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </RoleGuard>
    );
  }

  // Compute line items from settlement
  const grossValue = s ? Number(s.grossValueUsd) : null;
  const cifFreight = s ? -Math.abs(Number(s.cifFreightUsd ?? 0)) : null;
  const customsDuties = s ? -Math.abs(Number(s.customsDutiesUsd ?? 0)) : null;
  const logisticsCost = s ? -Math.abs(Number(s.logisticsCostUsd)) : null;
  const refineryCharge = s ? -Math.abs(Number(s.refineryChargeUsd)) : null;
  const agentCommission = s ? -Math.abs(Number(s.agentCommissionUsd)) : null;
  const companyFee = s ? -Math.abs(Number(s.companyFeeUsd)) : null;
  const netPayable = s ? Number(s.netPayableUsd) : null;

  const goldWeightFineKg = s ? Number(s.goldWeightFine) : 0;
  const goldWeightFineOz = goldWeightFineKg * KG_TO_TROY_OZ;
  const lmePrice = s ? Number(s.lmePriceUsd) : 0;

  const isSettled = s?.status === 'SETTLED' || s?.status === 'CONFIRMED';

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS']}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ‹ Back
        </button>

        {/* Transaction header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="font-mono text-xs text-gray-400 mb-1">
                {txnId.slice(-12).toUpperCase()}
              </p>
              <h1 className="text-xl font-bold text-aop-dark">
                {(client?.fullName as string) ?? '—'}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {(txRecord?.countryCode as string) ?? ''} · Phase{' '}
                {(txRecord?.phase as string)?.replace('_', ' ') ?? '—'}
              </p>
            </div>
            <div className="text-right space-y-1">
              {s && <StatusBadge status={s.status} />}
              {s?.remittanceStatus && (
                <p className="text-xs text-gray-500 mt-1">
                  {REMITTANCE_LABELS[s.remittanceStatus] ?? s.remittanceStatus}
                </p>
              )}
            </div>
          </div>

          {/* Key transaction facts */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Fine Gold</p>
              <p className="font-mono text-sm font-semibold text-gray-800">
                {goldWeightFineOz > 0 ? `${goldWeightFineOz.toFixed(4)} toz` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">LME Locked</p>
              <p className="font-mono text-sm font-semibold text-gray-800">
                {lmePrice > 0 ? `${usd(lmePrice)}/toz` : '—'}
              </p>
            </div>
            {s?.currency !== 'USD' && s?.fxRate && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">FX Rate ({s.currency})</p>
                <p className="font-mono text-sm font-semibold text-gray-800">{s.fxRate}</p>
              </div>
            )}
          </div>
        </div>

        {/* Discrepancy warning */}
        {s?.discrepancyFlag && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠</span>
              <div className="flex-1">
                <p className="font-semibold text-red-800">Assay Discrepancy Flagged</p>
                {s.discrepancyDetails && (
                  <p className="text-sm text-red-700 mt-1">{s.discrepancyDetails}</p>
                )}
                {clearingDiscrepancy ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      rows={2}
                      value={discrepancyNote}
                      onChange={(e) => setDiscrepancyNote(e.target.value)}
                      placeholder="Enter clearing note…"
                      className="w-full border border-red-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearDiscrepancy}
                        disabled={clearDiscrepancy.isPending || !discrepancyNote.trim()}
                        className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                      >
                        {clearDiscrepancy.isPending ? 'Clearing…' : 'Clear Discrepancy'}
                      </button>
                      <button
                        onClick={() => setClearingDiscrepancy(false)}
                        className="text-sm text-gray-600 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setClearingDiscrepancy(true)}
                    className="mt-3 text-sm bg-red-100 text-red-700 border border-red-300 px-4 py-2 rounded-lg hover:bg-red-200 font-medium transition-colors"
                  >
                    Clear Discrepancy (OPS Manager)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settlement calculation card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-aop-dark">Settlement Statement</h2>
              {s?.calculatedAt && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Calculated {new Date(s.calculatedAt).toLocaleString('en-GB')}
                </p>
              )}
            </div>
            {!s && (
              <button
                onClick={() => calculate.mutateAsync(undefined)}
                disabled={calculate.isPending}
                className="text-sm bg-aop-navy text-white px-4 py-2 rounded-lg hover:bg-aop-navy/90 disabled:opacity-50 font-medium transition-colors"
              >
                {calculate.isPending ? 'Calculating…' : 'Calculate Settlement'}
              </button>
            )}
          </div>

          {!s ? (
            <div className="px-6 py-12 text-center text-gray-400">
              <p className="text-3xl mb-2">🧮</p>
              <p className="text-sm">No settlement calculated yet</p>
              <p className="text-xs mt-1">Click "Calculate Settlement" to generate figures</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-2">
                <table className="w-full">
                  <tbody>
                    <LineRow
                      label="Gross Proceeds"
                      amount={grossValue}
                      note={
                        goldWeightFineOz > 0 && lmePrice > 0
                          ? `${goldWeightFineOz.toFixed(4)}oz × $${lmePrice.toLocaleString()}`
                          : undefined
                      }
                    />
                    {!!cifFreight && cifFreight !== 0 && (
                      <LineRow label="Less: CIF Freight & Insurance" amount={cifFreight} indent />
                    )}
                    {!!customsDuties && customsDuties !== 0 && (
                      <LineRow
                        label="Less: Customs & Export Duties"
                        amount={customsDuties}
                        indent
                      />
                    )}
                    {!!logisticsCost && logisticsCost !== 0 && (
                      <LineRow label="Less: Logistics & Transport" amount={logisticsCost} indent />
                    )}
                    {!!refineryCharge && refineryCharge !== 0 && (
                      <LineRow label="Less: Refinery Charges" amount={refineryCharge} indent />
                    )}
                    {!!agentCommission && agentCommission !== 0 && (
                      <LineRow label="Less: Agent Commission" amount={agentCommission} indent />
                    )}
                    {!!companyFee && companyFee !== 0 && (
                      <LineRow label="Less: Company Service Fee" amount={companyFee} indent />
                    )}
                  </tbody>
                </table>
              </div>

              {/* Net payable — highlighted */}
              <div className="mx-6 mb-6 mt-2 bg-gold/10 border border-gold/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-aop-dark">NET REMITTANCE TO MINER</p>
                    {s.currency !== 'USD' && s.netPayableLocal && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {s.currency} {Number(s.netPayableLocal).toLocaleString()} (FX: {s.fxRate})
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-2xl font-bold font-mono ${(netPayable ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}
                    >
                      {netPayable !== null ? usd(netPayable) : '—'}
                    </p>
                    <p className="text-xs text-gold font-semibold mt-0.5">✦ Final Amount</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {s && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-aop-dark text-sm">Actions</h3>

            <div className="flex flex-wrap gap-3">
              {/* Download Statement */}
              <button
                onClick={handleDownload}
                disabled={downloadStatement.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-aop-dark text-white rounded-xl text-sm font-medium hover:bg-aop-dark/90 disabled:opacity-50 transition-colors"
              >
                <span>⬇</span>
                {downloadStatement.isPending ? 'Downloading…' : 'Download Statement PDF'}
              </button>

              {/* Approve Settlement */}
              {!isSettled && (
                <button
                  onClick={() => setShowApproveDialog(true)}
                  disabled={!!s.discrepancyFlag || confirm.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <span>✓</span> Approve Settlement
                </button>
              )}

              {/* Generate Remittance */}
              {isSettled && (
                <button
                  onClick={handleGenerateRemittance}
                  disabled={generateRemittance.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 bg-aop-navy text-white rounded-xl text-sm font-medium hover:bg-aop-navy/90 disabled:opacity-50 transition-colors"
                >
                  <span>📋</span>
                  {generateRemittance.isPending ? 'Generating…' : 'Generate Remittance Instruction'}
                </button>
              )}
            </div>

            {/* Update Remittance Status */}
            {isSettled && (
              <div className="pt-4 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Update Remittance Status
                </label>
                <div className="flex gap-2">
                  <select
                    value={remittanceStatus}
                    onChange={(e) => setRemittanceStatus(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold bg-white"
                  >
                    <option value="">Select status…</option>
                    {REMITTANCE_STATUSES.map((st: RemittanceStatus) => (
                      <option key={st} value={st}>
                        {REMITTANCE_LABELS[st] ?? st}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleUpdateRemittance}
                    disabled={!remittanceStatus || updateRemittance.isPending}
                    className="px-4 py-2.5 bg-gold text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-gold/90 transition-colors"
                  >
                    {updateRemittance.isPending ? 'Saving…' : 'Update'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Approve confirmation */}
        <ConfirmDialog
          open={showApproveDialog}
          title="Approve Settlement"
          message={`This will approve the settlement of ${usd(netPayable ?? 0)} for ${(client?.fullName as string) ?? 'this client'}.\n\nThis action is irreversible. Are you sure?`}
          confirmLabel={confirm.isPending ? 'Approving…' : 'Approve Settlement'}
          onConfirm={handleApprove}
          onCancel={() => setShowApproveDialog(false)}
        />
      </div>
    </RoleGuard>
  );
}
