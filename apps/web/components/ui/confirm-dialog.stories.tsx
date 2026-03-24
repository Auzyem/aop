import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ConfirmDialog } from './confirm-dialog';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

function Trigger({
  label = 'Open Dialog',
  danger = false,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed? This action cannot be undone.',
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium"
      >
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        danger={danger}
        onConfirm={() => {
          setOpen(false);
          alert('Confirmed!');
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Trigger />,
};

export const Dangerous: Story = {
  render: () => (
    <Trigger
      label="Delete User"
      danger
      title="Delete User Account"
      message="This will permanently delete the user and all associated data. This action cannot be undone."
    />
  ),
};

export const ShortMessage: Story = {
  render: () => (
    <Trigger
      label="Submit Report"
      title="Submit to Regulator"
      message="Submit this report to the regulatory authority?"
    />
  ),
};

export const AlwaysOpen: Story = {
  args: {
    open: true,
    title: 'Confirm Deactivation',
    message:
      'Are you sure you want to deactivate this agent? They will lose access to all transactions.',
    confirmLabel: 'Deactivate',
    cancelLabel: 'Keep Active',
    danger: true,
    onConfirm: () => {},
    onCancel: () => {},
  },
};
