import type { Meta, StoryObj } from '@storybook/react';
import { KycStatusBadge, SanctionsStatusBadge, PhaseBadge, RagBadge } from './status-badge';

const meta: Meta = {
  title: 'UI/StatusBadge',
  tags: ['autodocs'],
};
export default meta;

export const KycStatuses: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2 p-4">
      {['APPROVED', 'PENDING', 'REJECTED', 'EXPIRED'].map((s) => (
        <KycStatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

export const SanctionStatuses: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2 p-4">
      {['CLEAR', 'HIT', 'POSSIBLE_MATCH', 'PENDING'].map((s) => (
        <SanctionsStatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

export const Phases: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2 p-4">
      {['PHASE_1', 'PHASE_2', 'PHASE_3', 'PHASE_4', 'PHASE_5', 'PHASE_6', 'PHASE_7'].map((p) => (
        <PhaseBadge key={p} phase={p} />
      ))}
    </div>
  ),
};

export const RagStatuses: StoryObj = {
  render: () => (
    <div className="flex items-center gap-4 p-4">
      {['GREEN', 'AMBER', 'RED'].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <RagBadge status={s as 'GREEN' | 'AMBER' | 'RED'} />
          <span className="text-sm">{s}</span>
        </div>
      ))}
    </div>
  ),
};
