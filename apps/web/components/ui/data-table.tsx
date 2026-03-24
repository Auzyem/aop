'use client';
import React, { useState } from 'react';
import { cn } from '../../lib/utils';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  pagination?: { page: number; limit: number; total: number; onPageChange: (page: number) => void };
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading,
  onRowClick,
  emptyMessage = 'No records found',
  pagination,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-aop-dark text-white">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left font-semibold',
                  col.sortable && 'cursor-pointer hover:bg-aop-navy/80 select-none',
                )}
                onClick={() => {
                  if (col.sortable) {
                    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                    else {
                      setSortKey(col.key);
                      setSortDir('asc');
                    }
                  }
                }}
              >
                <span className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <span className="text-gold">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={i}
                className={cn('hover:bg-gray-50 transition-colors', onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-gray-700">
                    {col.render ? col.render(row) : String(row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {pagination && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>
            Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}
            &#8211;{Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              &larr; Prev
            </button>
            <button
              disabled={pagination.page * pagination.limit >= pagination.total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
