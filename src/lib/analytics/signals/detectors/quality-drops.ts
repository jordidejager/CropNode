/**
 * Detector: QUALITY DROPS
 *
 * Detecteert verslechtering in oogstkwaliteit (% Klasse I) per perceel/variëteit.
 * Vergelijkt huidig oogstjaar met vorig jaar.
 *
 * Trigger: -5 procentpunten of meer achteruitgang in Klasse I %.
 */

import type { Signal, SignalDetector } from '../types';
import { formatSubParcelName } from '../parcel-naming';
import { createHash } from 'crypto';

interface HarvestRow {
  id: string;
  parcel_id: string | null;
  sub_parcel_id: string | null;
  variety: string;
  total_crates: number;
  quality_class: string | null;
  harvest_year: number;
  harvest_date: string;
}

interface QualityStats {
  total: number;
  klasseI: number;
  klasseII: number;
  industrie: number;
  klasseIPct: number;
}

function hashId(parts: string[]): string {
  return createHash('md5').update(parts.join('|')).digest('hex').slice(0, 16);
}

function computeStats(rows: HarvestRow[]): QualityStats {
  let klasseI = 0;
  let klasseII = 0;
  let industrie = 0;
  let total = 0;
  rows.forEach((r) => {
    const crates = r.total_crates || 0;
    total += crates;
    if (r.quality_class === 'Klasse I') klasseI += crates;
    else if (r.quality_class === 'Klasse II') klasseII += crates;
    else if (r.quality_class === 'Industrie') industrie += crates;
  });
  return {
    total,
    klasseI,
    klasseII,
    industrie,
    klasseIPct: total > 0 ? (klasseI / total) * 100 : 0,
  };
}

export const detectQualityDrops: SignalDetector = async (ctx) => {
  const { admin, userId, harvestYear, now } = ctx;
  const signals: Signal[] = [];

  const { data, error } = await admin
    .from('harvest_registrations')
    .select('id, parcel_id, sub_parcel_id, variety, total_crates, quality_class, harvest_year, harvest_date')
    .eq('user_id', userId)
    .in('harvest_year', [harvestYear, harvestYear - 1]);

  if (error || !data?.length) return signals;

  const rows = data as HarvestRow[];

  // Groepeer op sub_parcel_id + jaar
  const byGroup = new Map<string, HarvestRow[]>();
  rows.forEach((r) => {
    const parcelKey = r.sub_parcel_id || r.parcel_id;
    if (!parcelKey) return;
    const key = `${parcelKey}|${r.harvest_year}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(r);
  });

  // Haal subparcel namen
  const spMap = new Map<string, any>();
  ctx.subParcels.forEach((sp) => spMap.set(sp.id, sp));

  // Vergelijk per subperceel: dit jaar vs vorig jaar
  const subParcelIds = new Set<string>();
  byGroup.forEach((_, key) => subParcelIds.add(key.split('|')[0]));

  subParcelIds.forEach((spId) => {
    const current = byGroup.get(`${spId}|${harvestYear}`);
    const previous = byGroup.get(`${spId}|${harvestYear - 1}`);

    if (!current || current.length === 0) return;
    if (!previous || previous.length === 0) return;

    const cur = computeStats(current);
    const prev = computeStats(previous);

    // Alleen vergelijken met voldoende data
    if (cur.total < 10 || prev.total < 10) return;
    // Kwaliteitsklasse moet ingevuld zijn (niet alle registraties hebben dat)
    if (cur.klasseI + cur.klasseII + cur.industrie < cur.total * 0.5) return;
    if (prev.klasseI + prev.klasseII + prev.industrie < prev.total * 0.5) return;

    const dropPp = prev.klasseIPct - cur.klasseIPct; // procentpunten
    if (dropPp < 5) return; // Niet significant

    const sp = spMap.get(spId);
    const name = formatSubParcelName(sp, ctx.parcels);
    const variety = sp?.variety || current[0]?.variety || '';

    const severity: Signal['severity'] =
      dropPp >= 15 ? 'urgent' : dropPp >= 10 ? 'attention' : 'explore';

    signals.push({
      id: hashId(['quality-drop', spId, String(harvestYear)]),
      mechanism: 'detectQualityDrops:sub-parcel',
      severity,
      category: 'quality',
      title: `${name}: Klasse I percentage daalt (${prev.klasseIPct.toFixed(0)}% → ${cur.klasseIPct.toFixed(0)}%)`,
      body: `Oogst ${harvestYear} toont -${dropPp.toFixed(0)} procentpunten Klasse I t.o.v. ${harvestYear - 1}${variety ? ` (${variety})` : ''}. Mogelijke oorzaken: schurft-infecties bij bloei of zetting, fysieke schade (hagel/wind), afrijpingsproblemen. Check infectietijdlijn en plukprotocol.`,
      affectedParcels: [name],
      action: {
        label: 'Open perceeldiagnose',
        href: '/analytics/perceel?id=' + spId,
      },
      metric: {
        value: Math.round(cur.klasseIPct),
        prevValue: Math.round(prev.klasseIPct),
        unit: '% Klasse I',
        higherIsBetter: true,
      },
      priority: Math.min(90, 40 + dropPp * 3),
      generatedAt: now.toISOString(),
    });
  });

  return signals;
};
