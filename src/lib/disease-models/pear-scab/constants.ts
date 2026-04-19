/**
 * Pear scab (Venturia pirina) — simulation constants
 *
 * Reuses the RIMpro-level apple scab v2 architecture with pear-specific
 * parameters from Spotts, Villalta, Coop.
 *
 * Key pear-specific adaptations:
 * - DDwet threshold 268.5 for first ascospore discharge (Villalta)
 * - Less strict night inhibition (17.5% at night vs 5% for apple)
 * - Shorter primary season (fruit susceptibility declines faster)
 * - Wood canker conidia source (constant throughout season) — optional track
 */

export const PEAR_SCAB_CONSTANTS = {
  // Timestep
  TIMESTEP_MINUTES: 30,
  STEPS_PER_DAY: 48,
  STEPS_PER_HOUR: 2,

  // Initial inoculum (same scale as apple v2 = 10000)
  INITIAL_INOCULUM: 10_000,

  // Maturation parameters (Villalta-tuned for pear)
  BASE_TEMP_MATURATION: 0, // °C
  TSUM_FOR_50_PCT_MATURATION: 280, // slightly higher than apple (250)
  DDWET_FIRST_DISCHARGE: 268.5, // °C·d wet before any discharge possible

  // Maturation interruption
  MATURATION_DRY_DAYS_STOP: 5,

  // Wet period detection (same as apple)
  WET_RH_THRESHOLD: 85,
  RAIN_TRIGGER_MM: 0.2,
  DISCHARGE_STOP_AFTER_RAIN_MIN: 90,

  // Night discharge inhibition (Villalta 2001):
  // V. pirina releases up to 17.5% at night (vs <5% for V. inaequalis)
  NIGHT_DISCHARGE_FRACTION: 0.175,
  SUNRISE_OFFSET_MINUTES: 60,

  // Spore survival (same biology as apple)
  UNGERMINATED_SURVIVAL_HOURS: 24,
  GERMINATED_SURVIVAL_HOURS: 12,

  // RIM thresholds (same convention: RIM/100 ≈ % of season inoculum)
  RIM_THRESHOLDS: {
    NONE: 0,
    LIGHT: 100,
    MODERATE: 300,
    SEVERE: 600,
  },
};
