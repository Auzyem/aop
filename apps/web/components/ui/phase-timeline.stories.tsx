import type { Meta, StoryObj } from '@storybook/react';
import { PhaseTimeline } from './phase-timeline';

const meta: Meta<typeof PhaseTimeline> = {
  title: 'UI/PhaseTimeline',
  component: PhaseTimeline,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof PhaseTimeline>;

export const Phase1: Story = { args: { currentPhase: 'PHASE_1' } };
export const Phase2: Story = { args: { currentPhase: 'PHASE_2' } };
export const Phase4: Story = { args: { currentPhase: 'PHASE_4' } };
export const Phase6: Story = { args: { currentPhase: 'PHASE_6' } };
export const Phase7: Story = { args: { currentPhase: 'PHASE_7' } };

export const AllPhases: StoryObj = {
  render: () => (
    <div className="space-y-6 p-4">
      {['PHASE_1', 'PHASE_2', 'PHASE_3', 'PHASE_4', 'PHASE_5', 'PHASE_6', 'PHASE_7'].map((p) => (
        <div key={p}>
          <p className="text-xs text-gray-500 mb-2">{p}</p>
          <PhaseTimeline currentPhase={p} />
        </div>
      ))}
    </div>
  ),
};
