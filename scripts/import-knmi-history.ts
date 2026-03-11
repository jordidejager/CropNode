/**
 * KNMI Historical Weather Data Import Script
 *
 * Pre-imports hourly + daily aggregated data for all KNMI fruit-region stations.
 * This makes the Historie page load instantly for all users.
 *
 * Run:  npx tsx scripts/import-knmi-history.ts
 * Env:  reads from .env.local automatically
 *
 * Options:
 *   --years=N    Number of years back (default: 3)
 *   --station=N  Only import a specific station code
 *   --daily-only Skip hourly import, only re-aggregate daily
 */

import { config } from 'dotenv';
import { execFileSync } from 'child_process';
import { inflateRawSync } from 'zlib';
import { writeFileSync, unlinkSync } from 'fs';

config({ path: '.env.local' });

// ---- Config ----

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BATCH_SIZE = 200;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing env vars. Check .env.local');
  process.exit(1);
}

// ---- curl-based helpers using execFileSync (bypasses Node.js 25 TLS issues) ----

function curlGet(url: string, headers: Record<string, string>): string {
  const args = ['-s', '-4', url];
  for (const [k, v] of Object.entries(headers)) {
    args.push('-H', `${k}: ${v}`);
  }
  return execFileSync('curl', args, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }).toString('utf-8');
}

function curlPost(url: string, body: string, headers: Record<string, string>, retries: number = 3): string {
  const tmpFile = `/tmp/knmi_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
  writeFileSync(tmpFile, body, 'utf-8');
  try {
    const args = ['-s', '-4', '--retry', '2', '--retry-delay', '3', '--connect-timeout', '30', '--max-time', '120', '-X', 'POST', url, '--data-binary', `@${tmpFile}`];
    for (const [k, v] of Object.entries(headers)) {
      args.push('-H', `${k}: ${v}`);
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return execFileSync('curl', args, { maxBuffer: 50 * 1024 * 1024, timeout: 180000 }).toString('utf-8');
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries - 1) {
          // Brief pause between retries
          execFileSync('sleep', ['2']);
        }
      }
    }
    throw lastError!;
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function curlPostForm(url: string, formData: string): string {
  const args = ['-s', '-4', '-X', 'POST', url, '-d', formData, '-H', 'Content-Type: application/x-www-form-urlencoded'];
  return execFileSync('curl', args, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }).toString('utf-8');
}

const SB_HEADERS: Record<string, string> = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

function supabaseSelect<T>(table: string, query: string = ''): T[] {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const result = curlGet(url, SB_HEADERS);
  return JSON.parse(result);
}

function supabaseUpsert(table: string, rows: Record<string, unknown>[], onConflict?: string): void {
  const conflictParam = onConflict ? `?on_conflict=${onConflict}` : '';
  const url = `${SUPABASE_URL}/rest/v1/${table}${conflictParam}`;
  const headers = { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates' };
  const result = curlPost(url, JSON.stringify(rows), headers);
  if (result && result.includes('"code"') && result.includes('"message"')) {
    try {
      const parsed = JSON.parse(result);
      if (parsed.message) throw new Error(`UPSERT ${table}: ${parsed.message}`);
    } catch (e) { if ((e as Error).message.startsWith('UPSERT')) throw e; }
  }
}

function supabaseInsert(table: string, row: Record<string, unknown>): void {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const headers = { ...SB_HEADERS, Prefer: 'return=minimal' };
  curlPost(url, JSON.stringify(row), headers);
}

// ---- CLI Args ----

const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg?.split('=')[1];
};

const YEARS_BACK = parseInt(getArg('years') ?? '3', 10);
const ONLY_STATION = getArg('station') ? parseInt(getArg('station')!, 10) : null;
const DAILY_ONLY = args.includes('--daily-only');

// ---- KNMI CSV Parsing ----

type KnmiHourlyRow = {
  station_code: number;
  timestamp: string;
  temperature_c: number | null;
  temperature_min_c: number | null;
  humidity_pct: number | null;
  precipitation_mm: number | null;
  precipitation_duration_hrs: number | null;
  wind_speed_ms: number | null;
  wind_direction: number | null;
  wind_gust_ms: number | null;
  solar_radiation_jcm2: number | null;
  sunshine_hours: number | null;
  pressure_hpa: number | null;
  cloud_cover_octets: number | null;
  dew_point_c: number | null;
  visibility_m: number | null;
  data_source: 'knmi_bulk';
};

function extractFromZip(buffer: Buffer): string {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    const text = buffer.toString('utf-8');
    if (text.includes('STN') || text.includes('#')) return text;
    throw new Error('Not a ZIP or KNMI CSV');
  }

  const compressionMethod = buffer.readUInt16LE(8);
  const compressedSize = buffer.readUInt32LE(18);
  const fileNameLength = buffer.readUInt16LE(26);
  const extraFieldLength = buffer.readUInt16LE(28);
  const dataOffset = 30 + fileNameLength + extraFieldLength;

  if (compressionMethod === 0) {
    return buffer.subarray(dataOffset, dataOffset + compressedSize).toString('utf-8');
  } else if (compressionMethod === 8) {
    return inflateRawSync(buffer.subarray(dataOffset, dataOffset + compressedSize)).toString('utf-8');
  }
  throw new Error(`Unsupported compression: ${compressionMethod}`);
}

function parseKnmiLine(line: string): KnmiHourlyRow | null {
  const parts = line.split(',').map(s => s.trim());
  if (parts.length < 24) return null;

  const stn = parseInt(parts[0], 10);
  const dateStr = parts[1];
  const hh = parseInt(parts[2], 10);
  if (isNaN(stn) || isNaN(hh) || !dateStr || dateStr.length !== 8) return null;

  const hour = hh - 1;
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  const timestamp = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:00:00+00:00`;

  const parseVal = (idx: number): number | null => {
    const raw = parts[idx]?.trim();
    if (!raw || raw === '') return null;
    const val = parseInt(raw, 10);
    return isNaN(val) ? null : val;
  };

  const div10 = (idx: number): number | null => {
    const val = parseVal(idx);
    return val !== null ? Math.round(val) / 10 : null;
  };

  const div10ZeroNeg = (idx: number): number | null => {
    const val = parseVal(idx);
    if (val === null) return null;
    if (val === -1) return 0;
    return Math.round(val) / 10;
  };

  return {
    station_code: stn,
    timestamp,
    temperature_c: div10(7),
    temperature_min_c: div10(8),
    humidity_pct: parseVal(17),
    precipitation_mm: div10ZeroNeg(13),
    precipitation_duration_hrs: div10ZeroNeg(12),
    wind_speed_ms: div10(4),
    wind_direction: parseVal(3),
    wind_gust_ms: div10(6),
    solar_radiation_jcm2: parseVal(11),
    sunshine_hours: div10ZeroNeg(10),
    pressure_hpa: div10(14),
    cloud_cover_octets: parseVal(16),
    dew_point_c: div10(9),
    visibility_m: parseVal(15),
    data_source: 'knmi_bulk',
  };
}

function fetchKnmiCSV(stationCode: number, startDate: string, endDate: string): KnmiHourlyRow[] {
  const start = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');

  const url = 'https://www.daggegevens.knmi.nl/klimatologie/uurgegevens';
  const formData = `start=${start}&end=${end}&vars=ALL&stns=${stationCode}`;
  console.log(`    📥 POST ${url} (station ${stationCode}, ${startDate} → ${endDate})`);

  const csvText = curlPostForm(url, formData);

  const lines = csvText.split('\n');
  const rows: KnmiHourlyRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('STN')) continue;
    const row = parseKnmiLine(trimmed);
    if (row) rows.push(row);
  }

  return rows;
}

// ---- Daily Aggregation ----

function calculateGDD(tMax: number | null, tMin: number | null, base: number): number | null {
  if (tMax === null || tMin === null) return null;
  const avg = (tMax + tMin) / 2;
  return Math.max(0, avg - base);
}

function aggregateHourlyToDaily(hours: KnmiHourlyRow[]): Record<string, unknown> | null {
  if (hours.length < 12) return null;

  const stationCode = hours[0].station_code;
  const date = hours[0].timestamp.split('T')[0];

  const temps = hours.map(r => r.temperature_c).filter((t): t is number => t !== null);
  const humidities = hours.map(r => r.humidity_pct).filter((h): h is number => h !== null);
  const winds = hours.map(r => r.wind_speed_ms).filter((w): w is number => w !== null);
  const precips = hours.map(r => r.precipitation_mm).filter((p): p is number => p !== null);
  const solarVals = hours.map(r => r.solar_radiation_jcm2).filter((s): s is number => s !== null);
  const sunshineVals = hours.map(r => r.sunshine_hours).filter((s): s is number => s !== null);
  const pressureVals = hours.map(r => r.pressure_hpa).filter((p): p is number => p !== null);

  const tempMin = temps.length > 0 ? Math.min(...temps) : null;
  const tempMax = temps.length > 0 ? Math.max(...temps) : null;
  const tempAvg = temps.length > 0
    ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10
    : null;

  const precipSum = precips.length > 0
    ? Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10
    : null;

  const humidityAvg = humidities.length > 0
    ? Math.round((humidities.reduce((a, b) => a + b, 0) / humidities.length) * 10) / 10
    : null;

  const windMax = winds.length > 0 ? Math.round(Math.max(...winds) * 10) / 10 : null;
  const windAvg = winds.length > 0
    ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10
    : null;

  const sunshineSum = sunshineVals.length > 0
    ? Math.round(sunshineVals.reduce((a, b) => a + b, 0) * 10) / 10
    : null;

  const solarSum = solarVals.length > 0
    ? solarVals.reduce((a, b) => a + b, 0)
    : null;

  const pressureAvg = pressureVals.length > 0
    ? Math.round((pressureVals.reduce((a, b) => a + b, 0) / pressureVals.length) * 10) / 10
    : null;

  // ET0 Makkink
  let et0Estimate: number | null = null;
  if (solarSum !== null && tempAvg !== null) {
    const rsMjM2 = solarSum / 100;
    const s = (4098 * 0.6108 * Math.exp(17.27 * tempAvg / (tempAvg + 237.3))) /
              Math.pow(tempAvg + 237.3, 2);
    const gamma = 0.066;
    et0Estimate = Math.round(0.65 * (s / (s + gamma)) * (rsMjM2 / 2.45) * 100) / 100;
    if (et0Estimate < 0) et0Estimate = 0;
  }

  // Leaf wetness: humidity > 87% or dew point close to temp or precip > 0
  const leafWetnessHrs = hours.filter(r => {
    if (r.humidity_pct !== null && r.humidity_pct > 87) return true;
    if (r.precipitation_mm !== null && r.precipitation_mm > 0) return true;
    if (r.dew_point_c !== null && r.temperature_c !== null && (r.temperature_c - r.dew_point_c) < 2) return true;
    return false;
  }).length;

  const frostHours = hours.filter(r => r.temperature_c !== null && r.temperature_c < 0).length;
  const gddBase5 = calculateGDD(tempMax, tempMin, 5);
  const gddBase10 = calculateGDD(tempMax, tempMin, 10);

  return {
    station_code: stationCode,
    date,
    temp_min_c: tempMin !== null ? Math.round(tempMin * 10) / 10 : null,
    temp_max_c: tempMax !== null ? Math.round(tempMax * 10) / 10 : null,
    temp_avg_c: tempAvg,
    precipitation_sum: precipSum,
    humidity_avg_pct: humidityAvg,
    wind_speed_max_ms: windMax,
    wind_speed_avg_ms: windAvg,
    sunshine_hours: sunshineSum,
    solar_radiation_sum: solarSum,
    et0_estimate_mm: et0Estimate,
    pressure_avg_hpa: pressureAvg,
    gdd_base5: gddBase5 !== null ? Math.round(gddBase5 * 10) / 10 : null,
    gdd_base10: gddBase10 !== null ? Math.round(gddBase10 * 10) / 10 : null,
    frost_hours: frostHours,
    leaf_wetness_hrs: leafWetnessHrs,
    data_source: 'knmi_bulk',
  };
}

// ---- Main Import Logic ----

function importStation(stationCode: number, stationName: string) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - YEARS_BACK;
  const startDate = `${startYear}-01-01`;
  const endDate = new Date().toISOString().split('T')[0];

  console.log(`\n🏔️  Station ${stationCode} (${stationName}): ${startDate} → ${endDate}`);

  if (!DAILY_ONLY) {
    // Step 1: Download hourly data from KNMI
    console.log('  📡 Fetching hourly data from KNMI...');
    const rows = fetchKnmiCSV(stationCode, startDate, endDate);
    console.log(`    ✅ Parsed ${rows.length} hourly rows`);

    if (rows.length === 0) {
      console.log('    ⚠️  No data returned, skipping');
      return;
    }

    // Step 2: Batch upsert hourly data
    console.log('  💾 Upserting hourly data to Supabase...');
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      try {
        supabaseUpsert('knmi_observations_hourly', batch as unknown as Record<string, unknown>[], 'station_code,timestamp');
        totalInserted += batch.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`    ❌ Batch error at ${i}: ${msg.slice(0, 200)}`);
      }

      if ((i / BATCH_SIZE) % 20 === 0 && i > 0) {
        const pct = Math.round((i / rows.length) * 100);
        console.log(`    ... ${pct}% (${totalInserted} rows)`);
      }
    }
    console.log(`    ✅ Inserted ${totalInserted} hourly rows`);

    // Log import
    try {
      supabaseInsert('knmi_fetch_log', {
        station_code: stationCode,
        fetch_type: 'bulk_historical',
        date_range_start: startDate,
        date_range_end: endDate,
        status: 'success',
        records_fetched: totalInserted,
      });
    } catch { /* ignore log errors */ }
  }

  // Step 3: Aggregate hourly → daily
  console.log('  📊 Aggregating hourly → daily...');

  // Fetch hourly data from DB (paginated - Supabase REST limit is 1000 by default)
  let allHourly: KnmiHourlyRow[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const query = `station_code=eq.${stationCode}&timestamp=gte.${startDate}T00:00:00%2B00:00&timestamp=lte.${endDate}T23:59:59%2B00:00&order=timestamp&offset=${offset}&limit=${limit}`;
    const batch = supabaseSelect<KnmiHourlyRow>('knmi_observations_hourly', query);
    allHourly = allHourly.concat(batch);
    if (batch.length < limit) break;
    offset += limit;
    if (offset % 10000 === 0) console.log(`    ... fetched ${allHourly.length} hourly rows`);
  }

  console.log(`    📦 Loaded ${allHourly.length} hourly rows for aggregation`);

  // Group by date
  const grouped: Record<string, KnmiHourlyRow[]> = {};
  for (const row of allHourly) {
    const date = row.timestamp.split('T')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(row);
  }

  const dailyRows: Record<string, unknown>[] = [];
  for (const [, hours] of Object.entries(grouped)) {
    const agg = aggregateHourlyToDaily(hours);
    if (agg) dailyRows.push(agg);
  }

  console.log(`    📅 ${dailyRows.length} daily rows to upsert`);

  let dailyInserted = 0;
  for (let i = 0; i < dailyRows.length; i += BATCH_SIZE) {
    const batch = dailyRows.slice(i, i + BATCH_SIZE);
    try {
      supabaseUpsert('knmi_observations_daily', batch, 'station_code,date');
      dailyInserted += batch.length;
    } catch (err) {
      console.error(`    ❌ Daily batch error: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  console.log(`    ✅ ${dailyInserted} daily rows inserted`);
}

function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║    KNMI Historical Weather Data Import           ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`📅 Years back: ${YEARS_BACK}`);
  console.log(`🎯 Station filter: ${ONLY_STATION ?? 'ALL fruit-region stations'}`);
  console.log(`📊 Mode: ${DAILY_ONLY ? 'Daily aggregation only' : 'Full import (hourly + daily)'}`);

  // Get fruit-region stations
  type StationRow = { code: number; name: string; is_fruit_region: boolean };
  const stations = supabaseSelect<StationRow>(
    'knmi_stations',
    'select=code,name,is_fruit_region&active=eq.true&order=code'
  );

  const targetStations = ONLY_STATION
    ? stations.filter(s => s.code === ONLY_STATION)
    : stations.filter(s => s.is_fruit_region);

  if (targetStations.length === 0) {
    console.error('❌ No matching stations found');
    process.exit(1);
  }

  console.log(`\n🏔️  ${targetStations.length} stations to import:`);
  for (const s of targetStations) {
    console.log(`   • ${s.code} - ${s.name}`);
  }

  const startTime = Date.now();

  for (const station of targetStations) {
    try {
      importStation(station.code, station.name);
    } catch (err) {
      console.error(`\n❌ Failed station ${station.code}:`, err);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Done! Took ${elapsed}s`);
  console.log('💡 The Historie page should now show data immediately.');
}

try {
  main();
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
}
