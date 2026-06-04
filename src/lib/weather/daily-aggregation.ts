/**
 * Daily / hourly aggregation of physical-station measurements.
 *
 * Stations push an uplink roughly every 20 minutes. Growers don't want to
 * read a hundred 20-minute rows — they want "how much rain fell each day",
 * with the option to drill into the hours of a specific day. These helpers
 * roll the raw measurement stream up to calendar days (local time) and, on
 * demand, to hours within one day.
 */

import { leafWetnessState } from './leaf-wetness';

interface RainReading {
  measured_at: string;
  rainfall_mm: number | null;
}

export interface DailyRain {
  /** Local calendar date key, YYYY-MM-DD. */
  date: string;
  /** Millisecond timestamp of local midnight (for sorting / axis). */
  ts: number;
  /** Total rainfall that day (mm). */
  rainMm: number;
  /** Whether this bucket is the current (still-running) local day. */
  isToday: boolean;
}

export interface HourlyRain {
  /** Hour of day 0–23. */
  hour: number;
  /** Rainfall in that hour (mm). */
  rainMm: number;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localMidnightTs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Sum rainfall per local calendar day.
 *
 * @param measurements  Raw readings (any order).
 * @param days          How many trailing days to include (default 7).
 *                      Days with no data are still emitted with rainMm = 0 so
 *                      the chart shows a continuous axis.
 */
export function aggregateDailyRain(
  measurements: RainReading[],
  days = 7
): DailyRain[] {
  const todayKey = localDateKey(new Date());

  // Sum into a map keyed by local date.
  const sums = new Map<string, number>();
  for (const m of measurements) {
    const t = new Date(m.measured_at);
    if (Number.isNaN(t.getTime())) continue;
    const key = localDateKey(t);
    sums.set(key, (sums.get(key) ?? 0) + (m.rainfall_mm ?? 0));
  }

  // Build a continuous list of the last `days` days (oldest → newest).
  const out: DailyRain[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDateKey(d);
    out.push({
      date: key,
      ts: localMidnightTs(d),
      rainMm: Math.round((sums.get(key) ?? 0) * 10) / 10,
      isToday: key === todayKey,
    });
  }
  return out;
}

/**
 * Rainfall per hour for one specific local day (0–23, continuous).
 *
 * @param measurements  Raw readings (any order).
 * @param dateKey       The local date key (YYYY-MM-DD) to break down.
 */
export function aggregateHourlyRainForDay(
  measurements: RainReading[],
  dateKey: string
): HourlyRain[] {
  const sums = new Array<number>(24).fill(0);
  for (const m of measurements) {
    const t = new Date(m.measured_at);
    if (Number.isNaN(t.getTime())) continue;
    if (localDateKey(t) !== dateKey) continue;
    sums[t.getHours()] += m.rainfall_mm ?? 0;
  }
  return sums.map((mm, hour) => ({
    hour,
    rainMm: Math.round(mm * 10) / 10,
  }));
}

/** Total rainfall since local midnight today (the "vandaag tot nu toe" value). */
export function rainSinceMidnight(measurements: RainReading[]): number {
  const midnight = localMidnightTs(new Date());
  let sum = 0;
  for (const m of measurements) {
    const t = new Date(m.measured_at).getTime();
    if (Number.isNaN(t) || t < midnight) continue;
    sum += m.rainfall_mm ?? 0;
  }
  return Math.round(sum * 10) / 10;
}

// ---- Leaf wetness duration (hours wet per day / hour) ----

interface LeafReading {
  measured_at: string;
  leaf_wetness_pct_measured: number | null;
}

export interface DailyLeafWet {
  /** Local calendar date key, YYYY-MM-DD. */
  date: string;
  /** Millisecond timestamp of local midnight. */
  ts: number;
  /** Hours the leaf was wet that day. */
  wetHours: number;
  /** Whether this is the current (still-running) local day. */
  isToday: boolean;
}

export interface HourlyLeafWet {
  /** Hour of day 0–23. */
  hour: number;
  /** Minutes the leaf was wet in that hour (0–60). */
  wetMinutes: number;
}

const MAX_WET_GAP_MS = 90 * 60_000; // cap a single wet interval (missed uplinks)

/** Build sorted (timestamp, wet?) points from raw leaf readings. */
function leafPoints(measurements: LeafReading[]): Array<{ t: number; wet: boolean }> {
  return measurements
    .map(m => ({
      t: new Date(m.measured_at).getTime(),
      wet: leafWetnessState(m.leaf_wetness_pct_measured) === 'wet',
    }))
    .filter(p => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
}

/**
 * Hours the leaf was wet per local calendar day. Integrates the wet intervals
 * between consecutive readings (each interval that starts wet contributes its
 * length, capped to avoid inflation from missed uplinks) and buckets by the
 * local day the interval starts in.
 */
export function aggregateDailyLeafWetness(
  measurements: LeafReading[],
  days = 7
): DailyLeafWet[] {
  const todayKey = localDateKey(new Date());
  const pts = leafPoints(measurements);
  const now = Date.now();

  const wetMsByDay = new Map<string, number>();
  for (let i = 0; i < pts.length; i++) {
    if (!pts[i]!.wet) continue;
    const next = i < pts.length - 1 ? pts[i + 1]!.t : now;
    const dur = Math.min(next - pts[i]!.t, MAX_WET_GAP_MS);
    const key = localDateKey(new Date(pts[i]!.t));
    wetMsByDay.set(key, (wetMsByDay.get(key) ?? 0) + dur);
  }

  const out: DailyLeafWet[] = [];
  const nowD = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() - i);
    const key = localDateKey(d);
    out.push({
      date: key,
      ts: localMidnightTs(d),
      wetHours: Math.round(((wetMsByDay.get(key) ?? 0) / 3_600_000) * 10) / 10,
      isToday: key === todayKey,
    });
  }
  return out;
}

/** Minutes wet per hour (0–23) for one specific local day. */
export function aggregateHourlyLeafWetForDay(
  measurements: LeafReading[],
  dateKey: string
): HourlyLeafWet[] {
  const pts = leafPoints(measurements);
  const now = Date.now();
  const wetMsByHour = new Array<number>(24).fill(0);

  for (let i = 0; i < pts.length; i++) {
    if (!pts[i]!.wet) continue;
    const d = new Date(pts[i]!.t);
    if (localDateKey(d) !== dateKey) continue;
    const next = i < pts.length - 1 ? pts[i + 1]!.t : now;
    const dur = Math.min(next - pts[i]!.t, MAX_WET_GAP_MS);
    wetMsByHour[d.getHours()] += dur;
  }

  return wetMsByHour.map((ms, hour) => ({
    hour,
    wetMinutes: Math.round(Math.min(ms, 3_600_000) / 60_000),
  }));
}
