/**
 * Incubation Period Model (Submodel 3)
 *
 * Predicts when symptoms (lesions) will become visible after a successful infection.
 * Based on degree-day accumulation post-infection.
 *
 * Rule of thumb: incubation ≈ 230 / T_avg_daily
 * - At 10°C: ~23 days
 * - At 15°C: ~15 days
 * - At 20°C: ~11 days
 * - At 25°C: ~9 days
 */

const INCUBATION_DEGREE_DAYS = 230;
const MIN_INCUBATION_DAYS = 7;
const MAX_INCUBATION_DAYS = 60;

/**
 * Estimate the number of days until symptoms appear after infection.
 *
 * @param avgDailyTemp - Average daily temperature (°C) expected after infection
 * @returns Estimated number of days until symptom appearance
 */
export function calculateIncubationDays(avgDailyTemp: number): number {
  if (avgDailyTemp <= 0) return MAX_INCUBATION_DAYS;

  const days = Math.round(INCUBATION_DEGREE_DAYS / avgDailyTemp);
  return Math.max(MIN_INCUBATION_DAYS, Math.min(MAX_INCUBATION_DAYS, days));
}

/**
 * Estimate the date when symptoms will first appear.
 *
 * @param infectionDate - The date of infection (wet period start)
 * @param avgDailyTemp - Average daily temperature expected after infection
 * @returns Estimated symptom appearance date as YYYY-MM-DD string
 */
export function estimateSymptomDate(
  infectionDate: Date,
  avgDailyTemp: number
): string {
  const days = calculateIncubationDays(avgDailyTemp);
  const symptomDate = new Date(infectionDate);
  symptomDate.setDate(symptomDate.getDate() + days);

  const y = symptomDate.getFullYear();
  const m = String(symptomDate.getMonth() + 1).padStart(2, '0');
  const d = String(symptomDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
