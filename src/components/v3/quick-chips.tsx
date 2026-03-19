'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParcelHistorySlim } from '@/lib/types-v2';

interface QuickChipsProps {
  recentHistory: ParcelHistorySlim[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}

interface Chip {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Generates contextual quick action chips based on recent spray history.
 * Max 4 chips, most relevant first.
 */
function generateChips(history: ParcelHistorySlim[]): Chip[] {
  const chips: Chip[] = [];
  if (!history || history.length === 0) {
    // Default chips when no history
    return [
      { label: 'Alle peren met Merpan 2L', icon: Sparkles },
      { label: 'Gisteren gespoten', icon: Clock },
    ];
  }

  // 1. Most recent spray as a template
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Group by date to find the most recent "session"
  const lastDate = sortedHistory[0]?.date;
  if (lastDate) {
    const lastSession = sortedHistory.filter(h => h.date === lastDate);
    // Get unique products from last session
    const products = [...new Set(lastSession.map(h => h.product))];
    const parcelNames = [...new Set(lastSession.map(h => h.parcelName))];

    if (products.length > 0 && products.length <= 2) {
      const productStr = products.map(p => {
        const entry = lastSession.find(h => h.product === p);
        return entry && entry.dosage > 0 ? `${p} ${entry.dosage}${entry.unit}` : p;
      }).join(' + ');

      const parcelStr = parcelNames.length > 2
        ? `${parcelNames.length} percelen`
        : parcelNames.join(', ');

      chips.push({
        label: `${productStr} op ${parcelStr}`,
        icon: RotateCcw,
      });
    }
  }

  // 2. Most frequently used product combination
  const productFrequency = new Map<string, number>();
  for (const h of history) {
    productFrequency.set(h.product, (productFrequency.get(h.product) || 0) + 1);
  }

  const topProducts = [...productFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  if (topProducts.length > 0 && chips.length < 4) {
    const topProduct = topProducts[0][0];
    const lastUsage = sortedHistory.find(h => h.product === topProduct);
    if (lastUsage && lastUsage.dosage > 0) {
      const label = `${topProduct} ${lastUsage.dosage}${lastUsage.unit}`;
      // Don't duplicate the first chip
      if (!chips.some(c => c.label.includes(topProduct))) {
        chips.push({ label, icon: Zap });
      }
    }
  }

  // 3. Always add time-based chips
  if (chips.length < 4) {
    chips.push({ label: 'Vandaag gespoten', icon: Clock });
  }
  if (chips.length < 4) {
    chips.push({ label: 'Gisteren alle appels', icon: Sparkles });
  }

  return chips.slice(0, 4);
}

export function QuickChips({ recentHistory, onSelect, disabled }: QuickChipsProps) {
  const chips = React.useMemo(() => generateChips(recentHistory), [recentHistory]);

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar px-1">
      {chips.map((chip, i) => (
        <motion.button
          key={chip.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          onClick={() => onSelect(chip.label)}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] font-medium text-white/40 transition-all whitespace-nowrap",
            "hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400 hover:shadow-lg",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <chip.icon className="h-3 w-3 opacity-60" />
          {chip.label}
        </motion.button>
      ))}
    </div>
  );
}
