/**
 * Pear scab (Venturia pirina) simulation.
 *
 * Structurally identical to apple scab v2 (30-min steps, age-class cohorts,
 * ascospore discharge + germination dynamics) but with pear-specific:
 * - Spotts-Cervantes Mills-like table
 * - Higher night discharge tolerance (17.5% vs 5%)
 * - Villalta DDwet threshold (268.5) for first discharge
 * - Higher Tsum for 50% PAM (280 vs 250)
 *
 * This is our "RIMpro pear scab" equivalent — uses same scientific concepts.
 */

import type { InoculumPressure } from '../types';
import { PEAR_SCAB_CONSTANTS as PC } from './constants';
import {
  lookupPearScabSeverity,
  calculatePearScabInfectionFraction,
  type PearScabSeverity,
} from './spotts-table';
import { getSunTimes } from '../apple-scab-v2/astronomy';
import { buildWeatherSteps } from '../apple-scab-v2/weather-stepper';
import type {
  HourlyWeatherStep,
  WeatherStep30Min,
  GerminatingCohort,
} from '../apple-scab-v2/types';

// ============================================================
// Types specific to pear scab output
// ============================================================

export interface PearScabInput {
  biofixDate: Date;
  endDate: Date;
  latitude: number;
  longitude: number;
  inoculumPressure?: InoculumPressure;
  hourlyWeather: HourlyWeatherStep[];
}

export interface PearScabInfectionEvent {
  wetPeriodStart: Date;
  infectionCompleted: Date;
  wetDurationHours: number;
  avgTemperature: number;
  totalPrecipitation: number;
  severity: PearScabSeverity;
  rimValue: number;
  pamAtStart: number;
  expectedSymptomDate: Date | null;
  isForecast: boolean;
}

export interface PearScabDailyEntry {
  date: string;
  dailyRIM: number;
  cumulativeRIM: number;
  pam: number;
  cumulativeDD: number;
  isForecast: boolean;
}

export interface PearScabResult {
  infections: PearScabInfectionEvent[];
  seasonalRIM: number;
  dailyProgress: PearScabDailyEntry[];
  biofixDate: Date;
  finalPAM: number;
}

// ============================================================
// Helpers
// ============================================================

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function estimateSymptomDate(infectionTime: Date, avgTemp: number): Date {
  // Pear scab incubation: similar to apple scab (~230/T days)
  const days = Math.max(7, Math.min(60, 230 / Math.max(1, avgTemp)));
  return new Date(infectionTime.getTime() + days * 24 * 3600 * 1000);
}

// ============================================================
// Submodel: Maturation (PAM)
// ============================================================

function maturationIncrement(cumulativeDDwet: number, ddStep: number): number {
  // Logistic curve centered at Tsum_50 = 280 for pear
  const k = 0.02;
  const DD50 = PC.TSUM_FOR_50_PCT_MATURATION;
  const pamBefore = 1 / (1 + Math.exp(-k * (cumulativeDDwet - DD50)));
  const pamAfter = 1 / (1 + Math.exp(-k * (cumulativeDDwet + ddStep - DD50)));
  return Math.max(0, pamAfter - pamBefore);
}

// ============================================================
// Submodel: Discharge
// ============================================================

function dischargeRate(
  step: WeatherStep30Min,
  isDaytime: boolean,
  minutesSinceRain: number,
  cumulativeDDwet: number
): number {
  // Block any discharge before DDwet threshold (Villalta 2001)
  if (cumulativeDDwet < PC.DDWET_FIRST_DISCHARGE) return 0;

  const hasTrigger =
    step.precipitationMm > PC.RAIN_TRIGGER_MM ||
    minutesSinceRain <= PC.DISCHARGE_STOP_AFTER_RAIN_MIN;
  if (!hasTrigger) return 0;

  const temp = step.temperatureC;
  let baseRate: number;
  if (temp < 4) baseRate = 0.05;
  else if (temp < 8) baseRate = 0.15;
  else if (temp < 12) baseRate = 0.22;
  else baseRate = 0.28;

  const rainMultiplier = Math.min(2, 1 + step.precipitationMm);
  const lightFactor = isDaytime ? 1.0 : PC.NIGHT_DISCHARGE_FRACTION;

  return Math.min(0.9, baseRate * rainMultiplier * lightFactor);
}

// ============================================================
// Submodel: Germination & infection completion
// ============================================================

function advanceCohort(
  cohort: GerminatingCohort,
  step: WeatherStep30Min,
  isWet: boolean
): GerminatingCohort | null {
  const deltaHours = 0.5;
  const temp = step.temperatureC;
  const prevWetHours = cohort.wetHoursAccumulated;
  const wetHoursNew = isWet ? prevWetHours + deltaHours : prevWetHours;

  const avgTemp = isWet
    ? (cohort.avgTempExposed * prevWetHours + temp * deltaHours) / wetHoursNew
    : cohort.avgTempExposed;

  const dryHours = isWet ? 0 : cohort.dryHoursSinceWet + deltaHours;
  const survivalLimit =
    wetHoursNew > 0
      ? PC.GERMINATED_SURVIVAL_HOURS
      : PC.UNGERMINATED_SURVIVAL_HOURS;

  if (dryHours > survivalLimit) return null;

  return {
    ...cohort,
    wetHoursAccumulated: wetHoursNew,
    dryHoursSinceWet: dryHours,
    avgTempExposed: avgTemp,
    totalExposureHours: cohort.totalExposureHours + deltaHours,
  };
}

function cohortInfectionCompleted(cohort: GerminatingCohort): boolean {
  if (cohort.wetHoursAccumulated <= 0) return false;
  const severity = lookupPearScabSeverity(
    cohort.avgTempExposed,
    cohort.wetHoursAccumulated,
    'ascospore'
  );
  return severity !== 'none';
}

// ============================================================
// Main simulation
// ============================================================

export function runPearScabSimulation(input: PearScabInput): PearScabResult {
  const steps = buildWeatherSteps(
    input.hourlyWeather,
    input.biofixDate,
    input.endDate
  );

  if (steps.length === 0) {
    return {
      infections: [],
      seasonalRIM: 0,
      dailyProgress: [],
      biofixDate: input.biofixDate,
      finalPAM: 0,
    };
  }

  const inoculumMult =
    input.inoculumPressure === 'low'
      ? 0.5
      : input.inoculumPressure === 'high'
      ? 1.5
      : 1.0;
  const initialInoculum = PC.INITIAL_INOCULUM * inoculumMult;

  // State
  let immature = initialInoculum;
  let maturePool = 0;
  let cumulativeDDwet = 0;
  let cumulativeInfected = 0;
  let consecutiveDryDays = 0;
  let germinating: GerminatingCohort[] = [];
  let minutesSinceRain = Infinity;
  let lastDayKey = -1;
  let dailyHadRain = false;

  const infections: PearScabInfectionEvent[] = [];
  const dailyMap = new Map<
    string,
    { rim: number; pam: number; dd: number; isForecast: boolean }
  >();

  for (const step of steps) {
    const dayKey = Math.floor(step.timestamp.getTime() / 86_400_000);
    const isNewDay = dayKey !== lastDayKey;

    if (isNewDay && lastDayKey >= 0) {
      if (!dailyHadRain) consecutiveDryDays++;
      else consecutiveDryDays = 0;
    }
    if (isNewDay) {
      lastDayKey = dayKey;
      dailyHadRain = false;
    }

    const isRaining = step.precipitationMm > PC.RAIN_TRIGGER_MM;
    const isWet =
      isRaining ||
      step.humidityPct >= PC.WET_RH_THRESHOLD ||
      (step.leafWetnessPct !== null && step.leafWetnessPct >= 50);

    if (isRaining) {
      minutesSinceRain = 0;
      dailyHadRain = true;
    } else {
      minutesSinceRain += PC.TIMESTEP_MINUTES;
    }

    // Daylight check
    const sun = getSunTimes(step.timestamp, input.latitude, input.longitude);
    let isDaytime = true;
    if (sun) {
      const effectiveSunrise = new Date(
        sun.sunrise.getTime() + PC.SUNRISE_OFFSET_MINUTES * 60 * 1000
      );
      isDaytime =
        step.timestamp.getTime() >= effectiveSunrise.getTime() &&
        step.timestamp.getTime() < sun.sunset.getTime();
    }

    // Maturation (wet-hour DDs only, per Rossi/Villalta)
    const maturationActive = consecutiveDryDays < PC.MATURATION_DRY_DAYS_STOP;
    if (
      maturationActive &&
      step.temperatureC > PC.BASE_TEMP_MATURATION &&
      isWet
    ) {
      const ddStep =
        Math.max(0, step.temperatureC - PC.BASE_TEMP_MATURATION) *
        (PC.TIMESTEP_MINUTES / 1440);
      cumulativeDDwet += ddStep;
      const matInc = maturationIncrement(cumulativeDDwet - ddStep, ddStep);
      const newlyMature = immature * matInc;
      immature -= newlyMature;
      maturePool += newlyMature;
    }

    // Discharge
    if (maturePool > 0 && isRaining) {
      const dischargeFraction = dischargeRate(
        step,
        isDaytime,
        minutesSinceRain,
        cumulativeDDwet
      );
      const discharged = maturePool * dischargeFraction;
      maturePool -= discharged;
      if (discharged > 0.01) {
        germinating.push({
          dischargeTime: step.timestamp,
          count: discharged,
          wetHoursAccumulated: 0,
          dryHoursSinceWet: 0,
          avgTempExposed: step.temperatureC,
          totalExposureHours: 0,
        });
      }
    }

    // Advance cohorts
    const surviving: GerminatingCohort[] = [];
    let stepInfectedCount = 0;
    let stepInfectionStart: Date | null = null;
    let stepInfectionWetHours = 0;
    let stepInfectionAvgTemp = 0;

    for (const cohort of germinating) {
      const advanced = advanceCohort(cohort, step, isWet);
      if (!advanced) continue;
      if (cohortInfectionCompleted(advanced)) {
        stepInfectedCount += advanced.count;
        cumulativeInfected += advanced.count;
        if (!stepInfectionStart) {
          stepInfectionStart = advanced.dischargeTime;
          stepInfectionWetHours = advanced.wetHoursAccumulated;
          stepInfectionAvgTemp = advanced.avgTempExposed;
        }
      } else {
        surviving.push(advanced);
      }
    }
    germinating = surviving;

    if (stepInfectedCount > 0 && stepInfectionStart) {
      const fraction = calculatePearScabInfectionFraction(
        stepInfectionAvgTemp,
        stepInfectionWetHours,
        'ascospore'
      );
      const eventRIM = Math.round(
        (stepInfectedCount / initialInoculum) * 10_000 * fraction
      );
      const pamAtStart = (initialInoculum - immature) / initialInoculum;
      const severity = lookupPearScabSeverity(
        stepInfectionAvgTemp,
        stepInfectionWetHours,
        'ascospore'
      );

      infections.push({
        wetPeriodStart: stepInfectionStart,
        infectionCompleted: step.timestamp,
        wetDurationHours: stepInfectionWetHours,
        avgTemperature: Math.round(stepInfectionAvgTemp * 10) / 10,
        totalPrecipitation: 0, // not tracked per-event
        severity,
        rimValue: eventRIM,
        pamAtStart,
        expectedSymptomDate: estimateSymptomDate(
          stepInfectionStart,
          stepInfectionAvgTemp
        ),
        isForecast: step.isForecast,
      });

      const dateKey = toDateStr(stepInfectionStart);
      const prev = dailyMap.get(dateKey) ?? {
        rim: 0,
        pam: 0,
        dd: 0,
        isForecast: false,
      };
      dailyMap.set(dateKey, {
        rim: prev.rim + eventRIM,
        pam: (initialInoculum - immature) / initialInoculum,
        dd: cumulativeDDwet,
        isForecast: prev.isForecast || step.isForecast,
      });
    }

    // Update daily snapshot (even without infection)
    const dateKey = toDateStr(step.timestamp);
    const existing = dailyMap.get(dateKey);
    dailyMap.set(dateKey, {
      rim: existing?.rim ?? 0,
      pam: (initialInoculum - immature) / initialInoculum,
      dd: cumulativeDDwet,
      isForecast: existing?.isForecast || step.isForecast,
    });
  }

  // Build daily progress array
  const dailyProgress: PearScabDailyEntry[] = [];
  let cumulative = 0;
  const sortedDates = Array.from(dailyMap.keys()).sort();
  for (const dateKey of sortedDates) {
    const entry = dailyMap.get(dateKey)!;
    cumulative += entry.rim;
    dailyProgress.push({
      date: dateKey,
      dailyRIM: entry.rim,
      cumulativeRIM: cumulative,
      pam: entry.pam,
      cumulativeDD: entry.dd,
      isForecast: entry.isForecast,
    });
  }

  const finalPAM = (initialInoculum - immature) / initialInoculum;
  const seasonalRIM = Math.round(
    (cumulativeInfected / initialInoculum) * 10_000
  );

  return {
    infections,
    seasonalRIM,
    dailyProgress,
    biofixDate: input.biofixDate,
    finalPAM,
  };
}
