/**
 * Apple Powdery Mildew (Podosphaera leucotricha) — Types
 *
 * Fundamentally different from scab and black rot:
 * - NO water needed for infection (water actually KILLS spores)
 * - High RH is enough (>70%, optimum >90%)
 * - Primary inoculum = mycelium in overwintering buds
 * - Secondary = airborne conidia from primary mildew
 * - Temperature sweet spot: 19-22°C, zero outside 10-30°C
 * - VPD (Vapor Pressure Deficit) is a key variable
 * - Winter mortality: buds killed below -24°C (Jonathan: 96% mortality)
 *
 * Based on:
 * - Xu 1999 (Plant Pathology): Modelling epidemics of apple powdery mildew
 * - Xu & Butt 1998 (EJPP): Temperature and atmospheric moisture effects
 * - Xu 1996: Incubation period
 * - Ellis et al. 2008+: Field observations
 */

export type MildewSeverity = 'none' | 'light' | 'moderate' | 'severe';

// ============================================================
// Simulation constants
// ============================================================

export const MILDEW_CONSTANTS = {
  // Temperature limits
  TEMP_MIN: 10, // °C — below this, no infection
  TEMP_MAX: 30, // °C — above this, spores die
  TEMP_OPT: 22, // °C — optimum (Xu 1999)
  TEMP_SD: 6, // °C — bell-curve width

  // Humidity thresholds
  RH_INFECTION_MIN: 70, // % — below this, little risk
  RH_INFECTION_OPT: 90, // % — optimum

  // Duration thresholds (hours of favorable conditions)
  MIN_INFECTION_HOURS: 6, // hours for light infection at optimum
  MODERATE_INFECTION_HOURS: 12,
  SEVERE_INFECTION_HOURS: 24,

  // Water kills spores — if recent rain, risk is suppressed
  RAIN_SUPPRESSION_HOURS: 4, // hours after rain where risk is halved
  RAIN_WASH_MM: 2, // mm rain in 24h = strong wash effect
  LEAF_WETNESS_PENALTY: 0.3, // multiplier if leaves wet

  // Winter mortality threshold
  WINTER_KILL_TEMP_C: -24, // Jonathan: 96% bud mortality below this
  WINTER_KILL_INOCULUM_MULT: 0.04, // only 4% survives

  // Bud break / biofix offset (typically 10-14 days before green tip)
  BIOFIX_OFFSET_FROM_BLOOM_DAYS: -35, // bud break ≈ bloom - 35 days

  // Incubation period (Xu 1996): 3-12 days based on temperature
  INCUBATION_MIN_DAYS: 3,
  INCUBATION_MAX_DAYS: 12,

  // Initial inoculum scale
  INITIAL_INOCULUM: 10_000,
};

// ============================================================
// Input types
// ============================================================

export interface MildewInput {
  biofixDate: Date; // bud break
  endDate: Date;
  latitude: number;
  longitude: number;
  inoculumPressure?: 'low' | 'medium' | 'high';
  /** Min winter temperature from previous dormant season (for inoculum-kill check) */
  minWinterTemp?: number | null;
  hourlyWeather: MildewWeatherHour[];
}

export interface MildewWeatherHour {
  timestamp: Date;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  leafWetnessPct: number | null;
  dewPointC: number | null;
  isForecast: boolean;
}

// ============================================================
// Output types
// ============================================================

export interface MildewInfectionEvent {
  /** When the favorable window started */
  windowStart: Date;
  /** When infection was achieved */
  infectionCompleted: Date;
  /** Duration of favorable conditions (hours) */
  favorableDurationHours: number;
  /** Average temperature during window */
  avgTemperature: number;
  /** Average RH during window */
  avgHumidity: number;
  /** Average VPD during window (kPa) */
  avgVPD: number;
  /** Severity class */
  severity: MildewSeverity;
  /** RIM-like value (0-10000) */
  rimValue: number;
  /** Expected symptom date */
  expectedSymptomDate: Date | null;
  isForecast: boolean;
}

export interface MildewDailyEntry {
  date: string; // YYYY-MM-DD
  dailyRIM: number;
  cumulativeRIM: number;
  avgTemp: number;
  avgHumidity: number;
  avgVPD: number;
  hadInfection: boolean;
  isForecast: boolean;
}

export interface MildewResult {
  infections: MildewInfectionEvent[];
  seasonalRIM: number;
  dailyProgress: MildewDailyEntry[];
  biofixDate: Date;
  /** Whether a severe winter happened (inoculum decimated) */
  winterKillOccurred: boolean;
}
