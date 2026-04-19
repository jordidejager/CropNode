/**
 * Apple Powdery Mildew infection simulation.
 *
 * Hourly timestep model:
 * 1. For each hour, compute favorability score (temp × RH × no-rain)
 * 2. Accumulate scores during favorable windows
 * 3. When accumulated favorability crosses threshold → infection event
 * 4. Reset accumulator when conditions become unfavorable for 4+ hours
 *
 * Key design: this is NOT a wet-period detector. We detect DRY high-humidity
 * periods (the opposite of scab).
 */

import type {
  MildewInput,
  MildewResult,
  MildewInfectionEvent,
  MildewDailyEntry,
  MildewWeatherHour,
} from './types';
import { MILDEW_CONSTANTS as C } from './types';
import {
  hourlyFavorabilityScore,
  classifyMildewSeverity,
  incubationDays,
  calculateVPD,
} from './response-curves';

const MS_PER_HOUR = 3600_000;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Check if leaves are currently wet (sensor or proxy).
 */
function isLeafWet(h: MildewWeatherHour): boolean {
  if (h.leafWetnessPct !== null && h.leafWetnessPct >= 50) return true;
  if (h.precipitationMm !== null && h.precipitationMm > 0.2) return true;
  // Heavy dew as proxy: RH ≥ 95% and temp near dew point
  if (h.humidityPct !== null && h.humidityPct >= 95) return true;
  return false;
}

/**
 * Estimate expected symptom date from an infection event.
 */
function estimateSymptomDate(infectionTime: Date, avgTemp: number): Date {
  const days = incubationDays(avgTemp);
  return new Date(infectionTime.getTime() + days * 24 * MS_PER_HOUR);
}

export function runMildewSimulation(input: MildewInput): MildewResult {
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

  // Winter mortality check
  const winterKillOccurred =
    typeof input.minWinterTemp === 'number' &&
    input.minWinterTemp < C.WINTER_KILL_TEMP_C;
  const winterMult = winterKillOccurred ? C.WINTER_KILL_INOCULUM_MULT : 1.0;

  const totalMult = pressureMult * winterMult;

  // State tracking
  let minutesSinceRain = Infinity;
  let recentRainMm24h = 0;
  const rainLog: { time: number; mm: number }[] = [];

  // Accumulator for current favorable window
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
  const hourlyVpd = new Map<string, { vpdSum: number; count: number; tSum: number; rhSum: number }>();
  const dailyMap = new Map<
    string,
    { rim: number; hadInfection: boolean; isForecast: boolean }
  >();

  for (const h of sorted) {
    const temp = h.temperatureC!;
    const rh = h.humidityPct!;
    const rainMm = h.precipitationMm ?? 0;
    const t = h.timestamp.getTime();

    // Update rain tracking
    if (rainMm > 0.2) {
      minutesSinceRain = 0;
    } else {
      minutesSinceRain += 60;
    }
    rainLog.push({ time: t, mm: rainMm });
    // Keep only last 24h
    while (rainLog.length > 0 && rainLog[0].time < t - 24 * MS_PER_HOUR) {
      rainLog.shift();
    }
    recentRainMm24h = rainLog.reduce((s, r) => s + r.mm, 0);

    const leafWet = isLeafWet(h);
    const vpd = calculateVPD(temp, rh);

    const score = hourlyFavorabilityScore({
      tempC: temp,
      humidityPct: rh,
      minutesSinceRain,
      recentRainMm24h,
      leafWet,
    });

    // Track daily VPD/temp/RH averages
    const dateKey = toDateStr(h.timestamp);
    const prev = hourlyVpd.get(dateKey) ?? { vpdSum: 0, count: 0, tSum: 0, rhSum: 0 };
    hourlyVpd.set(dateKey, {
      vpdSum: prev.vpdSum + vpd,
      count: prev.count + 1,
      tSum: prev.tSum + temp,
      rhSum: prev.rhSum + rh,
    });

    if (score > 0.1) {
      // Favorable hour — accumulate
      if (favStart === null) {
        favStart = h.timestamp;
        favAccum = 0;
        favTempSum = 0;
        favRhSum = 0;
        favVpdSum = 0;
        favHours = 0;
        forecastInWindow = false;
        reportedForWindow = false;
      }
      favAccum += score;
      favHours += 1;
      favTempSum += temp;
      favRhSum += rh;
      favVpdSum += vpd;
      unfavorableStreak = 0;
      forecastInWindow = forecastInWindow || h.isForecast;

      // Check for infection completion
      if (!reportedForWindow && favAccum >= C.MIN_INFECTION_HOURS) {
        const avgT = favTempSum / favHours;
        const avgRh = favRhSum / favHours;
        const avgVpd = favVpdSum / favHours;
        const severity = classifyMildewSeverity(favAccum);

        if (severity !== 'none') {
          // RIM-like: favorability-hours × scale × modifiers
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

          reportedForWindow = true;

          const pDay = dailyMap.get(toDateStr(favStart)) ?? {
            rim: 0,
            hadInfection: false,
            isForecast: false,
          };
          dailyMap.set(toDateStr(favStart), {
            rim: pDay.rim + rim,
            hadInfection: true,
            isForecast: pDay.isForecast || forecastInWindow,
          });
        }
      }
    } else {
      // Unfavorable hour
      if (favStart !== null) {
        unfavorableStreak += 1;
        // Reset accumulator after 4 unfavorable hours
        if (unfavorableStreak >= 4) {
          favStart = null;
          favAccum = 0;
          favHours = 0;
          favTempSum = 0;
          favRhSum = 0;
          favVpdSum = 0;
          unfavorableStreak = 0;
          reportedForWindow = false;
          forecastInWindow = false;
        }
      }
    }
  }

  // Build daily progress array
  const dailyProgress: MildewDailyEntry[] = [];
  let cumulative = 0;
  const dates = Array.from(new Set(sorted.map((h) => toDateStr(h.timestamp)))).sort();
  for (const dateKey of dates) {
    const entry = dailyMap.get(dateKey);
    const daily = entry?.rim ?? 0;
    cumulative += daily;
    const stats = hourlyVpd.get(dateKey);
    dailyProgress.push({
      date: dateKey,
      dailyRIM: daily,
      cumulativeRIM: cumulative,
      avgTemp: stats ? stats.tSum / stats.count : 0,
      avgHumidity: stats ? stats.rhSum / stats.count : 0,
      avgVPD: stats ? stats.vpdSum / stats.count : 0,
      hadInfection: entry?.hadInfection ?? false,
      isForecast: entry?.isForecast ?? false,
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
