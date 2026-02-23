'use client';

import { cn } from '@/lib/utils';
import type { HarvestStorageStatus } from '@/lib/types';

interface HarvestStatusBadgeProps {
  status: HarvestStorageStatus;
  storedCrates?: number;
  totalCrates?: number;
  className?: string;
}

const statusConfig: Record<HarvestStorageStatus, { label: string; className: string }> = {
  not_stored: {
    label: 'Niet opgeslagen',
    className: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  },
  partially_stored: {
    label: 'Deels opgeslagen',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  fully_stored: {
    label: 'Volledig opgeslagen',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
};

export function HarvestStatusBadge({
  status,
  storedCrates,
  totalCrates,
  className,
}: HarvestStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      <span>{config.label}</span>
      {storedCrates !== undefined && totalCrates !== undefined && (
        <span className="opacity-75">
          ({storedCrates}/{totalCrates})
        </span>
      )}
    </div>
  );
}
