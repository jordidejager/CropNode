'use client';

import { type LucideIcon, BarChart3 } from 'lucide-react';
import Link from 'next/link';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function EmptyState({ icon: Icon = BarChart3, title, description, ctaLabel, ctaHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
        <Icon className="size-8 text-emerald-500/60" />
      </div>
      <h3 className="text-base font-medium text-slate-100 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-4">{description}</p>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
