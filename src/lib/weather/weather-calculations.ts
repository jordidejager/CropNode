// ============================================================================
// Weather Calculations Module
// Derived calculations: leaf wetness, GDD, Delta-T, spray window score.
// ============================================================================

import type { HourlyWeatherData, DeltaTResult, SprayWindowScore, SprayProductType, SprayProfile } from './weather-types';

// ---- Leaf Wetness ----

/**
 * Estimate leaf wetness probability (0-100%) from weather parameters.
 */
export function estimateLeafWetness(
  humidity: number | null,
  temperature: number | null,
  dewPoint: number | null,
  precipitation: number | null
): number | null {
  if (humidity === null) return null;

  if (precipitation !== null && precipitation > 0) return 100;
  if (humidity > 95) return 90;
  if (humidity > 90) return 70;
  if (temperature !== null && dewPoint !== null && (temperature - dewPoint) < 2) return 50;
  if (humidity > 85) return 30;
  return 0;
}

// ---- Growing Degree Days (GDD) ----

/**
 * Calculate Growing Degree Days for a single day.
 * GDD = max(0, ((temp_max + temp_min) / 2) - base)
 */
export function calculateGDD(
  tempMax: number | null,
  tempMin: number | null,
  base: number
): number | null {
  if (tempMax === null || tempMin === null) return null;
  const avg = (tempMax + tempMin) / 2;
  return Math.max(0, avg - base);
}

/**
 * Calculate cumulative GDD for a series of daily data.
 * Returns an array of { date, cumulativeGdd } from the start date.
 */
export function calculateCumulativeGDD(
  dailyData: Array<{ date: string; gdd: number | null }>,
): Array<{ date: string; cumulativeGdd: number }> {
  let cumulative = 0;
  return dailyData.map(({ date, gdd }) => {
    if (gdd !== null) cumulative += gdd;
    return { date, cumulativeGdd: Math.round(cumulative * 10) / 10 };
  });
}

// ---- Leaf Wetness Hours per Day ----

/**
 * Count hours per day where leaf wetness probability > 50%.
 */
export function calculateLeafWetnessHours(
  hourlyData: Array<{ leafWetnessPct: number | null }>
): number {
  return hourlyData.filter(h => h.leafWetnessPct !== null && h.leafWetnessPct > 50).length;
}

// ---- Frost Hours ----

/**
 * Count hours per day where temperature is below 0°C.
 */
export function calculateFrostHours(
  hourlyData: Array<{ temperatureC: number | null }>
): number {
  return hourlyData.filter(h => h.temperatureC !== null && h.temperatureC < 0).length;
}

// ---- Delta-T ----

/**
 * Calculate Delta-T = temperature - dew_point.
 * Interpretation:
 *   < 2:   too wet (droplets don't dry)
 *   2-8:   ideal spray window
 *   8-10:  acceptable, watch for fine droplets
 *   > 10:  too dry, too much evaporation/drift
 */
export function calculateDeltaT(
  temperature: number | null,
  dewPoint: number | null
): DeltaTResult | null {
  if (temperature === null || dewPoint === null) return null;

  const value = Math.round((temperature - dewPoint) * 10) / 10;
  let category: DeltaTResult['category'];
  let label: string;

  if (value < 2) {
    category = 'too_wet';
    label = 'Te vochtig';
  } else if (value <= 8) {
    category = 'ideal';
    label = 'Ideaal';
  } else if (value <= 10) {
    category = 'acceptable';
    label = 'Acceptabel';
  } else {
    category = 'too_dry';
    label = 'Te droog';
  }

  return { value, category, label };
}

// ---- Spray Window Score ----

/**
 * Calculate spray window score (0-100) based on multiple weather factors.
 * Score -> Groen (>70) / Oranje (40-70) / Rood (<40)
 */
export function calculateSprayWindowScore(
  windSpeedMs: number | null,
  temperature: number | null,
  dewPoint: number | null,
  precipitationCurrent: number | null,
  precipitationNext2h: number | null
): SprayWindowScore {
  const factors = {
    wind: calculateWindScore(windSpeedMs),
    deltaT: calculateDeltaTScore(temperature, dewPoint),
    precipitation: calculatePrecipitationScore(precipitationCurrent, precipitationNext2h),
    temperature: calculateTemperatureScore(temperature),
  };

  // Weighted average: wind (30%), deltaT (25%), precipitation (25%), temperature (20%)
  const score = Math.round(
    factors.wind * 0.30 +
    factors.deltaT * 0.25 +
    factors.precipitation * 0.25 +
    factors.temperature * 0.20
  );

  let label: SprayWindowScore['label'];
  if (score > 70) label = 'Groen';
  else if (score >= 40) label = 'Oranje';
  else label = 'Rood';

  return { score, label, factors };
}

function calculateWindScore(windSpeedMs: number | null): number {
  if (windSpeedMs === null) return 50;
  if (windSpeedMs <= 1) return 90;
  if (windSpeedMs <= 3) return 100;
  if (windSpeedMs <= 5) return 60;
  if (windSpeedMs <= 7) return 30;
  return 0;
}

function calculateDeltaTScore(temperature: number | null, dewPoint: number | null): number {
  const result = calculateDeltaT(temperature, dewPoint);
  if (!result) return 50;

  if (result.value >= 2 && result.value <= 8) return 100;
  if (result.value >= 1 && result.value < 2) return 60;
  if (result.value > 8 && result.value <= 10) return 60;
  if (result.value < 1) return 20;
  return 10; // > 10
}

function calculatePrecipitationScore(
  current: number | null,
  next2h: number | null
): number {
  if (current !== null && current > 0) return 0;
  if (next2h !== null && next2h > 0) return 30;
  return 100;
}

function calculateTemperatureScore(temperature: number | null): number {
  if (temperature === null) return 50;
  if (temperature >= 10 && temperature <= 25) return 100;
  if (temperature >= 5 && temperature < 10) return 70;
  if (temperature > 25 && temperature <= 30) return 70;
  if (temperature >= 0 && temperature < 5) return 30;
  if (temperature > 30) return 30;
  return 0; // Below 0
}

// ---- Spray Window Profiles per Product Type ----

/**
 * Pre-defined spray profiles for different product categories.
 *
 * Key differences:
 * - Contact fungicides (Captan, Delan): need dry time → precipitation weight high, wind matters for drift
 * - Systemic fungicides (Scala, Score): absorbed quickly → less rain-sensitive, temp range narrower
 * - Growth regulators (Regalis, Ethrel): very temp-sensitive (12-22°C) → temperature weight high
 * - Foliar fertilizers: humidity matters for uptake → deltaT weight high
 */
export const SPRAY_PROFILES: Record<SprayProductType, SprayProfile> = {
  contact: {
    type: 'contact',
    label: 'Contactmiddel',
    weights: { wind: 0.35, deltaT: 0.20, precipitation: 0.30, temperature: 0.15 },
    thresholds: { maxWindMs: 5, dryHoursAfter: 2 },
  },
  systemisch: {
    type: 'systemisch',
    label: 'Systemisch middel',
    weights: { wind: 0.25, deltaT: 0.25, precipitation: 0.20, temperature: 0.30 },
    thresholds: { maxWindMs: 7, minTempC: 8 },
  },
  groeistof: {
    type: 'groeistof',
    label: 'Groeistof',
    weights: { wind: 0.30, deltaT: 0.15, precipitation: 0.25, temperature: 0.30 },
    thresholds: { maxWindMs: 5, minTempC: 12, maxTempC: 22 },
  },
  meststof: {
    type: 'meststof',
    label: 'Bladvoeding',
    weights: { wind: 0.20, deltaT: 0.35, precipitation: 0.25, temperature: 0.20 },
    thresholds: { maxWindMs: 7 },
  },
};

/**
 * Calculate spray window score for a specific product type.
 * Uses product-specific weight profiles and hard thresholds.
 *
 * When no productType is given, falls back to the standard balanced score.
 */
export function calculateSprayWindowScoreForProduct(
  windSpeedMs: number | null,
  temperature: number | null,
  dewPoint: number | null,
  precipitationCurrent: number | null,
  precipitationNext2h: number | null,
  productType: SprayProductType
): SprayWindowScore {
  const profile = SPRAY_PROFILES[productType];
  const w = profile.weights;

  const factors = {
    wind: calculateWindScore(windSpeedMs),
    deltaT: calculateDeltaTScore(temperature, dewPoint),
    precipitation: calculatePrecipitationScore(precipitationCurrent, precipitationNext2h),
    temperature: calculateTemperatureScoreForProduct(temperature, productType),
  };

  // Weighted average with product-specific weights
  let score = Math.round(
    factors.wind * w.wind +
    factors.deltaT * w.deltaT +
    factors.precipitation * w.precipitation +
    factors.temperature * w.temperature
  );

  // Apply hard thresholds — instant red card
  const t = profile.thresholds;
  if (t) {
    if (t.maxWindMs !== undefined && windSpeedMs !== null && windSpeedMs > t.maxWindMs) {
      score = Math.min(score, 20);
    }
    if (t.minTempC !== undefined && temperature !== null && temperature < t.minTempC) {
      score = Math.min(score, 25);
    }
    if (t.maxTempC !== undefined && temperature !== null && temperature > t.maxTempC) {
      score = Math.min(score, 25);
    }
  }

  let label: SprayWindowScore['label'];
  if (score > 70) label = 'Groen';
  else if (score >= 40) label = 'Oranje';
  else label = 'Rood';

  return { score, label, factors };
}

/**
 * Temperature score adjusted for product type.
 * Growth regulators have a very narrow window (12-22°C).
 * Systemic products need warmer conditions for plant uptake (>8°C).
 */
function calculateTemperatureScoreForProduct(
  temperature: number | null,
  productType: SprayProductType
): number {
  if (temperature === null) return 50;

  if (productType === 'groeistof') {
    // Very narrow: 12-22°C ideal, 10-12 or 22-25 acceptable
    if (temperature >= 12 && temperature <= 22) return 100;
    if (temperature >= 10 && temperature < 12) return 60;
    if (temperature > 22 && temperature <= 25) return 60;
    if (temperature >= 8 && temperature < 10) return 30;
    return 10;
  }

  if (productType === 'systemisch') {
    // Needs warmer for uptake: 10-28°C ideal
    if (temperature >= 10 && temperature <= 28) return 100;
    if (temperature >= 8 && temperature < 10) return 60;
    if (temperature > 28 && temperature <= 32) return 60;
    if (temperature >= 5 && temperature < 8) return 30;
    return 10;
  }

  // Default (contact + meststof): same as original
  return calculateTemperatureScore(temperature);
}

// ---- Daily Aggregation ----

/**
 * Aggregate hourly data into daily summary.
 * Used for computing weather_data_daily from weather_data_hourly.
 */
export function aggregateHourlyToDaily(
  hourlyRows: Array<{
    temperature_c: number | null;
    humidity_pct: number | null;
    precipitation_mm: number | null;
    wind_speed_ms: number | null;
    leaf_wetness_pct: number | null;
    et0_mm: number | null;
    solar_radiation: number | null;
  }>
): {
  temp_min_c: number | null;
  temp_max_c: number | null;
  temp_avg_c: number | null;
  precipitation_sum: number | null;
  humidity_avg_pct: number | null;
  wind_speed_max_ms: number | null;
  wind_speed_avg_ms: number | null;
  leaf_wetness_hrs: number;
  et0_sum_mm: number | null;
  solar_radiation_sum: number | null;
  gdd_base5: number | null;
  gdd_base10: number | null;
  frost_hours: number;
} {
  const temps = hourlyRows.map(r => r.temperature_c).filter((t): t is number => t !== null);
  const humidities = hourlyRows.map(r => r.humidity_pct).filter((h): h is number => h !== null);
  const winds = hourlyRows.map(r => r.wind_speed_ms).filter((w): w is number => w !== null);
  const et0s = hourlyRows.map(r => r.et0_mm).filter((e): e is number => e !== null);
  const radiations = hourlyRows.map(r => r.solar_radiation).filter((s): s is number => s !== null);
  const precips = hourlyRows.map(r => r.precipitation_mm).filter((p): p is number => p !== null);

  const tempMin = temps.length > 0 ? Math.min(...temps) : null;
  const tempMax = temps.length > 0 ? Math.max(...temps) : null;
  const tempAvg = temps.length > 0
    ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10
    : null;

  const humidityAvg = humidities.length > 0
    ? Math.round((humidities.reduce((a, b) => a + b, 0) / humidities.length) * 10) / 10
    : null;

  const windMax = winds.length > 0 ? Math.max(...winds) : null;
  const windAvg = winds.length > 0
    ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10
    : null;

  const precipSum = precips.length > 0
    ? Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10
    : null;

  const et0Sum = et0s.length > 0
    ? Math.round(et0s.reduce((a, b) => a + b, 0) * 100) / 100
    : null;

  // Solar radiation: convert from W/m² hourly to MJ/m²/day
  // 1 W/m² for 1 hour = 3600 J/m² = 0.0036 MJ/m²
  const solarSum = radiations.length > 0
    ? Math.round(radiations.reduce((a, b) => a + b, 0) * 0.0036 * 10) / 10
    : null;

  const leafWetnessHrs = hourlyRows.filter(
    r => r.leaf_wetness_pct !== null && r.leaf_wetness_pct > 50
  ).length;

  const frostHours = hourlyRows.filter(
    r => r.temperature_c !== null && r.temperature_c < 0
  ).length;

  const gddBase5 = calculateGDD(tempMax, tempMin, 5);
  const gddBase10 = calculateGDD(tempMax, tempMin, 10);

  return {
    temp_min_c: tempMin !== null ? Math.round(tempMin * 10) / 10 : null,
    temp_max_c: tempMax !== null ? Math.round(tempMax * 10) / 10 : null,
    temp_avg_c: tempAvg,
    precipitation_sum: precipSum,
    humidity_avg_pct: humidityAvg,
    wind_speed_max_ms: windMax !== null ? Math.round(windMax * 10) / 10 : null,
    wind_speed_avg_ms: windAvg,
    leaf_wetness_hrs: leafWetnessHrs,
    et0_sum_mm: et0Sum,
    solar_radiation_sum: solarSum,
    gdd_base5: gddBase5 !== null ? Math.round(gddBase5 * 10) / 10 : null,
    gdd_base10: gddBase10 !== null ? Math.round(gddBase10 * 10) / 10 : null,
    frost_hours: frostHours,
  };
}
