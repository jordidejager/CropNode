/**
 * Weather Calculations Tests
 * Run with: npx tsx src/__tests__/weather-calculations.test.ts
 *
 * Tests for: leaf wetness estimation, GDD, Delta-T, spray window score,
 * daily aggregation, and cumulative GDD.
 */

import assert from 'node:assert';
import {
  estimateLeafWetness,
  calculateGDD,
  calculateCumulativeGDD,
  calculateLeafWetnessHours,
  calculateFrostHours,
  calculateDeltaT,
  calculateSprayWindowScore,
  aggregateHourlyToDaily,
} from '../lib/weather/weather-calculations';
import { parseHourlyResponse } from '../lib/weather/open-meteo-client';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

// ---- Leaf Wetness Estimation ----

console.log('\nLeaf Wetness Estimation:');

test('returns 100% when precipitation > 0', () => {
  assert.strictEqual(estimateLeafWetness(80, 15, 12, 0.5), 100);
});

test('returns 90% when humidity > 95%', () => {
  assert.strictEqual(estimateLeafWetness(97, 15, 12, 0), 90);
});

test('returns 70% when humidity > 90%', () => {
  assert.strictEqual(estimateLeafWetness(92, 15, 12, 0), 70);
});

test('returns 50% when temp - dewpoint < 2', () => {
  assert.strictEqual(estimateLeafWetness(80, 15, 14, 0), 50);
});

test('returns 30% when humidity > 85%', () => {
  assert.strictEqual(estimateLeafWetness(87, 15, 10, 0), 30);
});

test('returns 0% for dry conditions', () => {
  assert.strictEqual(estimateLeafWetness(60, 20, 10, 0), 0);
});

test('returns null when humidity is null', () => {
  assert.strictEqual(estimateLeafWetness(null, 15, 12, 0), null);
});

test('precipitation takes priority over humidity', () => {
  assert.strictEqual(estimateLeafWetness(50, 15, 10, 1.0), 100);
});

// ---- Growing Degree Days ----

console.log('\nGrowing Degree Days:');

test('GDD base 5: warm day', () => {
  const gdd = calculateGDD(25, 15, 5);
  assert.strictEqual(gdd, 15); // (25+15)/2 - 5 = 15
});

test('GDD base 10: warm day', () => {
  const gdd = calculateGDD(25, 15, 10);
  assert.strictEqual(gdd, 10); // (25+15)/2 - 10 = 10
});

test('GDD returns 0 when avg temp below base', () => {
  const gdd = calculateGDD(5, 3, 10);
  assert.strictEqual(gdd, 0); // (5+3)/2 = 4, 4 - 10 < 0 → 0
});

test('GDD returns null when temps are null', () => {
  assert.strictEqual(calculateGDD(null, 15, 5), null);
  assert.strictEqual(calculateGDD(25, null, 5), null);
});

test('GDD handles frost correctly', () => {
  const gdd = calculateGDD(2, -2, 5);
  assert.strictEqual(gdd, 0); // (2+(-2))/2 = 0, 0 - 5 < 0 → 0
});

// ---- Cumulative GDD ----

console.log('\nCumulative GDD:');

test('cumulative GDD accumulates correctly', () => {
  const data = [
    { date: '2024-04-01', gdd: 5 },
    { date: '2024-04-02', gdd: 8 },
    { date: '2024-04-03', gdd: null },
    { date: '2024-04-04', gdd: 3 },
  ];
  const result = calculateCumulativeGDD(data);
  assert.strictEqual(result[0]!.cumulativeGdd, 5);
  assert.strictEqual(result[1]!.cumulativeGdd, 13);
  assert.strictEqual(result[2]!.cumulativeGdd, 13); // null gdd, no change
  assert.strictEqual(result[3]!.cumulativeGdd, 16);
});

// ---- Leaf Wetness Hours ----

console.log('\nLeaf Wetness Hours:');

test('counts hours with leaf wetness > 50%', () => {
  const data = [
    { leafWetnessPct: 100 },
    { leafWetnessPct: 70 },
    { leafWetnessPct: 30 },
    { leafWetnessPct: 0 },
    { leafWetnessPct: 90 },
    { leafWetnessPct: null },
  ];
  assert.strictEqual(calculateLeafWetnessHours(data), 3);
});

// ---- Frost Hours ----

console.log('\nFrost Hours:');

test('counts hours below 0°C', () => {
  const data = [
    { temperatureC: -2 },
    { temperatureC: 0 },
    { temperatureC: 3 },
    { temperatureC: -0.5 },
    { temperatureC: null },
  ];
  assert.strictEqual(calculateFrostHours(data), 2);
});

// ---- Delta-T ----

console.log('\nDelta-T:');

test('too wet: deltaT < 2', () => {
  const result = calculateDeltaT(15, 14);
  assert.strictEqual(result?.category, 'too_wet');
  assert.strictEqual(result?.value, 1);
});

test('ideal: deltaT 2-8', () => {
  const result = calculateDeltaT(20, 15);
  assert.strictEqual(result?.category, 'ideal');
  assert.strictEqual(result?.value, 5);
});

test('acceptable: deltaT 8-10', () => {
  const result = calculateDeltaT(25, 16);
  assert.strictEqual(result?.category, 'acceptable');
  assert.strictEqual(result?.value, 9);
});

test('too dry: deltaT > 10', () => {
  const result = calculateDeltaT(30, 15);
  assert.strictEqual(result?.category, 'too_dry');
  assert.strictEqual(result?.value, 15);
});

test('returns null when inputs are null', () => {
  assert.strictEqual(calculateDeltaT(null, 15), null);
  assert.strictEqual(calculateDeltaT(20, null), null);
});

// ---- Spray Window Score ----

console.log('\nSpray Window Score:');

test('perfect conditions: high score, green label', () => {
  const result = calculateSprayWindowScore(2.5, 18, 13, 0, 0);
  assert.ok(result.score > 70, `Expected score > 70, got ${result.score}`);
  assert.strictEqual(result.label, 'Groen');
});

test('rain: significantly lower score', () => {
  const resultDry = calculateSprayWindowScore(2.5, 18, 13, 0, 0);
  const resultRain = calculateSprayWindowScore(2.5, 18, 13, 1.0, 0);
  assert.ok(resultRain.score < resultDry.score, `Rain should lower the score (dry: ${resultDry.score}, rain: ${resultRain.score})`);
});

test('high wind: lower score', () => {
  const result = calculateSprayWindowScore(8, 18, 13, 0, 0);
  assert.ok(result.score < 80, `Expected score < 80 with high wind, got ${result.score}`);
});

test('very high wind: not green', () => {
  const result = calculateSprayWindowScore(12, 18, 13, 0, 0);
  assert.ok(result.label !== 'Groen', `Expected non-green with 12 m/s wind, got ${result.label} (score: ${result.score})`);
});

test('cold temperature: lower score', () => {
  const resultCold = calculateSprayWindowScore(2, 3, -2, 0, 0);
  const resultWarm = calculateSprayWindowScore(2, 18, 13, 0, 0);
  assert.ok(resultCold.score < resultWarm.score, 'Cold should score lower than warm');
});

// ---- Daily Aggregation ----

console.log('\nDaily Aggregation:');

test('aggregates hourly data correctly', () => {
  const hourlyRows = [
    { temperature_c: 10, humidity_pct: 80, precipitation_mm: 0, wind_speed_ms: 3, leaf_wetness_pct: 30, et0_mm: 0.1, solar_radiation: 200 },
    { temperature_c: 15, humidity_pct: 70, precipitation_mm: 2, wind_speed_ms: 5, leaf_wetness_pct: 100, et0_mm: 0.3, solar_radiation: 400 },
    { temperature_c: 20, humidity_pct: 60, precipitation_mm: 0, wind_speed_ms: 2, leaf_wetness_pct: 0, et0_mm: 0.5, solar_radiation: 600 },
    { temperature_c: 12, humidity_pct: 85, precipitation_mm: 0, wind_speed_ms: 4, leaf_wetness_pct: 30, et0_mm: 0.2, solar_radiation: 100 },
  ];

  const result = aggregateHourlyToDaily(hourlyRows);

  assert.strictEqual(result.temp_min_c, 10);
  assert.strictEqual(result.temp_max_c, 20);
  assert.strictEqual(result.precipitation_sum, 2);
  assert.strictEqual(result.leaf_wetness_hrs, 1); // Only 1 hour > 50%
  assert.strictEqual(result.frost_hours, 0);
  assert.ok(result.temp_avg_c !== null);
  assert.ok(result.wind_speed_max_ms === 5);
  assert.ok(result.et0_sum_mm !== null && result.et0_sum_mm > 0);
  assert.ok(result.gdd_base5 !== null);
  assert.ok(result.gdd_base10 !== null);
});

test('handles all null values', () => {
  const hourlyRows = [
    { temperature_c: null, humidity_pct: null, precipitation_mm: null, wind_speed_ms: null, leaf_wetness_pct: null, et0_mm: null, solar_radiation: null },
  ];

  const result = aggregateHourlyToDaily(hourlyRows);

  assert.strictEqual(result.temp_min_c, null);
  assert.strictEqual(result.temp_max_c, null);
  assert.strictEqual(result.temp_avg_c, null);
  assert.strictEqual(result.precipitation_sum, null);
  assert.strictEqual(result.leaf_wetness_hrs, 0);
  assert.strictEqual(result.frost_hours, 0);
  assert.strictEqual(result.gdd_base5, null);
});

test('frost hours are counted correctly', () => {
  const hourlyRows = [
    { temperature_c: -2, humidity_pct: 90, precipitation_mm: 0, wind_speed_ms: 1, leaf_wetness_pct: 90, et0_mm: 0, solar_radiation: 0 },
    { temperature_c: -1, humidity_pct: 90, precipitation_mm: 0, wind_speed_ms: 1, leaf_wetness_pct: 90, et0_mm: 0, solar_radiation: 0 },
    { temperature_c: 5, humidity_pct: 80, precipitation_mm: 0, wind_speed_ms: 2, leaf_wetness_pct: 0, et0_mm: 0.1, solar_radiation: 100 },
  ];

  const result = aggregateHourlyToDaily(hourlyRows);
  assert.strictEqual(result.frost_hours, 2);
});

// ---- Open-Meteo Client (parseHourlyResponse) ----

console.log('\nOpen-Meteo Response Parsing:');

test('parses hourly response correctly', () => {
  const mockResponse = {
    latitude: 51.89,
    longitude: 5.35,
    elevation: 8,
    timezone: 'Europe/Amsterdam',
    timezone_abbreviation: 'CET',
    utc_offset_seconds: 3600,
    hourly: {
      time: ['2024-06-01T00:00', '2024-06-01T01:00'],
      temperature_2m: [15.5, 14.2],
      relative_humidity_2m: [86, 90],
      precipitation: [0, 0.5],
      wind_speed_10m: [3.2, 2.8],
      wind_direction_10m: [220, 215],
      wind_gusts_10m: [5.5, 4.8],
      et0_fao_evapotranspiration: [0.1, 0.05],
      soil_temperature_6cm: [12.3, 12.1],
      cloud_cover: [60, 80],
      dew_point_2m: [12.8, 13.0],
      direct_radiation: [100, 50],
      diffuse_radiation: [80, 60],
    },
  };

  const rows = parseHourlyResponse(mockResponse, 'test-station-id', false);

  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0]!.station_id, 'test-station-id');
  assert.strictEqual(rows[0]!.temperature_c, 15.5);
  assert.strictEqual(rows[0]!.humidity_pct, 86);
  assert.strictEqual(rows[0]!.precipitation_mm, 0);
  assert.strictEqual(rows[0]!.solar_radiation, 180); // 100 + 80
  assert.strictEqual(rows[0]!.leaf_wetness_pct, 30); // humidity 85 → 30%
  assert.strictEqual(rows[1]!.leaf_wetness_pct, 100); // precipitation > 0 → 100%
  assert.strictEqual(rows[0]!.is_forecast, false);
  assert.strictEqual(rows[0]!.data_source, 'open-meteo');
});

test('handles empty response', () => {
  const emptyResponse = {
    latitude: 51.89,
    longitude: 5.35,
    elevation: 8,
    timezone: 'Europe/Amsterdam',
    timezone_abbreviation: 'CET',
    utc_offset_seconds: 3600,
    hourly: { time: [] },
  };

  const rows = parseHourlyResponse(emptyResponse, 'test', false);
  assert.strictEqual(rows.length, 0);
});

// ---- Station Get-or-Create Logic ----

console.log('\nStation Coordinate Rounding:');

test('coordinates round to 2 decimals correctly', () => {
  // Simulating the rounding logic used in get_or_create_weather_station
  const round = (n: number) => Math.round(n * 100) / 100;

  // Two points within ~1km (same rounded value)
  assert.strictEqual(round(51.8912), round(51.8945)); // Both → 51.89
  assert.strictEqual(round(5.3523), round(5.3487));    // Both → 5.35

  // Two points further apart (different rounded value)
  assert.notStrictEqual(round(51.89), round(51.90)); // 51.89 vs 51.90
});

// ---- Summary ----

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
