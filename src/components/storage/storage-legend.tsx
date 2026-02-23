'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VARIETY_COLORS, getVarietyColor } from './storage-floor-plan';
import { cn } from '@/lib/utils';

interface StorageLegendProps {
  activeVarieties: string[];
  className?: string;
}

export function StorageLegend({ activeVarieties, className }: StorageLegendProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  // Sort varieties alphabetically
  const sortedVarieties = React.useMemo(() => {
    return [...activeVarieties].sort((a, b) => a.localeCompare(b));
  }, [activeVarieties]);

  if (activeVarieties.length === 0) {
    return null;
  }

  return (
    <div className={cn('bg-white/5 rounded-lg border border-white/10', className)}>
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between px-4 py-2 h-auto"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-sm font-medium">
          Legenda ({activeVarieties.length} rassen)
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2">
          <div className="flex flex-wrap gap-2">
            {sortedVarieties.map((variety) => {
              const color = getVarietyColor(variety);
              return (
                <div
                  key={variety}
                  className="flex items-center gap-2 bg-white/5 rounded-full px-3 py-1"
                >
                  <div
                    className={cn(
                      'w-3 h-3 rounded-full',
                      color.bg,
                      'border',
                      color.border
                    )}
                  />
                  <span className="text-xs text-white/80">{variety}</span>
                </div>
              );
            })}
          </div>

          {/* Legend for special positions */}
          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-white/5 border border-white/10" />
              <span className="text-xs text-muted-foreground">Leeg</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-slate-800/80 border border-slate-700" />
              <span className="text-xs text-muted-foreground">Geblokkeerd</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
