/**
 * Spotts-Cervantes infection table for Venturia pirina (pear scab)
 *
 * Based on:
 * - Spotts & Cervantes 1991: "Effect of Temperature and Wetness on Infection
 *   of Pear by Venturia pirina" (Plant Disease 75:1204-1207)
 * - Villalta et al. 2000-2001: Australian Journal of Agricultural Research —
 *   ascospore dose + interrupted wet periods
 * - Coop & Spotts 2002: degree-hour adaptation for PNW IPM
 *
 * Key differences from apple scab (Mills table):
 * - Pear scab NEEDS MORE wet hours at warm temperatures (Mills over-predicts)
 * - Conidia need ~2 hours extra wetness at cool temperatures (<12°C)
 * - Ascospore discharge less strictly day-time (<17.5% at night vs <5% for apple)
 * - Primary season shorter — fruit susceptibility declines faster after bloom
 */

export type PearScabSeverity = 'none' | 'light' | 'moderate' | 'severe';

/**
 * Hours of continuous wetness required for LIGHT ascospore infection.
 * From Spotts & Cervantes 1991.
 */
const ASCOSPORE_LIGHT_HOURS: Record<number, number> = {
  4: 27,
  6: 20,
  8: 15,
  10: 13,
  12: 11,
  14: 10,
  15: 10,
  16: 10,
  18: 9,
  20: 9,
  22: 9,
  25: 9,
  27: 10, // heat starts to suppress
  30: 14,
};

/**
 * Hours for SEVERE (moderate/heavy) ascospore infection.
 * Approximated as ~1.5-2x light threshold (same ratio as Mills).
 */
const ASCOSPORE_SEVERE_HOURS: Record<number, number> = {
  4: 48,
  6: 36,
  8: 26,
  10: 22,
  12: 19,
  14: 17,
  15: 17,
  16: 17,
  18: 15,
  20: 15,
  22: 15,
  25: 15,
  27: 17,
  30: 24,
};

/**
 * Conidia need extra hours at cool temperatures (Spotts 1991).
 * At 4-10°C: +2 hours. At >=12°C: same as ascospores.
 */
function conidiaAdjustment(tempC: number): number {
  if (tempC < 12) return 2;
  return 0;
}

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

  const frac = (temp - low) / (high - low);
  return table[low] * (1 - frac) + table[high] * frac;
}

/**
 * Classify pear scab infection severity.
 *
 * @param avgTempC - Average temperature during wet period
 * @param wetHours - Continuous wet duration in hours
 * @param sporeType - 'ascospore' or 'conidia' — conidia need extra at low T
 */
export function lookupPearScabSeverity(
  avgTempC: number,
  wetHours: number,
  sporeType: 'ascospore' | 'conidia' = 'ascospore'
): PearScabSeverity {
  if (avgTempC < 4 || avgTempC > 30) return 'none';
  if (wetHours < 6) return 'none';

  const adjust = sporeType === 'conidia' ? conidiaAdjustment(avgTempC) : 0;
  const lightThreshold = interpolate(avgTempC, ASCOSPORE_LIGHT_HOURS) + adjust;
  const severeThreshold = interpolate(avgTempC, ASCOSPORE_SEVERE_HOURS) + adjust;
  const moderateThreshold = (lightThreshold + severeThreshold) / 2;

  if (wetHours >= severeThreshold) return 'severe';
  if (wetHours >= moderateThreshold) return 'moderate';
  if (wetHours >= lightThreshold) return 'light';
  return 'none';
}

/**
 * Infection fraction (0-1) for RIM scaling.
 * Sigmoidal response: quick saturation once threshold exceeded.
 */
export function calculatePearScabInfectionFraction(
  avgTempC: number,
  wetHours: number,
  sporeType: 'ascospore' | 'conidia' = 'ascospore'
): number {
  if (avgTempC < 4 || avgTempC > 30) return 0;
  const adjust = sporeType === 'conidia' ? conidiaAdjustment(avgTempC) : 0;
  const threshold = interpolate(avgTempC, ASCOSPORE_LIGHT_HOURS) + adjust;
  if (wetHours < threshold) return 0;

  // Sigmoid: k * (wetHours - threshold) clamped to [0, 1]
  const excess = wetHours - threshold;
  const severeThr = interpolate(avgTempC, ASCOSPORE_SEVERE_HOURS) + adjust;
  const span = severeThr - threshold;
  if (span <= 0) return 1;

  return Math.min(1, 0.3 + 0.7 * (excess / span));
}
