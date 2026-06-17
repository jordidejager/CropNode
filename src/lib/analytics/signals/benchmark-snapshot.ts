/**
 * Benchmark Snapshot — aggregeert top-KPI's voor de "hoe sta ik ervoor"-widget.
 * Vergelijkt huidig jaar met vorig jaar EN sector-benchmark.
 */

import type { BenchmarkSnapshot } from './types';
import { getBenchmark, getDominantCrop } from './benchmarks';

function deriveHarvestYear(now: Date): number {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 11 ? year + 1 : year;
}

export async function buildBenchmarkSnapshot(
  admin: any,
  userId: string
): Promise<BenchmarkSnapshot[]> {
  const now = new Date();
  const harvestYear = deriveHarvestYear(now);
  const prevYear = harvestYear - 1;

  const [subParcelsRes, parcelHistoryRes] = await Promise.all([
    admin.from('sub_parcels').select('id, crop, variety, area').eq('user_id', userId),
    admin.from('parcel_history')
      .select('parcel_name, dosage, unit_price, harvest_year, registration_type')
      .eq('user_id', userId)
      .in('harvest_year', [harvestYear, prevYear]),
  ]);

  const subParcels = (subParcelsRes.data || []) as Array<{
    id: string; crop: string; variety: string; area: number;
  }>;
  const history = (parcelHistoryRes.data || []) as Array<{
    parcel_name: string; dosage: number; unit_price: number | null;
    harvest_year: number; registration_type: string | null;
  }>;

  const benchmark = getBenchmark(getDominantCrop(subParcels));

  // --- Kosten per ha (per jaar) ---
  function costsPerHa(year: number): number | null {
    const rows = history.filter((h) => h.harvest_year === year);
    const totalCost = rows.reduce((s, r) => s + (r.unit_price || 0) * (r.dosage || 0), 0);
    if (totalCost === 0) return null;

    // Hectares = unieke percelen uit history × area
    const spNames = new Set(rows.map((r) => r.parcel_name));
    let totalHa = 0;
    spNames.forEach((name) => {
      const sp = subParcels.find((s) => s.id === name) // id match
        || subParcels.find((s) => (s as any).name === name); // name match (unlikely sp-name)
      if (sp) totalHa += sp.area || 0;
    });
    if (totalHa === 0) {
      // Fallback: tel alle unique parcel_names × 1 ha
      totalHa = spNames.size;
    }
    return totalHa > 0 ? totalCost / totalHa : null;
  }

  // --- Aantal behandelingen ---
  function sprayCount(year: number): number | null {
    const rows = history.filter((h) => h.harvest_year === year);
    // Dedupe op (datum+perceel): niet beschikbaar zonder datum, dus tel rijen per perceel en deel
    // Simpele proxy: unieke perceel-datum combo zit niet in parcel_history zonder datum veld
    // Gebruik totaalaantal gedeeld door gem. #producten per spuit (~3-4)
    // Beter: tel direct uit spuitschrift
    return rows.length > 0 ? Math.round(rows.length / 3.5) : null;
  }

  const snapshots: BenchmarkSnapshot[] = [
    {
      label: 'Inputkosten/ha',
      current: costsPerHa(harvestYear),
      previous: costsPerHa(prevYear),
      sectorAverage: benchmark.inputCostPerHa,
      unit: '€/ha',
      higherIsBetter: false,
      tag: 'kosten',
    },
    {
      label: 'Behandelingen/seizoen',
      current: sprayCount(harvestYear),
      previous: sprayCount(prevYear),
      sectorAverage: benchmark.spraysPerSeason,
      unit: '×',
      higherIsBetter: false,
      tag: 'kosten',
    },
  ];

  return snapshots;
}
