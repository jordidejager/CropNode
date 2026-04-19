/**
 * Apple Scab v2 — Types
 *
 * RIMpro-level dynamic simulation based on:
 * - Trapman 1994, 1997 (original RIMpro framework)
 * - Rossi et al. 2007 (A-scab paper)
 * - Philion et al. 2010 (20-year validation, Canada/Italy)
 *
 * Key design: age-class boxcar trains — spores progress through discrete
 * age bins at each 30-min timestep. This replaces the Mills-table lookup
 * with true dynamic simulation.
 */

import type { InoculumPressure } from '../types';

// ============================================================
// Simulation constants (from Philion et al. 2010)
// ============================================================

export const SIMULATION_CONSTANTS = {
  // Timestep
  TIMESTEP_MINUTES: 30,
  STEPS_PER_DAY: 48,
  STEPS_PER_HOUR: 2,

  // Initial inoculum (RIMpro convention)
  // Maximum seasonal RIM = INITIAL_INOCULUM = 10,000
  // RIM/100 ≈ % of season's spores that caused infection
  INITIAL_INOCULUM: 10_000,

  // Maturation: Gadoury & MacHardy / Rossi
  BASE_TEMP_MATURATION: 0, // °C, base for degree-day accumulation
  TSUM_FOR_50_PCT_MATURATION: 250, // °C·days base 0

  // Maturation interruption: stop if >5 consecutive dry days
  MATURATION_DRY_DAYS_STOP: 5,

  // Wet period detection
  WET_RH_THRESHOLD: 85, // % RH — leaf considered wet above this
  RAIN_TRIGGER_MM: 0.2, // mm per 30-min interval — triggers discharge
  DISCHARGE_STOP_AFTER_RAIN_MIN: 90, // discharge continues 90 min after rain stops

  // Night discharge inhibition (Philion 2010)
  NIGHT_DISCHARGE_FRACTION: 0.05, // 5% of daytime rate
  SUNRISE_OFFSET_MINUTES: 60, // inhibition ends 60 min after sunrise

  // Spore survival (hours)
  UNGERMINATED_SURVIVAL_HOURS: 24, // on dry surface
  GERMINATED_SURVIVAL_HOURS: 12, // if infection not completed

  // Infection completion temperatures (Stensvand 1997 revised Mills)
  // Hours of continuous wetness for ascospore infection
  MILLS_CURVE: {
    // temp °C -> hours wetness needed for light infection
    2: 35,
    3: 30,
    4: 28,
    5: 22,
    6: 19,
    7: 17,
    8: 15,
    9: 13,
    10: 12,
    11: 11,
    12: 10,
    13: 9,
    14: 9,
    15: 9,
    16: 9,
    17: 8,
    18: 8,
    19: 7,
    20: 7,
    21: 7,
    22: 6,
    23: 6,
    24: 6,
    25: 8, // increasing risk at high temp
    26: 11,
  } as Record<number, number>,

  // Germination rate: fraction completed per hour of wetness at temp T
  // Derived: at temp T, germination needs MILLS_CURVE[T] hours to complete
  // So per hour, 1/hours_needed fraction completes

  // RIM severity thresholds (Trapman / RIMpro convention)
  RIM_THRESHOLDS: {
    NONE: 0,
    LIGHT: 100, // 1% of season's inoculum infected
    MODERATE: 300, // 3%
    SEVERE: 600, // 6% — rare
  },
};

// ============================================================
// Spore state (tracked per 30-min step)
// ============================================================

/**
 * Cohort = group of spores at same life stage.
 * We track 4 main cohorts using boxcar approach (single-stage transitions).
 */
export interface SporeState {
  /** Timestamp of this state snapshot */
  timestamp: Date;

  /** Immature spores remaining in pseudothecia (0-INITIAL_INOCULUM) */
  immature: number;

  /** Mature spores ready for discharge (in pseudothecia, awaiting rain) */
  maturePool: number;

  /** Cumulative spores discharged this season (monotonic) */
  cumulativeDischarged: number;

  /** Spores currently germinating on wet leaves (age in hours) */
  germinating: GerminatingCohort[];

  /** Cumulative spores that successfully completed infection (RIM source) */
  cumulativeInfected: number;

  /** Current cumulative degree-days since biofix */
  cumulativeDD: number;

  /** Dry-day counter for maturation interruption */
  consecutiveDryDays: number;

  /** True if this step's weather is wet */
  isWet: boolean;

  /** True if this step's weather is rain (>0.2mm per 30min) */
  isRaining: boolean;

  /** True if this step occurs after sunrise + 60min (daylight) */
  isDaytime: boolean;

  /** True if weather data is forecast (vs observed) */
  isForecast: boolean;
}

/**
 * A cohort of germinating spores, sharing a start time.
 * Each step we age them by 30min, check survival, and check for infection.
 */
export interface GerminatingCohort {
  /** When these spores landed on leaves (discharge time) */
  dischargeTime: Date;

  /** Count of spores in this cohort */
  count: number;

  /** Cumulative wet hours experienced (capped at MILLS requirement for temp) */
  wetHoursAccumulated: number;

  /** Cumulative dry hours since last wet (for survival attrition) */
  dryHoursSinceWet: number;

  /** Average temperature during wet exposure */
  avgTempExposed: number;

  /** Total hours of exposure (wet + dry) */
  totalExposureHours: number;
}

// ============================================================
// Infection events (output)
// ============================================================

/**
 * A detected infection event — produced when a cohort of spores
 * completes germination + infection.
 */
export interface InfectionEvent {
  /** When the wet period / infection started (first wet step) */
  wetPeriodStart: Date;
  /** When the infection was completed (cohort succeeded) */
  infectionCompleted: Date;
  /** When symptoms are expected (from incubation model) */
  expectedSymptomDate: Date | null;
  /** Duration of wet period that enabled infection (hours) */
  wetDurationHours: number;
  /** Average temperature during wet period */
  avgTemperature: number;
  /** Number of spores that successfully infected */
  sporesInfected: number;
  /** RIM value for this event (contribution to seasonal RIM) */
  rimValue: number;
  /** Cumulative RIM at time of this event */
  cumulativeRim: number;
  /** PAM (fraction mature) at wet period start */
  pamAtStart: number;
  /** Fraction of season's inoculum that this event represents */
  fractionOfSeasonInoculum: number;
  /** Severity classification */
  severity: 'none' | 'light' | 'moderate' | 'severe';
  /** Whether this is forecast or observed */
  isForecast: boolean;
}

// ============================================================
// Simulation result
// ============================================================

export interface SimulationResult {
  /** 30-minute timestep states (full simulation history) */
  states: SporeState[];
  /** Detected infection events */
  infections: InfectionEvent[];
  /** Final cumulative RIM for the season */
  seasonalRIM: number;
  /** Final PAM (fraction of season's spores matured) */
  finalPAM: number;
  /** Biofix date used */
  biofixDate: Date;
}

// ============================================================
// Simulation input
// ============================================================

export interface SimulationInput {
  /** Biofix date (start of simulation) */
  biofixDate: Date;
  /** End date (usually today + 7 days forecast) */
  endDate: Date;
  /** Latitude for astronomical calculations */
  latitude: number;
  /** Longitude for astronomical calculations */
  longitude: number;
  /** Initial inoculum (adjusted by inoculumPressure) */
  initialInoculum?: number;
  /** Inoculum pressure (modifier for initialInoculum) */
  inoculumPressure?: InoculumPressure;
  /** Hourly weather data — will be interpolated to 30-min */
  hourlyWeather: HourlyWeatherStep[];
}

/**
 * Subset of weather fields needed by the simulation.
 * Input is hourly; we interpolate to 30-min steps internally.
 */
export interface HourlyWeatherStep {
  timestamp: Date;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null; // mm/hour
  leafWetnessPct: number | null;
  isForecast: boolean;
}

/**
 * Interpolated 30-min weather step.
 */
export interface WeatherStep30Min {
  timestamp: Date;
  temperatureC: number;
  humidityPct: number;
  precipitationMm: number; // mm in this 30-min window
  leafWetnessPct: number | null;
  isForecast: boolean;
}
