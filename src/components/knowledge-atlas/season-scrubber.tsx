'use client';

/**
 * Zone 5 — Season Scrubber
 *
 * Sticky footer timeline with 12-month scale + fenological phase bands.
 * User can drag the marker or click a month to filter the entire atlas by that month.
 *
 * "Reset naar vandaag" jumps the marker back to the current month.
 */

import { motion, useMotionValue, animate } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { MONTH_LABELS, PHENOLOGICAL_PHASES } from '@/lib/knowledge/ui-tokens';
import { cn } from '@/lib/utils';

interface SeasonScrubberProps {
  selectedMonth: number | null; // 1-12, null = today
  onMonthChange: (month: number | null) => void;
}

export function SeasonScrubber({ selectedMonth, onMonthChange }: SeasonScrubberProps) {
  const currentMonth = new Date().getUTCMonth() + 1;
  const activeMonth = selectedMonth ?? currentMonth;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const markerX = useMotionValue(0);

  // Recompute container width on mount & resize
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const w = containerRef.current?.offsetWidth ?? 0;
      setContainerWidth(w);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Animate marker to active month when month changes
  useEffect(() => {
    if (containerWidth === 0) return;
    const segmentWidth = containerWidth / 12;
    const target = (activeMonth - 0.5) * segmentWidth;
    const controls = animate(markerX, target, {
      type: 'spring',
      stiffness: 200,
      damping: 25,
    });
    return () => controls.stop();
  }, [activeMonth, containerWidth, markerX]);

  const handleMonthClick = (month: number) => {
    onMonthChange(month === currentMonth ? null : month);
  };

  const resetToToday = () => {
    onMonthChange(null);
  };

  const isOffToday = selectedMonth !== null && selectedMonth !== currentMonth;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.6 }}
      className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/80 p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/70">
            Seizoen scrubber
          </span>
          <span className="text-[10px] text-white/40">
            {isOffToday ? `Bekijken: ${MONTH_LABELS[activeMonth - 1]}` : 'Vandaag'}
          </span>
        </div>
        {isOffToday && (
          <button
            type="button"
            onClick={resetToToday}
            className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            <RotateCcw className="h-3 w-3" />
            Vandaag
          </button>
        )}
      </div>

      {/* Phase bands */}
      <div className="relative mb-2 flex h-1.5 w-full overflow-hidden rounded-full">
        {PHENOLOGICAL_PHASES.map((phase, i) => {
          // Compute width in "months"
          const monthWidth = phase.monthStart <= phase.monthEnd
            ? phase.monthEnd - phase.monthStart + 1
            : 12 - phase.monthStart + 1 + phase.monthEnd;
          const widthPct = (monthWidth / 12) * 100;
          return (
            <div
              key={phase.key + i}
              className="h-full"
              style={{
                width: `${widthPct}%`,
                backgroundColor: phase.color,
                opacity: 0.5,
              }}
              title={phase.label}
            />
          );
        })}
      </div>

      {/* Month scale + marker */}
      <div ref={containerRef} className="relative h-10 select-none">
        {/* Month grid */}
        <div className="absolute inset-0 flex">
          {MONTH_LABELS.map((label, i) => {
            const month = i + 1;
            const isActive = month === activeMonth;
            const isCurrent = month === currentMonth;
            return (
              <button
                key={month}
                type="button"
                onClick={() => handleMonthClick(month)}
                className={cn(
                  'flex flex-1 flex-col items-center justify-end border-r border-white/5 pb-1 transition-colors',
                  isActive ? 'bg-white/5' : 'hover:bg-white/[0.02]',
                )}
              >
                <span
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-wider transition-colors',
                    isActive
                      ? 'font-bold text-emerald-300'
                      : isCurrent
                      ? 'text-emerald-400/70'
                      : 'text-white/50',
                  )}
                >
                  {label}
                </span>
                {isCurrent && (
                  <span className="h-0.5 w-4 rounded-full bg-emerald-400/60" />
                )}
              </button>
            );
          })}
        </div>

        {/* Floating marker */}
        {containerWidth > 0 && (
          <motion.div
            style={{ x: markerX }}
            className="pointer-events-none absolute top-0 -ml-[6px] h-full"
          >
            <div className="relative h-full w-3">
              <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-gradient-to-b from-emerald-400 to-transparent" />
              <div className="absolute left-1/2 top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
