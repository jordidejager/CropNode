'use client';

import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WindRoseDataPoint {
  wind_direction: number | null;
  wind_speed_ms: number | null;
}

interface WindRoseProps {
  data: WindRoseDataPoint[];
  /** SVG size — defaults to 280 */
  size?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIRECTIONS_16 = [
  'N', 'NNO', 'NO', 'ONO',
  'O', 'OZO', 'ZO', 'ZZO',
  'Z', 'ZZW', 'ZW', 'WZW',
  'W', 'WNW', 'NW', 'NNW',
] as const;

// Only show labels for the 8 main compass points (Dutch)
const LABEL_INDICES = new Set([0, 2, 4, 6, 8, 10, 12, 14]);

// Speed buckets (m/s) — each bucket gets a progressively more vivid color
const SPEED_BUCKETS = [
  { max: 2, label: '0-2', color: '#064e3b' },   // emerald-950
  { max: 4, label: '2-4', color: '#065f46' },   // emerald-900
  { max: 6, label: '4-6', color: '#047857' },   // emerald-800
  { max: 8, label: '6-8', color: '#059669' },   // emerald-700
  { max: 12, label: '8-12', color: '#10b981' },  // emerald-500
  { max: Infinity, label: '12+', color: '#34d399' }, // emerald-400
] as const;

// ---------------------------------------------------------------------------
// Data processing
// ---------------------------------------------------------------------------

interface DirectionBin {
  label: string;
  /** Angle in degrees (center of bin) */
  angle: number;
  /** Total count of data points in this direction */
  count: number;
  /** Counts per speed bucket */
  speedCounts: number[];
  /** Sum of wind speeds for average calculation */
  speedSum: number;
}

function processBins(data: WindRoseDataPoint[]): {
  bins: DirectionBin[];
  maxFreq: number;
  avgSpeed: number;
  totalValid: number;
} {
  const binCount = 16;
  const binWidth = 360 / binCount;

  const bins: DirectionBin[] = DIRECTIONS_16.map((label, i) => ({
    label,
    angle: i * binWidth,
    count: 0,
    speedCounts: SPEED_BUCKETS.map(() => 0),
    speedSum: 0,
  }));

  let totalValid = 0;
  let totalSpeedSum = 0;

  for (const point of data) {
    if (point.wind_direction == null || point.wind_speed_ms == null) continue;
    if (point.wind_speed_ms < 0) continue;

    const deg = ((point.wind_direction % 360) + 360) % 360;
    const binIdx = Math.round(deg / binWidth) % binCount;
    const bin = bins[binIdx]!;

    bin.count++;
    bin.speedSum += point.wind_speed_ms;
    totalSpeedSum += point.wind_speed_ms;
    totalValid++;

    // Assign to speed bucket
    for (let b = 0; b < SPEED_BUCKETS.length; b++) {
      if (point.wind_speed_ms < SPEED_BUCKETS[b]!.max) {
        bin.speedCounts[b]!++;
        break;
      }
    }
  }

  const maxFreq = Math.max(...bins.map((b) => b.count), 1);
  const avgSpeed = totalValid > 0 ? totalSpeedSum / totalValid : 0;

  return { bins, maxFreq, avgSpeed, totalValid };
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  // SVG: 0 deg = top (North), clockwise
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

/**
 * Build a petal (wedge) path for one direction bin.
 * Uses stacked segments for each speed bucket.
 */
function petalPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  centerAngle: number,
  halfWidth: number
): string {
  const startAngle = centerAngle - halfWidth;
  const endAngle = centerAngle + halfWidth;

  const p1 = polarToCartesian(cx, cy, innerR, startAngle);
  const p2 = polarToCartesian(cx, cy, outerR, startAngle);
  const p3 = polarToCartesian(cx, cy, outerR, endAngle);
  const p4 = polarToCartesian(cx, cy, innerR, endAngle);

  // Large arc flag — always 0 for our small wedges
  return [
    `M ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${p3.x} ${p3.y}`,
    `L ${p4.x} ${p4.y}`,
    `A ${innerR} ${innerR} 0 0 0 ${p1.x} ${p1.y}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WindRose({ data, size = 280 }: WindRoseProps) {
  const { bins, maxFreq, avgSpeed, totalValid } = useMemo(
    () => processBins(data),
    [data]
  );

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 32; // Leave room for labels
  const innerRadius = outerRadius * 0.18;
  const binWidth = 360 / 16;
  const halfPetal = binWidth * 0.42; // Slight gap between petals

  // Concentric guide rings
  const ringCount = 4;
  const ringRadii = Array.from({ length: ringCount }, (_, i) =>
    innerRadius + ((outerRadius - innerRadius) * (i + 1)) / ringCount
  );

  if (totalValid === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-sm text-slate-500">Geen winddata beschikbaar</p>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full h-auto max-w-[320px] mx-auto"
      role="img"
      aria-label="Windroos"
    >
      {/* Background circle */}
      <circle
        cx={cx}
        cy={cy}
        r={outerRadius + 2}
        fill="#0f172a"
        stroke="#1e293b"
        strokeWidth={1}
      />

      {/* Concentric guide rings */}
      {ringRadii.map((r, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#1e293b"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
      ))}

      {/* Cross-hair lines (N-S, E-W, and diagonals) */}
      {[0, 45, 90, 135].map((angle) => {
        const p1 = polarToCartesian(cx, cy, innerRadius, angle);
        const p2 = polarToCartesian(cx, cy, outerRadius, angle);
        const p3 = polarToCartesian(cx, cy, innerRadius, angle + 180);
        const p4 = polarToCartesian(cx, cy, outerRadius, angle + 180);
        return (
          <g key={angle}>
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="#1e293b"
              strokeWidth={0.5}
            />
            <line
              x1={p3.x} y1={p3.y} x2={p4.x} y2={p4.y}
              stroke="#1e293b"
              strokeWidth={0.5}
            />
          </g>
        );
      })}

      {/* Petals — stacked speed buckets */}
      {bins.map((bin) => {
        if (bin.count === 0) return null;

        const freqFraction = bin.count / maxFreq;
        const petalOuterR = innerRadius + (outerRadius - innerRadius) * freqFraction;

        // Build stacked segments from inside out
        let currentR = innerRadius;
        const segments: JSX.Element[] = [];

        for (let b = 0; b < SPEED_BUCKETS.length; b++) {
          const bucketCount = bin.speedCounts[b]!;
          if (bucketCount === 0) continue;

          const bucketFraction = bucketCount / bin.count;
          const segmentR = currentR + (petalOuterR - innerRadius) * bucketFraction;

          segments.push(
            <path
              key={`${bin.label}-${b}`}
              d={petalPath(cx, cy, currentR, segmentR, bin.angle, halfPetal)}
              fill={SPEED_BUCKETS[b]!.color}
              stroke="#020617"
              strokeWidth={0.5}
              opacity={0.9}
            >
              <title>
                {bin.label}: {bucketCount}x ({SPEED_BUCKETS[b]!.label} m/s)
              </title>
            </path>
          );

          currentR = segmentR;
        }

        return <g key={bin.label}>{segments}</g>;
      })}

      {/* Compass labels — 8 main directions */}
      {bins.map((bin, i) => {
        if (!LABEL_INDICES.has(i)) return null;
        const labelR = outerRadius + 16;
        const pos = polarToCartesian(cx, cy, labelR, bin.angle);
        const isNorth = i === 0;
        return (
          <text
            key={`label-${bin.label}`}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="central"
            className={
              isNorth
                ? 'fill-emerald-400 text-[11px] font-bold'
                : 'fill-slate-400 text-[10px] font-medium'
            }
          >
            {bin.label}
          </text>
        );
      })}

      {/* Center circle with average speed */}
      <circle
        cx={cx}
        cy={cy}
        r={innerRadius}
        fill="#020617"
        stroke="#10b981"
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={cy - 5}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-emerald-400 text-[13px] font-bold"
      >
        {avgSpeed.toFixed(1)}
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-500 text-[8px] font-medium"
      >
        m/s
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Legend (exported for use in widget)
// ---------------------------------------------------------------------------

export function WindRoseLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 mt-2">
      {SPEED_BUCKETS.map((bucket) => (
        <div key={bucket.label} className="flex items-center gap-1">
          <span
            className="inline-block w-2.5 h-2.5 rounded-[2px]"
            style={{ backgroundColor: bucket.color }}
          />
          <span className="text-[10px] text-slate-500">{bucket.label}</span>
        </div>
      ))}
      <span className="text-[10px] text-slate-600 ml-1">m/s</span>
    </div>
  );
}
