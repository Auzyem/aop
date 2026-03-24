import type { Meta, StoryObj } from '@storybook/react';
import { PageHeader } from './page-header';

const meta: Meta<typeof PageHeader> = {
  title: 'UI/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const TitleOnly: Story = {
  args: { title: 'Operations Dashboard' },
};

export const WithBreadcrumbs: Story = {
  args: {
    title: 'Transaction Detail',
    breadcrumbs: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Transactions', href: '/transactions' },
      { label: 'aop_c8f2e1a9' },
    ],
  },
};

export const WithActions: Story = {
  args: {
    title: 'Clients',
    breadcrumbs: [{ label: 'Home', href: '/dashboard' }, { label: 'Clients' }],
    actions: (
      <button className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors">
        + New Client
      </button>
    ),
  },
};

export const WithMultipleActions: Story = {
  args: {
    title: 'Regulatory Reports',
    breadcrumbs: [{ label: 'Home', href: '/dashboard' }, { label: 'Reports' }],
    actions: (
      <div className="flex gap-2">
        <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          ↓ Export
        </button>
        <button className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors">
          + Generate
        </button>
      </div>
    ),
  },
};
