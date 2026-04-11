/**
 * Spray Linker — Connects Spuitschrift records to fungicide properties
 *
 * Reads spray registrations for a parcel/season from the spuitschrift table,
 * matches each product's active substance(s) against the fungicide_properties
 * table, and returns SprayEvent objects for coverage calculation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SprayEvent, FungicideProperties } from '../types';

/**
 * Raw spuitschrift row from database
 */
interface SpuitschriftRow {
  id: string;
  date: string; // ISO timestamp
  plots: string[];
  products: {
    product: string;
    dosage: number;
    unit: string;
    targetReason?: string;
  }[];
  harvest_year: number;
}

/**
 * Fetch spray events for a parcel in a given harvest year,
 * enriched with fungicide properties from the database.
 */
export async function fetchSprayEventsForParcel(
  parcelId: string,
  harvestYear: number,
  supabase: SupabaseClient
): Promise<SprayEvent[]> {
  // 1. Fetch spuitschrift records that include this parcel
  const { data: sprays } = await supabase
    .from('spuitschrift')
    .select('id, date, plots, products, harvest_year')
    .eq('harvest_year', harvestYear)
    .contains('plots', [parcelId])
    .order('date');

  if (!sprays || sprays.length === 0) return [];

  // 2. Fetch all fungicide properties (small table, cache-friendly)
  const { data: fungicideRows } = await supabase
    .from('fungicide_properties')
    .select('*');

  const fungicideMap = new Map<string, FungicideProperties>();
  if (fungicideRows) {
    for (const row of fungicideRows) {
      fungicideMap.set(row.active_substance.toLowerCase(), {
        active_substance: row.active_substance,
        active_substance_nl: row.active_substance_nl,
        frac_group: row.frac_group,
        mode_of_action: row.mode_of_action,
        rain_washoff_halflife_mm: Number(row.rain_washoff_halflife_mm),
        min_residual_fraction: Number(row.min_residual_fraction),
        curative_max_degree_hours: row.curative_max_degree_hours
          ? Number(row.curative_max_degree_hours)
          : null,
        min_drying_hours: Number(row.min_drying_hours),
      });
    }
  }

  // 3. Fetch CTGB product data for active substance matching
  // Get unique product names from all sprays
  const productNames = new Set<string>();
  for (const spray of sprays as SpuitschriftRow[]) {
    for (const p of spray.products) {
      productNames.add(p.product);
    }
  }

  // Look up werkzame_stoffen from ctgb_products
  const ctgbMap = new Map<string, string[]>(); // product name → active substances
  if (productNames.size > 0) {
    const { data: ctgbProducts } = await supabase
      .from('ctgb_products')
      .select('naam, werkzame_stoffen')
      .in('naam', Array.from(productNames));

    if (ctgbProducts) {
      for (const cp of ctgbProducts) {
        ctgbMap.set(cp.naam, cp.werkzame_stoffen || []);
      }
    }
  }

  // 4. Build SprayEvents
  const events: SprayEvent[] = [];

  for (const spray of sprays as SpuitschriftRow[]) {
    const sprayProducts = spray.products.map((p) => {
      // Find active substances via CTGB
      const activeSubstances = ctgbMap.get(p.product) || [];

      // Match against fungicide properties
      let fungicideProps: FungicideProperties | null = null;
      for (const substance of activeSubstances) {
        const props = fungicideMap.get(substance.toLowerCase());
        if (props) {
          // If multiple active substances match, keep the one with best rain resistance
          if (
            !fungicideProps ||
            props.rain_washoff_halflife_mm > fungicideProps.rain_washoff_halflife_mm
          ) {
            fungicideProps = props;
          }
        }
      }

      // Fallback: try to match product name directly (common names like "captan", "delan")
      if (!fungicideProps) {
        const nameLower = p.product.toLowerCase();
        for (const [substance, props] of fungicideMap) {
          if (nameLower.includes(substance) || nameLower.includes(props.active_substance_nl?.toLowerCase() ?? '___')) {
            fungicideProps = props;
            break;
          }
        }
      }

      return { name: p.product, fungicideProps };
    });

    // Only include sprays that have at least one recognized fungicide
    // (skip pure fertilizers, insecticides, etc.)
    const hasFungicide = sprayProducts.some((p) => p.fungicideProps !== null);

    events.push({
      id: spray.id,
      date: new Date(spray.date),
      products: sprayProducts,
      parcelIds: spray.plots,
    });

    // Even if no fungicide matched, include the spray (shows as "unknown coverage")
    // This is better than hiding it — the teler sees they sprayed but we can't calculate
  }

  return events;
}

/**
 * Conservative default properties for unrecognized fungicides.
 * Assumes fast wash-off (worst case) so teler doesn't get false confidence.
 */
export const DEFAULT_FUNGICIDE_PROPS: FungicideProperties = {
  active_substance: 'unknown',
  active_substance_nl: 'Onbekend',
  frac_group: null,
  mode_of_action: 'preventief',
  rain_washoff_halflife_mm: 2.0,
  min_residual_fraction: 0.05,
  curative_max_degree_hours: null,
  min_drying_hours: 2,
};
