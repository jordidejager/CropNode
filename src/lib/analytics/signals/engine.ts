/**
 * Signal Engine — orchestrator voor alle detectors.
 *
 * Roept alle detectors aan (parallel), dedupliceert op ID en sorteert
 * op priority (hoogste eerst). Geeft ook context-stats terug voor de UI.
 */

import type { Signal, SignalDetector, SignalDetectorContext } from './types';
import { detectSoilDrift } from './detectors/soil-drift';
import { detectQualityDrops } from './detectors/quality-drops';
import { detectCostAnomalies } from './detectors/cost-anomalies';
import { detectProductionTrends } from './detectors/production-trends';

const ALL_DETECTORS: SignalDetector[] = [
  detectSoilDrift,
  detectQualityDrops,
  detectCostAnomalies,
  detectProductionTrends,
];

export interface EngineResult {
  signals: Signal[];
  stats: {
    totalDetected: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    detectorsRun: number;
    detectorsFailed: number;
    dataAvailability: {
      parcels: number;
      subParcels: number;
      soilAnalyses: number;
      productionEntries: number;
      harvestRegistrations: number;
      spuitschriftEntries: number;
    };
  };
  generatedAt: string;
}

async function fetchDataAvailability(admin: any, userId: string) {
  const [parcels, sub, soil, prod, harv, spuit] = await Promise.all([
    admin.from('parcels').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('sub_parcels').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('soil_analyses').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('production_summaries').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('harvest_registrations').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('spuitschrift').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  return {
    parcels: parcels.count || 0,
    subParcels: sub.count || 0,
    soilAnalyses: soil.count || 0,
    productionEntries: prod.count || 0,
    harvestRegistrations: harv.count || 0,
    spuitschriftEntries: spuit.count || 0,
  };
}

function deriveHarvestYear(now: Date): number {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  // Nov/Dec: al aan het werk voor volgend oogstjaar
  return month >= 11 ? year + 1 : year;
}

export async function runSignalEngine(
  admin: any,
  userId: string,
  options?: { now?: Date }
): Promise<EngineResult> {
  const now = options?.now || new Date();
  const harvestYear = deriveHarvestYear(now);

  // Haal context data op
  const [parcelsRes, subParcelsRes, availability] = await Promise.all([
    admin.from('parcels').select('id, name, area').eq('user_id', userId),
    admin.from('sub_parcels').select('id, parcel_id, name, crop, variety, area').eq('user_id', userId),
    fetchDataAvailability(admin, userId),
  ]);

  const parcels = (parcelsRes.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    area: p.area || 0,
  }));
  const subParcels = (subParcelsRes.data || []).map((sp: any) => ({
    id: sp.id,
    parcel_id: sp.parcel_id,
    name: sp.name,
    crop: sp.crop || '',
    variety: sp.variety || '',
    area: sp.area || 0,
  }));

  const ctx: SignalDetectorContext = {
    userId,
    admin,
    harvestYear,
    now,
    subParcels,
    parcels,
  };

  // Run alle detectors parallel, vang fouten af per detector
  let detectorsFailed = 0;
  const detectorResults = await Promise.all(
    ALL_DETECTORS.map(async (detector) => {
      try {
        return await detector(ctx);
      } catch (err) {
        console.error('[signals] Detector failed:', detector.name, err);
        detectorsFailed++;
        return [] as Signal[];
      }
    })
  );

  // Verzamel + dedupliceer op ID
  const byId = new Map<string, Signal>();
  detectorResults.flat().forEach((s) => {
    const existing = byId.get(s.id);
    if (!existing || s.priority > existing.priority) {
      byId.set(s.id, s);
    }
  });

  // Sorteer op priority (hoog → laag), dan op severity rank
  const severityRank: Record<string, number> = { urgent: 3, attention: 2, explore: 1 };
  const signals = [...byId.values()].sort((a, b) => {
    const sev = severityRank[b.severity] - severityRank[a.severity];
    if (sev !== 0) return sev;
    return b.priority - a.priority;
  });

  // Stats
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  signals.forEach((s) => {
    byCategory[s.category] = (byCategory[s.category] || 0) + 1;
    bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
  });

  return {
    signals,
    stats: {
      totalDetected: signals.length,
      byCategory,
      bySeverity,
      detectorsRun: ALL_DETECTORS.length,
      detectorsFailed,
      dataAvailability: availability,
    },
    generatedAt: now.toISOString(),
  };
}
