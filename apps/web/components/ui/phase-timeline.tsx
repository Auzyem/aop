'use client';
import { cn } from '../../lib/utils';

const PHASES = [
  { key: 'PHASE_1', label: 'KYC' },
  { key: 'PHASE_2', label: 'Price Lock' },
  { key: 'PHASE_3', label: 'Logistics' },
  { key: 'PHASE_4', label: 'Refinery' },
  { key: 'PHASE_5', label: 'Disbursement' },
  { key: 'PHASE_6', label: 'Settlement' },
  { key: 'PHASE_7', label: 'Regulatory' },
];

export function PhaseTimeline({ currentPhase }: { currentPhase: string }) {
  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase);

  return (
    <div className="flex items-center w-full my-4">
      {PHASES.map((phase, idx) => (
        <div key={phase.key} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                idx < currentIdx && 'bg-gold border-gold text-white',
                idx === currentIdx && 'bg-aop-navy border-aop-navy text-white',
                idx > currentIdx && 'bg-white border-gray-300 text-gray-400',
              )}
            >
              {idx + 1}
            </div>
            <span
              className={cn(
                'text-xs mt-1 text-center w-16 leading-tight',
                idx === currentIdx && 'text-aop-navy font-semibold',
                idx < currentIdx && 'text-gold',
                idx > currentIdx && 'text-gray-400',
              )}
            >
              {phase.label}
            </span>
          </div>
          {idx < PHASES.length - 1 && (
            <div
              className={cn('flex-1 h-0.5 mx-1', idx < currentIdx ? 'bg-gold' : 'bg-gray-200')}
            />
          )}
        </div>
      ))}
    </div>
  );
}
