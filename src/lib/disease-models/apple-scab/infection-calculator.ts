/**
 * Infection Calculator (combines all submodels)
 *
 * For each detected wet period:
 * 1. Look up Mills severity (temp × duration → infection potential)
 * 2. Determine PAM at the time of the event (spore availability)
 * 3. Calculate RIM value = infection_fraction × PAM × 1000 (magnitude)
 * 4. Estimate symptom date via incubation model
 *
 * Key design: Mills severity is the PRIMARY indicator — it determines
 * whether conditions allowed infection. RIM is a SECONDARY magnitude
 * metric that scales the impact by spore availability (PAM).
 *
 * This matches RIMpro behavior: even early-season events with low PAM
 * show up as infection events (just with smaller RIM bars), because
 * the infection conditions WERE met — the teler needs to know.
 */

import type {
  WetPeriod,
  SeasonProgressEntry,
  InfectionPeriod,
} from '../types';
import {
  lookupMillsSeverity,
  calculateInfectionFraction,
} from './mills-table';
import { estimateSymptomDate } from './incubation';

/**
 * Format a Date as ISO string.
 */
function toISO(d: Date): string {
  return d.toISOString();
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Find the PAM value for a given date from the season progress array.
 * Uses the closest date on or before the given date.
 */
function getPAMAtDate(
  seasonProgress: SeasonProgressEntry[],
  date: Date
): { pam: number; cumulativeDD: number } {
  const dateStr = toDateStr(date);

  let best: SeasonProgressEntry | null = null;
  for (const entry of seasonProgress) {
    if (entry.date <= dateStr) {
      if (!best || entry.date > best.date) {
        best = entry;
      }
    }
  }

  return best
    ? { pam: best.pam, cumulativeDD: best.cumulativeDD }
    : { pam: 0, cumulativeDD: 0 };
}

/**
 * Evaluate all wet periods for infection risk.
 *
 * Returns all periods where Mills conditions are met (infection possible).
 * Severity is from Mills table directly. RIM scales the magnitude by PAM.
 *
 * @param wetPeriods - Detected wet periods from weather data
 * @param seasonProgress - Daily PAM/DD progression
 * @param biofixDate - The biofix date (YYYY-MM-DD)
 * @returns Array of infection periods with Mills-based severity and RIM magnitude
 */
export function evaluateInfections(
  wetPeriods: WetPeriod[],
  seasonProgress: SeasonProgressEntry[],
  biofixDate: string
): InfectionPeriod[] {
  const biofixTime = new Date(biofixDate + 'T00:00:00').getTime();

  // Only consider wet periods after biofix
  const relevantPeriods = wetPeriods.filter(
    (wp) => wp.start.getTime() >= biofixTime
  );

  // Sort chronologically
  relevantPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());

  const infections: InfectionPeriod[] = [];

  for (const wp of relevantPeriods) {
    // Mills severity: primary indicator — did conditions allow infection?
    const severity = lookupMillsSeverity(
      wp.avgTemperature,
      wp.durationHours
    );

    // Skip if Mills says no infection possible at this temp/duration
    if (severity === 'none') continue;

    const { pam: pamAtEvent, cumulativeDD } = getPAMAtDate(
      seasonProgress,
      wp.start
    );

    // RIM value: magnitude metric — how much infection, considering spore availability
    // Uses absolute PAM (total mature spores available), not delta
    const infectionFraction = calculateInfectionFraction(
      wp.avgTemperature,
      wp.durationHours
    );
    const rimValue = Math.round(infectionFraction * pamAtEvent * 1000);

    // Estimate symptom date
    const expectedSymptomDate = estimateSymptomDate(
      wp.start,
      wp.avgTemperature
    );

    infections.push({
      wetPeriodStart: toISO(wp.start),
      wetPeriodEnd: toISO(wp.end),
      durationHours: wp.durationHours,
      avgTemperature: wp.avgTemperature,
      severity,
      rimValue,
      pamAtEvent,
      degreeDaysCumulative: cumulativeDD,
      expectedSymptomDate,
      isForecast: wp.isForecast,
    });
  }

  return infections;
}
