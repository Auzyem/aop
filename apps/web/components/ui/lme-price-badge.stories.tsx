import type { Meta, StoryObj } from '@storybook/react';
import { LMEPriceBadge } from './lme-price-badge';

const meta: Meta<typeof LMEPriceBadge> = {
  title: 'UI/LMEPriceBadge',
  component: LMEPriceBadge,
  tags: ['autodocs'],
  parameters: { backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof LMEPriceBadge>;

const basePrice = {
  priceUsdPerTroyOz: 2345.67,
  recordedAt: new Date().toISOString(),
};

export const Loading: Story = {
  args: { price: null },
};

export const Live: Story = {
  args: { price: basePrice, previousPrice: 2320.0 },
};

export const PriceUp: Story = {
  args: {
    price: { ...basePrice, priceUsdPerTroyOz: 2345.67 },
    previousPrice: 2300.0,
  },
};

export const PriceDown: Story = {
  args: {
    price: { ...basePrice, priceUsdPerTroyOz: 2300.0 },
    previousPrice: 2345.67,
  },
};

export const Stale: Story = {
  args: {
    price: { ...basePrice, stale: true },
  },
};
