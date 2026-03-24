import type { Meta, StoryObj } from '@storybook/react';
import { DataTable } from './data-table';
import { Badge } from './badge';

const meta: Meta<typeof DataTable> = {
  title: 'UI/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DataTable>;

const sampleData = [
  {
    id: 'aop_001',
    client: 'Kamau Mining Co.',
    country: 'KE',
    phase: 'PHASE_2',
    weight: '12.450',
    status: 'ACTIVE',
  },
  {
    id: 'aop_002',
    client: 'Nile Gold Ltd.',
    country: 'UG',
    phase: 'PHASE_4',
    weight: '7.200',
    status: 'ACTIVE',
  },
  {
    id: 'aop_003',
    client: 'Mwanza Exports',
    country: 'TZ',
    phase: 'PHASE_6',
    weight: '22.100',
    status: 'SETTLED',
  },
  {
    id: 'aop_004',
    client: 'Rift Valley Metals',
    country: 'KE',
    phase: 'PHASE_1',
    weight: '5.800',
    status: 'ACTIVE',
  },
  {
    id: 'aop_005',
    client: 'Kinshasa Gold Coop',
    country: 'CD',
    phase: 'PHASE_3',
    weight: '9.750',
    status: 'ACTIVE',
  },
];

const columns = [
  {
    key: 'id',
    header: 'ID',
    sortable: true,
    render: (r: Record<string, unknown>) => (
      <span className="font-mono text-xs">{r.id as string}</span>
    ),
  },
  { key: 'client', header: 'Client', sortable: true },
  { key: 'country', header: 'Country' },
  {
    key: 'phase',
    header: 'Phase',
    render: (r: Record<string, unknown>) => <Badge variant="info">{r.phase as string}</Badge>,
  },
  {
    key: 'weight',
    header: 'Weight (kg)',
    render: (r: Record<string, unknown>) => `${r.weight as string} kg`,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r: Record<string, unknown>) => (
      <Badge variant={r.status === 'SETTLED' ? 'success' : 'warning'}>{r.status as string}</Badge>
    ),
  },
];

export const Default: Story = {
  args: { columns: columns as never, data: sampleData as never },
};

export const Loading: Story = {
  args: { columns: columns as never, data: [], loading: true },
};

export const Empty: Story = {
  args: { columns: columns as never, data: [], emptyMessage: 'No transactions found' },
};

export const WithPagination: Story = {
  args: {
    columns: columns as never,
    data: sampleData as never,
    pagination: { page: 1, limit: 5, total: 42, onPageChange: () => {} },
  },
};

export const Clickable: Story = {
  args: {
    columns: columns as never,
    data: sampleData as never,
    // eslint-disable-next-line no-alert
    onRowClick: (row: Record<string, unknown>) => alert(`Clicked: ${row.id}`),
  },
};
