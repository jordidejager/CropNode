/**
 * Mills Table — Revised by MacHardy & Gadoury (Stensvand et al. 1997)
 *
 * Defines minimum hours of leaf wetness required for apple scab infection
 * at different temperatures and severity levels.
 *
 * Each entry: [temperature_°C, hours_light, hours_moderate, hours_severe]
 * null = no infection possible at that severity for that temperature.
 */

import type { MillsSeverity } from '../types';

// [temp_°C, light_hours, moderate_hours, severe_hours]
const MILLS_TABLE: [number, number | null, number | null, number | null][] = [
  [1,  null, null, null],
  [2,  35,   null, null],
  [3,  30,   null, null],
  [4,  28,   37,   48],
  [5,  22,   30,   40],
  [6,  19,   23,   32],
  [7,  17,   21,   28],
  [8,  15,   18,   24],
  [9,  13,   17,   22],
  [10, 12,   16,   20],
  [11, 11,   14,   18],
  [12, 10,   13,   17],
  [13, 9,    12,   16],
  [14, 9,    12,   15],
  [15, 9,    12,   15],
  [16, 9,    11,   14],
  [17, 8,    10,   13],
  [18, 8,    10,   13],
  [19, 7,    9,    12],
  [20, 7,    9,    12],
  [21, 7,    9,    12],
  [22, 6,    9,    11],
  [23, 6,    9,    11],
  [24, 6,    9,    11],
  [25, 8,    11,   14],
  [26, 11,   14,   18],
];

/**
 * Interpolate between two values. Returns null if either is null.
 */
function interpolate(
  v1: number | null,
  v2: number | null,
  fraction: number
): number | null {
  if (v1 === null || v2 === null) return null;
  return v1 + (v2 - v1) * fraction;
}

/**
 * Get the Mills table thresholds for a given temperature.
 * Linearly interpolates between whole-degree entries.
 *
 * Returns [light_hours, moderate_hours, severe_hours] or null values
 * if infection is not possible at that severity/temperature.
 */
function getThresholds(
  avgTemp: number
): [number | null, number | null, number | null] {
  // Outside range: no infection
  if (avgTemp < 1 || avgTemp > 26) {
    return [null, null, null];
  }

  const tempFloor = Math.floor(avgTemp);
  const tempCeil = Math.ceil(avgTemp);
  const fraction = avgTemp - tempFloor;

  // Find table entries
  const entryLow = MILLS_TABLE.find(([t]) => t === tempFloor);
  const entryHigh = MILLS_TABLE.find(([t]) => t === tempCeil);

  if (!entryLow || !entryHigh) {
    return [null, null, null];
  }

  // Exact integer temperature
  if (fraction === 0) {
    return [entryLow[1], entryLow[2], entryLow[3]];
  }

  return [
    interpolate(entryLow[1], entryHigh[1], fraction),
    interpolate(entryLow[2], entryHigh[2], fraction),
    interpolate(entryLow[3], entryHigh[3], fraction),
  ];
}

/**
 * Look up the infection severity for a given average temperature and
 * wet period duration using the revised Mills table.
 *
 * @param avgTemp - Average temperature during the wet period (°C)
 * @param durationHours - Duration of the wet period (hours)
 * @returns The severity level of infection
 */
export function lookupMillsSeverity(
  avgTemp: number,
  durationHours: number
): MillsSeverity {
  const [light, moderate, severe] = getThresholds(avgTemp);

  // Check severe first (longest threshold), then down
  if (severe !== null && durationHours >= severe) return 'severe';
  if (moderate !== null && durationHours >= moderate) return 'moderate';
  if (light !== null && durationHours >= light) return 'light';

  return 'none';
}

/**
 * Calculate the infection fraction (0-1) based on how far the wet duration
 * exceeds the minimum threshold. Used for RIM value calculation.
 *
 * Returns 0 if no infection, up to 1.0 for maximum infection.
 */
export function calculateInfectionFraction(
  avgTemp: number,
  durationHours: number
): number {
  const [light, , severe] = getThresholds(avgTemp);

  if (light === null || durationHours < light) return 0;
  if (severe === null) {
    // Only light infection possible — binary
    return durationHours >= light ? 0.3 : 0;
  }

  // Scale from 0 at light threshold to 1.0 at severe threshold
  const fraction = (durationHours - light) / (severe - light);
  return Math.min(1.0, Math.max(0, fraction));
}

export { MILLS_TABLE };
