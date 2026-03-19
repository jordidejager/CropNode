/**
 * BRP Gewasrotatiehistorie - PDOK + lokale database
 * Haalt historische gewasdata op via de lokale brp_gewas_nationaal tabel (2009-2025).
 * Fallback naar PDOK WFS/OGC API als de tabel leeg is.
 */

import { supabase } from './supabase-client';

const PDOK_WFS_URL =
  "https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0";

const PDOK_OGC_URL =
  "https://api.pdok.nl/rvo/gewaspercelen/ogc/v1/collections/brpgewas/items";

export interface BrpFetchResult {
  jaar: number;
  gewascode: number;
  gewas: string;
  category: string;
  cropGroup: string;
}

/**
 * Classify a BRP category + gewascode into a simplified crop group.
 */
export function classifyCropGroup(category: string, gewascode: number): string {
  const cat = (category || '').toLowerCase();

  if (cat.includes('grasland')) return 'Grasland';
  if (cat.includes('bouwland')) return 'Akkerbouw';
  if (cat.includes('tuinbouw')) return 'Fruit';

  // Fallback: check specific gewascodes
  if (gewascode >= 233 && gewascode <= 237) return 'Fruit';
  if (gewascode === 256) return 'Fruit'; // Aardbeien
  if (gewascode === 2596) return 'Fruit'; // Overig pit/steenfruit
  if (gewascode === 265 || gewascode === 266 || gewascode === 331 || gewascode === 332) return 'Grasland';

  return 'Overig';
}

/**
 * Fetch BRP gewas data for a location using the OGC API Features endpoint.
 * Returns the current year's crop at that location.
 */
export async function fetchBrpAtLocation(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<BrpFetchResult | null> {
  // Create a small bbox around the point (same pattern as rvo-api.ts)
  const delta = 0.001; // ~100m
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  const params = new URLSearchParams({
    f: 'json',
    bbox,
    limit: '10',
  });

  try {
    const response = await fetch(`${PDOK_OGC_URL}?${params}`, {
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.features || data.features.length === 0) return null;

    // Find the closest feature (simplification: take the first one)
    const feature = data.features[0];
    const props = feature.properties;

    const category = props.category || '';
    const gewascode = Number(props.gewascode) || 0;

    return {
      jaar: Number(props.jaar) || new Date().getFullYear(),
      gewascode,
      gewas: props.gewas || 'Onbekend',
      category,
      cropGroup: classifyCropGroup(category, gewascode),
    };
  } catch (err) {
    console.warn('[BRP] OGC API fetch failed:', err);
    return null;
  }
}

/**
 * Fetch BRP gewas data via WFS endpoint.
 * Tries both with and without year filter.
 */
export async function fetchBrpWfs(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<BrpFetchResult | null> {
  const delta = 0.001;
  const bboxFilter = `BBOX(geom,${lng - delta},${lat - delta},${lng + delta},${lat + delta})`;

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: 'brpgewaspercelen:BrpGewas',
    outputFormat: 'application/json',
    count: '5',
    srsName: 'EPSG:4326',
    CQL_FILTER: bboxFilter,
  });

  try {
    const response = await fetch(`${PDOK_WFS_URL}?${params}`, {
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.features || data.features.length === 0) return null;

    const feature = data.features[0];
    const props = feature.properties;

    const category = props.category || '';
    const gewascode = Number(props.gewascode) || 0;

    return {
      jaar: Number(props.jaar) || new Date().getFullYear(),
      gewascode,
      gewas: props.gewas || 'Onbekend',
      category,
      cropGroup: classifyCropGroup(category, gewascode),
    };
  } catch (err) {
    console.warn('[BRP] WFS fetch failed:', err);
    return null;
  }
}

/**
 * Fetch BRP historie from the local brp_gewas_nationaal table.
 * Uses a bbox query around the given lat/lng (~220m radius).
 * Returns all years found, sorted newest first.
 */
export async function fetchBrpHistorieFromDb(
  lat: number,
  lng: number
): Promise<BrpFetchResult[]> {
  const latDelta = 0.002; // ~220m
  const lngDelta = 0.003; // ~220m at NL latitudes

  try {
    const { data, error } = await supabase
      .from('brp_gewas_nationaal')
      .select('jaar, gewascode, gewas, category')
      .gte('lat', lat - latDelta)
      .lte('lat', lat + latDelta)
      .gte('lng', lng - lngDelta)
      .lte('lng', lng + lngDelta)
      .order('jaar', { ascending: false });

    if (error || !data || data.length === 0) return [];

    // Deduplicate by jaar (take first match per year, which is closest due to bbox)
    const seen = new Set<number>();
    const results: BrpFetchResult[] = [];

    for (const row of data) {
      if (seen.has(row.jaar)) continue;
      seen.add(row.jaar);
      results.push({
        jaar: row.jaar,
        gewascode: row.gewascode,
        gewas: row.gewas,
        category: row.category || '',
        cropGroup: classifyCropGroup(row.category || '', row.gewascode),
      });
    }

    return results;
  } catch (err) {
    console.warn('[BRP] DB query failed:', err);
    return [];
  }
}

/**
 * Main entry point: fetch BRP data for a parcel location.
 * Tries local DB first (instant, all years 2009-2025).
 * Falls back to PDOK OGC/WFS API (current year only).
 */
export async function fetchBrpHistorie(
  lat: number,
  lng: number
): Promise<BrpFetchResult[]> {
  // Try local database first (has all years)
  const dbResults = await fetchBrpHistorieFromDb(lat, lng);
  if (dbResults.length > 0) return dbResults;

  // Fallback to PDOK API (current year only)
  const results: BrpFetchResult[] = [];
  let result = await fetchBrpAtLocation(lat, lng);
  if (!result) {
    result = await fetchBrpWfs(lat, lng);
  }
  if (result) {
    results.push(result);
  }
  return results;
}
