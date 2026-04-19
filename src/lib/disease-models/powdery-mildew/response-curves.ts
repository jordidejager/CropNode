/**
 * Response curves for P. leucotricha infection favorability.
 *
 * These convert hourly weather conditions into an "infection favorability score"
 * (0-1) that accumulates over time into infection events.
 *
 * Xu 1999 modelled colony growth as a bell-curve around 22°C.
 * We extend this to infection favorability by combining:
 *   T-response × RH-response × rain-suppression
 */

import { MILDEW_CONSTANTS as C } from './types';

// ============================================================
// Saturation vapor pressure (Tetens formula, kPa)
// ============================================================

function saturationVaporPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/**
 * Compute Vapor Pressure Deficit (kPa) from temperature and humidity.
 * Low VPD (saturated air) favors mildew; high VPD (dry air) suppresses it.
 */
export function calculateVPD(tempC: number, humidityPct: number): number {
  const satVP = saturationVaporPressure(tempC);
  const actualVP = satVP * (humidityPct / 100);
  return Math.max(0, satVP - actualVP);
}

// ============================================================
// Temperature response (Xu 1999 bell curve)
// ============================================================

/**
 * Temperature favorability score (0-1) based on Xu 1999 bell curve.
 * Optimum at 22°C, zero below 10°C or above 30°C.
 */
export function temperatureResponse(tempC: number): number {
  if (tempC < C.TEMP_MIN || tempC > C.TEMP_MAX) return 0;

  // Gaussian bell curve
  const diff = tempC - C.TEMP_OPT;
  return Math.exp(-0.5 * Math.pow(diff / C.TEMP_SD, 2));
}

// ============================================================
// Humidity response (NOT a Mills-curve; opposite behaviour)
// ============================================================

/**
 * RH favorability (0-1):
 * - below 70%: 0 (too dry for spore germination)
 * - 70-90%: linear ramp 0→1
 * - >90%: 1 (saturated but not wet)
 *
 * Note: leaf wetness/liquid water actually suppresses mildew!
 * That's handled separately below.
 */
export function humidityResponse(humidityPct: number): number {
  if (humidityPct < C.RH_INFECTION_MIN) return 0;
  if (humidityPct >= C.RH_INFECTION_OPT) return 1;

  const range = C.RH_INFECTION_OPT - C.RH_INFECTION_MIN;
  return (humidityPct - C.RH_INFECTION_MIN) / range;
}

// ============================================================
// Rain suppression
// ============================================================

/**
 * Rain suppression factor (0-1):
 * - 1.0 = no recent rain → full infection possible
 * - 0.5 = recent light rain → halved
 * - 0.1 = heavy rain / leaves wet → largely suppressed
 *
 * @param minutesSinceRain - elapsed minutes since last rain
 * @param recentRainMm24h - total rain in last 24h
 * @param leafWet - whether leaf is currently wet (from sensor or RH+rain)
 */
export function rainSuppressionFactor(
  minutesSinceRain: number,
  recentRainMm24h: number,
  leafWet: boolean
): number {
  // If leaf currently wet: strong suppression (water kills spores)
  if (leafWet) return C.LEAF_WETNESS_PENALTY;

  // If strong rain in last 24h: spores washed off
  if (recentRainMm24h >= C.RAIN_WASH_MM) return 0.3;

  // If rain in last 4h: halved
  if (minutesSinceRain < C.RAIN_SUPPRESSION_HOURS * 60) return 0.5;

  return 1.0;
}

// ============================================================
// Combined hourly favorability score
// ============================================================

/**
 * Combine all factors into a single favorability score (0-1) for one hour.
 * This is what accumulates to drive infection.
 */
export function hourlyFavorabilityScore(params: {
  tempC: number;
  humidityPct: number;
  minutesSinceRain: number;
  recentRainMm24h: number;
  leafWet: boolean;
}): number {
  const T = temperatureResponse(params.tempC);
  const RH = humidityResponse(params.humidityPct);
  const rainFactor = rainSuppressionFactor(
    params.minutesSinceRain,
    params.recentRainMm24h,
    params.leafWet
  );

  return T * RH * rainFactor;
}

// ============================================================
// Severity classification
// ============================================================

/**
 * Map accumulated favorability (in "favorability-hours") to severity class.
 * Favorability-hours = sum of hourly scores where conditions were favorable.
 *
 * Under perfect conditions (T=22, RH=90, no rain): 1.0 per hour.
 * 6 hours perfect = light infection.
 * 12 hours = moderate.
 * 24 hours = severe.
 */
export function classifyMildewSeverity(
  accumulatedFavorabilityHours: number
): 'none' | 'light' | 'moderate' | 'severe' {
  if (accumulatedFavorabilityHours < C.MIN_INFECTION_HOURS) return 'none';
  if (accumulatedFavorabilityHours < C.MODERATE_INFECTION_HOURS) return 'light';
  if (accumulatedFavorabilityHours < C.SEVERE_INFECTION_HOURS) return 'moderate';
  return 'severe';
}

// ============================================================
// Incubation period (Xu 1996)
// ============================================================

/**
 * Days from infection to visible symptoms.
 * Based on Xu 1996: 3-12 days across 8-30°C range, optimum ~23°C.
 */
export function incubationDays(avgTempC: number): number {
  if (avgTempC < 8) return 12;
  if (avgTempC > 30) return 12;
  // Non-linear: optimum ~23°C gives ~3 days
  const optTemp = 23;
  const minDays = C.INCUBATION_MIN_DAYS;
  const maxDays = C.INCUBATION_MAX_DAYS;

  // Parabolic: slower at extremes, fast at optimum
  const diff = Math.abs(avgTempC - optTemp);
  const normalizedDiff = Math.min(1, diff / 15);
  return Math.round(minDays + (maxDays - minDays) * Math.pow(normalizedDiff, 1.5));
}
