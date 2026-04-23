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
  priceUsdPerKg: 107_500,
  recordedAt: new Date().toISOString(),
};

export const Loading: Story = {
  args: { price: null },
};

export const Live: Story = {
  args: { price: basePrice, previousPrice: 106_200 },
};

export const PriceUp: Story = {
  args: {
    price: { ...basePrice, priceUsdPerKg: 107_500 },
    previousPrice: 105_000,
  },
};

export const PriceDown: Story = {
  args: {
    price: { ...basePrice, priceUsdPerKg: 105_000 },
    previousPrice: 107_500,
  },
};

export const Stale: Story = {
  args: {
    price: { ...basePrice, stale: true },
  },
};
