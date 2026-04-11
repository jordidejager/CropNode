'use client';

/**
 * Fenologische Compas — circulaire SVG seizoenskalender.
 *
 * Toont de 12 maanden als een ring met de fenologische fasen
 * als gekleurde bogen. De huidige maand wordt gemarkeerd met
 * een pulserende indicator.
 *
 * Compact genoeg om naast de chat te passen.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useCurrentPhenology } from '@/hooks/use-knowledge';
import { cn } from '@/lib/utils';

const SIZE = 220;
const CENTER = SIZE / 2;
const OUTER_R = 95;
const INNER_R = 65;
const LABEL_R = 50;

const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

// Fenologische fasen met kleuren en maand-ranges
const PHASES: Array<{
  name: string;
  shortName: string;
  startMonth: number; // 1-12
  endMonth: number;
  color: string;
  colorLight: string;
}> = [
  { name: 'Winterrust', shortName: 'Rust', startMonth: 12, endMonth: 2, color: '#64748b', colorLight: '#64748b30' },
  { name: 'Knopstadium', shortName: 'Knop', startMonth: 3, endMonth: 3, color: '#a78bfa', colorLight: '#a78bfa30' },
  { name: 'Bloei', shortName: 'Bloei', startMonth: 4, endMonth: 4, color: '#f472b6', colorLight: '#f472b630' },
  { name: 'Vruchtzetting', shortName: 'Zetting', startMonth: 5, endMonth: 5, color: '#34d399', colorLight: '#34d39930' },
  { name: 'Groei', shortName: 'Groei', startMonth: 6, endMonth: 8, color: '#10b981', colorLight: '#10b98130' },
  { name: 'Oogst', shortName: 'Oogst', startMonth: 9, endMonth: 10, color: '#f59e0b', colorLight: '#f59e0b30' },
  { name: 'Bladval', shortName: 'Blad', startMonth: 11, endMonth: 11, color: '#fb923c', colorLight: '#fb923c30' },
];

function monthToAngle(month: number): number {
  // Month 1 (Jan) = top (270°), clockwise
  return ((month - 1) * 30 - 90) * (Math.PI / 180);
}

function polarToXY(angle: number, radius: number): { x: number; y: number } {
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function arcPath(startMonth: number, endMonth: number, r: number): string {
  const startAngle = monthToAngle(startMonth) - (15 * Math.PI / 180); // Start at beginning of month
  const endAngle = monthToAngle(endMonth) + (15 * Math.PI / 180); // End at end of month
  const largeArc = (endMonth >= startMonth ? endMonth - startMonth : endMonth + 12 - startMonth) > 6 ? 1 : 0;
  const start = polarToXY(startAngle, r);
  const end = polarToXY(endAngle, r);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

interface PhenologicalCompassProps {
  className?: string;
}

export function PhenologicalCompass({ className }: PhenologicalCompassProps) {
  const { data: phenology } = useCurrentPhenology();
  const currentMonth = phenology?.month ?? new Date().getUTCMonth() + 1;
  const currentPhase = phenology?.phenologicalPhase ?? '';

  // Current month indicator position
  const currentAngle = monthToAngle(currentMonth);
  const indicator = polarToXY(currentAngle, OUTER_R);
  const indicatorInner = polarToXY(currentAngle, INNER_R);

  return (
    <div className={cn('relative', className)}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="drop-shadow-lg">
        {/* Background circle */}
        <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={OUTER_R - INNER_R} />

        {/* Phase arcs */}
        {PHASES.map((phase) => (
          <path
            key={phase.name}
            d={arcPath(phase.startMonth, phase.endMonth, (OUTER_R + INNER_R) / 2)}
            fill="none"
            stroke={phase.colorLight}
            strokeWidth={OUTER_R - INNER_R - 2}
            strokeLinecap="round"
          />
        ))}

        {/* Month tick marks */}
        {MONTHS.map((_, m) => {
          const angle = monthToAngle(m + 1);
          const outer = polarToXY(angle, OUTER_R + 2);
          const inner = polarToXY(angle, OUTER_R - 4);
          return (
            <line
              key={m}
              x1={outer.x} y1={outer.y}
              x2={inner.x} y2={inner.y}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
            />
          );
        })}

        {/* Month labels */}
        {MONTHS.map((label, m) => {
          const angle = monthToAngle(m + 1);
          const pos = polarToXY(angle, LABEL_R);
          const isCurrent = m + 1 === currentMonth;
          return (
            <text
              key={m}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isCurrent ? '#10b981' : 'rgba(255,255,255,0.3)'}
              fontSize={isCurrent ? 10 : 8}
              fontWeight={isCurrent ? 700 : 400}
              fontFamily="system-ui, sans-serif"
            >
              {label}
            </text>
          );
        })}

        {/* Current month indicator — line from center to edge */}
        <line
          x1={CENTER} y1={CENTER}
          x2={indicator.x} y2={indicator.y}
          stroke="#10b981"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.6}
        />

        {/* Current month dot */}
        <circle
          cx={indicator.x}
          cy={indicator.y}
          r={5}
          fill="#10b981"
        />

        {/* Pulse animation on current month */}
        <circle
          cx={indicator.x}
          cy={indicator.y}
          r={5}
          fill="none"
          stroke="#10b981"
          strokeWidth={2}
          opacity={0.4}
        >
          <animate attributeName="r" values="5;12;5" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Center text */}
        <text
          x={CENTER}
          y={CENTER - 6}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#10b981"
          fontSize={10}
          fontWeight={700}
          fontFamily="system-ui, sans-serif"
        >
          {MONTHS[currentMonth - 1]}
        </text>
        <text
          x={CENTER}
          y={CENTER + 8}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.4)"
          fontSize={7}
          fontFamily="system-ui, sans-serif"
        >
          {currentPhase.replace(/-/g, ' ').split('/')[0]}
        </text>
      </svg>

      {/* Phase legend (compact) */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {PHASES.map((phase) => {
          const isActive = isPhaseActive(phase, currentMonth);
          return (
            <div key={phase.name} className="flex items-center gap-1">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: isActive ? phase.color : phase.colorLight }}
              />
              <span className={cn('text-[9px]', isActive ? 'text-white/70 font-semibold' : 'text-white/25')}>
                {phase.shortName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isPhaseActive(phase: typeof PHASES[0], currentMonth: number): boolean {
  if (phase.startMonth <= phase.endMonth) {
    return currentMonth >= phase.startMonth && currentMonth <= phase.endMonth;
  }
  // Wraps around (e.g. Dec-Feb)
  return currentMonth >= phase.startMonth || currentMonth <= phase.endMonth;
}
