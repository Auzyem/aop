'use client';
import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTransaction } from '../../../../../lib/hooks/use-transactions';
import { useLMECurrentPrice } from '../../../../../lib/hooks/use-lme';
import { useLockPrice, useGenerateValuationPdf } from '../../../../../lib/hooks/use-lme';
import { RoleGuard } from '../../../../../components/auth/role-guard';
import { ConfirmDialog } from '../../../../../components/ui/confirm-dialog';
import type { PriceLockPayload } from '../../../../../lib/api/lme';
import { toast } from 'sonner';

const KG_TO_TROY_OZ = 32.1507;

const PRICE_TYPES = ['SPOT', 'AM_FIX', 'PM_FIX', 'FORWARD'] as const;
type PriceType = (typeof PRICE_TYPES)[number];

const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  SPOT: 'Spot Price (live market)',
  AM_FIX: 'AM Fix (London morning fix)',
  PM_FIX: 'PM Fix (London afternoon fix)',
  FORWARD: 'Forward Contract',
};

function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n);
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between py-2.5 ${highlight ? 'font-semibold text-aop-navy' : 'text-gray-700'}`}
    >
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

export default function PriceLockPage({ params }: { params: Promise<{ txnId: string }> }) {
  const { txnId } = use(params);
  const router = useRouter();

  const { data: tx, isLoading: txLoading } = useTransaction(txnId);
  const { data: currentPrice, isLoading: priceLoading } = useLMECurrentPrice();
  const lockPrice = useLockPrice(txnId);
  const generatePdf = useGenerateValuationPdf();

  const [priceType, setPriceType] = useState<PriceType>('SPOT');
  const [customPrice, setCustomPrice] = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'success'>('form');
  const [lockedResult, setLockedResult] = useState<{
    lockedPrice: number;
    priceType: string;
    lockedAt: string;
  } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Auto-fill custom price when SPOT is selected
  useEffect(() => {
    if (priceType === 'SPOT' && currentPrice) {
      setCustomPrice(currentPrice.priceUsdPerKg.toFixed(2));
    }
  }, [priceType, currentPrice]);

  const spotPrice = currentPrice?.priceUsdPerKg ?? 0;
  const effectivePrice =
    priceType === 'SPOT' ? parseFloat(customPrice) || spotPrice : parseFloat(customPrice) || 0;

  const goldWeightFineKg = tx ? Number((tx as Record<string, unknown>).goldWeightFine ?? 0) : 0;
  const goldWeightFineOz = goldWeightFineKg * KG_TO_TROY_OZ;
  const grossValue = goldWeightFineKg * effectivePrice;

  const isPriceAdjusted =
    priceType === 'SPOT' && parseFloat(customPrice) !== spotPrice && parseFloat(customPrice) > 0;

  async function handleSubmit() {
    if (!effectivePrice) {
      toast.error('Please enter a price');
      return;
    }
    if (isPriceAdjusted && !reason.trim()) {
      toast.error('A reason is required when adjusting from spot');
      return;
    }
    setShowConfirm(false);
    try {
      const payload: PriceLockPayload = {
        priceType,
        lockedPrice: effectivePrice,
        ...(reason.trim() && { reason: reason.trim() }),
      };
      const result = await lockPrice.mutateAsync(payload);
      setLockedResult(result);
      setStep('success');
      toast.success('Price locked successfully');
    } catch {
      toast.error('Failed to lock price — please try again');
    }
  }

  async function handleDownloadPdf() {
    try {
      const blob = await generatePdf.mutateAsync(txnId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `valuation-disclosure-${txnId.slice(-8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download PDF');
    }
  }

  if (txLoading || priceLoading) {
    return (
      <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER']}>
        <div className="max-w-2xl mx-auto space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </RoleGuard>
    );
  }

  const txRecord = tx as Record<string, unknown> | null;
  const client = txRecord?.client as Record<string, unknown> | null;

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER']}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ‹ Back to Trade Desk
        </button>

        <div>
          <h1 className="text-2xl font-bold text-aop-dark">Price Lock</h1>
          <p className="text-sm text-gray-500 mt-0.5 font-mono">{txnId.slice(-8).toUpperCase()}</p>
        </div>

        {step === 'success' ? (
          /* ── SUCCESS STATE ── */
          <div className="space-y-5">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">🔒</div>
              <h2 className="text-lg font-bold text-green-800 mb-1">Price Locked</h2>
              <p className="text-sm text-green-700">
                {lockedResult?.priceType} ·{' '}
                <span className="font-mono font-semibold">
                  {usd(lockedResult?.lockedPrice ?? 0)}/toz
                </span>
              </p>
              <p className="text-xs text-green-600 mt-1">
                {lockedResult?.lockedAt
                  ? new Date(lockedResult.lockedAt).toLocaleString('en-GB')
                  : ''}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2">
              <Row label="Client" value={(client?.fullName as string) ?? '—'} />
              <div className="border-t border-gray-100" />
              <Row label="Fine Gold Weight" value={`${goldWeightFineOz.toFixed(4)} toz`} />
              <Row label="Locked Price" value={`${usd(lockedResult?.lockedPrice ?? 0)}/toz`} />
              <div className="border-t border-gray-200 mt-1 pt-1" />
              <Row
                label="Gross Proceeds"
                value={usd(goldWeightFineOz * (lockedResult?.lockedPrice ?? 0))}
                highlight
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDownloadPdf}
                disabled={generatePdf.isPending}
                className="flex-1 bg-aop-navy text-white font-medium py-3 rounded-xl hover:bg-aop-navy/90 disabled:opacity-50 transition-colors"
              >
                {generatePdf.isPending ? 'Generating…' : '⬇ Download Valuation Disclosure PDF'}
              </button>
              <button
                onClick={() => router.push('/trade-desk/dashboard')}
                className="px-5 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── FORM STATE ── */
          <div className="space-y-5">
            {/* Transaction detail card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Transaction
              </h3>
              <div className="space-y-2 divide-y divide-gray-50">
                <Row label="Client" value={(client?.fullName as string) ?? '—'} />
                <Row label="Phase" value={(txRecord?.phase as string)?.replace('_', ' ') ?? '—'} />
                <Row
                  label="Gold Weight (Fine)"
                  value={goldWeightFineKg > 0 ? `${goldWeightFineKg.toFixed(4)} kg` : '—'}
                />
                <Row
                  label="Fine oz"
                  value={goldWeightFineOz > 0 ? `${goldWeightFineOz.toFixed(4)} toz` : '—'}
                />
              </div>
            </div>

            {/* Live spot */}
            <div className="bg-aop-navy text-white rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-300 mb-1">Current LME Spot</p>
                <p className="text-2xl font-bold font-mono text-gold">
                  {spotPrice ? usd(spotPrice) : '—'}
                  <span className="text-sm text-gray-300 ml-1">/toz</span>
                </p>
              </div>
              {grossValue > 0 && (
                <div className="text-right">
                  <p className="text-xs text-gray-300 mb-1">Gross at Spot</p>
                  <p className="text-lg font-bold font-mono text-white">{usd(grossValue)}</p>
                </div>
              )}
            </div>

            {/* Lock form */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h3 className="font-semibold text-aop-dark text-sm">Lock Price</h3>

              {/* Price type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Price Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRICE_TYPES.map((pt) => (
                    <button
                      key={pt}
                      onClick={() => {
                        setPriceType(pt);
                        if (pt !== 'SPOT') setCustomPrice('');
                      }}
                      className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                        priceType === pt
                          ? 'border-gold bg-amber-50 text-aop-dark font-medium'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{pt.replace('_', ' ')}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {PRICE_TYPE_LABELS[pt].split(' (')[1]?.replace(')', '') ?? ''}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Price input */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Price (USD/toz)
                  {priceType === 'SPOT' && (
                    <span className="text-gray-400 ml-1">— pre-filled from live spot</span>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder={spotPrice.toFixed(2)}
                    className="w-full pl-7 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold font-mono"
                  />
                </div>
                {isPriceAdjusted && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Adjusted{' '}
                    {(((parseFloat(customPrice) - spotPrice) / spotPrice) * 100).toFixed(3)}% from
                    spot — reason required
                  </p>
                )}
              </div>

              {/* Reason (required when adjusting) */}
              {(priceType !== 'SPOT' || isPriceAdjusted) && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Reason {isPriceAdjusted && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Provide reason for price selection…"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none"
                  />
                </div>
              )}

              {/* Gross value preview */}
              {effectivePrice > 0 && goldWeightFineOz > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Fine weight</span>
                    <span className="font-mono">{goldWeightFineOz.toFixed(4)} toz</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Lock price</span>
                    <span className="font-mono">{usd(effectivePrice)}/toz</span>
                  </div>
                  <div className="border-t border-amber-200 pt-2 mt-2 flex justify-between">
                    <span className="font-semibold text-aop-dark">Gross Proceeds</span>
                    <span className="font-mono font-bold text-aop-navy text-lg">
                      {usd(grossValue)}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowConfirm(true)}
                disabled={
                  !effectivePrice || (isPriceAdjusted && !reason.trim()) || lockPrice.isPending
                }
                className="w-full bg-gold text-white font-semibold py-3 rounded-xl hover:bg-gold/90 disabled:opacity-50 transition-colors"
              >
                Review & Confirm Lock
              </button>
            </div>
          </div>
        )}

        {/* Confirmation dialog */}
        <ConfirmDialog
          open={showConfirm}
          title="Confirm Price Lock"
          message={`You are locking ${goldWeightFineOz.toFixed(4)} troy oz at ${usd(effectivePrice)}/oz.\n\nGross proceeds: ${usd(grossValue)}.\n\nThis cannot be changed without CEO approval.`}
          confirmLabel={lockPrice.isPending ? 'Locking…' : 'Lock Price'}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      </div>
    </RoleGuard>
  );
}
