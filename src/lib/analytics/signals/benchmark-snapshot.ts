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

  const [subParcelsRes, parcelHistoryRes, harvestRes, productionRes] = await Promise.all([
    admin.from('sub_parcels').select('id, crop, variety, area').eq('user_id', userId),
    admin.from('parcel_history')
      .select('parcel_name, dosage, unit_price, harvest_year, registration_type')
      .eq('user_id', userId)
      .in('harvest_year', [harvestYear, prevYear]),
    admin.from('harvest_registrations')
      .select('sub_parcel_id, total_crates, weight_per_crate, quality_class, harvest_year')
      .eq('user_id', userId)
      .in('harvest_year', [harvestYear, prevYear]),
    admin.from('production_summaries')
      .select('sub_parcel_id, total_kg, hectares, harvest_year')
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
  const harvests = (harvestRes.data || []) as Array<{
    sub_parcel_id: string | null; total_crates: number;
    weight_per_crate: number | null; quality_class: string | null;
    harvest_year: number;
  }>;
  const production = (productionRes.data || []) as Array<{
    sub_parcel_id: string | null; total_kg: number;
    hectares: number | null; harvest_year: number;
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

  // --- Opbrengst kg/ha ---
  function yieldKgPerHa(year: number): number | null {
    // Combineer production_summaries + harvest_registrations
    const prodRows = production.filter((p) => p.harvest_year === year && p.hectares && p.hectares > 0);
    let totalKg = 0;
    let totalHa = 0;

    const seenSp = new Set<string>();
    prodRows.forEach((p) => {
      if (!p.sub_parcel_id) return;
      totalKg += p.total_kg || 0;
      totalHa += p.hectares || 0;
      seenSp.add(p.sub_parcel_id);
    });

    // Aanvullen met harvest_registrations (voor sp's zonder summary)
    const harvRows = harvests.filter((h) => h.harvest_year === year && h.sub_parcel_id && !seenSp.has(h.sub_parcel_id!));
    const bySp = new Map<string, { kg: number }>();
    harvRows.forEach((h) => {
      const spId = h.sub_parcel_id!;
      const kg = (h.total_crates || 0) * (h.weight_per_crate || 18);
      if (!bySp.has(spId)) bySp.set(spId, { kg: 0 });
      bySp.get(spId)!.kg += kg;
    });
    bySp.forEach((data, spId) => {
      const sp = subParcels.find((s) => s.id === spId);
      if (!sp || !sp.area) return;
      totalKg += data.kg;
      totalHa += sp.area;
    });

    return totalHa > 0 ? totalKg / totalHa : null;
  }

  // --- Klasse I percentage ---
  function classOnePct(year: number): number | null {
    const rows = harvests.filter((h) => h.harvest_year === year && h.quality_class);
    if (rows.length === 0) return null;
    let total = 0;
    let klasseI = 0;
    rows.forEach((r) => {
      const crates = r.total_crates || 0;
      total += crates;
      if (r.quality_class === 'Klasse I') klasseI += crates;
    });
    return total > 0 ? (klasseI / total) * 100 : null;
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
    {
      label: 'Oogst',
      current: yieldKgPerHa(prevYear), // vorig jaar is het "laatst bekende" geoogste
      previous: yieldKgPerHa(prevYear - 1),
      sectorAverage: benchmark.yieldKgPerHa,
      unit: 'kg/ha',
      higherIsBetter: true,
      tag: 'productie',
    },
    {
      label: 'Klasse I',
      current: classOnePct(prevYear),
      previous: classOnePct(prevYear - 1),
      sectorAverage: benchmark.classOnePct,
      unit: '%',
      higherIsBetter: true,
      tag: 'productie',
    },
  ];

  return snapshots;
}
