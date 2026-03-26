'use client';

import { type LucideIcon } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyCta?: { label: string; href: string };
  className?: string;
}

export function ChartCard({ title, children, isEmpty = false, emptyIcon, emptyTitle = 'Geen data beschikbaar', emptyDescription = 'Er is nog niet genoeg data voor deze grafiek.', emptyCta, className = '' }: ChartCardProps) {
  return (
    <div className={`rounded-xl border border-white/5 bg-white/[0.02] p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-200 mb-4">{title}</h3>
      {isEmpty ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} ctaLabel={emptyCta?.label} ctaHref={emptyCta?.href} />
      ) : children}
    </div>
  );
}
