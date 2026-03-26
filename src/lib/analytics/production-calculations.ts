import type { AnalyticsHarvest, AnalyticsSubParcel } from './types';
import type { ProductionSummaryRow } from './production-queries';

export interface YearlyProductionEntry {
  harvestYear: number;
  variety: string;
  parcelId: string | null;
  parcelName: string;
  totalKg: number;
  hectares: number;
  kgPerHa: number;
  source: 'manual' | 'harvest_registrations';
}

export interface YearTrend {
  harvestYear: number;
  totalTon: number;
  totalKgPerHa: number;
  totalHectares: number;
}

export interface VarietyYearData {
  harvestYear: number;
  [variety: string]: number | string; // variety name → kg
}

export interface ParcelProductionRow {
  parcelName: string;
  variety: string;
  totalKg: number;
  hectares: number;
  kgPerHa: number;
}

export interface VarietyRanking {
  variety: string;
  avgKgPerHa: number;
  totalKg: number;
  yearCount: number;
}

const VARIETY_COLORS = ['#10b981', '#14b8a6', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#f97316'];

export function getVarietyColor(index: number): string {
  return VARIETY_COLORS[index % VARIETY_COLORS.length];
}

/**
 * Merge harvest_registrations and production_summaries into unified yearly data.
 * For any (year, parcel, variety) with harvest_registrations, prefer that data.
 */
export function buildYearlyProduction(
  summaries: ProductionSummaryRow[],
  harvests: AnalyticsHarvest[],
  subParcels: AnalyticsSubParcel[]
): YearlyProductionEntry[] {
  const entries: YearlyProductionEntry[] = [];
  const harvestKeys = new Set<string>();

  // 1. Aggregate harvest_registrations by year/subparcel/variety
  const harvestAgg = new Map<string, { totalKg: number; totalCrates: number }>();
  harvests.forEach((h) => {
    const key = `${h.harvest_year}|${h.sub_parcel_id || h.parcel_id}|${h.variety}`;
    if (!harvestAgg.has(key)) harvestAgg.set(key, { totalKg: 0, totalCrates: 0 });
    const agg = harvestAgg.get(key)!;
    const weight = h.weight_per_crate || 18;
    agg.totalKg += h.total_crates * weight;
    agg.totalCrates += h.total_crates;
  });

  harvestAgg.forEach((agg, key) => {
    const [yearStr, parcelId, variety] = key.split('|');
    const year = parseInt(yearStr);
    const sp = subParcels.find((s) => s.id === parcelId);
    const hectares = sp?.area || 1;

    entries.push({
      harvestYear: year,
      variety,
      parcelId,
      parcelName: sp?.name || parcelId,
      totalKg: agg.totalKg,
      hectares,
      kgPerHa: hectares > 0 ? agg.totalKg / hectares : 0,
      source: 'harvest_registrations',
    });
    harvestKeys.add(key);
  });

  // 2. Add production_summaries where no harvest_registrations exist
  summaries.forEach((s) => {
    const key = `${s.harvest_year}|${s.sub_parcel_id || s.parcel_id || ''}|${s.variety}`;
    if (harvestKeys.has(key)) return; // skip: harvest_registrations takes precedence

    const sp = subParcels.find((sub) => sub.id === s.sub_parcel_id);
    const hectares = s.hectares || sp?.area || 1;

    entries.push({
      harvestYear: s.harvest_year,
      variety: s.variety,
      parcelId: s.sub_parcel_id || s.parcel_id,
      parcelName: sp?.name || s.variety,
      totalKg: s.total_kg,
      hectares,
      kgPerHa: hectares > 0 ? s.total_kg / hectares : 0,
      source: 'manual',
    });
  });

  return entries.sort((a, b) => a.harvestYear - b.harvestYear);
}

/**
 * Calculate year-over-year trend totals.
 */
export function calculateYearTrends(entries: YearlyProductionEntry[]): YearTrend[] {
  const yearMap = new Map<number, { totalKg: number; totalHectares: number }>();

  entries.forEach((e) => {
    if (!yearMap.has(e.harvestYear)) yearMap.set(e.harvestYear, { totalKg: 0, totalHectares: 0 });
    const y = yearMap.get(e.harvestYear)!;
    y.totalKg += e.totalKg;
    // Avoid double-counting hectares for same parcel
    // Simple approach: accumulate unique parcels
    y.totalHectares += e.hectares;
  });

  return [...yearMap.entries()]
    .map(([year, data]) => ({
      harvestYear: year,
      totalTon: data.totalKg / 1000,
      totalKgPerHa: data.totalHectares > 0 ? data.totalKg / data.totalHectares : 0,
      totalHectares: data.totalHectares,
    }))
    .sort((a, b) => a.harvestYear - b.harvestYear);
}

/**
 * Calculate variety breakdown per year for stacked bar chart.
 */
export function calculateVarietyByYear(entries: YearlyProductionEntry[]): { data: VarietyYearData[]; varieties: string[] } {
  const years = [...new Set(entries.map((e) => e.harvestYear))].sort();
  const varieties = [...new Set(entries.map((e) => e.variety))];

  const data = years.map((year) => {
    const row: VarietyYearData = { harvestYear: year };
    varieties.forEach((v) => {
      const total = entries
        .filter((e) => e.harvestYear === year && e.variety === v)
        .reduce((sum, e) => sum + e.totalKg / 1000, 0); // in ton
      row[v] = Math.round(total * 10) / 10;
    });
    return row;
  });

  return { data, varieties };
}

/**
 * Calculate per-parcel production for a specific year.
 */
export function calculateParcelProduction(entries: YearlyProductionEntry[], year: number, perHectare: boolean): ParcelProductionRow[] {
  const yearEntries = entries.filter((e) => e.harvestYear === year);
  const parcelMap = new Map<string, ParcelProductionRow>();

  yearEntries.forEach((e) => {
    const key = e.parcelName;
    if (!parcelMap.has(key)) {
      parcelMap.set(key, { parcelName: e.parcelName, variety: e.variety, totalKg: 0, hectares: e.hectares, kgPerHa: 0 });
    }
    const row = parcelMap.get(key)!;
    row.totalKg += e.totalKg;
  });

  parcelMap.forEach((row) => {
    row.kgPerHa = row.hectares > 0 ? row.totalKg / row.hectares : 0;
  });

  const result = [...parcelMap.values()];
  if (perHectare) {
    return result.sort((a, b) => b.kgPerHa - a.kgPerHa);
  }
  return result.sort((a, b) => b.totalKg - a.totalKg);
}

/**
 * Calculate variety ranking across all years.
 */
export function calculateVarietyRanking(entries: YearlyProductionEntry[], perHectare: boolean): VarietyRanking[] {
  const varietyMap = new Map<string, { totalKg: number; totalHectares: number; years: Set<number> }>();

  entries.forEach((e) => {
    if (!varietyMap.has(e.variety)) varietyMap.set(e.variety, { totalKg: 0, totalHectares: 0, years: new Set() });
    const v = varietyMap.get(e.variety)!;
    v.totalKg += e.totalKg;
    v.totalHectares += e.hectares;
    v.years.add(e.harvestYear);
  });

  return [...varietyMap.entries()]
    .map(([variety, data]) => ({
      variety,
      avgKgPerHa: data.totalHectares > 0 ? data.totalKg / data.totalHectares : 0,
      totalKg: data.totalKg,
      yearCount: data.years.size,
    }))
    .sort((a, b) => perHectare ? b.avgKgPerHa - a.avgKgPerHa : b.totalKg - a.totalKg);
}

/**
 * Calculate production KPIs for the current year.
 */
export function calculateProductionKPIs(
  entries: YearlyProductionEntry[],
  currentYear: number,
  previousYear: number
) {
  const current = entries.filter((e) => e.harvestYear === currentYear);
  const prev = entries.filter((e) => e.harvestYear === previousYear);

  const totalKg = current.reduce((sum, e) => sum + e.totalKg, 0);
  const totalHa = current.reduce((sum, e) => sum + e.hectares, 0);
  const varieties = [...new Set(current.map((e) => e.variety))];

  const prevTotalKg = prev.reduce((sum, e) => sum + e.totalKg, 0);
  const prevTotalHa = prev.reduce((sum, e) => sum + e.hectares, 0);

  // Best variety (highest kg/ha)
  const varietyKgHa = new Map<string, { totalKg: number; totalHa: number }>();
  current.forEach((e) => {
    if (!varietyKgHa.has(e.variety)) varietyKgHa.set(e.variety, { totalKg: 0, totalHa: 0 });
    const v = varietyKgHa.get(e.variety)!;
    v.totalKg += e.totalKg;
    v.totalHa += e.hectares;
  });

  let bestVariety = '-';
  let bestKgHa = 0;
  varietyKgHa.forEach((data, variety) => {
    const kgHa = data.totalHa > 0 ? data.totalKg / data.totalHa : 0;
    if (kgHa > bestKgHa) { bestKgHa = kgHa; bestVariety = variety; }
  });

  return {
    totalTon: totalKg / 1000,
    prevTotalTon: prevTotalKg / 1000,
    avgKgPerHa: totalHa > 0 ? totalKg / totalHa : 0,
    prevAvgKgPerHa: prevTotalHa > 0 ? prevTotalKg / prevTotalHa : 0,
    varietyCount: varieties.length,
    bestVariety,
    bestKgHa: Math.round(bestKgHa),
  };
}
