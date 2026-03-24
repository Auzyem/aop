'use client';
import { Badge } from './badge';

interface ChecklistItem {
  documentType: string;
  required: boolean;
  uploaded: boolean;
  approved: boolean;
  rejected: boolean;
}

export function DocumentChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.documentType}
          className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">
              {item.approved
                ? '✅'
                : item.rejected
                  ? '❌'
                  : item.uploaded
                    ? '🕐'
                    : item.required
                      ? '⭕'
                      : '○'}
            </span>
            <span className="text-sm font-medium text-gray-700">
              {item.documentType.replace(/_/g, ' ')}
            </span>
            {item.required && <Badge variant="gold">Required</Badge>}
          </div>
          <Badge
            variant={
              item.approved
                ? 'success'
                : item.rejected
                  ? 'danger'
                  : item.uploaded
                    ? 'warning'
                    : 'default'
            }
          >
            {item.approved
              ? 'Approved'
              : item.rejected
                ? 'Rejected'
                : item.uploaded
                  ? 'Pending'
                  : 'Missing'}
          </Badge>
        </div>
      ))}
    </div>
  );
}
