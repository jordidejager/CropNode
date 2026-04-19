/**
 * Detector: PRODUCTION TRENDS & UNDERPERFORMANCE
 *
 * Signaleert:
 * - Percelen die structureel achterlopen op benchmark én eigen bedrijfsgemiddelde
 * - Percelen met dalende opbrengst over ≥ 3 jaren
 * - Beste/slechtst presterende ras per opbrengst × kwaliteit
 */

import type { Signal, SignalDetector } from '../types';
import { getBenchmark } from '../benchmarks';
import { formatSubParcelName } from '../parcel-naming';
import { createHash } from 'crypto';

interface ProductionRow {
  sub_parcel_id: string | null;
  parcel_id: string | null;
  variety: string;
  total_kg: number;
  hectares: number | null;
  harvest_year: number;
}

function hashId(parts: string[]): string {
  return createHash('md5').update(parts.join('|')).digest('hex').slice(0, 16);
}

interface YearlyYield {
  harvestYear: number;
  totalKg: number;
  hectares: number;
  kgPerHa: number;
}

export const detectProductionTrends: SignalDetector = async (ctx) => {
  const { admin, userId, harvestYear, subParcels, now } = ctx;
  const signals: Signal[] = [];

  // Haal alle production_summaries op
  const { data, error } = await admin
    .from('production_summaries')
    .select('sub_parcel_id, parcel_id, variety, total_kg, hectares, harvest_year')
    .eq('user_id', userId);

  if (error || !data?.length) return signals;

  const rows = data as ProductionRow[];
  const spMap = new Map<string, any>();
  subParcels.forEach((sp) => spMap.set(sp.id, sp));

  // Groepeer per sub_parcel_id → per jaar
  const bySubParcel = new Map<string, YearlyYield[]>();
  rows.forEach((r) => {
    if (!r.sub_parcel_id || !r.total_kg || !r.hectares || r.hectares <= 0) return;
    const key = r.sub_parcel_id;
    if (!bySubParcel.has(key)) bySubParcel.set(key, []);
    bySubParcel.get(key)!.push({
      harvestYear: r.harvest_year,
      totalKg: r.total_kg,
      hectares: r.hectares,
      kgPerHa: r.total_kg / r.hectares,
    });
  });

  // --- Signal 1: dalende opbrengst over ≥ 3 jaar ---
  bySubParcel.forEach((years, spId) => {
    if (years.length < 3) return;
    const sorted = [...years].sort((a, b) => a.harvestYear - b.harvestYear);
    const last3 = sorted.slice(-3);
    const [y1, y2, y3] = last3;
    // Strikt dalend
    if (y1.kgPerHa > y2.kgPerHa && y2.kgPerHa > y3.kgPerHa) {
      const totalDropPct = ((y1.kgPerHa - y3.kgPerHa) / y1.kgPerHa) * 100;
      if (totalDropPct < 10) return; // Te klein

      const sp = spMap.get(spId);
      if (!sp) return;
      const fullName = formatSubParcelName(sp, ctx.parcels);

      signals.push({
        id: hashId(['prod-declining', spId]),
        mechanism: 'detectProductionTrends:declining',
        severity: totalDropPct >= 25 ? 'urgent' : 'attention',
        category: 'production',
        title: `${fullName}: opbrengst ${totalDropPct.toFixed(0)}% gedaald over 3 jaar`,
        body: `${y1.harvestYear}: ${Math.round(y1.kgPerHa).toLocaleString('nl-NL')} kg/ha → ${y3.harvestYear}: ${Math.round(y3.kgPerHa).toLocaleString('nl-NL')} kg/ha (${sp.variety || 'onbekend ras'}). Drie jaar achter elkaar dalend. Oorzaken kunnen zijn: boomleeftijd, bodemuitputting, wortelproblemen, ziekte- of plaagdruk die niet tijdig is aangepakt.`,
        affectedParcels: [fullName],
        action: {
          label: 'Open perceeldiagnose',
          href: '/analytics/perceel?id=' + spId,
        },
        metric: {
          value: Math.round(y3.kgPerHa),
          prevValue: Math.round(y1.kgPerHa),
          unit: 'kg/ha',
          higherIsBetter: true,
        },
        priority: Math.min(85, 45 + totalDropPct),
        generatedAt: now.toISOString(),
      });
    }
  });

  // --- Signal 2: percelen ver onder bedrijfsgemiddelde (voor hetzelfde ras) ---
  // Verzamel: per ras → alle (spId, kgPerHa) voor laatste beschikbare jaar
  const latestPerSp = new Map<string, YearlyYield>();
  bySubParcel.forEach((years, spId) => {
    const latest = years.reduce((a, b) => (b.harvestYear > a.harvestYear ? b : a));
    latestPerSp.set(spId, latest);
  });

  const byVariety = new Map<string, { spId: string; kgPerHa: number; spName: string }[]>();
  latestPerSp.forEach((y, spId) => {
    const sp = spMap.get(spId);
    if (!sp || !sp.variety) return;
    const v = sp.variety.toLowerCase();
    if (!byVariety.has(v)) byVariety.set(v, []);
    byVariety.get(v)!.push({ spId, kgPerHa: y.kgPerHa, spName: formatSubParcelName(sp, ctx.parcels) });
  });

  byVariety.forEach((list, variety) => {
    if (list.length < 3) return;
    const avg = list.reduce((s, x) => s + x.kgPerHa, 0) / list.length;
    const underperformers = list.filter((x) => x.kgPerHa < avg * 0.75);
    underperformers.forEach((u) => {
      const gap = ((avg - u.kgPerHa) / avg) * 100;
      signals.push({
        id: hashId(['prod-under-variety', u.spId]),
        mechanism: 'detectProductionTrends:under-variety-avg',
        severity: gap >= 35 ? 'attention' : 'explore',
        category: 'production',
        title: `${u.spName}: ${Math.round(gap)}% onder gemiddelde voor ${variety}`,
        body: `Laatste oogst: ${Math.round(u.kgPerHa).toLocaleString('nl-NL')} kg/ha. Jouw bedrijfsgemiddelde voor ${variety} over ${list.length} percelen: ${Math.round(avg).toLocaleString('nl-NL')} kg/ha. Check of plantleeftijd, bodemvruchtbaarheid of management verschilt van de best presterende percelen.`,
        affectedParcels: [u.spName],
        action: {
          label: 'Open perceeldiagnose',
          href: '/analytics/perceel?id=' + u.spId,
        },
        metric: {
          value: Math.round(u.kgPerHa),
          benchmark: Math.round(avg),
          unit: 'kg/ha',
          higherIsBetter: true,
        },
        priority: Math.min(70, 35 + gap),
        generatedAt: now.toISOString(),
      });
    });
  });

  // --- Signal 3: positieve signalering — bedrijf boven sectorbenchmark ---
  // Bedrijfsbreed voor laatste jaar
  const latestYear = Math.max(...rows.map((r) => r.harvest_year));
  const latestRows = rows.filter((r) => r.harvest_year === latestYear && r.hectares && r.hectares > 0);
  if (latestRows.length >= 3) {
    const totalKg = latestRows.reduce((s, r) => s + (r.total_kg || 0), 0);
    const totalHa = latestRows.reduce((s, r) => s + (r.hectares || 0), 0);
    const avgKgPerHa = totalHa > 0 ? totalKg / totalHa : 0;

    // Dominante gewas
    const cropArea = new Map<string, number>();
    latestRows.forEach((r) => {
      const sp = spMap.get(r.sub_parcel_id || '');
      const crop = sp?.crop?.toLowerCase() || 'default';
      cropArea.set(crop, (cropArea.get(crop) || 0) + (r.hectares || 0));
    });
    let dominantCrop = 'default';
    let maxArea = 0;
    cropArea.forEach((a, c) => {
      if (a > maxArea) { maxArea = a; dominantCrop = c; }
    });

    const benchmark = getBenchmark(dominantCrop);
    if (avgKgPerHa > benchmark.yieldKgPerHa * 1.15) {
      const pct = Math.round(((avgKgPerHa - benchmark.yieldKgPerHa) / benchmark.yieldKgPerHa) * 100);
      signals.push({
        id: hashId(['prod-above-sector', userId, String(latestYear)]),
        mechanism: 'detectProductionTrends:above-sector',
        severity: 'explore',
        category: 'benchmark',
        title: `Opbrengst ${Math.round(avgKgPerHa).toLocaleString('nl-NL')} kg/ha — ${pct}% boven sectorgemiddelde`,
        body: `Indicatieve sectorbenchmark ${dominantCrop}: ±${benchmark.yieldKgPerHa.toLocaleString('nl-NL')} kg/ha. Oogst ${latestYear}: ${Math.round(avgKgPerHa).toLocaleString('nl-NL')} kg/ha bedrijfsgemiddelde. Goed signaal — analyseer welke combinatie van ras/onderstam/management de topresultaten oplevert.`,
        affectedParcels: [],
        metric: {
          value: Math.round(avgKgPerHa),
          benchmark: benchmark.yieldKgPerHa,
          unit: 'kg/ha',
          higherIsBetter: true,
        },
        priority: 25,
        generatedAt: now.toISOString(),
      });
    }
  }

  return signals;
};
