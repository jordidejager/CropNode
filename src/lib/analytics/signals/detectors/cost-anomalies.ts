/**
 * Detector: COST ANOMALIES
 *
 * Detecteert afwijkingen in spuitkosten per hectare per perceel.
 * - Vergelijkt met sector-benchmark
 * - Vergelijkt met bedrijfsgemiddelde
 * - Detecteert uitschieters (percelen > 30% boven gemiddelde)
 * - Signaleert als kosten/ha sterk zijn gestegen t.o.v. vorig jaar
 */

import type { Signal, SignalDetector } from '../types';
import { getBenchmark, getDominantCrop } from '../benchmarks';
import { formatSubParcelName } from '../parcel-naming';
import { createHash } from 'crypto';

interface ParcelHistoryRow {
  parcel_id: string;
  parcel_name: string;
  product: string;
  dosage: number;
  unit: string;
  unit_price: number | null;
  date: string;
  harvest_year: number | null;
  registration_type: string | null;
}

interface ParcelCostAggregation {
  parcelId: string;
  parcelName: string;
  hectares: number;
  totalCost: number;
  costPerHa: number;
  treatmentCount: number;
}

function hashId(parts: string[]): string {
  return createHash('md5').update(parts.join('|')).digest('hex').slice(0, 16);
}

function aggregateCostsPerParcel(
  rows: ParcelHistoryRow[],
  parcelNameToAreaMap: Map<string, number>
): ParcelCostAggregation[] {
  // Groepeer op parcel_name (parcel_history bevat naam, niet altijd id)
  const map = new Map<string, ParcelCostAggregation>();
  rows.forEach((r) => {
    const key = r.parcel_name || r.parcel_id;
    if (!key) return;
    if (!map.has(key)) {
      const area = parcelNameToAreaMap.get(key) || 1;
      map.set(key, {
        parcelId: r.parcel_id || key,
        parcelName: key,
        hectares: area,
        totalCost: 0,
        costPerHa: 0,
        treatmentCount: 0,
      });
    }
    const agg = map.get(key)!;
    if (r.unit_price != null && r.dosage != null) {
      agg.totalCost += r.unit_price * r.dosage;
    }
    agg.treatmentCount++;
  });

  map.forEach((agg) => {
    agg.costPerHa = agg.hectares > 0 ? agg.totalCost / agg.hectares : 0;
  });

  return [...map.values()];
}

export const detectCostAnomalies: SignalDetector = async (ctx) => {
  const { admin, userId, harvestYear, subParcels, now } = ctx;
  const signals: Signal[] = [];

  // Haal huidig + vorig jaar parcel_history op
  const { data, error } = await admin
    .from('parcel_history')
    .select('parcel_id, parcel_name, product, dosage, unit, unit_price, date, harvest_year, registration_type')
    .eq('user_id', userId)
    .in('harvest_year', [harvestYear, harvestYear - 1]);

  if (error || !data?.length) return signals;

  const rows = data as ParcelHistoryRow[];

  // Map parcelnaam → hectares (uit subparcels lookup op naam)
  const parcelNameToArea = new Map<string, number>();
  subParcels.forEach((sp) => {
    parcelNameToArea.set(sp.name, sp.area);
  });

  const currentYearRows = rows.filter((r) => r.harvest_year === harvestYear);
  const prevYearRows = rows.filter((r) => r.harvest_year === harvestYear - 1);

  const currentAggs = aggregateCostsPerParcel(currentYearRows, parcelNameToArea);
  const prevAggs = aggregateCostsPerParcel(prevYearRows, parcelNameToArea);

  // Bedrijfsbenchmark
  const benchmark = getBenchmark(getDominantCrop(subParcels));

  // Alleen percelen waar we prijsinfo hebben
  const withCost = currentAggs.filter((a) => a.totalCost > 0);
  if (withCost.length === 0) return signals;

  // Helper: bouw volledige naam uit parcel_history parcel_name (meestal subperceelnaam)
  const nameToFullName = new Map<string, string>();
  withCost.forEach((agg) => {
    const sp = subParcels.find((s) => s.name === agg.parcelName);
    nameToFullName.set(agg.parcelName, sp ? formatSubParcelName(sp, ctx.parcels) : agg.parcelName);
  });

  // Bedrijfsgemiddelde
  const totalHa = withCost.reduce((s, a) => s + a.hectares, 0);
  const totalCost = withCost.reduce((s, a) => s + a.totalCost, 0);
  const avgCostPerHa = totalHa > 0 ? totalCost / totalHa : 0;

  // --- Signal 1: percelen met extreem hoge kosten/ha (>30% boven bedrijfsgemiddelde) ---
  withCost.forEach((agg) => {
    if (avgCostPerHa === 0) return;
    const deviation = ((agg.costPerHa - avgCostPerHa) / avgCostPerHa) * 100;
    if (deviation < 30) return;

    // Zoek vorig jaar voor dit perceel
    const prev = prevAggs.find((p) => p.parcelName === agg.parcelName);
    const prevHint = prev && prev.costPerHa > 0
      ? `Vorig jaar €${prev.costPerHa.toFixed(0)}/ha (${agg.costPerHa > prev.costPerHa ? '+' : ''}${Math.round(((agg.costPerHa - prev.costPerHa) / prev.costPerHa) * 100)}%).`
      : '';

    const fullName = nameToFullName.get(agg.parcelName) || agg.parcelName;
    signals.push({
      id: hashId(['cost-high', agg.parcelName, String(harvestYear)]),
      mechanism: 'detectCostAnomalies:high-parcel',
      severity: deviation >= 60 ? 'urgent' : 'attention',
      category: 'cost',
      title: `${fullName}: kosten €${agg.costPerHa.toFixed(0)}/ha — ${deviation.toFixed(0)}% boven bedrijfsgemiddelde`,
      body: `${agg.treatmentCount} behandelingen dit oogstjaar. ${prevHint} Dat is €${Math.round(agg.costPerHa - avgCostPerHa)} per ha meer dan gemiddeld. Kijk of het hoge aantal behandelingen gerechtvaardigd was door ziektedruk-events, of dat er ruimte is voor rationalisatie.`,
      affectedParcels: [fullName],
      action: {
        label: 'Bekijk middelenanalyse',
        href: '/analytics',
      },
      metric: {
        value: Math.round(agg.costPerHa),
        prevValue: prev?.costPerHa ? Math.round(prev.costPerHa) : undefined,
        benchmark: Math.round(avgCostPerHa),
        unit: '€/ha',
        higherIsBetter: false,
      },
      priority: Math.min(80, 40 + deviation / 2),
      generatedAt: now.toISOString(),
    });
  });

  // --- Signal 2: bedrijfsbreed t.o.v. sector-benchmark ---
  if (avgCostPerHa > benchmark.inputCostPerHa * 1.15) {
    const pct = Math.round(((avgCostPerHa - benchmark.inputCostPerHa) / benchmark.inputCostPerHa) * 100);
    signals.push({
      id: hashId(['cost-vs-sector', userId, String(harvestYear)]),
      mechanism: 'detectCostAnomalies:sector-compare',
      severity: pct >= 30 ? 'attention' : 'explore',
      category: 'benchmark',
      title: `Inputkosten €${avgCostPerHa.toFixed(0)}/ha — ${pct}% boven sectorgemiddelde`,
      body: `Sector-indicatie voor hardfruit: ±€${benchmark.inputCostPerHa}/ha. Jouw gemiddelde dit oogstjaar: €${avgCostPerHa.toFixed(0)}/ha over ${withCost.length} percelen. Verschil kan door intensievere teelt, duurdere middelen, of grotere behandelfrequentie komen — kijk per perceel waar het zit.`,
      affectedParcels: withCost.map((a) => nameToFullName.get(a.parcelName) || a.parcelName),
      metric: {
        value: Math.round(avgCostPerHa),
        benchmark: benchmark.inputCostPerHa,
        unit: '€/ha',
        higherIsBetter: false,
      },
      priority: 50,
      generatedAt: now.toISOString(),
    });
  }

  // --- Signal 3: spuitfrequentie dramatisch gestegen t.o.v. vorig jaar ---
  withCost.forEach((agg) => {
    const prev = prevAggs.find((p) => p.parcelName === agg.parcelName);
    if (!prev) return;
    if (prev.treatmentCount < 5) return; // Vorig jaar al weinig → geen zinvolle vergelijking

    const increase = agg.treatmentCount - prev.treatmentCount;
    if (increase < 5) return;

    const pct = Math.round((increase / prev.treatmentCount) * 100);
    if (pct < 30) return;

    const fullName2 = nameToFullName.get(agg.parcelName) || agg.parcelName;
    signals.push({
      id: hashId(['spray-freq-jump', agg.parcelName, String(harvestYear)]),
      mechanism: 'detectCostAnomalies:spray-freq-jump',
      severity: pct >= 50 ? 'attention' : 'explore',
      category: 'cost',
      title: `${fullName2}: behandelfrequentie fors toegenomen (${prev.treatmentCount} → ${agg.treatmentCount})`,
      body: `+${pct}% meer behandelingen dan vorig oogstjaar. Dit kan legitiem zijn (hogere ziektedruk, nieuw ras-protocol) maar ook een signaal van reactief spuiten. Vergelijk met ziektedruk-events op dit perceel.`,
      affectedParcels: [fullName2],
      metric: {
        value: agg.treatmentCount,
        prevValue: prev.treatmentCount,
        unit: 'behandelingen',
        higherIsBetter: false,
      },
      priority: 45,
      generatedAt: now.toISOString(),
    });
  });

  return signals;
};
