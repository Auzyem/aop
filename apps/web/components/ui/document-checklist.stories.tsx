import type { Meta, StoryObj } from '@storybook/react';
import { DocumentChecklist } from './document-checklist';

const meta: Meta<typeof DocumentChecklist> = {
  title: 'UI/DocumentChecklist',
  component: DocumentChecklist,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DocumentChecklist>;

const items = [
  { documentType: 'KYC_ID_FRONT', required: true, uploaded: true, approved: true, rejected: false },
  { documentType: 'KYC_ID_BACK', required: true, uploaded: true, approved: false, rejected: false },
  {
    documentType: 'PROOF_OF_ADDRESS',
    required: true,
    uploaded: false,
    approved: false,
    rejected: false,
  },
  {
    documentType: 'MINING_LICENCE',
    required: true,
    uploaded: true,
    approved: false,
    rejected: true,
  },
  {
    documentType: 'ASSAY_CERTIFICATE',
    required: false,
    uploaded: false,
    approved: false,
    rejected: false,
  },
];

export const Mixed: Story = { args: { items } };

export const AllApproved: Story = {
  args: {
    items: items.map((i) => ({ ...i, uploaded: true, approved: true, rejected: false })),
  },
};

export const AllMissing: Story = {
  args: {
    items: items.map((i) => ({ ...i, uploaded: false, approved: false, rejected: false })),
  },
};

export const WithRejections: Story = {
  args: {
    items: items.map((i, idx) => ({
      ...i,
      uploaded: true,
      approved: false,
      rejected: idx % 2 === 0,
    })),
  },
};
