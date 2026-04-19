/**
 * Black Rot (Botryosphaeria obtusa) — infection simulation
 *
 * Model approach: simpler than apple scab because:
 * - No PAM / ascospore maturation (inoculum is continuous from cankers/mummies)
 * - No age-class boxcar trains
 * - 1-hour timestep is sufficient
 *
 * Key mechanisms:
 * - Spores splashed during rain events (assumed constantly available)
 * - Wet period starts, germination begins on leaves
 * - If dry period >= 1 hour → cohort dies (Arauz-Sutton 1990)
 * - Infection completed when wet hours >= threshold from Arauz-Sutton 1989
 * - Severity classified by wet duration relative to thresholds
 *
 * Season: active from petal fall (biofix) through harvest (~October).
 * Unlike apple scab, this runs all summer.
 */

import type { InoculumPressure } from '../types';
import {
  lookupArauzSuttonSeverity,
  calculateBlackRotInfectionFraction,
  type BlackRotSeverity,
} from './arauz-sutton-table';

// ============================================================
// Config
// ============================================================

const WET_RH_THRESHOLD = 85; // % RH — leaf considered wet above this
const RAIN_TRIGGER_MM = 0.2; // mm per hour — rain event
const MAX_DRY_INTERRUPTION_HOURS = 1; // >= 1 hour dry = cohort dies (Arauz-Sutton 1990)
const MIN_WET_FOR_INFECTION = 4; // hours, below this = no infection regardless of temp

// ============================================================
// Types
// ============================================================

export interface BlackRotInput {
  biofixDate: Date; // usually petal fall
  endDate: Date; // today + 7 days forecast
  latitude: number;
  longitude: number;
  inoculumPressure?: InoculumPressure;
  hourlyWeather: BlackRotWeatherHour[];
}

export interface BlackRotWeatherHour {
  timestamp: Date;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  leafWetnessPct: number | null;
  isForecast: boolean;
}

export interface BlackRotInfectionEvent {
  wetPeriodStart: Date;
  wetPeriodEnd: Date;
  wetDurationHours: number;
  avgTemperature: number;
  totalPrecipitation: number;
  severity: BlackRotSeverity;
  rimValue: number; // scaled 0-10000
  expectedSymptomDate: Date | null; // symptoms often not visible until fruit matures
  isForecast: boolean;
}

export interface BlackRotResult {
  infections: BlackRotInfectionEvent[];
  /** Total cumulative RIM for the season */
  seasonalRIM: number;
  /** Daily progress snapshots (for chart) */
  dailyProgress: BlackRotDailyEntry[];
  biofixDate: Date;
}

export interface BlackRotDailyEntry {
  date: string; // YYYY-MM-DD
  dailyRIM: number;
  cumulativeRIM: number;
  hadInfection: boolean;
  isForecast: boolean;
}

// ============================================================
// Helpers
// ============================================================

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isHourWet(h: BlackRotWeatherHour): boolean {
  if (h.precipitationMm !== null && h.precipitationMm > RAIN_TRIGGER_MM) return true;
  if (h.leafWetnessPct !== null && h.leafWetnessPct >= 50) return true;
  if (h.humidityPct !== null && h.humidityPct >= WET_RH_THRESHOLD) return true;
  return false;
}

function hasRain(h: BlackRotWeatherHour): boolean {
  return h.precipitationMm !== null && h.precipitationMm > RAIN_TRIGGER_MM;
}

function estimateSymptomDate(
  infectionTime: Date,
  avgTemp: number
): Date | null {
  // Black rot incubation is long — often not visible until fruit matures
  // For leaves: 2-4 weeks
  // For fruit: often only visible near harvest
  // Use simple approximation: 300/T days, clamped 14-60
  const days = Math.max(14, Math.min(60, 300 / Math.max(1, avgTemp)));
  return new Date(infectionTime.getTime() + days * 24 * 3600 * 1000);
}

// ============================================================
// Main simulation
// ============================================================

export function runBlackRotSimulation(input: BlackRotInput): BlackRotResult {
  const sorted = [...input.hourlyWeather].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  const biofixMs = input.biofixDate.getTime();
  const endMs = input.endDate.getTime();

  // Only evaluate periods after biofix
  const active = sorted.filter(
    (h) =>
      h.timestamp.getTime() >= biofixMs &&
      h.timestamp.getTime() <= endMs &&
      h.temperatureC !== null &&
      h.humidityPct !== null
  );

  const pressureMultiplier =
    input.inoculumPressure === 'low'
      ? 0.5
      : input.inoculumPressure === 'high'
      ? 1.5
      : 1.0;

  const infections: BlackRotInfectionEvent[] = [];
  const dailyRIM = new Map<string, { rim: number; hadInfection: boolean; isForecast: boolean }>();

  // State: track the current wet cohort
  let wetStartIdx = -1;
  let wetHours = 0;
  let tempSum = 0;
  let tempCount = 0;
  let precipSum = 0;
  let dryHoursCounter = 0;
  let anyRainDuringWet = false;
  let forecastInCohort = false;
  let alreadyReported = false; // prevent double-reporting same wet period

  for (let i = 0; i < active.length; i++) {
    const h = active[i];
    const wet = isHourWet(h);
    const rained = hasRain(h);

    if (wet) {
      // Start or continue wet cohort
      if (wetStartIdx === -1) {
        wetStartIdx = i;
        wetHours = 1;
        tempSum = h.temperatureC!;
        tempCount = 1;
        precipSum = h.precipitationMm ?? 0;
        anyRainDuringWet = rained;
        forecastInCohort = h.isForecast;
        alreadyReported = false;
      } else {
        wetHours += 1;
        tempSum += h.temperatureC!;
        tempCount += 1;
        precipSum += h.precipitationMm ?? 0;
        anyRainDuringWet = anyRainDuringWet || rained;
        forecastInCohort = forecastInCohort || h.isForecast;
      }
      dryHoursCounter = 0;

      // Check infection completion at each hour (progressive)
      if (wetHours >= MIN_WET_FOR_INFECTION && !alreadyReported) {
        const avgT = tempSum / tempCount;
        const severity = lookupArauzSuttonSeverity(avgT, wetHours, 'leaf');

        if (severity !== 'none' && anyRainDuringWet) {
          const fraction = calculateBlackRotInfectionFraction(avgT, wetHours);
          const rim = Math.round(fraction * pressureMultiplier * 10000);
          const wetStart = active[wetStartIdx].timestamp;

          infections.push({
            wetPeriodStart: wetStart,
            wetPeriodEnd: h.timestamp,
            wetDurationHours: wetHours,
            avgTemperature: Math.round(avgT * 10) / 10,
            totalPrecipitation: Math.round(precipSum * 10) / 10,
            severity,
            rimValue: rim,
            expectedSymptomDate: estimateSymptomDate(wetStart, avgT),
            isForecast: forecastInCohort,
          });

          alreadyReported = true; // report once per wet period

          // Aggregate by day
          const dateKey = toDateStr(wetStart);
          const prev = dailyRIM.get(dateKey) ?? {
            rim: 0,
            hadInfection: false,
            isForecast: false,
          };
          dailyRIM.set(dateKey, {
            rim: prev.rim + rim,
            hadInfection: true,
            isForecast: prev.isForecast || forecastInCohort,
          });
        }
      }
    } else {
      // Dry hour
      if (wetStartIdx !== -1) {
        dryHoursCounter += 1;

        // 1 hour dry = cohort dies (Arauz-Sutton 1990)
        if (dryHoursCounter >= MAX_DRY_INTERRUPTION_HOURS) {
          wetStartIdx = -1;
          wetHours = 0;
          tempSum = 0;
          tempCount = 0;
          precipSum = 0;
          anyRainDuringWet = false;
          forecastInCohort = false;
          alreadyReported = false;
        }
      }
    }
  }

  // Build daily progress array
  const dailyProgress: BlackRotDailyEntry[] = [];
  const allDates = new Set<string>();
  for (const h of active) allDates.add(toDateStr(h.timestamp));

  let cumulative = 0;
  for (const dateKey of Array.from(allDates).sort()) {
    const entry = dailyRIM.get(dateKey);
    const daily = entry?.rim ?? 0;
    cumulative += daily;
    dailyProgress.push({
      date: dateKey,
      dailyRIM: daily,
      cumulativeRIM: cumulative,
      hadInfection: entry?.hadInfection ?? false,
      isForecast: entry?.isForecast ?? false,
    });
  }

  return {
    infections,
    seasonalRIM: cumulative,
    dailyProgress,
    biofixDate: input.biofixDate,
  };
}
