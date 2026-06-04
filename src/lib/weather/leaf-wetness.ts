/**
 * Leaf wetness helpers.
 *
 * The Dragino LMS01-LS reports leaf wetness as a PERCENTAGE of surface
 * wetness (0–100%). On its own that number is agronomically meaningless —
 * what fruit-scab models (Mills / Venturia inaequalis) actually need is:
 *
 *   1. A binary WET / DRY state (leaf surface wet or not)
 *   2. The LEAF WETNESS DURATION (LWD) — the number of hours the leaf stayed
 *      wet. Combined with temperature this drives the infection-risk lookup
 *      in the Mills table.
 *
 * We use a 50% threshold for "wet", matching the LEAF_WETNESS_THRESHOLD the
 * apple-scab wet-period detector already uses (wet-period-detection.ts). That
 * keeps the live sensor consistent with the disease model so a future wiring
 * (real sensor → scab model instead of Open-Meteo estimate) is seamless.
 */

/** Surface-wetness % at or above which the leaf is considered "wet". */
export const LEAF_WET_THRESHOLD = 50;

export type LeafState = 'wet' | 'dry';

/** Map a raw leaf-wetness percentage to a binary wet/dry state. */
export function leafWetnessState(pct: number | null): LeafState | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  return pct >= LEAF_WET_THRESHOLD ? 'wet' : 'dry';
}

/** Short Dutch label for the current leaf state. */
export function leafStateLabel(state: LeafState | null): string {
  if (state === null) return 'Geen data';
  return state === 'wet' ? 'Blad nat' : 'Blad droog';
}

interface LeafReading {
  measured_at: string;
  leaf_wetness_pct_measured: number | null;
}

/**
 * Compute the leaf wetness duration (hours wet) over a trailing time window.
 *
 * Uplinks arrive roughly every 20 minutes, so we integrate over the gaps
 * between consecutive readings: each interval that STARTS wet contributes its
 * length to the wet total. Gaps are capped (a missed transmission shouldn't
 * inflate the duration) so a 6-hour silence can't count as 6 wet hours.
 *
 * @param measurements  Readings in any order (will be sorted chronologically).
 * @param windowHours   Trailing window to integrate over (default 24h).
 * @returns Hours wet (rounded to 0.1h), or null if there is no data in window.
 */
export function leafWetnessDurationHours(
  measurements: LeafReading[],
  windowHours = 24
): number | null {
  const now = Date.now();
  const cutoff = now - windowHours * 3_600_000;
  const MAX_GAP_MS = 90 * 60_000; // cap a single interval at 90 minutes

  const pts = measurements
    .map(m => ({
      t: new Date(m.measured_at).getTime(),
      wet: leafWetnessState(m.leaf_wetness_pct_measured) === 'wet',
    }))
    .filter(p => Number.isFinite(p.t) && p.t >= cutoff)
    .sort((a, b) => a.t - b.t);

  if (pts.length === 0) return null;

  let wetMs = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i]!.wet) {
      wetMs += Math.min(pts[i + 1]!.t - pts[i]!.t, MAX_GAP_MS);
    }
  }
  // Trailing interval from the last reading up to "now".
  const last = pts[pts.length - 1]!;
  if (last.wet) wetMs += Math.min(now - last.t, MAX_GAP_MS);

  return Math.round((wetMs / 3_600_000) * 10) / 10;
}

/**
 * Agronomic interpretation of accumulated leaf wetness in the last 24h.
 * Thresholds are indicative for apple/pear scab pressure at moderate temps.
 */
export function leafWetnessDurationLabel(hours: number | null): {
  label: string;
  tone: 'ok' | 'watch' | 'high';
} | null {
  if (hours === null || !Number.isFinite(hours)) return null;
  if (hours < 6) return { label: 'Kort nat — laag risico', tone: 'ok' };
  if (hours < 12) return { label: 'Langdurig nat — let op schurft', tone: 'watch' };
  return { label: 'Zeer lang nat — hoog infectierisico', tone: 'high' };
}
