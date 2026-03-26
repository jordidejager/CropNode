/**
 * Harvest Year (Oogstjaar) utilities for CropNode Analytics.
 *
 * In fruit cultivation, costs and revenues do NOT align within a calendar year:
 * - Pruning (Nov/Dec) = cost for NEXT year's harvest
 * - Spraying (Feb-Aug) = cost for THIS year's harvest
 * - Harvest (Sep/Oct) = THIS year's harvest
 * - Cold storage sales (Nov-May next year) = revenue for THIS year's harvest
 *
 * The harvest_year field is the single source of truth.
 */

/**
 * Suggest the harvest year for a given registration date.
 * - Jan-Oct → current year (working on this year's harvest)
 * - Nov-Dec → next year (preparation for next harvest)
 */
export function suggestHarvestYear(registrationDate: Date): number {
  const month = registrationDate.getMonth() + 1; // 1-12
  const year = registrationDate.getFullYear();
  if (month >= 11) return year + 1; // nov-dec → next harvest year
  return year; // jan-oct → current harvest year
}

/**
 * Get a list of harvest years that have data, by querying distinct values.
 * Returns sorted descending (most recent first).
 */
export function getHarvestYearOptions(harvestYears: number[]): number[] {
  const unique = [...new Set(harvestYears)].filter(Boolean);
  return unique.sort((a, b) => b - a);
}

/**
 * Format harvest year for display: "Oogst 2026"
 */
export function formatHarvestYear(year: number): string {
  return `Oogst ${year}`;
}

/**
 * Get the current default harvest year based on today's date.
 */
export function getCurrentHarvestYear(): number {
  return suggestHarvestYear(new Date());
}
