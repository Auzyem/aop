import type { Meta, StoryObj } from '@storybook/react';
import { CurrencyAmount } from './currency-amount';

const meta: Meta<typeof CurrencyAmount> = {
  title: 'UI/CurrencyAmount',
  component: CurrencyAmount,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof CurrencyAmount>;

export const USD: Story = {
  args: { amountUsd: 125_000, defaultCurrency: 'USD' },
};

export const KES: Story = {
  args: { amountUsd: 125_000, defaultCurrency: 'KES' },
};

export const UGX: Story = {
  args: { amountUsd: 50_000, defaultCurrency: 'UGX' },
};

export const TZS: Story = {
  args: { amountUsd: 75_000, defaultCurrency: 'TZS' },
};

export const LargeAmount: Story = {
  args: { amountUsd: 4_750_000, defaultCurrency: 'USD' },
};

export const SmallAmount: Story = {
  args: { amountUsd: 123.45, defaultCurrency: 'USD' },
};

export const MultipleAmounts: StoryObj = {
  render: () => (
    <div className="space-y-2 p-4 font-mono text-sm">
      {[10_000, 125_000, 1_500_000, 8_250_000].map((amt) => (
        <div key={amt} className="flex items-center gap-2">
          <span className="text-gray-400 w-12">USD</span>
          <CurrencyAmount amountUsd={amt} />
          <span className="text-gray-300 text-xs">(click to toggle)</span>
        </div>
      ))}
    </div>
  ),
};
