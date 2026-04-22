'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '../../lib/utils';
import { useCreateClient } from '../../lib/hooks/use-clients';
import {
  uploadKycDocument,
  runSanctionsScreen,
  manualSanctionsRecord,
} from '../../lib/api/clients';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STEPS = ['Details', 'Documents', 'Review & Submit'] as const;

const ENTITY_TYPES = ['INDIVIDUAL', 'COMPANY', 'PARTNERSHIP', 'COOPERATIVE'];
const KYC_DOC_TYPES = [
  { type: 'NATIONAL_ID', label: 'National ID / Passport', required: true },
  { type: 'MINING_LICENCE', label: 'Mining Licence', required: true },
  { type: 'BUSINESS_REGISTRATION', label: 'Business Registration', required: false },
  { type: 'BENEFICIAL_OWNERSHIP', label: 'Beneficial Ownership Declaration', required: false },
] as const;

type DocType = (typeof KYC_DOC_TYPES)[number]['type'];

interface FormDetails {
  fullName: string;
  entityType: string;
  nationality: string;
  countryCode: string;
  nationalId: string;
  miningLicenceNo: string;
  businessRegNo: string;
}

const EMPTY_DETAILS: FormDetails = {
  fullName: '',
  entityType: 'INDIVIDUAL',
  nationality: '',
  countryCode: '',
  nationalId: '',
  miningLicenceNo: '',
  businessRegNo: '',
};

export function NewClientWizard({ open, onClose }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _router = useRouter();
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<FormDetails>(EMPTY_DETAILS);
  const [files, setFiles] = useState<Partial<Record<DocType, File>>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_uploadedIds, setUploadedIds] = useState<Partial<Record<DocType, string>>>({});
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [screening, setScreening] = useState<{ outcome: string; hitCount?: number } | null>(null);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [sanctionMode, setSanctionMode] = useState<'auto' | 'skip' | 'manual'>('auto');
  const [manualOutcome, setManualOutcome] = useState<'CLEAR' | 'HIT' | 'POSSIBLE_MATCH'>('CLEAR');

  const createClient = useCreateClient();

  const uploadedCount = Object.keys(files).length;
  const totalDocs = KYC_DOC_TYPES.length;
  const requiredDocs = KYC_DOC_TYPES.filter((d) => d.required);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _allRequiredUploaded = requiredDocs.every((d) => files[d.type]);

  const detailsValid =
    !!details.fullName && !!details.entityType && !!details.countryCode && !!details.nationalId;

  function setDetail(key: keyof FormDetails, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
  }

  async function handleFileUpload(docType: DocType, file: File) {
    setUploading(docType);
    setFiles((f) => ({ ...f, [docType]: file }));
    // We'll upload after client creation; store file reference for now
    setUploading(null);
  }

  async function handleSubmit() {
    setScreeningLoading(true);
    try {
      const client = await createClient.mutateAsync(details);

      // Upload all queued KYC documents
      for (const [docType, file] of Object.entries(files)) {
        if (file) {
          const doc = await uploadKycDocument(client.id, docType, file as File);
          setUploadedIds((ids) => ({ ...ids, [docType]: doc.id }));
        }
      }

      if (sanctionMode === 'skip') {
        setScreening({ outcome: 'PENDING' });
        return;
      }

      if (sanctionMode === 'manual') {
        const res = await manualSanctionsRecord(client.id, manualOutcome);
        setScreening({ outcome: res.outcome });
        return;
      }

      // auto: call actual screening API
      const res = await runSanctionsScreen(client.id);
      setScreening({ outcome: res.outcome, hitCount: res.hitCount });
    } finally {
      setScreeningLoading(false);
    }
  }

  function handleClose() {
    setStep(0);
    setDetails(EMPTY_DETAILS);
    setFiles({});
    setUploadedIds({});
    setScreening(null);
    setSanctionMode('auto');
    setManualOutcome('CLEAR');
    onClose();
  }

  if (!open) return null;

  const outcomeConfig: Record<string, { color: string; icon: string; label: string; bg: string }> =
    {
      CLEAR: {
        color: 'text-green-700',
        icon: '✅',
        label: 'Clear — No sanctions hits',
        bg: 'bg-green-50 border-green-200',
      },
      HIT: {
        color: 'text-red-700',
        icon: '🚨',
        label: 'Hit — Sanctions match found',
        bg: 'bg-red-50 border-red-200',
      },
      POSSIBLE_MATCH: {
        color: 'text-amber-700',
        icon: '⚠️',
        label: 'Possible Match — Manual review required',
        bg: 'bg-amber-50 border-amber-200',
      },
      PENDING: {
        color: 'text-gray-700',
        icon: '🕐',
        label: 'Pending',
        bg: 'bg-gray-50 border-gray-200',
      },
    };
  const outcomeInfo = outcomeConfig[screening?.outcome ?? ''] ?? outcomeConfig.PENDING;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={screening ? handleClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-aop-dark text-white px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold">New Client Onboarding</h2>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Step indicator */}
        {!screening && (
          <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                        i < step
                          ? 'bg-gold border-gold text-white'
                          : i === step
                            ? 'bg-aop-navy border-aop-navy text-white'
                            : 'bg-white border-gray-300 text-gray-400',
                      )}
                    >
                      {i < step ? '✓' : i + 1}
                    </div>
                    <span
                      className={cn(
                        'text-xs mt-1 font-medium hidden sm:block',
                        i === step ? 'text-aop-navy' : i < step ? 'text-gold' : 'text-gray-400',
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn('flex-1 h-0.5 mx-2 mb-4', i < step ? 'bg-gold' : 'bg-gray-200')}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Step 1: Details ── */}
          {step === 0 && !screening && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Enter the client's personal or entity details.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Full Legal Name *
                  </label>
                  <input
                    value={details.fullName}
                    onChange={(e) => setDetail('fullName', e.target.value)}
                    placeholder="e.g. Kwame Asante Mining Ltd"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Entity Type *
                  </label>
                  <select
                    value={details.entityType}
                    onChange={(e) => setDetail('entityType', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Nationality
                  </label>
                  <input
                    value={details.nationality}
                    onChange={(e) => setDetail('nationality', e.target.value)}
                    placeholder="e.g. Ghanaian"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Country of Operation *
                  </label>
                  <input
                    value={details.countryCode}
                    onChange={(e) => setDetail('countryCode', e.target.value.toUpperCase())}
                    placeholder="ISO code e.g. GH"
                    maxLength={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    National ID / Passport No. *
                  </label>
                  <input
                    value={details.nationalId}
                    onChange={(e) => setDetail('nationalId', e.target.value)}
                    placeholder="e.g. GHA-123456789"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Mining Licence Number
                  </label>
                  <input
                    value={details.miningLicenceNo}
                    onChange={(e) => setDetail('miningLicenceNo', e.target.value)}
                    placeholder="e.g. ML-2024-001"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                {details.entityType !== 'INDIVIDUAL' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Business Registration Number
                    </label>
                    <input
                      value={details.businessRegNo}
                      onChange={(e) => setDetail('businessRegNo', e.target.value)}
                      placeholder="e.g. BRN-2024-GH-5678"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Documents ── */}
          {step === 1 && !screening && (
            <div className="space-y-4">
              {/* Progress */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Upload KYC documents.</p>
                <span className="text-sm font-medium text-aop-navy">
                  {uploadedCount} of {totalDocs} uploaded
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gold h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadedCount / totalDocs) * 100}%` }}
                />
              </div>

              <div className="space-y-3">
                {KYC_DOC_TYPES.map((doc) => {
                  const uploaded = files[doc.type];
                  const isUploading = uploading === doc.type;
                  return (
                    <div
                      key={doc.type}
                      className={cn(
                        'rounded-xl border p-4 transition-colors',
                        uploaded ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200',
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span>{uploaded ? '✅' : doc.required ? '⭕' : '○'}</span>
                          <span className="text-sm font-medium text-gray-800">{doc.label}</span>
                          {doc.required && (
                            <span className="text-xs bg-gold-light text-gold-dark px-1.5 py-0.5 rounded-full font-medium">
                              Required
                            </span>
                          )}
                        </div>
                        {uploaded && (
                          <span className="text-xs text-green-700 font-medium">
                            {uploaded.name}
                          </span>
                        )}
                      </div>
                      {!uploaded ? (
                        <label
                          className={cn(
                            'flex items-center gap-2 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3',
                            'cursor-pointer hover:border-gold hover:bg-gold-light/30 transition-colors',
                            isUploading && 'pointer-events-none opacity-60',
                          )}
                        >
                          <span className="text-lg">📎</span>
                          <span className="text-sm text-gray-500">
                            {isUploading ? 'Uploading…' : 'Click or drag to upload (PDF, JPG, PNG)'}
                          </span>
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileUpload(doc.type, f);
                            }}
                          />
                        </label>
                      ) : (
                        <div className="flex items-center justify-between text-xs text-green-700">
                          <span>
                            📄 {uploaded.name} ({(uploaded.size / 1024).toFixed(1)} KB)
                          </span>
                          <button
                            onClick={() =>
                              setFiles((f) => {
                                const n = { ...f };
                                delete n[doc.type];
                                return n;
                              })
                            }
                            className="text-red-500 hover:text-red-700 transition-colors ml-4"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 3: Review & Submit ── */}
          {step === 2 && !screening && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Review before submitting. Sanctions screening will run automatically.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <h4 className="font-semibold text-aop-dark mb-3">Entity Details</h4>
                {(
                  [
                    ['Full Name', details.fullName],
                    ['Entity Type', details.entityType],
                    ['Nationality', details.nationality || '—'],
                    ['Country', details.countryCode],
                    ['National ID', details.nationalId],
                    ['Mining Licence', details.miningLicenceNo || '—'],
                    ['Business Reg.', details.businessRegNo || '—'],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <h4 className="font-semibold text-aop-dark mb-3">Documents</h4>
                {KYC_DOC_TYPES.map((doc) => (
                  <div key={doc.type} className="flex items-center justify-between">
                    <span className="text-gray-500">{doc.label}</span>
                    <span
                      className={cn(
                        'font-medium',
                        files[doc.type] ? 'text-green-700' : 'text-red-500',
                      )}
                    >
                      {files[doc.type] ? `✓ ${files[doc.type]!.name}` : '✗ Not uploaded'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700">Sanctions check:</p>
                {(
                  [
                    {
                      value: 'auto',
                      label: '🔄 Run automatic screen',
                      desc: 'Check against global watchlists via Dilisense',
                    },
                    {
                      value: 'manual',
                      label: '✅ Recorded manually',
                      desc: 'I checked on the provider site — select outcome below',
                    },
                    {
                      value: 'skip',
                      label: '⏭ Skip for now',
                      desc: 'Onboard client; screen can be run later from the client profile',
                    },
                  ] as { value: 'auto' | 'manual' | 'skip'; label: string; desc: string }[]
                ).map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                      sanctionMode === value
                        ? 'border-gold bg-gold-light/20'
                        : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="sanctionMode"
                      value={value}
                      checked={sanctionMode === value}
                      onChange={() => setSanctionMode(value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </label>
                ))}
                {sanctionMode === 'manual' && (
                  <div className="ml-6 flex gap-3 flex-wrap">
                    {(
                      [
                        { value: 'CLEAR', label: '✅ Clear' },
                        { value: 'POSSIBLE_MATCH', label: '⚠️ Possible Match' },
                        { value: 'HIT', label: '🚨 Hit' },
                      ] as { value: 'CLEAR' | 'POSSIBLE_MATCH' | 'HIT'; label: string }[]
                    ).map(({ value, label }) => (
                      <label
                        key={value}
                        className={cn(
                          'flex items-center gap-1.5 text-xs rounded-lg border px-3 py-1.5 cursor-pointer',
                          manualOutcome === value
                            ? 'border-gold bg-gold-light/20 font-semibold'
                            : 'border-gray-200',
                        )}
                      >
                        <input
                          type="radio"
                          name="manualOutcome"
                          value={value}
                          checked={manualOutcome === value}
                          onChange={() => setManualOutcome(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Screening Result ── */}
          {screening && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              {screeningLoading ? (
                <>
                  <div className="w-14 h-14 border-4 border-gold border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-600 font-medium">Running sanctions screening…</p>
                  <p className="text-xs text-gray-400">Checking against global watchlists</p>
                </>
              ) : (
                <>
                  <span className="text-5xl">{outcomeInfo.icon}</span>
                  <div className={cn('w-full rounded-xl border p-5', outcomeInfo.bg)}>
                    <p className={cn('font-semibold text-lg', outcomeInfo.color)}>
                      {outcomeInfo.label}
                    </p>
                    {screening.hitCount !== undefined && screening.hitCount > 0 && (
                      <p className="text-sm text-red-600 mt-1">
                        {screening.hitCount} potential match(es) found
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    Client profile created.
                    {screening.outcome === 'CLEAR'
                      ? ' You can now proceed with KYC review.'
                      : screening.outcome === 'HIT'
                        ? ' This client is blocked pending compliance review.'
                        : ' A compliance officer will need to manually review the matches.'}
                  </p>
                  <button
                    onClick={handleClose}
                    className="bg-gold text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
                  >
                    View Client Profile
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!screening && !screeningLoading && (
          <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
            <button
              onClick={() => (step > 0 ? setStep(step - 1) : handleClose())}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              {step === 0 ? 'Cancel' : '← Back'}
            </button>
            <button
              disabled={
                (step === 0 && !detailsValid) ||
                (step === 2 && (createClient.isPending || screeningLoading))
              }
              onClick={() => {
                if (step < 2) setStep(step + 1);
                else handleSubmit();
              }}
              className={cn(
                'px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors',
                (step === 0 && !detailsValid) ||
                  (step === 2 && (createClient.isPending || screeningLoading))
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-gold hover:bg-gold-dark',
              )}
            >
              {step === 2
                ? createClient.isPending || screeningLoading
                  ? 'Submitting…'
                  : 'Submit & Screen'
                : 'Next →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
