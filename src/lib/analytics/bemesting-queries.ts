'use client';

import { createClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface SoilAnalysisRow {
  id: string;
  parcel_id: string | null;
  sub_parcel_id: string | null;
  rapport_identificatie: string | null;
  lab: string | null;
  datum_monstername: string | null;
  datum_verslag: string | null;
  geldig_tot: number | null;
  grondsoort_rapport: string | null;
  oppervlakte_rapport_ha: number | null;
  n_totaal_bodemvoorraad_kg_ha: number | null;
  n_leverend_vermogen_kg_ha: number | null;
  cn_ratio: number | null;
  p_plantbeschikbaar_kg_ha: number | null;
  p_bodemvoorraad_kg_ha: number | null;
  p_bodemvoorraad_p_al: number | null;
  pw_getal: number | null;
  c_organisch_pct: number | null;
  organische_stof_pct: number | null;
  klei_percentage: number | null;
  bulkdichtheid_kg_m3: number | null;
  waarderingen: Record<string, { waardering: string; streeftraject?: string }> | null;
  bemestingsadviezen: any | null;
  extractie_status: string | null;
  extractie_confidence: number | null;
  created_at: string;
  // Resolved names
  parcel_name?: string;
  sub_parcel_name?: string;
}

/** A sub-parcel with its inherited or direct soil analysis */
export interface SubParcelSoilData {
  subParcelId: string;
  subParcelName: string;
  crop: string;
  variety: string;
  hectares: number;
  analysis: SoilAnalysisRow | null;
  analysisSource: 'direct' | 'inherited' | null; // inherited = from hoofdperceel
}

/** A hoofdperceel with its sub-parcels and soil data */
export interface HoofdPerceelBemesting {
  parcelId: string;
  parcelName: string;
  totalHa: number;
  /** Analysis directly on this hoofdperceel (if any) */
  hoofdAnalysis: SoilAnalysisRow | null;
  /** Sub-parcels with their soil data (direct or inherited from hoofd) */
  subParcels: SubParcelSoilData[];
}

// ============================================================================
// QUERIES
// ============================================================================

export async function fetchSoilAnalyses(): Promise<SoilAnalysisRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('soil_analyses')
    .select(`
      *,
      parcels:parcel_id(name),
      sub_parcels:sub_parcel_id(name, variety, crop, area)
    `)
    .order('datum_monstername', { ascending: false });

  if (error) {
    console.error('Error fetching soil analyses:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    ...row,
    parcel_name: row.parcels?.name || null,
    sub_parcel_name: row.sub_parcels?.name || null,
  }));
}

// ============================================================================
// BUILD HOOFDPERCEEL → SUBPERCEEL STRUCTURE
// ============================================================================

export function buildHoofdPerceelBemesting(
  analyses: SoilAnalysisRow[],
  subParcels: { id: string; parcel_id: string; name: string; crop: string; variety: string; area: number }[],
  parcels: { id: string; name: string; area: number }[]
): HoofdPerceelBemesting[] {
  // Index analyses by parcel_id and sub_parcel_id
  const analysesByParcel = new Map<string, SoilAnalysisRow[]>();
  const analysesBySubParcel = new Map<string, SoilAnalysisRow[]>();

  analyses.forEach((a) => {
    if (a.parcel_id) {
      if (!analysesByParcel.has(a.parcel_id)) analysesByParcel.set(a.parcel_id, []);
      analysesByParcel.get(a.parcel_id)!.push(a);
    }
    if (a.sub_parcel_id) {
      if (!analysesBySubParcel.has(a.sub_parcel_id)) analysesBySubParcel.set(a.sub_parcel_id, []);
      analysesBySubParcel.get(a.sub_parcel_id)!.push(a);
    }
  });

  // Group sub_parcels by their parcel_id (hoofdperceel)
  const hoofdMap = new Map<string, HoofdPerceelBemesting>();

  // Initialize from parcels
  parcels.forEach((p) => {
    const hoofdAnalyses = analysesByParcel.get(p.id);
    hoofdMap.set(p.id, {
      parcelId: p.id,
      parcelName: p.name,
      totalHa: 0,
      hoofdAnalysis: hoofdAnalyses?.[0] || null, // latest (already sorted desc)
      subParcels: [],
    });
  });

  // Populate sub-parcels into their hoofdperceel
  subParcels.forEach((sp) => {
    let hoofd = hoofdMap.get(sp.parcel_id);
    if (!hoofd) {
      // Orphan sub-parcel without a matching parcel
      hoofd = {
        parcelId: sp.parcel_id,
        parcelName: sp.parcel_id,
        totalHa: 0,
        hoofdAnalysis: analysesByParcel.get(sp.parcel_id)?.[0] || null,
        subParcels: [],
      };
      hoofdMap.set(sp.parcel_id, hoofd);
    }

    // Direct analysis on sub-parcel, or inherit from hoofdperceel
    const directAnalyses = analysesBySubParcel.get(sp.id);
    const directAnalysis = directAnalyses?.[0] || null;

    hoofd.subParcels.push({
      subParcelId: sp.id,
      subParcelName: sp.name,
      crop: sp.crop,
      variety: sp.variety,
      hectares: sp.area,
      analysis: directAnalysis || hoofd.hoofdAnalysis, // inherit from hoofd if no direct
      analysisSource: directAnalysis ? 'direct' : hoofd.hoofdAnalysis ? 'inherited' : null,
    });

    hoofd.totalHa += sp.area || 0;
  });

  // Only return hoofdpercelen that have analyses (direct or on sub-parcels)
  return [...hoofdMap.values()]
    .filter((h) => h.hoofdAnalysis || h.subParcels.some((sp) => sp.analysis))
    .sort((a, b) => a.parcelName.localeCompare(b.parcelName));
}

// ============================================================================
// STATS
// ============================================================================

export function calculateBemestingStats(groups: HoofdPerceelBemesting[]) {
  // Collect all unique analyses across all sub-parcels
  const allSubsWithData = groups.flatMap((g) => g.subParcels.filter((sp) => sp.analysis));

  const withOS = allSubsWithData.filter((sp) => sp.analysis?.organische_stof_pct != null);
  const withNLV = allSubsWithData.filter((sp) => sp.analysis?.n_leverend_vermogen_kg_ha != null);
  const withP = allSubsWithData.filter((sp) => sp.analysis?.p_plantbeschikbaar_kg_ha != null);
  const withPAl = allSubsWithData.filter((sp) => sp.analysis?.p_bodemvoorraad_p_al != null);

  return {
    totalHoofdPercelen: groups.length,
    totalSubParcels: allSubsWithData.length,
    avgOrganischeStof: withOS.length > 0 ? withOS.reduce((s, sp) => s + sp.analysis!.organische_stof_pct!, 0) / withOS.length : null,
    avgNLV: withNLV.length > 0 ? withNLV.reduce((s, sp) => s + sp.analysis!.n_leverend_vermogen_kg_ha!, 0) / withNLV.length : null,
    avgPBeschikbaar: withP.length > 0 ? withP.reduce((s, sp) => s + sp.analysis!.p_plantbeschikbaar_kg_ha!, 0) / withP.length : null,
    avgPAl: withPAl.length > 0 ? withPAl.reduce((s, sp) => s + sp.analysis!.p_bodemvoorraad_p_al!, 0) / withPAl.length : null,
  };
}
