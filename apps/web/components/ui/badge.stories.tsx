import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'danger', 'info', 'gold'],
    },
  },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: 'Default', variant: 'default' },
};

export const Success: Story = {
  args: { children: 'Approved', variant: 'success' },
};

export const Warning: Story = {
  args: { children: 'Pending', variant: 'warning' },
};

export const Danger: Story = {
  args: { children: 'Rejected', variant: 'danger' },
};

export const Info: Story = {
  args: { children: 'In Review', variant: 'info' },
};

export const Gold: Story = {
  args: { children: 'Required', variant: 'gold' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 p-4">
      {(['default', 'success', 'warning', 'danger', 'info', 'gold'] as const).map((v) => (
        <Badge key={v} variant={v}>
          {v}
        </Badge>
      ))}
    </div>
  ),
};
