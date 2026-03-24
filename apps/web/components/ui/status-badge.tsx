'use client';
import { Badge } from './badge';

export function KycStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    APPROVED: 'success',
    PENDING: 'warning',
    REJECTED: 'danger',
    EXPIRED: 'danger',
  };
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>;
}

export function SanctionsStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    CLEAR: 'success',
    HIT: 'danger',
    POSSIBLE_MATCH: 'warning',
    PENDING: 'default',
  };
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>;
}

export function PhaseBadge({ phase }: { phase: string }) {
  return <Badge variant="info">{phase.replace('_', ' ')}</Badge>;
}

export function RagBadge({ status }: { status: 'GREEN' | 'AMBER' | 'RED' | string }) {
  const colors: Record<string, string> = {
    GREEN: 'bg-green-500',
    AMBER: 'bg-amber-500',
    RED: 'bg-red-500',
  };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] ?? 'bg-gray-400'}`}
      title={status}
    />
  );
}
