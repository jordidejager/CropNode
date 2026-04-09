/**
 * Ascospore Maturation Model (Submodel 1)
 *
 * Predicts the proportion of ascospores that are mature and available
 * for discharge at any given time during the primary scab season.
 *
 * Based on: Gadoury & MacHardy (1982), Rossi et al. (2000)
 * Formula: PAM = 1 / (1 + exp(a + b * DD))
 * Where DD = cumulative degree-days (base 0°C) since biofix
 */

import type { HourlyWeatherInput, SeasonProgressEntry } from '../types';

// Regression parameters (Gadoury & MacHardy)
const A = 7.486;
const B = -0.0152;

/**
 * Calculate the Proportion of Ascospores Mature (PAM) from cumulative degree-days.
 *
 * @param cumulativeDD - Cumulative degree-days (base 0°C) since biofix
 * @returns PAM value between 0.0 and 1.0
 */
export function calculatePAM(cumulativeDD: number): number {
  return 1 / (1 + Math.exp(A + B * cumulativeDD));
}

/**
 * Format a Date as YYYY-MM-DD string.
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Group hourly weather data by date and calculate daily averages.
 */
function groupByDate(
  hourlyData: HourlyWeatherInput[]
): Map<string, { temps: number[]; isForecast: boolean }> {
  const byDate = new Map<string, { temps: number[]; isForecast: boolean }>();

  for (const hour of hourlyData) {
    const dateStr = formatDate(hour.timestamp);
    const entry = byDate.get(dateStr);

    if (entry) {
      if (hour.temperatureC !== null) {
        entry.temps.push(hour.temperatureC);
      }
      // If any hour is forecast, mark the day as forecast
      if (hour.isForecast) entry.isForecast = true;
    } else {
      byDate.set(dateStr, {
        temps: hour.temperatureC !== null ? [hour.temperatureC] : [],
        isForecast: hour.isForecast,
      });
    }
  }

  return byDate;
}

/**
 * Build the season progress array: cumulative degree-days and PAM per day.
 *
 * Degree-days are calculated as: per hour, max(0, T_hour) / 24
 * accumulated over each day from biofix onwards.
 *
 * @param hourlyData - Hourly weather data array (must include data from biofix onwards)
 * @param biofixDate - The "groene punt" date (YYYY-MM-DD)
 * @returns Array of daily season progress entries
 */
export function buildSeasonProgress(
  hourlyData: HourlyWeatherInput[],
  biofixDate: string
): SeasonProgressEntry[] {
  // Filter data from biofix onwards
  const biofixTime = new Date(biofixDate + 'T00:00:00').getTime();
  const relevantData = hourlyData.filter(
    (h) => h.timestamp.getTime() >= biofixTime
  );

  if (relevantData.length === 0) return [];

  const byDate = groupByDate(relevantData);

  // Sort dates chronologically
  const sortedDates = [...byDate.keys()].sort();

  let cumulativeDD = 0;
  const progress: SeasonProgressEntry[] = [];

  for (const dateStr of sortedDates) {
    // Only include dates from biofix onwards
    if (dateStr < biofixDate) continue;

    const day = byDate.get(dateStr)!;

    // Calculate daily degree-days from average temperature
    let dailyDD = 0;
    if (day.temps.length > 0) {
      const avgTemp =
        day.temps.reduce((sum, t) => sum + t, 0) / day.temps.length;
      dailyDD = Math.max(0, avgTemp);
    }

    cumulativeDD += dailyDD;

    progress.push({
      date: dateStr,
      dailyDD: Math.round(dailyDD * 10) / 10,
      cumulativeDD: Math.round(cumulativeDD * 10) / 10,
      pam: Math.round(calculatePAM(cumulativeDD) * 1000) / 1000,
      isForecast: day.isForecast,
    });
  }

  return progress;
}
