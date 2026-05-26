/**
 * WhatsApp Live Snapshot Handler.
 *
 * Replies to "nu", "status", "live", "hoe is het" with a single information-
 * dense text message that pulls together every active physical sensor the
 * user owns (WSC2 / SE01 / LMS01) PLUS the forecast's near-term outlook
 * for the same site. Designed to answer the grower's most common question
 * — "what's happening on my parcel right now?" — in 5 seconds.
 *
 * Output shape (sections collapse out when the user lacks that sensor):
 *
 *   📍 Kapelle perceel 1 · 3 min geleden
 *
 *   🌡️ 14.2°C  💧 78% RV  💨 3 Bft NW (vlagen 5)
 *   🌧️ Vandaag tot nu: 2.3mm
 *
 *   🌱 Bodem (op 25cm)
 *      Vocht 28% (optimaal) · 14°C · EC 350 µS
 *
 *   🍃 Blad
 *      Bladnat 0.2% (droog)
 *
 *   ✅ Spuitvenster: matig (nog 1u)
 *      Volgend goed: morgen 06-10u
 */

import { sendTextMessage } from './client';
import { logMessage } from './store';
import { stripPlus } from './phone-utils';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import {
  calculateSprayWindowScore,
  calculateDeltaT,
} from '@/lib/weather/weather-calculations';

// ============================================================================
// Intent detection
// ============================================================================

const LIVE_PATTERNS: RegExp[] = [
  /^(?:nu|status|live|update)\??$/i,
  /\bhoe (?:is|gaat) het(?:\s+nu)?\b/i,
  /\b(?:laatste|huidige) (?:meting|metingen|status|stand)\b/i,
  /\bwat (?:is|zijn) (?:de|mijn) (?:metingen|sensoren)\b/i,
  /\b(?:weerstation|station|sensor)\s*(?:status|update|live)\b/i,
];

export function isLiveSnapshotIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  const matched = LIVE_PATTERNS.some(p => p.test(t));
  // Debug log so we can verify the intent dispatcher is reaching this point.
  console.log(`[LiveSnapshot] intent check on "${t}" → ${matched}`);
  return matched;
}

// ============================================================================
// Main handler
// ============================================================================

export async function handleLiveSnapshot(
  userId: string,
  phoneNumber: string,
  queryText: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);
  const admin = getSupabaseAdmin();
  if (!admin) {
    await sendTextMessage(metaPhone, '❗ Database tijdelijk niet beschikbaar.');
    return;
  }

  try {
    await logMessage({ phoneNumber, direction: 'inbound', messageText: queryText });

    // 1. Find user's physical stations (WSC2 / SE01 / LMS01)
    const { data: stations } = await (admin as any)
      .from('physical_weather_stations')
      .select('id, label, device_id, device_kind, last_seen_at, parcels(name)')
      .eq('user_id', userId)
      .eq('active', true);

    if (!stations || stations.length === 0) {
      const msg =
        '📡 Je hebt nog geen fysieke weerstations gekoppeld.\n\n' +
        'Wil je de _forecast_ verwachting in plaats daarvan? Stuur "weersverwachting".';
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    // 2. Per station: fetch latest measurement
    const stationIds = stations.map((s: any) => s.id);
    const { data: latestRows } = await (admin as any)
      .from('weather_measurements')
      .select(
        'station_id, measured_at, temperature_c, humidity_pct, wind_speed_ms, wind_gusts_ms,' +
          ' wind_direction, dew_point_c, rainfall_mm,' +
          ' soil_moisture_pct, soil_temp_c, soil_conductivity_us_cm,' +
          ' leaf_wetness_pct_measured, leaf_temp_c,' +
          ' battery_v, battery_status'
      )
      .in('station_id', stationIds)
      .order('measured_at', { ascending: false });

    // Group by station, keep only latest per station
    const latestByStation = new Map<string, any>();
    for (const r of latestRows ?? []) {
      if (!latestByStation.has(r.station_id)) {
        latestByStation.set(r.station_id, r);
      }
    }

    // 3. Pick "the" weather station for the headline (WSC2-like = device_kind 'weather').
    // SE01 and LMS01 layer in as additional sections.
    const weatherStation = stations.find((s: any) => s.device_kind === 'weather') ?? stations[0];
    const soilStation = stations.find((s: any) => s.device_kind === 'soil');
    const leafStation = stations.find((s: any) => s.device_kind === 'leaf');

    const weatherRow = weatherStation ? latestByStation.get(weatherStation.id) : null;
    const soilRow = soilStation ? latestByStation.get(soilStation.id) : null;
    const leafRow = leafStation ? latestByStation.get(leafStation.id) : null;

    // 4. Today's rainfall: sum rainfall_mm from start of day (local time)
    const startOfDayLocal = startOfTodayIso();
    const { data: todayRain } = weatherStation
      ? await (admin as any)
          .from('weather_measurements')
          .select('rainfall_mm')
          .eq('station_id', weatherStation.id)
          .gte('measured_at', startOfDayLocal)
      : { data: [] };
    const rainTodayMm = (todayRain ?? []).reduce(
      (acc: number, r: any) => acc + (typeof r.rainfall_mm === 'number' ? r.rainfall_mm : 0),
      0
    );

    // 5. Compose the message
    const lines: string[] = [];
    const stationLabel =
      weatherStation?.label ||
      weatherStation?.parcels?.name ||
      weatherStation?.device_id ||
      'jouw perceel';
    const ageMin = weatherRow
      ? Math.max(0, Math.floor((Date.now() - new Date(weatherRow.measured_at).getTime()) / 60_000))
      : null;
    lines.push(`📍 *${stationLabel}* · ${ageMin !== null ? formatAge(ageMin) : 'geen data'}`);
    lines.push('');

    // Weather row
    if (weatherRow) {
      const tempStr = numStr(weatherRow.temperature_c, 1, '°C');
      const rvStr = weatherRow.humidity_pct !== null ? `${Math.round(weatherRow.humidity_pct)}% RV` : null;
      const wind = formatWind(weatherRow.wind_speed_ms, weatherRow.wind_direction, weatherRow.wind_gusts_ms);
      const headline = [tempStr, rvStr, wind].filter(Boolean).join('  ·  ');
      if (headline) lines.push(`🌡️ ${headline}`);
      lines.push(
        `🌧️ Vandaag tot nu: ${rainTodayMm.toFixed(1)} mm` +
          (weatherRow.dew_point_c !== null
            ? `  ·  dauwpunt ${weatherRow.dew_point_c.toFixed(1)}°C`
            : '')
      );
    }

    // Soil row
    if (soilRow) {
      lines.push('');
      lines.push('🌱 *Bodem*');
      const vwc =
        soilRow.soil_moisture_pct !== null
          ? `Vocht ${Number(soilRow.soil_moisture_pct).toFixed(1)}% (${soilMoistureLabel(soilRow.soil_moisture_pct)})`
          : null;
      const st =
        soilRow.soil_temp_c !== null
          ? `${Number(soilRow.soil_temp_c).toFixed(1)}°C`
          : null;
      const ec =
        soilRow.soil_conductivity_us_cm != null
          ? `EC ${soilRow.soil_conductivity_us_cm} µS`
          : null;
      lines.push(`   ${[vwc, st, ec].filter(Boolean).join('  ·  ')}`);
    }

    // Leaf row
    if (leafRow) {
      lines.push('');
      lines.push('🍃 *Blad*');
      const lw =
        leafRow.leaf_wetness_pct_measured !== null
          ? `Bladnat ${Number(leafRow.leaf_wetness_pct_measured).toFixed(1)}% (${leafWetnessLabel(leafRow.leaf_wetness_pct_measured)})`
          : null;
      const lt =
        leafRow.leaf_temp_c !== null ? `${Number(leafRow.leaf_temp_c).toFixed(1)}°C` : null;
      lines.push(`   ${[lw, lt].filter(Boolean).join('  ·  ')}`);
    }

    // Spuitvenster verdict (based on WSC2 if available)
    if (weatherRow && weatherRow.temperature_c !== null && weatherRow.wind_speed_ms !== null) {
      lines.push('');
      const score = calculateSprayWindowScore(
        weatherRow.wind_speed_ms,
        weatherRow.temperature_c,
        weatherRow.dew_point_c,
        weatherRow.rainfall_mm ?? 0,
        0
      );
      const deltaT = calculateDeltaT(weatherRow.temperature_c, weatherRow.dew_point_c);
      const emoji =
        score.label === 'Groen' ? '✅' : score.label === 'Oranje' ? '🟡' : '🔴';
      const dtStr = deltaT ? `Delta-T ${deltaT.value.toFixed(1)}°C` : '';
      lines.push(`${emoji} *Spuitvenster nu:* ${score.label.toLowerCase()}`);
      if (dtStr) lines.push(`   ${dtStr}`);
    }

    // Sensor-health hints — only when something's wrong
    const issues: string[] = [];
    for (const s of stations) {
      const row = latestByStation.get(s.id);
      const seenAt = row?.measured_at ?? s.last_seen_at;
      if (!seenAt) {
        issues.push(`${labelOf(s)}: nog geen meting`);
        continue;
      }
      const minutes = (Date.now() - new Date(seenAt).getTime()) / 60_000;
      // Each sensor has its own typical interval; 4h is conservative for all.
      if (minutes > 240) {
        issues.push(`${labelOf(s)}: ${Math.floor(minutes / 60)}u geen uplink`);
      }
      if (row?.battery_status === 'critical') {
        issues.push(`${labelOf(s)}: accu bijna leeg`);
      }
    }
    if (issues.length > 0) {
      lines.push('');
      lines.push('⚠️ *Let op*');
      for (const i of issues) lines.push(`   ${i}`);
    }

    // 6. Send
    const msg = lines.join('\n');
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
  } catch (err) {
    console.error('[handleLiveSnapshot] Error:', err);
    const msg = '❗ Kon de live-status niet ophalen. Probeer het later opnieuw.';
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
  }
}

// ============================================================================
// Helpers
// ============================================================================

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatAge(minutes: number): string {
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}u geleden`;
  return `${Math.floor(hours / 24)}d geleden`;
}

function numStr(v: number | null | undefined, decimals: number, unit: string): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return `${Number(v).toFixed(decimals)}${unit}`;
}

function formatWind(
  speedMs: number | null,
  direction: number | null,
  gustsMs: number | null
): string | null {
  if (speedMs === null) return null;
  const bft = msToBeaufort(speedMs);
  const dir = direction !== null ? compassFromDeg(direction) : '';
  const main = `${bft} Bft${dir ? ' ' + dir : ''}`;
  if (gustsMs !== null && gustsMs > speedMs * 1.3) {
    const gBft = msToBeaufort(gustsMs);
    return `💨 ${main} (vlagen ${gBft})`;
  }
  return `💨 ${main}`;
}

function msToBeaufort(ms: number): number {
  // Standard Beaufort scale boundaries (m/s)
  const bounds = [0.3, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6];
  for (let b = 0; b < bounds.length; b++) {
    if (ms < bounds[b]) return b;
  }
  return 12;
}

function compassFromDeg(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) / 360) * 8) % 8] ?? '';
}

function soilMoistureLabel(vwc: number): string {
  if (vwc < 15) return 'zeer droog';
  if (vwc < 25) return 'droog';
  if (vwc < 40) return 'optimaal';
  if (vwc < 50) return 'vochtig';
  return 'verzadigd';
}

function leafWetnessLabel(pct: number): string {
  if (pct < 30) return 'droog';
  if (pct < 60) return 'licht vochtig';
  if (pct < 90) return 'nat';
  return 'zeer nat';
}

function labelOf(s: { label: string | null; device_id: string }): string {
  return s.label || s.device_id;
}
