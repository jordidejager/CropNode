/**
 * Wet Period Detection (part of Submodel 2)
 *
 * Detects periods of leaf wetness from hourly weather data.
 * A wet period is critical for apple scab infection — ascospores need
 * continuous moisture to germinate and infect.
 *
 * Spore discharge primarily requires rain, but very light drizzle
 * (even < 0.2mm/h) or heavy dew can trigger discharge. In practice,
 * we use a low rain threshold and also allow high-humidity starts
 * because Open-Meteo grid data under-reports light precipitation.
 *
 * Detection rules:
 * - Start: precipitation > 0mm OR relative humidity ≥ 90%
 * - Continuation: RH ≥ 85% or precipitation > 0 or leaf wetness ≥ 50%
 * - End: RH < 80% for ≥ 4 consecutive hours
 * - Minimum duration: 4 hours (shorter periods rarely cause infection)
 * - Must contain at least 1 hour of rain (for spore discharge)
 */

import type { HourlyWeatherInput, WetPeriod } from '../types';

const START_RH_THRESHOLD = 90; // % — high enough to start a wet period
const WET_RH_THRESHOLD = 85; // % — keeps leaf surface wet (continuation)
const DRY_RH_THRESHOLD = 80; // % — below this, leaf dries
const LEAF_WETNESS_THRESHOLD = 50; // %
const DRY_HOURS_TO_END = 4; // consecutive dry hours to end a period
const MIN_WET_DURATION = 4; // minimum hours for a meaningful infection event

/**
 * Check if an hour can START a new wet period.
 * More sensitive than continuation — we want to catch the beginning.
 */
function canStartWetPeriod(hour: HourlyWeatherInput): boolean {
  // Any precipitation starts a wet period
  if (hour.precipitationMm !== null && hour.precipitationMm > 0) {
    return true;
  }
  // Very high humidity (dew formation)
  if (hour.humidityPct !== null && hour.humidityPct >= START_RH_THRESHOLD) {
    return true;
  }
  // Direct leaf wetness sensor
  if (
    hour.leafWetnessPct !== null &&
    hour.leafWetnessPct >= LEAF_WETNESS_THRESHOLD
  ) {
    return true;
  }
  return false;
}

/**
 * Determine if a single hour keeps the leaf surface wet.
 * Used to CONTINUE an existing wet period.
 */
function isHourWet(hour: HourlyWeatherInput): boolean {
  if (hour.precipitationMm !== null && hour.precipitationMm > 0) {
    return true;
  }
  if (
    hour.leafWetnessPct !== null &&
    hour.leafWetnessPct >= LEAF_WETNESS_THRESHOLD
  ) {
    return true;
  }
  if (hour.humidityPct !== null && hour.humidityPct >= WET_RH_THRESHOLD) {
    return true;
  }
  return false;
}

/**
 * Check if an hour has rain (important for spore discharge).
 */
function hasRain(hour: HourlyWeatherInput): boolean {
  return hour.precipitationMm !== null && hour.precipitationMm > 0;
}

/**
 * Detect all infection-relevant wet periods from hourly weather data.
 *
 * @param hourlyData - Array of hourly weather data, sorted by timestamp
 * @returns Array of detected wet periods that contain at least some rain
 */
export function detectWetPeriods(
  hourlyData: HourlyWeatherInput[]
): WetPeriod[] {
  if (hourlyData.length === 0) return [];

  // Ensure chronological order
  const sorted = [...hourlyData].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  const periods: WetPeriod[] = [];
  let currentPeriod: {
    startIndex: number;
    lastWetIndex: number;
    dryCount: number;
  } | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const hour = sorted[i];

    if (currentPeriod === null) {
      // Not in a wet period — check if this hour starts one
      if (canStartWetPeriod(hour)) {
        currentPeriod = { startIndex: i, lastWetIndex: i, dryCount: 0 };
      }
    } else {
      // In a wet period — continue if still wet
      const wet = isHourWet(hour);

      if (wet) {
        currentPeriod.lastWetIndex = i;
        currentPeriod.dryCount = 0;
      } else {
        const isDry =
          hour.humidityPct !== null && hour.humidityPct < DRY_RH_THRESHOLD;

        if (isDry) {
          currentPeriod.dryCount++;
        }

        if (currentPeriod.dryCount >= DRY_HOURS_TO_END) {
          const period = buildWetPeriod(
            sorted,
            currentPeriod.startIndex,
            currentPeriod.lastWetIndex
          );
          if (period) periods.push(period);
          currentPeriod = null;
        }
      }
    }
  }

  // Close any remaining open wet period
  if (currentPeriod !== null) {
    const period = buildWetPeriod(
      sorted,
      currentPeriod.startIndex,
      currentPeriod.lastWetIndex
    );
    if (period) periods.push(period);
  }

  // Filter: only keep periods that had at least one hour of rain
  // (rain is needed for spore discharge — pure dew periods don't cause primary infection)
  return periods.filter((p) => p.hasRain);
}

/**
 * Build a WetPeriod from a range of hourly data.
 */
function buildWetPeriod(
  data: HourlyWeatherInput[],
  startIndex: number,
  endIndex: number
): WetPeriod | null {
  if (endIndex < startIndex) return null;

  const periodHours = data.slice(startIndex, endIndex + 1);
  const durationHours = periodHours.length;

  // Minimum duration for a meaningful infection event
  if (durationHours < MIN_WET_DURATION) return null;

  // Calculate averages
  const temps = periodHours
    .map((h) => h.temperatureC)
    .filter((t): t is number => t !== null);
  const humidities = periodHours
    .map((h) => h.humidityPct)
    .filter((h): h is number => h !== null);
  const precip = periodHours
    .map((h) => h.precipitationMm ?? 0)
    .reduce((sum, p) => sum + p, 0);

  if (temps.length === 0) return null;

  const avgTemp = temps.reduce((sum, t) => sum + t, 0) / temps.length;
  const avgHumidity =
    humidities.length > 0
      ? humidities.reduce((sum, h) => sum + h, 0) / humidities.length
      : 0;

  // Check if any hour had rain
  const hadRain = periodHours.some(hasRain);

  const isForecast = periodHours.some((h) => h.isForecast);

  return {
    start: data[startIndex].timestamp,
    end: data[endIndex].timestamp,
    durationHours,
    avgTemperature: Math.round(avgTemp * 10) / 10,
    avgHumidity: Math.round(avgHumidity * 10) / 10,
    totalPrecipitation: Math.round(precip * 10) / 10,
    hasRain: hadRain,
    isForecast,
  };
}
