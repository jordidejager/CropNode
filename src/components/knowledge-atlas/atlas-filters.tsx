'use client';

/**
 * Atlas filters — search bar + chip selectors for crops, months, and categories.
 *
 * Controlled component: parent holds the filter state and passes it back in.
 */

import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';

import { CROP_CONFIG, MONTH_LABELS } from '@/lib/knowledge/ui-tokens';
import type { Crop } from '@/lib/knowledge/types';
import type { ArticleFilters } from '@/lib/knowledge/client-api';
import { cn } from '@/lib/utils';

interface AtlasFiltersProps {
  filters: ArticleFilters;
  onChange: (next: ArticleFilters) => void;
  onClear?: () => void;
}

const ALL_CROPS: Crop[] = ['appel', 'peer', 'kers', 'pruim', 'blauwe_bes'];

export function AtlasFilters({ filters, onChange, onClear }: AtlasFiltersProps) {
  const toggleCrop = (crop: Crop) => {
    const current = filters.crops ?? [];
    const next = current.includes(crop)
      ? current.filter((c) => c !== crop)
      : [...current, crop];
    onChange({ ...filters, crops: next.length > 0 ? next : undefined });
  };

  const toggleMonth = (month: number) => {
    const current = filters.months ?? [];
    const next = current.includes(month)
      ? current.filter((m) => m !== month)
      : [...current, month];
    onChange({ ...filters, months: next.length > 0 ? next : undefined });
  };

  const hasActiveFilters =
    (filters.crops?.length ?? 0) > 0 ||
    (filters.months?.length ?? 0) > 0 ||
    (filters.categories?.length ?? 0) > 0 ||
    !!filters.search;

  return (
    <div className="mx-auto mb-6 max-w-5xl space-y-4">
      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          placeholder="Zoek in kennis-atlas..."
          value={filters.search ?? ''}
          onChange={(e) =>
            onChange({ ...filters, search: e.target.value || undefined })
          }
          className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-white placeholder-white/30 backdrop-blur-xl transition-colors focus:border-emerald-500/40 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        {hasActiveFilters && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-wider text-white/60 transition-colors hover:border-white/20 hover:text-white"
          >
            <X className="h-3 w-3" />
            Reset
          </button>
        )}
      </motion.div>

      {/* Crop chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Gewas
        </span>
        {ALL_CROPS.map((crop) => {
          const active = filters.crops?.includes(crop);
          const cfg = CROP_CONFIG[crop];
          return (
            <button
              key={crop}
              type="button"
              onClick={() => toggleCrop(crop)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                active
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/80',
              )}
              style={active ? { boxShadow: `0 0 12px ${cfg.color}40` } : undefined}
            >
              <span>{cfg.emoji}</span>
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Month chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Maand
        </span>
        {MONTH_LABELS.map((label, i) => {
          const month = i + 1;
          const active = filters.months?.includes(month);
          return (
            <button
              key={month}
              type="button"
              onClick={() => toggleMonth(month)}
              className={cn(
                'rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all',
                active
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20 hover:text-white/80',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
