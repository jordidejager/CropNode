/**
 * Auto-biofix detection
 *
 * The biofix is when ascospores become first available for discharge.
 * Instead of a fixed "green tip" date, we run a mini-simulation from
 * January 1 and detect when PAM exceeds a small threshold.
 *
 * This matches RIMpro's behavior: for 's Gravenpolder 2026 biofix was
 * Feb 25 (well before green tip), because mild winter allowed early
 * pseudothecia maturation.
 *
 * Logic:
 *   - Start DD accumulation January 1
 *   - Only count DD on days with at least some rain (Rossi 2007: wet DD)
 *   - Biofix = date when PAM reaches 0.5% (first dischargeable spores)
 *   - Return min(detectedBiofix, providedGreenTipDate) if green tip given
 */

import type { HourlyWeatherStep } from './types';
import { SIMULATION_CONSTANTS } from './types';

const C = SIMULATION_CONSTANTS;

const BIOFIX_PAM_THRESHOLD = 0.005; // 0.5% mature = first dischargeable

/**
 * Detect the biofix date from weather history.
 *
 * @param hourlyWeather - Weather data covering Jan 1 to target date
 * @param year - Harvest year (e.g., 2026)
 * @param greenTipDate - Optional green tip date to cap detection
 * @returns Detected biofix date (YYYY-MM-DD)
 */
export function detectBiofix(
  hourlyWeather: HourlyWeatherStep[],
  year: number,
  greenTipDate?: Date | null
): Date {
  // Start accumulating from Jan 1 of target year
  const seasonStart = new Date(Date.UTC(year, 0, 1));

  // Group weather by day
  const dailyData = new Map<
    string,
    { avgTemp: number; totalRain: number; latestDate: Date }
  >();

  for (const h of hourlyWeather) {
    if (h.timestamp < seasonStart) continue;
    const dateKey = h.timestamp.toISOString().slice(0, 10);

    if (!dailyData.has(dateKey)) {
      dailyData.set(dateKey, {
        avgTemp: 0,
        totalRain: 0,
        latestDate: h.timestamp,
      });
    }

    const d = dailyData.get(dateKey)!;
    d.avgTemp += (h.temperatureC ?? 0);
    d.totalRain += (h.precipitationMm ?? 0);
    d.latestDate = h.timestamp;
  }

  // Convert sums to averages
  const dailyEntries = Array.from(dailyData.entries())
    .map(([dateKey, d]) => ({
      dateKey,
      date: new Date(dateKey + 'T12:00:00Z'),
      avgTemp: d.avgTemp / 24, // assumes 24 hours; close enough
      totalRain: d.totalRain,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Simulate maturation day by day
  let cumulativeDD = 0;
  let consecutiveDryDays = 0;
  let detectedBiofix: Date | null = null;

  for (const day of dailyEntries) {
    // Pseudothecia maturation needs moisture — only accumulate on rainy days
    // Rossi 2007 revision: DD counts only in wet hours
    // Simplification: require at least trace rain for day to count
    const isWetDay = day.totalRain > 0.2;

    if (isWetDay) {
      consecutiveDryDays = 0;
      if (day.avgTemp > C.BASE_TEMP_MATURATION) {
        cumulativeDD += day.avgTemp;
      }
    } else {
      consecutiveDryDays++;
    }

    // Check PAM using same logistic as main simulation
    const k = 0.02;
    const DD50 = C.TSUM_FOR_50_PCT_MATURATION;
    const pam = 1 / (1 + Math.exp(-k * (cumulativeDD - DD50)));

    if (pam >= BIOFIX_PAM_THRESHOLD && !detectedBiofix) {
      detectedBiofix = day.date;
      break;
    }
  }

  // If not detected yet, fall back to provided green tip or mid-March
  if (!detectedBiofix) {
    if (greenTipDate) return greenTipDate;
    return new Date(Date.UTC(year, 2, 15)); // March 15 as last-resort fallback
  }

  // Use the earlier of detected biofix and green tip
  if (greenTipDate && greenTipDate < detectedBiofix) {
    return greenTipDate;
  }

  return detectedBiofix;
}

/**
 * Format a Date as YYYY-MM-DD.
 */
export function formatBiofix(date: Date): string {
  return date.toISOString().slice(0, 10);
}
