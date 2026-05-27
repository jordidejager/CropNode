/**
 * Soil EC conversion helpers.
 *
 * The Dragino SE01-LS (and equivalent capacitive probes) reports BULK soil
 * conductivity — the conductivity of everything between the three metal pins,
 * which depends on:
 *   - dissolved salts in the soil-pore water (the agronomically relevant part)
 *   - soil water content (capacitive effect)
 *   - mineral particle surface conduction
 *
 * Agronomically you care about PORE-WATER EC (ECpw) — that's what the root
 * hairs actually contact and what affects nutrient uptake / salt stress.
 *
 * The widely-used simplification (Hilhorst 2000 model, reduced form) is:
 *
 *   ECpw ≈ ECbulk / θ
 *
 * where θ = volumetric water content as a fraction (0..1).
 *
 * Reference for the Dutch fruit-grower context (the spreadsheet the user
 * shared): "normaal" pore-water EC is 0.70–1.30 mS/cm in clay/zavel soils.
 * The factory-uncalibrated SE01 reads roughly that range divided by VWC,
 * which is exactly the bulk → pore-water relationship.
 *
 * We deliberately avoid the more complex Hilhorst variant that needs the
 * dielectric permittivity of the soil — Dragino doesn't expose that value,
 * and the simplified form is accurate enough for the 0.5–3 mS/cm range
 * relevant for European fruit orchards.
 */

const MIN_VWC_FOR_CONVERSION = 0.05; // 5% — below this the formula falls apart

/**
 * Convert bulk EC (in µS/cm) measured by a Dragino SE01-LS-style probe to
 * pore-water EC (in µS/cm).
 *
 * @param bulkUsCm  Sensor reading in µS/cm (the raw conduct_SOIL value)
 * @param vwcPct    Volumetric water content as percentage (0..100)
 * @returns         Pore-water EC in µS/cm, or null if the inputs are
 *                  out of safe range (too dry / missing data).
 */
export function bulkEcToPoreWater(
  bulkUsCm: number | null,
  vwcPct: number | null
): number | null {
  if (bulkUsCm === null || vwcPct === null) return null;
  if (!Number.isFinite(bulkUsCm) || !Number.isFinite(vwcPct)) return null;
  if (bulkUsCm <= 0) return 0;
  const theta = vwcPct / 100;
  if (theta < MIN_VWC_FOR_CONVERSION) return null;
  return Math.round(bulkUsCm / theta);
}

/**
 * Agronomic label for pore-water EC (mS/cm) based on the Dutch fruit-grower
 * protocol (Maurice De Gendt / IPM Vision practice notes):
 *   - <  0.30 mS/cm  → laag, voedingstoestand mager
 *   - 0.30 – 0.70    → onder gemiddeld
 *   - 0.70 – 1.30    → normaal
 *   - 1.30 – 1.50    → verhoogd
 *   - >  1.50        → hoog — droogtegevoelig perceel: kans op zoutstress
 *
 * @param ecPwMs  Pore-water EC in mS/cm (not µS/cm)
 */
export function poreWaterEcLabel(ecPwMs: number | null): {
  label: string;
  tone: 'low' | 'ok' | 'optimal' | 'high' | 'very-high';
} | null {
  if (ecPwMs === null || !Number.isFinite(ecPwMs)) return null;
  if (ecPwMs < 0.30) return { label: 'Laag — bemesting overwegen', tone: 'low' };
  if (ecPwMs < 0.70) return { label: 'Onder gemiddeld', tone: 'ok' };
  if (ecPwMs < 1.30) return { label: 'Normaal', tone: 'optimal' };
  if (ecPwMs < 1.50) return { label: 'Verhoogd', tone: 'high' };
  return { label: 'Hoog — droogte+zoutrisico', tone: 'very-high' };
}
