/**
 * Detector: SOIL DRIFT
 *
 * Detecteert structurele verslechtering van bodemparameters over meerdere jaren.
 * Kijkt naar organische stof %, N-leverend vermogen, P-Al per perceel.
 *
 * Trigger: ≥ 2 grondmonsters over ≥ 2 kalenderjaren, en significante daling.
 */

import type { Signal, SignalDetector } from '../types';
import { SOIL_TARGETS } from '../benchmarks';
import { createHash } from 'crypto';

interface SoilAnalysisRow {
  id: string;
  parcel_id: string | null;
  sub_parcel_id: string | null;
  datum_monstername: string | null;
  organische_stof_pct: number | null;
  n_leverend_vermogen_kg_ha: number | null;
  p_bodemvoorraad_p_al: number | null;
  c_organisch_pct: number | null;
}

interface ParcelTrend {
  parcelId: string;
  parcelName: string;
  latestDate: string;
  earliestDate: string;
  years: number;
  latestValue: number;
  earliestValue: number;
  absoluteDrop: number;
  pctDrop: number;
  annualRate: number;
}

function hashId(parts: string[]): string {
  return createHash('md5').update(parts.join('|')).digest('hex').slice(0, 16);
}

function computeTrends(
  analyses: SoilAnalysisRow[],
  parcelNameMap: Map<string, string>,
  field: keyof SoilAnalysisRow
): ParcelTrend[] {
  // Groepeer op parcel_id (of sub_parcel_id → parcel_id)
  const byParcel = new Map<string, SoilAnalysisRow[]>();
  analyses.forEach((a) => {
    const key = a.parcel_id;
    if (!key) return;
    const val = a[field];
    if (val == null || typeof val !== 'number') return;
    if (!a.datum_monstername) return;

    if (!byParcel.has(key)) byParcel.set(key, []);
    byParcel.get(key)!.push(a);
  });

  const trends: ParcelTrend[] = [];

  byParcel.forEach((rows, parcelId) => {
    if (rows.length < 2) return;
    const sorted = [...rows].sort(
      (a, b) =>
        new Date(a.datum_monstername!).getTime() -
        new Date(b.datum_monstername!).getTime()
    );
    const earliest = sorted[0];
    const latest = sorted[sorted.length - 1];

    const earliestVal = earliest[field] as number | null;
    const latestVal = latest[field] as number | null;
    if (earliestVal == null || latestVal == null) return;

    const earliestDate = new Date(earliest.datum_monstername!);
    const latestDate = new Date(latest.datum_monstername!);
    const years = (latestDate.getTime() - earliestDate.getTime()) / (365 * 24 * 3600 * 1000);

    if (years < 1.5) return; // Te kort om trend te claimen

    const absoluteDrop = earliestVal - latestVal;
    const pctDrop = earliestVal > 0 ? (absoluteDrop / earliestVal) * 100 : 0;
    const annualRate = absoluteDrop / years;

    trends.push({
      parcelId,
      parcelName: parcelNameMap.get(parcelId) || 'Onbekend',
      latestDate: latest.datum_monstername!,
      earliestDate: earliest.datum_monstername!,
      years: Math.round(years * 10) / 10,
      latestValue: latestVal,
      earliestValue: earliestVal,
      absoluteDrop: Math.round(absoluteDrop * 100) / 100,
      pctDrop: Math.round(pctDrop * 10) / 10,
      annualRate: Math.round(annualRate * 100) / 100,
    });
  });

  return trends;
}

export const detectSoilDrift: SignalDetector = async (ctx) => {
  const { admin, userId, parcels, subParcels, now } = ctx;
  const signals: Signal[] = [];

  const { data: analyses, error } = await admin
    .from('soil_analyses')
    .select('id, parcel_id, sub_parcel_id, datum_monstername, organische_stof_pct, n_leverend_vermogen_kg_ha, p_bodemvoorraad_p_al, c_organisch_pct')
    .eq('user_id', userId)
    .order('datum_monstername', { ascending: false })
    .limit(500);

  if (error || !analyses?.length) return signals;

  const parcelNameMap = new Map<string, string>();
  parcels.forEach((p: any) => parcelNameMap.set(p.id, p.name));

  // Groepeer ook op naam (telers hebben soms meerdere parcels met zelfde naam)
  // We aggregeren op parcel_id voor de trend — perceelnaam voor UI
  const osTrends = computeTrends(analyses as SoilAnalysisRow[], parcelNameMap, 'organische_stof_pct');
  const nTrends = computeTrends(analyses as SoilAnalysisRow[], parcelNameMap, 'n_leverend_vermogen_kg_ha');

  // --- Organische stof daling ---
  const osDroppers = osTrends.filter(
    (t) => t.pctDrop >= 5 && t.absoluteDrop >= 0.2 // minstens 5% én 0.2% absoluut
  );

  if (osDroppers.length >= 3) {
    // Bedrijfsbrede trend
    const gemAnnual =
      osDroppers.reduce((s, t) => s + t.annualRate, 0) / osDroppers.length;
    const gemLatest =
      osDroppers.reduce((s, t) => s + t.latestValue, 0) / osDroppers.length;

    const belowTarget = gemLatest < SOIL_TARGETS.organicMatterPct.optimal;

    signals.push({
      id: hashId(['soil-os-bedrijf', userId]),
      mechanism: 'detectSoilDrift:os-farmwide',
      severity: gemLatest < SOIL_TARGETS.organicMatterPct.min ? 'urgent' : 'attention',
      category: 'soil',
      title: `Bodem organische stof daalt op ${osDroppers.length} percelen`,
      body: `Gemiddeld -${Math.abs(gemAnnual).toFixed(2)}% per jaar over ${osDroppers[0].years.toFixed(1)} jaar. Huidig gemiddelde: ${gemLatest.toFixed(1)}%${belowTarget ? ` (streefwaarde ${SOIL_TARGETS.organicMatterPct.optimal}%)` : ''}. Zonder bijsturing via compost, groenbemester of rijpadenbeheer blijft deze trend doorzetten.`,
      affectedParcels: osDroppers.map((t) => t.parcelName),
      action: {
        label: 'Bekijk bemesting-pagina',
        href: '/analytics/bemesting',
      },
      metric: {
        value: gemLatest,
        unit: '%',
        target: SOIL_TARGETS.organicMatterPct.optimal,
        higherIsBetter: true,
      },
      priority: gemLatest < SOIL_TARGETS.organicMatterPct.min ? 85 : 65,
      generatedAt: now.toISOString(),
    });
  } else {
    // Individuele percelen
    osDroppers.slice(0, 3).forEach((t) => {
      const belowMin = t.latestValue < SOIL_TARGETS.organicMatterPct.min;
      signals.push({
        id: hashId(['soil-os-parcel', t.parcelId]),
        mechanism: 'detectSoilDrift:os-parcel',
        severity: belowMin ? 'urgent' : 'attention',
        category: 'soil',
        title: `${t.parcelName}: organische stof gedaald van ${t.earliestValue.toFixed(1)}% naar ${t.latestValue.toFixed(1)}%`,
        body: `Daling van ${t.pctDrop.toFixed(1)}% over ${t.years.toFixed(1)} jaar (-${Math.abs(t.annualRate).toFixed(2)}%/jaar). ${belowMin ? `Onder de ondergrens van ${SOIL_TARGETS.organicMatterPct.min}%.` : `Nadert de ondergrens van ${SOIL_TARGETS.organicMatterPct.min}%.`}`,
        affectedParcels: [t.parcelName],
        action: {
          label: 'Bekijk bodemdetails',
          href: '/analytics/bemesting',
        },
        metric: {
          value: t.latestValue,
          prevValue: t.earliestValue,
          unit: '%',
          target: SOIL_TARGETS.organicMatterPct.optimal,
          higherIsBetter: true,
        },
        priority: belowMin ? 75 : 55,
        generatedAt: now.toISOString(),
      });
    });
  }

  // --- N-leverend vermogen daling ---
  const nDroppers = nTrends.filter((t) => t.pctDrop >= 15 && t.absoluteDrop >= 20);
  nDroppers.slice(0, 2).forEach((t) => {
    const belowMin = t.latestValue < SOIL_TARGETS.nSupplyKgPerHa.min;
    signals.push({
      id: hashId(['soil-n-parcel', t.parcelId]),
      mechanism: 'detectSoilDrift:n-parcel',
      severity: belowMin ? 'attention' : 'explore',
      category: 'soil',
      title: `${t.parcelName}: N-leverend vermogen daalt (${t.earliestValue.toFixed(0)} → ${t.latestValue.toFixed(0)} kg/ha)`,
      body: `Daling van ${t.pctDrop.toFixed(0)}% in ${t.years.toFixed(1)} jaar. Lagere N-levering betekent meer afhankelijkheid van kunstmestaanvulling. Check C/N-ratio en organische bemesting.`,
      affectedParcels: [t.parcelName],
      action: {
        label: 'Bekijk bodemdetails',
        href: '/analytics/bemesting',
      },
      metric: {
        value: t.latestValue,
        prevValue: t.earliestValue,
        unit: 'kg/ha',
        target: SOIL_TARGETS.nSupplyKgPerHa.optimal,
        higherIsBetter: true,
      },
      priority: belowMin ? 60 : 40,
      generatedAt: now.toISOString(),
    });
  });

  return signals;
};
