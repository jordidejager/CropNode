/**
 * Arauz-Sutton infection table for Botryosphaeria obtusa (apple black rot)
 *
 * Based on:
 * - Arauz LF & Sutton TB (1989). "Temperature and wetness duration requirements
 *   for apple infection by Botryosphaeria obtusa." Phytopathology 79:440-444.
 * - Arauz LF & Sutton TB (1990). "Effect of interrupted wetness periods on
 *   spore germination and apple infection by Botryosphaeria obtusa."
 *   Phytopathology 80:1218-1220.
 *
 * Key differences from apple scab (Mills table):
 * - Optimum temperature is MUCH higher (~27°C vs 18-22°C)
 * - Interrupted wetness of ≥1 hour KILLS the infection process (very strict)
 * - Infection can occur all season (petal fall → harvest), not just spring
 * - Fruit infections need wounds (require calyx/pedicel openings, insect
 *   damage, hail, mechanical wounds)
 */

export type BlackRotSeverity = 'none' | 'light' | 'moderate' | 'severe';

/**
 * Minimum hours of continuous wetness for leaf infection by B. obtusa.
 * Values interpolated from Arauz & Sutton 1989.
 *
 * Below 8°C or above 32°C: no infection possible.
 */
const LEAF_LIGHT_HOURS: Record<number, number> = {
  8: 30,
  10: 24,
  12: 18,
  14: 13,
  16: 10,
  18: 7,
  20: 6,
  22: 5,
  24: 4.5,
  26: 4.5,
  27: 4.5, // optimum
  28: 5,
  30: 6,
  32: 10,
};

const LEAF_SEVERE_HOURS: Record<number, number> = {
  8: 48,
  10: 36,
  12: 30,
  14: 24,
  16: 20,
  18: 17,
  20: 15,
  22: 14,
  24: 13,
  26: 13,
  27: 13,
  28: 14,
  30: 16,
  32: 24,
};

/**
 * Fruit infection requires slightly longer wet periods because conidia
 * need wounds / natural openings.
 */
const FRUIT_LIGHT_HOURS: Record<number, number> = {
  12: 24,
  14: 18,
  16: 14,
  18: 11,
  20: 9,
  22: 9,
  24: 9,
  26: 9,
  28: 10,
  30: 12,
};

/**
 * Linear interpolation lookup.
 * Returns Infinity if below/above covered range → no infection possible.
 */
function interpolate(
  temp: number,
  table: Record<number, number>
): number {
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  const minT = keys[0];
  const maxT = keys[keys.length - 1];
  if (temp < minT || temp > maxT) return Infinity;

  // Find surrounding keys
  let low = minT;
  let high = maxT;
  for (const k of keys) {
    if (k <= temp) low = k;
    if (k >= temp) {
      high = k;
      break;
    }
  }
  if (low === high) return table[low];

  const lowVal = table[low];
  const highVal = table[high];
  const frac = (temp - low) / (high - low);
  return lowVal * (1 - frac) + highVal * frac;
}

/**
 * Classify infection severity based on wet duration and temperature.
 *
 * @param avgTempC - Average temperature during wet period
 * @param wetHours - Continuous wet duration in hours
 * @param target - 'leaf' or 'fruit' (different thresholds)
 */
export function lookupArauzSuttonSeverity(
  avgTempC: number,
  wetHours: number,
  target: 'leaf' | 'fruit' = 'leaf'
): BlackRotSeverity {
  if (wetHours < 4) return 'none';
  if (avgTempC < 8 || avgTempC > 32) return 'none';

  const lightTable = target === 'leaf' ? LEAF_LIGHT_HOURS : FRUIT_LIGHT_HOURS;
  const severeTable = target === 'leaf' ? LEAF_SEVERE_HOURS : LEAF_SEVERE_HOURS;

  const lightThreshold = interpolate(avgTempC, lightTable);
  const severeThreshold = interpolate(avgTempC, severeTable);
  const moderateThreshold = (lightThreshold + severeThreshold) / 2;

  if (wetHours >= severeThreshold) return 'severe';
  if (wetHours >= moderateThreshold) return 'moderate';
  if (wetHours >= lightThreshold) return 'light';
  return 'none';
}

/**
 * Calculate infection fraction (0-1) for RIM-value scaling.
 * Based on Arauz-Sutton 1993 regression (adapted):
 *   y = 0.1546 + 0.0123*T + 0.0329*W (for B. dothidea fruit)
 * Clipped to [0, 1].
 */
export function calculateBlackRotInfectionFraction(
  avgTempC: number,
  wetHours: number
): number {
  if (avgTempC < 8 || avgTempC > 32) return 0;
  if (wetHours < 4) return 0;

  const y = 0.1546 + 0.0123 * avgTempC + 0.0329 * wetHours;
  return Math.max(0, Math.min(1, y));
}
