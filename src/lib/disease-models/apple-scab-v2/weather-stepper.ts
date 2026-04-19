/**
 * Weather data preparation for 30-minute simulation steps.
 *
 * Open-Meteo gives hourly data; RIMpro-style simulation runs at 30-min.
 * We linearly interpolate between hourly points and split precipitation.
 */

import type { HourlyWeatherStep, WeatherStep30Min } from './types';
import { SIMULATION_CONSTANTS } from './types';

/**
 * Build an array of 30-minute weather steps from hourly observations.
 * Covers the range [biofixDate, endDate] at 30-min resolution.
 */
export function buildWeatherSteps(
  hourlyData: HourlyWeatherStep[],
  biofixDate: Date,
  endDate: Date
): WeatherStep30Min[] {
  if (hourlyData.length === 0) return [];

  // Sort and index by timestamp (rounded to hour)
  const sorted = [...hourlyData].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const hourMap = new Map<number, HourlyWeatherStep>();
  for (const h of sorted) {
    const hourKey = Math.floor(h.timestamp.getTime() / 3_600_000) * 3_600_000;
    hourMap.set(hourKey, h);
  }

  const steps: WeatherStep30Min[] = [];
  const stepMs = SIMULATION_CONSTANTS.TIMESTEP_MINUTES * 60 * 1000;

  // Start at biofix, step through end
  let t = biofixDate.getTime();
  const endMs = endDate.getTime();

  while (t <= endMs) {
    const stepDate = new Date(t);
    const hourKey = Math.floor(t / 3_600_000) * 3_600_000;
    const nextHourKey = hourKey + 3_600_000;

    const current = hourMap.get(hourKey);
    const next = hourMap.get(nextHourKey);

    if (!current) {
      // No data — skip this step
      t += stepMs;
      continue;
    }

    // Interpolation weight: 0.0 at top of hour, 0.5 at half hour
    const weight = (t - hourKey) / 3_600_000;

    const interp = (a: number | null, b: number | null, w: number): number => {
      if (a === null && b === null) return NaN;
      if (a === null) return b!;
      if (b === null) return a;
      return a * (1 - w) + b * w;
    };

    const temp = interp(
      current.temperatureC,
      next?.temperatureC ?? current.temperatureC,
      weight
    );
    const hum = interp(
      current.humidityPct,
      next?.humidityPct ?? current.humidityPct,
      weight
    );
    // Precipitation: split evenly across 2 half-hours of the source hour
    const precipHourly = current.precipitationMm ?? 0;
    const precip30Min = precipHourly / 2;

    // Leaf wetness: no interpolation (may be binary in future sensor data)
    const lw = current.leafWetnessPct;

    if (!isNaN(temp) && !isNaN(hum)) {
      steps.push({
        timestamp: stepDate,
        temperatureC: temp,
        humidityPct: hum,
        precipitationMm: precip30Min,
        leafWetnessPct: lw,
        isForecast: current.isForecast,
      });
    }

    t += stepMs;
  }

  return steps;
}
