'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '../../lib/utils';
import { useClients } from '../../lib/hooks/use-clients';
import { useAgents } from '../../lib/hooks/use-admin';
import { useRefineries, useCreateTransaction } from '../../lib/hooks/use-transactions';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STEPS = ['Client', 'Gold Details', 'Assignment', 'Review'] as const;

type FormData = {
  clientId: string;
  clientName: string;
  goldWeightGross: string;
  estimatedPurity: string;
  agentId: string;
  agentName: string;
  refineryId: string;
  refineryName: string;
};

const EMPTY: FormData = {
  clientId: '',
  clientName: '',
  goldWeightGross: '',
  estimatedPurity: '',
  agentId: '',
  agentName: '',
  refineryId: '',
  refineryName: '',
};

export function CreateTransactionModal({ open, onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [clientSearch, setClientSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');

  const { data: clientsData } = useClients({
    kycStatus: 'APPROVED',
    search: clientSearch,
    limit: 20,
  });
  const { data: agents } = useAgents({ isActive: true });
  const { data: refineries } = useRefineries();
  const createTxn = useCreateTransaction();

  const clients = clientsData?.data?.clients ?? [];
  const agentList = (agents ?? []) as Array<{ id: string; companyName: string }>;
  const refineryList = (refineries ?? []) as Array<{ id: string; name: string }>;

  function set(key: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canAdvance = [
    !!form.clientId,
    !!form.goldWeightGross && !!form.estimatedPurity,
    !!form.agentId && !!form.refineryId,
    true,
  ][step];

  async function handleSubmit() {
    const result = await createTxn.mutateAsync({
      clientId: form.clientId,
      goldWeightGross: parseFloat(form.goldWeightGross),
      estimatedPurity: parseFloat(form.estimatedPurity) / 100,
      agentId: form.agentId,
      refineryId: form.refineryId,
    });
    onClose();
    setForm(EMPTY);
    setStep(0);
    if (result?.id) router.push(`/transactions/${result.id}`);
  }

  function handleClose() {
    onClose();
    setForm(EMPTY);
    setStep(0);
    setClientSearch('');
    setAgentSearch('');
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-aop-dark text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Transaction</h2>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-0">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
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
                      'text-xs mt-1 font-medium',
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1: Client */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Select an approved client for this transaction.
              </p>
              <input
                type="text"
                placeholder="Search clients by name..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {clients.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-4">
                    {clientSearch ? 'No approved clients found' : 'Type to search approved clients'}
                  </p>
                )}
                {(clients as unknown as Record<string, unknown>[]).map((c) => (
                  <button
                    key={c.id as string}
                    onClick={() => {
                      set('clientId', c.id as string);
                      set('clientName', c.fullName as string);
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-colors',
                      form.clientId === c.id
                        ? 'border-gold bg-gold-light'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                    )}
                  >
                    <div className="font-medium text-sm text-gray-800">{c.fullName as string}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {c.countryCode as string} · {c.entityType as string} · KYC:{' '}
                      {c.kycStatus as string}
                    </div>
                  </button>
                ))}
              </div>
              {form.clientId && (
                <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  Selected: <strong>{form.clientName}</strong>
                </p>
              )}
            </div>
          )}

          {/* Step 2: Gold Details */}
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                Enter the estimated gold details. These can be updated after assay.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Gross Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="e.g. 5.000"
                  value={form.goldWeightGross}
                  onChange={(e) => set('goldWeightGross', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Purity (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="e.g. 92.50"
                  value={form.estimatedPurity}
                  onChange={(e) => set('estimatedPurity', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Fine gold estimate:{' '}
                  {form.goldWeightGross && form.estimatedPurity
                    ? `${((parseFloat(form.goldWeightGross) * parseFloat(form.estimatedPurity)) / 100).toFixed(3)} kg`
                    : '—'}
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Assignment */}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                Assign an agent and select the processing refinery.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
                <input
                  type="text"
                  placeholder="Filter agents..."
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-gold"
                />
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {agentList
                    .filter(
                      (a) =>
                        !agentSearch ||
                        a.companyName.toLowerCase().includes(agentSearch.toLowerCase()),
                    )
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          set('agentId', a.id);
                          set('agentName', a.companyName);
                        }}
                        className={cn(
                          'w-full text-left p-2.5 rounded-lg border text-sm transition-colors',
                          form.agentId === a.id
                            ? 'border-gold bg-gold-light'
                            : 'border-gray-200 hover:border-gray-300',
                        )}
                      >
                        {a.companyName}
                      </button>
                    ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refinery</label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {refineryList.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        set('refineryId', r.id);
                        set('refineryName', r.name);
                      }}
                      className={cn(
                        'w-full text-left p-2.5 rounded-lg border text-sm transition-colors',
                        form.refineryId === r.id
                          ? 'border-gold bg-gold-light'
                          : 'border-gray-200 hover:border-gray-300',
                      )}
                    >
                      {r.name}
                    </button>
                  ))}
                  {refineryList.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-2">
                      No refineries available
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Review the details before submitting.</p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
                {(
                  [
                    ['Client', form.clientName],
                    ['Gross Weight', form.goldWeightGross ? `${form.goldWeightGross} kg` : '—'],
                    ['Est. Purity', form.estimatedPurity ? `${form.estimatedPurity}%` : '—'],
                    [
                      'Est. Fine Gold',
                      form.goldWeightGross && form.estimatedPurity
                        ? `${((parseFloat(form.goldWeightGross) * parseFloat(form.estimatedPurity)) / 100).toFixed(3)} kg`
                        : '—',
                    ],
                    ['Agent', form.agentName],
                    ['Refinery', form.refineryName],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                A transaction ID will be assigned automatically. The transaction will enter Phase 1
                (KYC review).
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => (step > 0 ? setStep(step - 1) : handleClose())}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            {step === 0 ? 'Cancel' : '← Back'}
          </button>
          <button
            disabled={!canAdvance || createTxn.isPending}
            onClick={() => (step < 3 ? setStep(step + 1) : handleSubmit())}
            className={cn(
              'px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors',
              canAdvance && !createTxn.isPending
                ? 'bg-gold hover:bg-gold-dark'
                : 'bg-gray-300 cursor-not-allowed',
            )}
          >
            {createTxn.isPending ? 'Creating...' : step < 3 ? 'Next →' : 'Create Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
