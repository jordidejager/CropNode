/**
 * Apple Powdery Mildew v2 — RIMpro-level dynamic simulation
 *
 * Implements the 3 coupled submodels from RIMpro Podosphaera:
 *
 * 1. PRIMARY MILDEW RELEASE (bottom layer)
 *    - Overwintering mycelium in buds produces conidia once bud break happens
 *    - Release follows temperature-driven rate (Xu 1999 bell curve)
 *    - Primary source declines as buds age (limited resource)
 *
 * 2. AERIAL SPORE POOL (middle layer)
 *    - Conidia concentration in air, dynamic pool
 *    - Positive correlation with T and VPD, negative with RH/rain/leaf-wet
 *    - Spores decay (UV, rain washing) — half-life ~24h
 *
 * 3. SECONDARY LESION SPORULATION (top layer)
 *    - New infections become sporulating lesions after ~14 days incubation
 *    - Each mature lesion adds conidia to aerial pool (exponential amplification)
 *    - Lesions stop sporulating after ~2 weeks (leaf tissue develops resistance)
 *
 * Based on:
 * - Xu 1999 (Plant Pathology): colony growth bell curve
 * - Xu & Butt 1998 (EJPP): VPD effects on early growth
 * - Xu 1996: incubation period vs temperature (3-12 days)
 * - RIMpro Podosphaera platform description
 * - Ellis/Cornell 2021: winter bud mortality at -24°C
 */

import { MILDEW_CONSTANTS as C } from './types';
import type { MildewInput, MildewResult, MildewInfectionEvent, MildewDailyEntry } from './types';
import {
  hourlyFavorabilityScore,
  classifyMildewSeverity,
  incubationDays,
  calculateVPD,
  temperatureResponse,
} from './response-curves';

// ============================================================
// Primary inoculum release dynamics
// ============================================================

/**
 * Rate at which primary inoculum is released from overwintering buds per hour.
 * Fraction of remaining primary pool released this hour.
 *
 * Peak during bud break and first 2 weeks of growth. Declines exponentially
 * afterwards as buds reach full expansion.
 */
function primaryReleaseRate(
  hoursSinceBiofix: number,
  temp: number
): number {
  if (temp < C.TEMP_MIN || temp > C.TEMP_MAX) return 0;

  // Temperature factor (bell curve, same as colony growth)
  const tempFactor = temperatureResponse(temp);

  // Time factor: peak around day 5-10, declining after day 21
  const days = hoursSinceBiofix / 24;
  let timeFactor: number;
  if (days < 2) timeFactor = 0.3; // ramping up
  else if (days < 21) timeFactor = 1.0; // active release
  else timeFactor = Math.max(0, 1 - (days - 21) / 30); // decline over ~30 more days

  // Base rate: ~1% per hour at peak conditions
  return 0.01 * tempFactor * timeFactor;
}

// ============================================================
// Aerial spore pool dynamics
// ============================================================

const AERIAL_HALF_LIFE_HOURS = 24; // spore lifespan in air (UV, natural decay)
const RAIN_WASH_DECAY_MULT = 0.3; // heavy rain → 70% lost per hour
const AERIAL_DECAY_PER_HOUR = Math.exp(-Math.LN2 / AERIAL_HALF_LIFE_HOURS);

/**
 * Apply one hour of decay to the aerial pool.
 * More aggressive decay if raining or leaves wet (water suppresses mildew).
 */
function decayAerialPool(
  pool: number,
  raining: boolean,
  leafWet: boolean
): number {
  let factor = AERIAL_DECAY_PER_HOUR;
  if (raining) factor *= RAIN_WASH_DECAY_MULT;
  else if (leafWet) factor *= 0.7;
  return pool * factor;
}

// ============================================================
// Secondary lesion cohorts
// ============================================================

interface LesionCohort {
  /** When the infection was completed (start of incubation) */
  infectedAt: Date;
  /** Number of lesions (proportional to spores that caused infection) */
  count: number;
  /** Accumulated degree-hours since infection (for incubation progress) */
  cumulativeDegreeHours: number;
  /** Sporulating status: false = still incubating, true = producing conidia */
  sporulating: boolean;
  /** Hours spent sporulating (max ~336h = 14 days, then leaves develop resistance) */
  sporulatingHours: number;
}

const SPORULATION_DURATION_HOURS = 14 * 24; // 2 weeks
const DEGREE_HOURS_FOR_SPORULATION = 6 * 24 * 15; // ~15°C·d cumulated (Xu 1996)

/**
 * Each sporulating lesion contributes ~20 spores per hour at peak conditions.
 * This amplifies the aerial pool exponentially as infections pile up.
 */
const SPORES_PER_LESION_PER_HOUR_OPT = 20;

function sporesReleasedByLesions(
  lesions: LesionCohort[],
  temp: number
): number {
  const tempFactor = temperatureResponse(temp);
  let total = 0;
  for (const lesion of lesions) {
    if (lesion.sporulating) {
      total += lesion.count * SPORES_PER_LESION_PER_HOUR_OPT * tempFactor;
    }
  }
  return total;
}

// ============================================================
// Main v2 simulation
// ============================================================

const MS_PER_HOUR = 3600_000;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isLeafWet(h: {
  leafWetnessPct: number | null;
  precipitationMm: number | null;
  humidityPct: number | null;
}): boolean {
  if (h.leafWetnessPct !== null && h.leafWetnessPct >= 50) return true;
  if (h.precipitationMm !== null && h.precipitationMm > 0.2) return true;
  if (h.humidityPct !== null && h.humidityPct >= 95) return true;
  return false;
}

function estimateSymptomDate(infectionTime: Date, avgTemp: number): Date {
  const days = incubationDays(avgTemp);
  return new Date(infectionTime.getTime() + days * 24 * MS_PER_HOUR);
}

export function runMildewSimulationV2(input: MildewInput): MildewResult {
  const sorted = [...input.hourlyWeather]
    .filter(
      (h) =>
        h.timestamp.getTime() >= input.biofixDate.getTime() &&
        h.timestamp.getTime() <= input.endDate.getTime() &&
        h.temperatureC !== null &&
        h.humidityPct !== null
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const pressureMult =
    input.inoculumPressure === 'low'
      ? 0.5
      : input.inoculumPressure === 'high'
      ? 1.5
      : 1.0;

  const winterKillOccurred =
    typeof input.minWinterTemp === 'number' &&
    input.minWinterTemp < C.WINTER_KILL_TEMP_C;
  const winterMult = winterKillOccurred ? C.WINTER_KILL_INOCULUM_MULT : 1.0;
  const totalMult = pressureMult * winterMult;

  // ===== Three-layer state =====
  // Layer 1: Primary inoculum pool (from overwintering buds)
  let primaryPool = C.INITIAL_INOCULUM * totalMult;
  // Layer 2: Aerial spore pool (concentration)
  let aerialPool = 0;
  // Layer 3: Secondary lesion cohorts
  let lesions: LesionCohort[] = [];

  // Rain tracking for suppression factors
  let minutesSinceRain = Infinity;
  const rainLog: { time: number; mm: number }[] = [];

  // Favorability accumulator (for new infections from aerial pool)
  let favStart: Date | null = null;
  let favAccum = 0;
  let favTempSum = 0;
  let favRhSum = 0;
  let favVpdSum = 0;
  let favHours = 0;
  let unfavorableStreak = 0;
  let forecastInWindow = false;
  let reportedForWindow = false;

  const infections: MildewInfectionEvent[] = [];
  const dailyMap = new Map<
    string,
    {
      rim: number;
      hadInfection: boolean;
      isForecast: boolean;
      aerialMax: number;
      tSum: number;
      rhSum: number;
      vpdSum: number;
      count: number;
    }
  >();

  for (const h of sorted) {
    const temp = h.temperatureC!;
    const rh = h.humidityPct!;
    const rainMm = h.precipitationMm ?? 0;
    const t = h.timestamp.getTime();
    const hoursSinceBiofix = (t - input.biofixDate.getTime()) / MS_PER_HOUR;

    // Rain tracking
    if (rainMm > 0.2) minutesSinceRain = 0;
    else minutesSinceRain += 60;
    rainLog.push({ time: t, mm: rainMm });
    while (rainLog.length > 0 && rainLog[0].time < t - 24 * MS_PER_HOUR) {
      rainLog.shift();
    }
    const recentRainMm24h = rainLog.reduce((s, r) => s + r.mm, 0);

    const leafWet = isLeafWet(h);
    const raining = rainMm > 0.2;
    const vpd = calculateVPD(temp, rh);

    // ===== Layer 1: Primary release =====
    if (primaryPool > 0) {
      const rate = primaryReleaseRate(hoursSinceBiofix, temp);
      const released = primaryPool * rate;
      primaryPool -= released;
      aerialPool += released;
    }

    // ===== Layer 3: Secondary sporulation (lesions release spores) =====
    const secondarySpores = sporesReleasedByLesions(lesions, temp);
    aerialPool += secondarySpores;

    // Advance lesion cohorts
    const survivingLesions: LesionCohort[] = [];
    for (const lesion of lesions) {
      const dhAdd = Math.max(0, temp - C.TEMP_MIN);
      const newDh = lesion.cumulativeDegreeHours + dhAdd;

      if (!lesion.sporulating) {
        if (newDh >= DEGREE_HOURS_FOR_SPORULATION) {
          survivingLesions.push({
            ...lesion,
            cumulativeDegreeHours: newDh,
            sporulating: true,
            sporulatingHours: 0,
          });
        } else {
          survivingLesions.push({ ...lesion, cumulativeDegreeHours: newDh });
        }
      } else {
        // Sporulating — check if still productive
        if (lesion.sporulatingHours < SPORULATION_DURATION_HOURS) {
          survivingLesions.push({
            ...lesion,
            sporulatingHours: lesion.sporulatingHours + 1,
          });
        }
        // else: leaf resistant, lesion dropped
      }
    }
    lesions = survivingLesions;

    // ===== Layer 2: Aerial pool decay =====
    aerialPool = decayAerialPool(aerialPool, raining, leafWet);

    // ===== Infection detection (favorable window from aerial spores) =====
    const score = hourlyFavorabilityScore({
      tempC: temp,
      humidityPct: rh,
      minutesSinceRain,
      recentRainMm24h,
      leafWet,
    });

    // Modulate score by available aerial spores (if pool is low, infections are low)
    const aerialFactor = Math.min(1, aerialPool / (C.INITIAL_INOCULUM * 0.1));
    const effectiveScore = score * aerialFactor;

    if (effectiveScore > 0.1) {
      if (favStart === null) {
        favStart = h.timestamp;
        favAccum = 0;
        favTempSum = favRhSum = favVpdSum = 0;
        favHours = 0;
        forecastInWindow = false;
        reportedForWindow = false;
      }
      favAccum += effectiveScore;
      favHours++;
      favTempSum += temp;
      favRhSum += rh;
      favVpdSum += vpd;
      unfavorableStreak = 0;
      forecastInWindow = forecastInWindow || h.isForecast;

      if (!reportedForWindow && favAccum >= C.MIN_INFECTION_HOURS) {
        const avgT = favTempSum / favHours;
        const avgRh = favRhSum / favHours;
        const avgVpd = favVpdSum / favHours;
        const severity = classifyMildewSeverity(favAccum);

        if (severity !== 'none') {
          const rim = Math.round(
            (favAccum / C.SEVERE_INFECTION_HOURS) * 10_000 * totalMult
          );

          infections.push({
            windowStart: favStart,
            infectionCompleted: h.timestamp,
            favorableDurationHours: favHours,
            avgTemperature: Math.round(avgT * 10) / 10,
            avgHumidity: Math.round(avgRh * 10) / 10,
            avgVPD: Math.round(avgVpd * 100) / 100,
            severity,
            rimValue: rim,
            expectedSymptomDate: estimateSymptomDate(favStart, avgT),
            isForecast: forecastInWindow,
          });

          // Add new lesion cohort (will start sporulating in ~14 days)
          lesions.push({
            infectedAt: h.timestamp,
            count: rim * 0.01, // lesion count scales with RIM
            cumulativeDegreeHours: 0,
            sporulating: false,
            sporulatingHours: 0,
          });

          reportedForWindow = true;

          const dKey = toDateStr(favStart);
          const prev = dailyMap.get(dKey);
          dailyMap.set(dKey, {
            rim: (prev?.rim ?? 0) + rim,
            hadInfection: true,
            isForecast: (prev?.isForecast ?? false) || forecastInWindow,
            aerialMax: Math.max(prev?.aerialMax ?? 0, aerialPool),
            tSum: (prev?.tSum ?? 0) + temp,
            rhSum: (prev?.rhSum ?? 0) + rh,
            vpdSum: (prev?.vpdSum ?? 0) + vpd,
            count: (prev?.count ?? 0) + 1,
          });
        }
      }
    } else {
      if (favStart !== null) {
        unfavorableStreak++;
        if (unfavorableStreak >= 4) {
          favStart = null;
          favAccum = favHours = 0;
          favTempSum = favRhSum = favVpdSum = 0;
          unfavorableStreak = 0;
          reportedForWindow = false;
          forecastInWindow = false;
        }
      }
    }

    // Track daily aerial max even without infection
    const dKey = toDateStr(h.timestamp);
    const ex = dailyMap.get(dKey);
    dailyMap.set(dKey, {
      rim: ex?.rim ?? 0,
      hadInfection: ex?.hadInfection ?? false,
      isForecast: (ex?.isForecast ?? false) || h.isForecast,
      aerialMax: Math.max(ex?.aerialMax ?? 0, aerialPool),
      tSum: (ex?.tSum ?? 0) + temp,
      rhSum: (ex?.rhSum ?? 0) + rh,
      vpdSum: (ex?.vpdSum ?? 0) + vpd,
      count: (ex?.count ?? 0) + 1,
    });
  }

  // Build daily progress
  const dailyProgress: MildewDailyEntry[] = [];
  let cumulative = 0;
  const dates = Array.from(dailyMap.keys()).sort();
  for (const dKey of dates) {
    const entry = dailyMap.get(dKey)!;
    cumulative += entry.rim;
    dailyProgress.push({
      date: dKey,
      dailyRIM: entry.rim,
      cumulativeRIM: cumulative,
      avgTemp: entry.count > 0 ? entry.tSum / entry.count : 0,
      avgHumidity: entry.count > 0 ? entry.rhSum / entry.count : 0,
      avgVPD: entry.count > 0 ? entry.vpdSum / entry.count : 0,
      hadInfection: entry.hadInfection,
      isForecast: entry.isForecast,
    });
  }

  return {
    infections,
    seasonalRIM: cumulative,
    dailyProgress,
    biofixDate: input.biofixDate,
    winterKillOccurred,
  };
}
