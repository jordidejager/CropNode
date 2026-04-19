/**
 * Apple Scab v2 — Core 30-minute simulation engine
 *
 * Implements the full dynamic model with 4 coupled submodels:
 * 1. Ascospore maturation (temperature-driven, rain-interrupted)
 * 2. Spore discharge (rain + daylight)
 * 3. Germination on leaves (temperature-dependent rate, wetness required)
 * 4. Infection completion (Mills-curve threshold per cohort)
 *
 * Based on Trapman 1994/1997 + Rossi 2007 + Philion et al. 2010 parameters.
 */

import type {
  SimulationInput,
  SimulationResult,
  SporeState,
  WeatherStep30Min,
  GerminatingCohort,
  InfectionEvent,
} from './types';
import { SIMULATION_CONSTANTS } from './types';
import { buildWeatherSteps } from './weather-stepper';
import { getSunTimes } from './astronomy';

const C = SIMULATION_CONSTANTS;

// ============================================================
// Helper: Mills-curve lookup with linear interpolation
// ============================================================

/**
 * Hours of continuous wetness required for infection at given temperature.
 * Returns Infinity if temperature is outside range (no infection possible).
 */
function millsHoursRequired(tempC: number): number {
  if (tempC < 2 || tempC > 26) return Infinity;

  const lowT = Math.floor(tempC);
  const highT = Math.ceil(tempC);
  const lowH = C.MILLS_CURVE[lowT];
  const highH = C.MILLS_CURVE[highT];

  if (lowH === undefined || highH === undefined) return Infinity;
  if (lowT === highT) return lowH;

  const frac = tempC - lowT;
  return lowH * (1 - frac) + highH * frac;
}

// ============================================================
// Submodel 1: Ascospore maturation (per 30-min step)
// ============================================================

/**
 * Rate of maturation per 30-min step.
 * Gadoury & MacHardy: dPAM/dDD follows logistic centred at DD=250.
 *
 * We use the CDF difference: dPAM = PAM(DD+delta) - PAM(DD)
 * Simplified slope near center: max rate ~0.004/°C·day = 0.00008/step at peak
 */
function maturationIncrement(
  cumulativeDD: number,
  ddStep: number // DD accumulated in this step
): number {
  // Logistic: PAM = 1 / (1 + exp(-k*(DD - DD50)))
  // With DD50 = 250, k chosen so PAM(100) ≈ 0.02, PAM(400) ≈ 0.98
  const k = 0.02;
  const DD50 = C.TSUM_FOR_50_PCT_MATURATION;

  const pamBefore = 1 / (1 + Math.exp(-k * (cumulativeDD - DD50)));
  const pamAfter =
    1 / (1 + Math.exp(-k * (cumulativeDD + ddStep - DD50)));

  return Math.max(0, pamAfter - pamBefore);
}

// ============================================================
// Submodel 2: Spore discharge
// ============================================================

/**
 * Fraction of mature pool discharged in this 30-min step.
 *
 * Conditions:
 * - Requires rain trigger (>0.2mm per 30-min interval)
 * - OR within 90 min after rain stopped
 * - Reduced to 5% at night
 * - Temperature-dependent rate (higher T = more vigorous discharge)
 */
function dischargeRate(
  step: WeatherStep30Min,
  isDaytime: boolean,
  minutesSinceRain: number
): number {
  const hasTrigger = step.precipitationMm > C.RAIN_TRIGGER_MM ||
    minutesSinceRain <= C.DISCHARGE_STOP_AFTER_RAIN_MIN;

  if (!hasTrigger) return 0;

  // Base rate per 30-min step
  // At peak conditions (warm day, rain): up to ~30% of pool discharges per step
  let baseRate: number;
  const temp = step.temperatureC;
  if (temp < 4) baseRate = 0.05;
  else if (temp < 8) baseRate = 0.15;
  else if (temp < 12) baseRate = 0.22;
  else baseRate = 0.28;

  // Heavy rain = faster discharge
  const rainMultiplier = Math.min(2, 1 + step.precipitationMm);

  // Night inhibition (5% of daytime rate)
  const lightFactor = isDaytime ? 1.0 : C.NIGHT_DISCHARGE_FRACTION;

  return Math.min(0.9, baseRate * rainMultiplier * lightFactor);
}

// ============================================================
// Submodel 3: Germination (on leaf)
// ============================================================

/**
 * Advance a germinating cohort by one 30-min step.
 * Returns updated cohort or null if cohort died (survival exceeded).
 */
function advanceCohort(
  cohort: GerminatingCohort,
  step: WeatherStep30Min,
  isWet: boolean
): GerminatingCohort | null {
  const deltaHours = 0.5; // 30 min = 0.5 hour

  const temp = step.temperatureC;
  // Update cumulative averages
  const prevWetHours = cohort.wetHoursAccumulated;
  const wetHoursNew = isWet
    ? prevWetHours + deltaHours
    : prevWetHours;

  // Weighted average temp over wet hours
  const avgTemp = isWet
    ? (cohort.avgTempExposed * prevWetHours + temp * deltaHours) /
      wetHoursNew
    : cohort.avgTempExposed;

  const dryHours = isWet ? 0 : cohort.dryHoursSinceWet + deltaHours;

  // Survival check: dry for too long → cohort dies
  const survivalLimit = wetHoursNew > 0
    ? C.GERMINATED_SURVIVAL_HOURS // germination started
    : C.UNGERMINATED_SURVIVAL_HOURS; // still dry on leaf

  if (dryHours > survivalLimit) {
    return null; // dead
  }

  return {
    ...cohort,
    wetHoursAccumulated: wetHoursNew,
    dryHoursSinceWet: dryHours,
    avgTempExposed: avgTemp,
    totalExposureHours: cohort.totalExposureHours + deltaHours,
  };
}

/**
 * Check if a cohort has completed infection.
 * Uses Mills-curve threshold based on average temperature during wetness.
 */
function cohortInfectionCompleted(cohort: GerminatingCohort): boolean {
  if (cohort.wetHoursAccumulated <= 0) return false;
  const required = millsHoursRequired(cohort.avgTempExposed);
  return cohort.wetHoursAccumulated >= required;
}

// ============================================================
// Submodel 4: Incubation (symptom date estimation)
// ============================================================

function estimateSymptomDate(
  infectionTime: Date,
  avgTempInfection: number
): Date {
  // Incubation days ≈ 230 / avg daily temp, clamped 7-60
  const days = Math.max(7, Math.min(60, 230 / Math.max(1, avgTempInfection)));
  return new Date(infectionTime.getTime() + days * 24 * 3600 * 1000);
}

// ============================================================
// Severity classification from event-RIM
// ============================================================

function classifySeverity(
  eventRIM: number
): 'none' | 'light' | 'moderate' | 'severe' {
  if (eventRIM >= C.RIM_THRESHOLDS.SEVERE) return 'severe';
  if (eventRIM >= C.RIM_THRESHOLDS.MODERATE) return 'moderate';
  if (eventRIM >= C.RIM_THRESHOLDS.LIGHT) return 'light';
  return 'none';
}

// ============================================================
// Main simulation loop
// ============================================================

export function runSimulation(input: SimulationInput): SimulationResult {
  const steps = buildWeatherSteps(
    input.hourlyWeather,
    input.biofixDate,
    input.endDate
  );

  if (steps.length === 0) {
    return {
      states: [],
      infections: [],
      seasonalRIM: 0,
      finalPAM: 0,
      biofixDate: input.biofixDate,
    };
  }

  // Adjust initial inoculum based on pressure
  const inoculumPressureMultiplier =
    input.inoculumPressure === 'low' ? 0.5 :
    input.inoculumPressure === 'high' ? 1.5 :
    1.0;
  const initialInoculum =
    (input.initialInoculum ?? C.INITIAL_INOCULUM) *
    inoculumPressureMultiplier;

  // Initial state
  const state: SporeState = {
    timestamp: input.biofixDate,
    immature: initialInoculum,
    maturePool: 0,
    cumulativeDischarged: 0,
    germinating: [],
    cumulativeInfected: 0,
    cumulativeDD: 0,
    consecutiveDryDays: 0,
    isWet: false,
    isRaining: false,
    isDaytime: false,
    isForecast: false,
  };

  const states: SporeState[] = [];
  const infections: InfectionEvent[] = [];

  let minutesSinceRain = Infinity;
  let lastDayKey = -1;
  let ddAccumulatedToday = 0;
  let dailyHadRain = false;

  // Track current wet period for reporting
  let currentWetStart: Date | null = null;
  let currentWetHours = 0;
  let currentWetTempSum = 0;
  let currentWetTempCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const dayKey = Math.floor(step.timestamp.getTime() / 86_400_000);
    const isNewDay = dayKey !== lastDayKey;

    // ===== Per-day transitions =====
    if (isNewDay) {
      if (lastDayKey >= 0) {
        // End of previous day — update dry-day counter
        if (!dailyHadRain) {
          state.consecutiveDryDays++;
        } else {
          state.consecutiveDryDays = 0;
        }
      }
      lastDayKey = dayKey;
      ddAccumulatedToday = 0;
      dailyHadRain = false;
    }

    // ===== Determine wet/dry/raining state =====
    const isRaining = step.precipitationMm > C.RAIN_TRIGGER_MM;
    const isWet =
      isRaining ||
      step.humidityPct >= C.WET_RH_THRESHOLD ||
      (step.leafWetnessPct !== null && step.leafWetnessPct >= 50);

    if (isRaining) {
      minutesSinceRain = 0;
      dailyHadRain = true;
    } else {
      minutesSinceRain += C.TIMESTEP_MINUTES;
    }

    // Daylight check
    const isDaytime =
      (() => {
        const sun = getSunTimes(
          step.timestamp,
          input.latitude,
          input.longitude
        );
        if (!sun) return true; // polar fallback
        const effectiveSunrise = new Date(
          sun.sunrise.getTime() + C.SUNRISE_OFFSET_MINUTES * 60 * 1000
        );
        return (
          step.timestamp.getTime() >= effectiveSunrise.getTime() &&
          step.timestamp.getTime() < sun.sunset.getTime()
        );
      })();

    // ===== Submodel 1: Maturation =====
    // Only accumulate DD if we haven't hit the dry-day cutoff
    const maturationActive =
      state.consecutiveDryDays < C.MATURATION_DRY_DAYS_STOP;

    if (maturationActive && step.temperatureC > C.BASE_TEMP_MATURATION) {
      const ddStep =
        Math.max(0, step.temperatureC - C.BASE_TEMP_MATURATION) *
        (C.TIMESTEP_MINUTES / 1440); // convert to day fraction

      state.cumulativeDD += ddStep;
      ddAccumulatedToday += ddStep;

      // Advance maturation
      const matInc = maturationIncrement(
        state.cumulativeDD - ddStep,
        ddStep
      );
      const newlyMature = state.immature * matInc;

      state.immature -= newlyMature;
      state.maturePool += newlyMature;
    }

    // ===== Submodel 2: Discharge =====
    if (state.maturePool > 0 && isRaining) {
      const dischargeFraction = dischargeRate(
        step,
        isDaytime,
        minutesSinceRain
      );
      const discharged = state.maturePool * dischargeFraction;

      state.maturePool -= discharged;
      state.cumulativeDischarged += discharged;

      // Add to germinating cohorts
      if (discharged > 0.01) {
        state.germinating.push({
          dischargeTime: step.timestamp,
          count: discharged,
          wetHoursAccumulated: 0,
          dryHoursSinceWet: 0,
          avgTempExposed: step.temperatureC,
          totalExposureHours: 0,
        });
      }
    }

    // ===== Submodel 3: Advance germinating cohorts =====
    const survivingCohorts: GerminatingCohort[] = [];
    let stepInfectedCount = 0;
    let stepInfectionStart: Date | null = null;
    let stepInfectionWetHours = 0;
    let stepInfectionAvgTemp = 0;

    for (const cohort of state.germinating) {
      const advanced = advanceCohort(cohort, step, isWet);
      if (!advanced) continue; // died

      // Check if infection is now complete
      if (cohortInfectionCompleted(advanced)) {
        stepInfectedCount += advanced.count;
        state.cumulativeInfected += advanced.count;
        if (!stepInfectionStart) {
          stepInfectionStart = advanced.dischargeTime;
          stepInfectionWetHours = advanced.wetHoursAccumulated;
          stepInfectionAvgTemp = advanced.avgTempExposed;
        }
        // Cohort is "done" — remove (infection achieved, no more action)
      } else {
        survivingCohorts.push(advanced);
      }
    }
    state.germinating = survivingCohorts;

    // Track current wet period
    if (isWet) {
      if (!currentWetStart) {
        currentWetStart = step.timestamp;
        currentWetHours = 0;
        currentWetTempSum = 0;
        currentWetTempCount = 0;
      }
      currentWetHours += 0.5;
      currentWetTempSum += step.temperatureC;
      currentWetTempCount++;
    } else if (currentWetStart && !isWet) {
      // Wet period ended
      currentWetStart = null;
      currentWetHours = 0;
      currentWetTempSum = 0;
      currentWetTempCount = 0;
    }

    // Record infection event if spores completed infection this step
    if (stepInfectedCount > 0 && stepInfectionStart) {
      // RIM = count of infected spores (scale: 0-10000 = fraction of initial inoculum)
      const eventRIM = Math.round(
        (stepInfectedCount / initialInoculum) * 10_000
      );
      const fractionOfSeason = stepInfectedCount / initialInoculum;
      const pamAtStart =
        (initialInoculum - state.immature) / initialInoculum;

      infections.push({
        wetPeriodStart: stepInfectionStart,
        infectionCompleted: step.timestamp,
        expectedSymptomDate: estimateSymptomDate(
          step.timestamp,
          stepInfectionAvgTemp
        ),
        wetDurationHours: stepInfectionWetHours,
        avgTemperature: stepInfectionAvgTemp,
        sporesInfected: stepInfectedCount,
        rimValue: eventRIM,
        cumulativeRim: Math.round(
          (state.cumulativeInfected / initialInoculum) * 10_000
        ),
        pamAtStart,
        fractionOfSeasonInoculum: fractionOfSeason,
        severity: classifySeverity(eventRIM),
        isForecast: step.isForecast,
      });
    }

    // Store state snapshot
    states.push({
      timestamp: step.timestamp,
      immature: state.immature,
      maturePool: state.maturePool,
      cumulativeDischarged: state.cumulativeDischarged,
      germinating: [...state.germinating],
      cumulativeInfected: state.cumulativeInfected,
      cumulativeDD: state.cumulativeDD,
      consecutiveDryDays: state.consecutiveDryDays,
      isWet,
      isRaining,
      isDaytime,
      isForecast: step.isForecast,
    });
  }

  const finalPAM =
    (initialInoculum - state.immature) / initialInoculum;
  const seasonalRIM = Math.round(
    (state.cumulativeInfected / initialInoculum) * 10_000
  );

  return {
    states,
    infections,
    seasonalRIM,
    finalPAM,
    biofixDate: input.biofixDate,
  };
}
