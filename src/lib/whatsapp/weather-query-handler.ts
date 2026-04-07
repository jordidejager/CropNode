/**
 * WhatsApp Weather Query Handler.
 *
 * Handles "wat is het weer" / "weersverwachting" / "14 daagse" intents.
 *
 * Flow:
 * 1. Resolve user → first parcel with location → weather station
 * 2. Fetch multi-model forecast (already paginated to bypass PostgREST 1000 row limit)
 * 3. Aggregate per day across models (avg + stdev for uncertainty)
 * 4. In parallel:
 *    a) Build a 14-day chart URL via QuickChart.io
 *    b) Generate a Dutch summary via Gemini
 * 5. Send chart as WhatsApp image, then summary as text
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { sendImageMessage, sendTextMessage } from './client';
import { logMessage } from './store';
import { stripPlus } from './phone-utils';
import { getOrCreateWeatherStation, getMultiModelForecast } from '@/lib/weather/weather-service';
import { ensureWeatherStation } from '@/lib/weather/ensure-weather-station';
import { createForecastChartUrl, type DailyForecastPoint } from '@/lib/weather/forecast-chart-url';
import { summarizeWeatherForecast, type DaySummaryInput } from '@/ai/flows/summarize-weather-forecast';

// ============================================================================
// Intent detection
// ============================================================================

const WEATHER_QUERY_PATTERNS: RegExp[] = [
  /\b(?:weers?verwachting|weersvoorspelling)\b/i,
  /\b(?:14[\s-]?daagse|veertien[\s-]?daagse|tien[\s-]?daagse)\b/i,
  /\b(?:hoe|wat) (?:is|wordt|gaat) het weer\b/i,
  /\b(?:wordt het|gaat het) (?:droog|nat|warm|koud|regen)/i,
  /\b(?:komende|volgende) (?:week|dagen)(?: het)? weer\b/i,
  /\bweer (?:voor|van|deze week|komende|volgende)\b/i,
  /\b(?:verwachting|voorspelling) (?:voor )?(?:het )?weer\b/i,
  /^weer\??$/i,
];

/** Returns true if the message looks like a weather forecast question. */
export function isWeatherQueryIntent(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return WEATHER_QUERY_PATTERNS.some(p => p.test(lower));
}

// ============================================================================
// Main handler
// ============================================================================

export async function handleWeatherQuery(
  userId: string,
  phoneNumber: string,
  queryText: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  try {
    await logMessage({ phoneNumber, direction: 'inbound', messageText: queryText });

    // 1. Resolve a station for this user
    const resolved = await resolveStationForUser(userId);
    if (!resolved) {
      const msg = '🌦️ Ik kan nog geen weerstation vinden voor jou. Voeg eerst een perceel met locatie toe in CropNode.';
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    // 2. Fetch multi-model forecast (paginated query)
    console.log(`[handleWeatherQuery] Fetching multimodel for station ${resolved.stationId} (${resolved.stationName})`);
    const forecast = await getMultiModelForecast(resolved.stationId);
    const modelNames = Object.keys(forecast.models);
    console.log(`[handleWeatherQuery] Got ${modelNames.length} models:`, modelNames);

    if (modelNames.length === 0) {
      const msg = `🌦️ Er is nog geen weerdata voor station *${resolved.stationName}*. Open Weather Hub in de app — dat initialiseert automatisch de 14-daagse verwachting — en probeer het daarna opnieuw.`;
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    // 3. Aggregate per day across models
    const dailyAgg = aggregatePerDay(forecast.models);
    console.log(`[handleWeatherQuery] Aggregated ${dailyAgg.length} days from ${modelNames.length} models`);
    if (dailyAgg.length === 0) {
      const msg = '🌦️ Niet genoeg weerdata beschikbaar voor een 14-daagse verwachting.';
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    // Cap at 14 days
    const days = dailyAgg.slice(0, 14);

    // 4. Run chart + summary in parallel
    const chartDays: DailyForecastPoint[] = days.map(d => ({
      date: d.date,
      tmin: d.tmin,
      tmax: d.tmax,
      precipMm: d.precipMm,
    }));

    const summaryDays: DaySummaryInput[] = days.map(d => ({
      date: d.date,
      weekday: weekdayShort(d.date),
      tmin: d.tmin,
      tmax: d.tmax,
      precipMm: d.precipMm,
      precipModelStdev: d.precipStdev,
      windMaxMs: d.windMaxMs,
    }));

    const metrics = computeMetrics(summaryDays);

    const [chartUrl, summary] = await Promise.all([
      createForecastChartUrl(resolved.stationName, chartDays),
      summarizeWeatherForecast({
        stationName: resolved.stationName,
        days: summaryDays,
        metrics,
      }).catch(err => {
        console.warn('[handleWeatherQuery] Summary failed, falling back:', err);
        return buildFallbackSummary(summaryDays, metrics);
      }),
    ]);

    // 5. Send chart image first, then the text summary
    const caption = `📊 14-daagse voor *${resolved.stationName}*`;
    await sendImageMessage(metaPhone, { link: chartUrl }, caption);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: `[image] ${caption}` });

    await sendTextMessage(metaPhone, summary);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: summary });
  } catch (err) {
    console.error('[handleWeatherQuery] Error:', err);
    const msg = '❗ Kon de weersverwachting niet ophalen. Probeer het later opnieuw.';
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
  }
}

// ============================================================================
// Station resolution
// ============================================================================

interface ResolvedStation {
  stationId: string;
  stationName: string;
}

async function resolveStationForUser(userId: string): Promise<ResolvedStation | null> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Admin client niet beschikbaar');

  // ------------------------------------------------------------------
  // Strategy 1 (best): find a station owned by this user that actually
  // has a successful multi-model forecast fetch logged. This guarantees
  // we pick a station with real forecast data (not a freshly created empty one).
  // ------------------------------------------------------------------
  try {
    const { data: userStations } = await (admin as any)
      .from('weather_stations')
      .select('id, name')
      .eq('user_id', userId);

    const stationIds: string[] = (userStations || []).map((s: any) => s.id);
    console.log(`[resolveStationForUser] User ${userId} owns ${stationIds.length} station(s):`, stationIds);

    if (stationIds.length > 0) {
      // Find the station with the most recent successful multi-model fetch
      const { data: log } = await (admin as any)
        .from('weather_fetch_log')
        .select('station_id, fetched_at')
        .in('station_id', stationIds)
        .eq('fetch_type', 'forecast_multimodel')
        .eq('status', 'success')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (log?.station_id) {
        const stationName = (userStations || []).find((s: any) => s.id === log.station_id)?.name;
        console.log(`[resolveStationForUser] ✅ Picked station ${log.station_id} via fetch_log`);
        return {
          stationId: log.station_id,
          stationName: stationName || 'jouw locatie',
        };
      }

      // Strategy 1b: no fetch_log, but maybe there's raw forecast data anyway.
      // Query weather_data_hourly for ANY station of this user with is_forecast data.
      const { data: anyForecast } = await (admin as any)
        .from('weather_data_hourly')
        .select('station_id')
        .in('station_id', stationIds)
        .eq('is_forecast', true)
        .neq('model_name', 'best_match')
        .limit(1)
        .maybeSingle();

      if (anyForecast?.station_id) {
        const stationName = (userStations || []).find((s: any) => s.id === anyForecast.station_id)?.name;
        console.log(`[resolveStationForUser] ✅ Picked station ${anyForecast.station_id} via weather_data_hourly`);
        return {
          stationId: anyForecast.station_id,
          stationName: stationName || 'jouw locatie',
        };
      }
    }
  } catch (err) {
    console.warn('[resolveStationForUser] Strategy 1 lookup failed, falling through:', err);
  }

  // ------------------------------------------------------------------
  // Strategy 2: an already-linked station via parcel_weather_stations
  // ------------------------------------------------------------------
  try {
    const { data: linked } = await (admin as any)
      .from('parcel_weather_stations')
      .select('station_id, parcels!inner(user_id, name)')
      .eq('parcels.user_id', userId)
      .limit(1)
      .maybeSingle();

    if (linked?.station_id) {
      const station = await getStationFromAdmin(linked.station_id);
      console.log(`[resolveStationForUser] ⚠️  Fallback to parcel_weather_stations: ${linked.station_id}`);
      return {
        stationId: linked.station_id,
        stationName: station?.name || linked.parcels?.name || 'jouw locatie',
      };
    }
  } catch (err) {
    console.warn('[resolveStationForUser] Strategy 2 lookup failed, falling through:', err);
  }

  // ------------------------------------------------------------------
  // Strategy 3: find first parcel with a location and ensure a station for it
  // ------------------------------------------------------------------
  const { data: parcels } = await (admin as any)
    .from('parcels')
    .select('id, name, location')
    .eq('user_id', userId)
    .not('location', 'is', null)
    .order('name')
    .limit(1);

  const parcel = parcels?.[0];
  if (!parcel?.location) {
    console.log(`[resolveStationForUser] ❌ No parcels with location for user ${userId}`);
    return null;
  }

  try {
    const stationId = await ensureWeatherStation(userId, parcel.id);
    const station = await getStationFromAdmin(stationId);
    console.log(`[resolveStationForUser] 🆕 Created/linked station ${stationId} for parcel ${parcel.id}`);
    return {
      stationId,
      stationName: station?.name || parcel.name || 'jouw locatie',
    };
  } catch (err) {
    console.error('[resolveStationForUser] ensureWeatherStation failed:', err);
    // Last resort: create-only via getOrCreateWeatherStation (no parcel linking)
    const { lat, lng } = parcel.location as { lat: number; lng: number };
    const stationId = await getOrCreateWeatherStation(userId, lat, lng);
    return { stationId, stationName: parcel.name || 'jouw locatie' };
  }
}

async function getStationFromAdmin(stationId: string): Promise<{ name: string | null } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await (admin as any)
    .from('weather_stations')
    .select('name')
    .eq('id', stationId)
    .maybeSingle();
  return data;
}

// ============================================================================
// Day aggregation across models
// ============================================================================

interface AggregatedDay {
  date: string;       // YYYY-MM-DD
  tmin: number;
  tmax: number;
  precipMm: number;
  precipStdev: number;
  windMaxMs: number;
}

type ModelData = {
  time: string[];
  temperature_c: (number | null)[];
  precipitation_mm: (number | null)[];
  wind_speed_ms: (number | null)[];
};

function aggregatePerDay(models: Record<string, ModelData>): AggregatedDay[] {
  // Per (date, model) collect arrays, then average across models for each day.
  // Step 1: per model, group rows by date.
  const perModelDaily = new Map<string, Map<string, { temps: number[]; precips: number[]; winds: number[] }>>();

  for (const [modelName, m] of Object.entries(models)) {
    const dayMap = new Map<string, { temps: number[]; precips: number[]; winds: number[] }>();
    for (let i = 0; i < m.time.length; i++) {
      const date = m.time[i].slice(0, 10); // YYYY-MM-DD
      if (!dayMap.has(date)) dayMap.set(date, { temps: [], precips: [], winds: [] });
      const bucket = dayMap.get(date)!;
      const t = m.temperature_c[i];
      const p = m.precipitation_mm[i];
      const w = m.wind_speed_ms[i];
      if (t !== null && t !== undefined) bucket.temps.push(t);
      if (p !== null && p !== undefined) bucket.precips.push(p);
      if (w !== null && w !== undefined) bucket.winds.push(w);
    }
    perModelDaily.set(modelName, dayMap);
  }

  // Step 2: collect all unique dates (sorted) and aggregate across models per day.
  const allDates = new Set<string>();
  for (const dayMap of perModelDaily.values()) {
    for (const date of dayMap.keys()) allDates.add(date);
  }
  const sortedDates = Array.from(allDates).sort();

  const result: AggregatedDay[] = [];
  for (const date of sortedDates) {
    const tmins: number[] = [];
    const tmaxs: number[] = [];
    const precipTotals: number[] = []; // one total per model — used for stdev
    const winds: number[] = [];

    for (const dayMap of perModelDaily.values()) {
      const bucket = dayMap.get(date);
      if (!bucket) continue;
      if (bucket.temps.length > 0) {
        tmins.push(Math.min(...bucket.temps));
        tmaxs.push(Math.max(...bucket.temps));
      }
      if (bucket.precips.length > 0) {
        precipTotals.push(bucket.precips.reduce((a, b) => a + b, 0));
      }
      if (bucket.winds.length > 0) {
        winds.push(Math.max(...bucket.winds));
      }
    }

    // Need at least one model with temperature data; otherwise skip
    if (tmins.length === 0) continue;

    result.push({
      date,
      tmin: avg(tmins),
      tmax: avg(tmaxs),
      precipMm: precipTotals.length > 0 ? avg(precipTotals) : 0,
      precipStdev: precipTotals.length > 1 ? stdev(precipTotals) : 0,
      windMaxMs: winds.length > 0 ? avg(winds) : 0,
    });
  }

  return result;
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  const m = avg(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

// ============================================================================
// Metrics + fallback summary
// ============================================================================

function computeMetrics(days: DaySummaryInput[]) {
  const week1 = days.slice(0, 7);
  const week2 = days.slice(7, 14);

  const week1AvgTemp = week1.length > 0 ? avg(week1.map(d => (d.tmin + d.tmax) / 2)) : 0;
  const week2AvgTemp = week2.length > 0 ? avg(week2.map(d => (d.tmin + d.tmax) / 2)) : 0;
  const totalPrecipWeek1 = week1.reduce((a, d) => a + d.precipMm, 0);
  const totalPrecipWeek2 = week2.reduce((a, d) => a + d.precipMm, 0);

  // Longest dry window: consecutive days with precipMm < 0.5
  let longest = 0;
  let current = 0;
  for (const d of days) {
    if (d.precipMm < 0.5) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  // High uncertainty: stdev > 3mm AND avg precip > 1mm
  const highUncertaintyDates = days
    .filter(d => d.precipModelStdev > 3 && d.precipMm > 1)
    .map(d => d.date);

  return {
    week1AvgTemp,
    week2AvgTemp,
    totalPrecipWeek1,
    totalPrecipWeek2,
    longestDryWindowDays: longest,
    highUncertaintyDates,
  };
}

/** Deterministic fallback used when Gemini is unavailable. */
function buildFallbackSummary(
  days: DaySummaryInput[],
  m: ReturnType<typeof computeMetrics>
): string {
  const parts: string[] = [];

  const tomorrow = days[1];
  if (tomorrow) {
    parts.push(
      `Morgen rond ${Math.round(tomorrow.tmin)}–${Math.round(tomorrow.tmax)}°C` +
        (tomorrow.precipMm > 1 ? ` met ${tomorrow.precipMm.toFixed(0)}mm regen.` : ' en grotendeels droog.')
    );
  }

  const tempDelta = m.week2AvgTemp - m.week1AvgTemp;
  if (Math.abs(tempDelta) >= 2) {
    parts.push(
      tempDelta > 0
        ? `Volgende week wordt het zachter (${m.week2AvgTemp.toFixed(0)}°C gem.).`
        : `Volgende week koelt het af naar gemiddeld ${m.week2AvgTemp.toFixed(0)}°C.`
    );
  }

  parts.push(
    `Week 1 totaal ~${m.totalPrecipWeek1.toFixed(0)}mm, week 2 ~${m.totalPrecipWeek2.toFixed(0)}mm regen.`
  );

  if (m.longestDryWindowDays >= 3) {
    parts.push(`Langste droge venster is ${m.longestDryWindowDays} dagen — bruikbaar voor spuitwerk.`);
  }

  if (m.highUncertaintyDates.length > 0) {
    parts.push(`Modellen verschillen op ${m.highUncertaintyDates.length} dag(en), houd het in de gaten.`);
  }

  return parts.join(' ');
}

// ============================================================================
// Helpers
// ============================================================================

function weekdayShort(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00');
  return d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
}
