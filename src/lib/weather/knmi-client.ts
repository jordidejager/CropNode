// ============================================================================
// KNMI Bulk CSV Client
// Downloads and parses historical hourly weather data from KNMI CDN.
// No API key required — uses public bulk download endpoints.
// ============================================================================

export type KnmiHourlyRow = {
  station_code: number;
  timestamp: string; // ISO 8601 UTC
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

/**
 * KNMI CDN URL for hourly data.
 * Format: uurgeg_{CODE}_{STARTYYYYMMDD}_{ENDYYYYMMDD}.zip
 * For "up to now", use end date = today or a future date like 9999.
 */
function buildKnmiUrl(stationCode: number, startDate: string, endDate: string): string {
  const start = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');
  return `https://cdn.knmi.nl/knmi/map/page/klimatologie/gegevens/uurgegevens/uurgeg_${stationCode}_${start}_${end}.zip`;
}

/**
 * Extract text content from a ZIP buffer (single-file ZIP).
 * Parses the local file header to find the compressed data.
 */
function extractFromZip(buffer: Buffer): string {
  // ZIP local file header signature: PK\x03\x04
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    // Not a ZIP — might be plain text or gzip
    const text = buffer.toString('utf-8');
    if (text.includes('STN') || text.includes('#')) {
      return text;
    }
    throw new Error('Response is neither ZIP nor KNMI CSV text');
  }

  const { inflateRawSync } = require('zlib') as typeof import('zlib');

  // Parse local file header
  const compressionMethod = buffer.readUInt16LE(8);
  const compressedSize = buffer.readUInt32LE(18);
  const fileNameLength = buffer.readUInt16LE(26);
  const extraFieldLength = buffer.readUInt16LE(28);
  const dataOffset = 30 + fileNameLength + extraFieldLength;

  if (compressionMethod === 0) {
    // Stored (no compression)
    return buffer.subarray(dataOffset, dataOffset + compressedSize).toString('utf-8');
  } else if (compressionMethod === 8) {
    // Deflated
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    return inflateRawSync(compressed).toString('utf-8');
  } else {
    throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
  }
}

/**
 * Parse a single KNMI CSV data line into a structured row.
 *
 * KNMI column order (from their header):
 * STN, YYYYMMDD, HH, DD, FH, FF, FX, T, T10N, TD, SQ, Q, DR, RH, P, VV, N, U, WW, IX, M, R, S, O, Y
 *
 * Key conversions:
 * - T, T10N, TD, FH, FF, FX: ÷ 10
 * - RH (precip), SQ (sunshine), DR (precip duration), P (pressure): ÷ 10
 * - RH=-1 and SQ=-1: treat as 0 (traces)
 * - HH 1-24 where HH=1 = measurement over 00:00–01:00 UTC
 * - U (humidity), DD (wind dir), Q (radiation), N (cloud cover), VV (visibility): direct
 */
function parseKnmiLine(line: string): KnmiHourlyRow | null {
  const parts = line.split(',').map(s => s.trim());
  if (parts.length < 24) return null;

  const stn = parseInt(parts[0], 10);
  const dateStr = parts[1]; // YYYYMMDD
  const hh = parseInt(parts[2], 10); // 1-24

  if (isNaN(stn) || isNaN(hh) || !dateStr || dateStr.length !== 8) return null;

  // Convert HH 1-24 to 0-23: HH=1 → 00:00 UTC, HH=24 → 23:00 UTC
  const hour = hh - 1;
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);

  // HH=24 means the measurement covers 23:00–00:00, timestamp = same day 23:00
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
    if (val === -1) return 0; // traces
    return Math.round(val) / 10;
  };

  return {
    station_code: stn,
    timestamp,
    temperature_c: div10(7),              // T
    temperature_min_c: div10(8),           // T10N
    humidity_pct: parseVal(17) !== null ? parseVal(17) : null, // U (not ×10)
    precipitation_mm: div10ZeroNeg(13),    // RH
    precipitation_duration_hrs: div10ZeroNeg(12), // DR
    wind_speed_ms: div10(4),              // FH
    wind_direction: parseVal(3),           // DD (degrees, not ×10)
    wind_gust_ms: div10(6),              // FX
    solar_radiation_jcm2: parseVal(11),    // Q (J/cm², not ×10)
    sunshine_hours: div10ZeroNeg(10),      // SQ
    pressure_hpa: div10(14),              // P
    cloud_cover_octets: parseVal(16),      // N
    dew_point_c: div10(9),               // TD
    visibility_m: (() => {
      const vv = parseVal(15);           // VV (in 100m increments or direct)
      return vv;
    })(),
    data_source: 'knmi_bulk' as const,
  };
}

/**
 * Fetch and parse KNMI hourly data for a station and date range.
 * Downloads from KNMI CDN (ZIP file containing CSV).
 */
export async function fetchKnmiBulkHourly(
  stationCode: number,
  startDate: string,
  endDate: string
): Promise<KnmiHourlyRow[]> {
  const url = buildKnmiUrl(stationCode, startDate, endDate);
  console.log(`[KNMI] Downloading: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/zip, text/plain, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`KNMI download failed: ${response.status} ${response.statusText} for station ${stationCode}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let csvText: string;
  try {
    csvText = extractFromZip(buffer);
  } catch {
    // Fallback: try treating as plain text
    csvText = buffer.toString('utf-8');
  }

  const lines = csvText.split('\n');
  const rows: KnmiHourlyRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, comment lines (start with #), and header lines
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('STN')) continue;

    const row = parseKnmiLine(trimmed);
    if (row) {
      rows.push(row);
    }
  }

  console.log(`[KNMI] Parsed ${rows.length} hourly rows for station ${stationCode}`);
  return rows;
}

/**
 * Fetch recent KNMI data (last N days) for keeping observations current.
 * Uses the same bulk endpoint but with a narrow date range.
 */
export async function fetchKnmiRecent(
  stationCode: number,
  daysBack: number = 3
): Promise<KnmiHourlyRow[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return fetchKnmiBulkHourly(stationCode, fmt(start), fmt(end));
}
