/**
 * Disease Service — Orchestration Layer
 *
 * Connects weather data, disease model calculations, and database caching.
 * Handles chunked weather fetching (getHourlyRange has a 3000-row limit ≈ 125 days),
 * runs calculations, and caches results in disease_* tables.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getHourlyRange, getOrCreateWeatherStation } from '@/lib/weather/weather-service';
import type { HourlyWeatherData } from '@/lib/weather/weather-types';
import { buildSeasonProgress } from './apple-scab/ascospore-maturation';
import { detectWetPeriods } from './apple-scab/wet-period-detection';
import { evaluateInfections } from './apple-scab/infection-calculator';
import {
  evaluateCoverageForInfections,
  buildCombinedCoverageTimeline,
} from './apple-scab/fungicide-coverage';
import { fetchSprayEventsForParcel } from './apple-scab/spray-linker';
import type {
  DiseaseModelConfig,
  HourlyWeatherInput,
  SeasonProgressEntry,
  InfectionPeriod,
  InfectionCoverage,
  CoveragePoint,
  ZiektedrukKPIs,
  ZiektedrukResult,
} from './types';

// Max days per weather data fetch (getHourlyRange limit is 3000 rows ≈ 125 days)
const CHUNK_DAYS = 31;
// Cache staleness threshold (matches weather cron: every 3 hours)
const CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/**
 * Convert HourlyWeatherData (from weather service) to HourlyWeatherInput (for disease models).
 */
function toWeatherInput(data: HourlyWeatherData[]): HourlyWeatherInput[] {
  return data.map((d) => ({
    timestamp: d.timestamp,
    temperatureC: d.temperatureC,
    humidityPct: d.humidityPct,
    precipitationMm: d.precipitationMm,
    leafWetnessPct: d.leafWetnessPct,
    dewPointC: d.dewPointC,
    isForecast: d.isForecast,
  }));
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Fetch hourly weather data in 31-day chunks to work within the getHourlyRange limit.
 */
async function fetchWeatherChunked(
  stationId: string,
  startDate: string,
  endDate: string,
  supabase: SupabaseClient
): Promise<HourlyWeatherData[]> {
  const allData: HourlyWeatherData[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let chunkStart = new Date(start);

  while (chunkStart <= end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    const chunkData = await getHourlyRange(
      stationId,
      formatDate(chunkStart),
      formatDate(chunkEnd),
      supabase
    );
    allData.push(...chunkData);

    // Next chunk starts the day after this chunk ends
    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  return allData;
}

/**
 * Get the weather station ID for a parcel.
 */
async function getStationForParcel(
  parcelId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from('parcel_weather_stations')
    .select('station_id')
    .eq('parcel_id', parcelId)
    .single();

  return data?.station_id ?? null;
}

/**
 * Calculate KPIs from season progress and infection periods.
 */
function calculateKPIs(
  seasonProgress: SeasonProgressEntry[],
  infectionPeriods: InfectionPeriod[]
): ZiektedrukKPIs {
  const actualInfections = infectionPeriods.filter(
    (ip) => ip.severity !== 'none'
  );
  const lightCount = actualInfections.filter(
    (ip) => ip.severity === 'light'
  ).length;
  const moderateCount = actualInfections.filter(
    (ip) => ip.severity === 'moderate'
  ).length;
  const severeCount = actualInfections.filter(
    (ip) => ip.severity === 'severe'
  ).length;

  // Current PAM and DD from latest progress entry
  const latestProgress = seasonProgress[seasonProgress.length - 1];
  const currentPAM = latestProgress?.pam ?? 0;
  const currentDD = latestProgress?.cumulativeDD ?? 0;

  // Determine season phase
  let seasonPhase: ZiektedrukKPIs['seasonPhase'] = 'dormant';
  if (currentPAM >= 0.95) seasonPhase = 'ended';
  else if (currentPAM >= 0.7) seasonPhase = 'declining';
  else if (currentPAM >= 0.3) seasonPhase = 'peak';
  else if (currentPAM >= 0.02) seasonPhase = 'building';

  // Estimate season end (PAM > 0.95)
  let estimatedSeasonEnd: string | null = null;
  for (const entry of seasonProgress) {
    if (entry.pam >= 0.95) {
      estimatedSeasonEnd = entry.date;
      break;
    }
  }

  // Next forecast risk
  const forecastInfections = infectionPeriods.filter(
    (ip) => ip.isForecast && ip.severity !== 'none'
  );
  const nextForecastRisk = forecastInfections.length > 0
    ? {
        date: forecastInfections[0].wetPeriodStart,
        severity: forecastInfections[0].severity,
      }
    : null;

  return {
    totalInfections: actualInfections.length,
    lightInfections: lightCount,
    moderateInfections: moderateCount,
    severeInfections: severeCount,
    currentPAM,
    currentDegreeDays: currentDD,
    seasonPhase,
    estimatedSeasonEnd,
    nextForecastRisk,
  };
}

/**
 * Run the full disease model calculation for a parcel.
 */
export async function calculateDiseaseResults(
  config: DiseaseModelConfig,
  supabase: SupabaseClient
): Promise<ZiektedrukResult> {
  // Try to find existing station, or auto-create one
  let stationId = await getStationForParcel(config.parcel_id, supabase);
  if (!stationId) {
    // Get parcel location and create/find station using the existing supabase client
    const { data: parcel } = await supabase
      .from('parcels')
      .select('location')
      .eq('id', config.parcel_id)
      .single();

    if (!parcel?.location) {
      throw new Error(
        `Kan geen weerstation koppelen aan dit perceel. Controleer of het perceel een locatie heeft.`
      );
    }

    const { lat, lng } = parcel.location as { lat: number; lng: number };
    stationId = await getOrCreateWeatherStation(config.user_id, lat, lng, supabase);

    // Link parcel to station
    await supabase
      .from('parcel_weather_stations')
      .upsert({ parcel_id: config.parcel_id, station_id: stationId });
  }

  // Date range: biofix to today + 7 days forecast
  const today = new Date();
  const forecastEnd = new Date(today);
  forecastEnd.setDate(forecastEnd.getDate() + 7);

  const weatherData = await fetchWeatherChunked(
    stationId,
    config.biofix_date,
    formatDate(forecastEnd),
    supabase
  );

  const weatherInput = toWeatherInput(weatherData);

  // Run submodels
  const seasonProgress = buildSeasonProgress(weatherInput, config.biofix_date);
  const wetPeriods = detectWetPeriods(weatherInput);
  const infectionPeriods = evaluateInfections(
    wetPeriods,
    seasonProgress,
    config.biofix_date
  );
  const kpis = calculateKPIs(seasonProgress, infectionPeriods);

  // Coverage model (Niveau 2): link sprays to infection periods
  const sprayEvents = await fetchSprayEventsForParcel(
    config.parcel_id,
    config.harvest_year,
    supabase
  );

  const infectionCoverageMap = evaluateCoverageForInfections(
    infectionPeriods,
    sprayEvents,
    weatherInput,
    seasonProgress
  );

  const coverageTimeline = buildCombinedCoverageTimeline(
    sprayEvents,
    weatherInput,
    seasonProgress
  );

  // Convert Map to plain object for JSON serialization
  const infectionCoverage: Record<string, InfectionCoverage> = {};
  for (const [key, value] of infectionCoverageMap) {
    infectionCoverage[key] = value;
  }

  return {
    configured: true,
    config,
    seasonProgress,
    infectionPeriods,
    kpis,
    coverageTimeline: coverageTimeline.map((p) => ({
      timestamp: p.timestamp instanceof Date ? p.timestamp.toISOString() : String(p.timestamp),
      coveragePct: p.coveragePct,
      product: p.product,
    })),
    infectionCoverage,
    sprayEvents: sprayEvents.map((s) => ({
      date: s.date.toISOString(),
      product: s.products.map((p) => p.name).join(' + '),
    })),
  };
}

/**
 * Calculate and cache results in the database.
 */
export async function calculateAndCache(
  config: DiseaseModelConfig,
  supabase: SupabaseClient
): Promise<ZiektedrukResult> {
  const result = await calculateDiseaseResults(config, supabase);

  // Clear old data for this config
  await supabase
    .from('disease_season_progress')
    .delete()
    .eq('config_id', config.id);

  await supabase
    .from('disease_infection_periods')
    .delete()
    .eq('config_id', config.id);

  // Insert season progress
  if (result.seasonProgress.length > 0) {
    const progressRows = result.seasonProgress.map((sp) => ({
      config_id: config.id,
      date: sp.date,
      degree_days_cumulative: sp.cumulativeDD,
      pam: sp.pam,
      is_forecast: sp.isForecast,
    }));

    // Insert in batches of 200
    for (let i = 0; i < progressRows.length; i += 200) {
      const batch = progressRows.slice(i, i + 200);
      await supabase.from('disease_season_progress').upsert(batch, {
        onConflict: 'config_id,date',
      });
    }
  }

  // Insert infection periods (with coverage data)
  if (result.infectionPeriods.length > 0) {
    const infectionRows = result.infectionPeriods.map((ip) => {
      const coverage = result.infectionCoverage[ip.wetPeriodStart];
      return {
        config_id: config.id,
        wet_period_start: ip.wetPeriodStart,
        wet_period_end: ip.wetPeriodEnd,
        wet_duration_hours: ip.durationHours,
        avg_temperature: ip.avgTemperature,
        severity: ip.severity,
        rim_value: ip.rimValue,
        pam_at_event: ip.pamAtEvent,
        degree_days_cumulative: ip.degreeDaysCumulative,
        expected_symptom_date: ip.expectedSymptomDate,
        is_forecast: ip.isForecast,
        // Coverage columns (Niveau 2)
        coverage_at_infection: coverage?.coverageAtInfection ?? null,
        coverage_status: coverage?.coverageStatus ?? null,
        last_spray_product: coverage?.lastSprayProduct ?? null,
        last_spray_date: coverage?.lastSprayDate ?? null,
        curative_window_open: coverage?.curativeWindowOpen ?? false,
        curative_remaining_dh: coverage?.curativeRemainingDH ?? null,
      };
    });

    await supabase.from('disease_infection_periods').upsert(infectionRows, {
      onConflict: 'config_id,wet_period_start',
    });
  }

  return result;
}

/**
 * Get cached results from the database, or recalculate if stale.
 */
export async function getCachedOrCalculate(
  config: DiseaseModelConfig,
  supabase: SupabaseClient
): Promise<ZiektedrukResult> {
  // Check cache freshness
  const { data: latestProgress } = await supabase
    .from('disease_season_progress')
    .select('created_at')
    .eq('config_id', config.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (latestProgress) {
    const cacheAge =
      Date.now() - new Date(latestProgress.created_at).getTime();

    if (cacheAge < CACHE_MAX_AGE_MS) {
      // Cache is fresh — load from DB
      return loadCachedResults(config, supabase);
    }
  }

  // Cache is stale or missing — recalculate
  return calculateAndCache(config, supabase);
}

/**
 * Load cached results from the database.
 */
async function loadCachedResults(
  config: DiseaseModelConfig,
  supabase: SupabaseClient
): Promise<ZiektedrukResult> {
  const [progressRes, infectionsRes] = await Promise.all([
    supabase
      .from('disease_season_progress')
      .select('*')
      .eq('config_id', config.id)
      .order('date'),
    supabase
      .from('disease_infection_periods')
      .select('*')
      .eq('config_id', config.id)
      .order('wet_period_start'),
  ]);

  const seasonProgress: SeasonProgressEntry[] = (
    progressRes.data ?? []
  ).map((row: Record<string, unknown>) => ({
    date: row.date as string,
    dailyDD: 0, // Not stored in cache — only needed during calculation
    cumulativeDD: Number(row.degree_days_cumulative),
    pam: Number(row.pam),
    isForecast: row.is_forecast as boolean,
  }));

  const infectionPeriods: InfectionPeriod[] = (
    infectionsRes.data ?? []
  ).map((row: Record<string, unknown>) => ({
    wetPeriodStart: row.wet_period_start as string,
    wetPeriodEnd: row.wet_period_end as string,
    durationHours: Number(row.wet_duration_hours),
    avgTemperature: Number(row.avg_temperature),
    severity: row.severity as InfectionPeriod['severity'],
    rimValue: Number(row.rim_value ?? 0),
    pamAtEvent: Number(row.pam_at_event ?? 0),
    degreeDaysCumulative: Number(row.degree_days_cumulative ?? 0),
    expectedSymptomDate: (row.expected_symptom_date as string) ?? null,
    isForecast: row.is_forecast as boolean,
  }));

  const kpis = calculateKPIs(seasonProgress, infectionPeriods);

  // Coverage is always calculated fresh (spuitschrift may have changed)
  const sprayEvents = await fetchSprayEventsForParcel(
    config.parcel_id,
    config.harvest_year,
    supabase
  );

  // For coverage we need hourly weather — fetch it
  let coverageTimeline: CoveragePoint[] = [];
  let infectionCoverage: Record<string, InfectionCoverage> = {};

  if (sprayEvents.length > 0 && seasonProgress.length > 0) {
    const today = new Date();
    const forecastEnd = new Date(today);
    forecastEnd.setDate(forecastEnd.getDate() + 7);

    // Find station for this parcel
    const stationId = await getStationForParcel(config.parcel_id, supabase);
    if (stationId) {
      const weatherData = await fetchWeatherChunked(
        stationId,
        config.biofix_date,
        formatDate(forecastEnd),
        supabase
      );
      const weatherInput = toWeatherInput(weatherData);

      const coverageMap = evaluateCoverageForInfections(
        infectionPeriods,
        sprayEvents,
        weatherInput,
        seasonProgress
      );
      for (const [key, value] of coverageMap) {
        infectionCoverage[key] = value;
      }

      coverageTimeline = buildCombinedCoverageTimeline(
        sprayEvents,
        weatherInput,
        seasonProgress
      );
    }
  }

  return {
    configured: true,
    config,
    seasonProgress,
    infectionPeriods,
    kpis,
    coverageTimeline: coverageTimeline.map((p) => ({
      timestamp: p.timestamp instanceof Date ? p.timestamp.toISOString() : String(p.timestamp),
      coveragePct: p.coveragePct,
      product: p.product,
    })),
    infectionCoverage,
    sprayEvents: sprayEvents.map((s) => ({
      date: s.date.toISOString(),
      product: s.products.map((p) => p.name).join(' + '),
    })),
  };
}

/**
 * Get disease model config for a parcel and harvest year.
 */
export async function getConfig(
  parcelId: string,
  harvestYear: number,
  supabase: SupabaseClient
): Promise<DiseaseModelConfig | null> {
  const { data } = await supabase
    .from('disease_model_config')
    .select('*')
    .eq('parcel_id', parcelId)
    .eq('harvest_year', harvestYear)
    .eq('disease_type', 'apple_scab')
    .single();

  return data as DiseaseModelConfig | null;
}

/**
 * Upsert disease model config.
 */
export async function upsertConfig(
  userId: string,
  parcelId: string,
  harvestYear: number,
  biofixDate: string,
  inoculumPressure: string,
  supabase: SupabaseClient
): Promise<DiseaseModelConfig> {
  const { data, error } = await supabase
    .from('disease_model_config')
    .upsert(
      {
        user_id: userId,
        parcel_id: parcelId,
        harvest_year: harvestYear,
        disease_type: 'apple_scab',
        biofix_date: biofixDate,
        inoculum_pressure: inoculumPressure,
      },
      { onConflict: 'user_id,parcel_id,harvest_year,disease_type' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as DiseaseModelConfig;
}
