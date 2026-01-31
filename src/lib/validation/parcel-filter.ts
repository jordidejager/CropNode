/**
 * Parcel Filter Resolver v2.0 - Set Operations for Parcel Selection
 *
 * ARCHITECTUUR:
 * - AI geeft abstracte filters terug: {"include": {"crop": "Appel"}, "exclude": {"variety": "Tessa"}}
 * - Backend voert de SQL query uit: SELECT * FROM parcels WHERE crop='Appel' AND variety != 'Tessa'
 * - Ondersteunt complexe combinaties: include + exclude + specific IDs
 */

import { supabase } from '../supabase';
import type { SprayableParcel } from '../supabase-store';

// ============================================
// Types
// ============================================

export interface LocationFilter {
  include?: {
    crop_type?: string;
    variety?: string;
    parcel_name?: string;
  };
  exclude?: {
    crop_type?: string;
    variety?: string;
    parcel_name?: string;
  };
  specific_ids?: string[];
}

export interface FilterResult {
  parcels: SprayableParcel[];
  totalMatched: number;
  filterApplied: string;
  warnings: string[];
}

// ============================================
// Crop/Variety Normalization
// ============================================

/**
 * Normalize crop names for matching
 * Handles singular/plural and common variations
 */
function normalizeCropName(name: string): string[] {
  const normalized = name.toLowerCase().trim();
  const variants: string[] = [normalized];

  // Dutch plural forms
  const pluralMappings: Record<string, string[]> = {
    'appel': ['appel', 'appels'],
    'appels': ['appel', 'appels'],
    'peer': ['peer', 'peren'],
    'peren': ['peer', 'peren'],
    'kers': ['kers', 'kersen'],
    'kersen': ['kers', 'kersen'],
    'pruim': ['pruim', 'pruimen'],
    'pruimen': ['pruim', 'pruimen'],
    'aardbei': ['aardbei', 'aardbeien'],
    'aardbeien': ['aardbei', 'aardbeien'],
  };

  if (pluralMappings[normalized]) {
    variants.push(...pluralMappings[normalized]);
  }

  // Also add without trailing 's' or 'en'
  if (normalized.endsWith('s')) {
    variants.push(normalized.slice(0, -1));
  }
  if (normalized.endsWith('en')) {
    variants.push(normalized.slice(0, -2));
  }

  return [...new Set(variants)];
}

/**
 * Check if a parcel crop matches the filter crop
 */
function cropMatches(parcelCrop: string, filterCrop: string): boolean {
  const filterVariants = normalizeCropName(filterCrop);
  const parcelLower = parcelCrop.toLowerCase();

  return filterVariants.some(variant =>
    parcelLower === variant ||
    parcelLower.includes(variant) ||
    variant.includes(parcelLower)
  );
}

/**
 * Check if a parcel variety matches the filter variety
 */
function varietyMatches(parcelVariety: string | null, filterVariety: string): boolean {
  if (!parcelVariety) return false;

  const parcelLower = parcelVariety.toLowerCase();
  const filterLower = filterVariety.toLowerCase();

  return parcelLower === filterLower ||
    parcelLower.includes(filterLower) ||
    filterLower.includes(parcelLower);
}

// ============================================
// Main Filter Functions
// ============================================

/**
 * Apply location filter to select parcels
 *
 * Logic:
 * 1. If specific_ids provided, start with those
 * 2. Apply include filter (intersection)
 * 3. Apply exclude filter (difference)
 *
 * @param filter - The location filter from AI
 * @param allParcels - All available sprayable parcels
 */
export function applyLocationFilter(
  filter: LocationFilter,
  allParcels: SprayableParcel[]
): FilterResult {
  const warnings: string[] = [];
  let result: SprayableParcel[] = [];
  let filterDescription: string[] = [];

  // Step 1: Start with specific IDs or all parcels
  if (filter.specific_ids && filter.specific_ids.length > 0) {
    result = allParcels.filter(p => filter.specific_ids!.includes(p.id));
    filterDescription.push(`Specifiek: ${result.length} percelen`);

    // Warn about missing IDs
    const foundIds = new Set(result.map(p => p.id));
    const missingIds = filter.specific_ids.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      warnings.push(`${missingIds.length} perceel ID(s) niet gevonden`);
    }
  } else {
    result = [...allParcels];
  }

  // Step 2: Apply include filter (narrow down)
  if (filter.include) {
    const { crop_type, variety, parcel_name } = filter.include;

    if (crop_type) {
      const beforeCount = result.length;
      result = result.filter(p => cropMatches(p.crop, crop_type));
      filterDescription.push(`Gewas: ${crop_type} (${result.length})`);

      if (result.length === 0 && beforeCount > 0) {
        warnings.push(`Geen percelen gevonden met gewas "${crop_type}"`);
      }
    }

    if (variety) {
      const beforeCount = result.length;
      result = result.filter(p => varietyMatches(p.variety, variety));
      filterDescription.push(`Ras: ${variety} (${result.length})`);

      if (result.length === 0 && beforeCount > 0) {
        warnings.push(`Geen percelen gevonden met ras "${variety}"`);
      }
    }

    if (parcel_name) {
      const beforeCount = result.length;
      const nameLower = parcel_name.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(nameLower) ||
        p.parcelName.toLowerCase().includes(nameLower)
      );
      filterDescription.push(`Naam: ${parcel_name} (${result.length})`);

      if (result.length === 0 && beforeCount > 0) {
        warnings.push(`Geen percelen gevonden met naam "${parcel_name}"`);
      }
    }
  }

  // Step 3: Apply exclude filter (remove from result)
  if (filter.exclude) {
    const { crop_type, variety, parcel_name } = filter.exclude;

    if (crop_type) {
      const beforeCount = result.length;
      result = result.filter(p => !cropMatches(p.crop, crop_type));
      filterDescription.push(`Excl. gewas: ${crop_type}`);

      if (result.length === beforeCount) {
        warnings.push(`Geen percelen met gewas "${crop_type}" om uit te sluiten`);
      }
    }

    if (variety) {
      const beforeCount = result.length;
      result = result.filter(p => !varietyMatches(p.variety, variety));
      filterDescription.push(`Excl. ras: ${variety}`);

      if (result.length === beforeCount) {
        warnings.push(`Geen percelen met ras "${variety}" om uit te sluiten`);
      }
    }

    if (parcel_name) {
      const beforeCount = result.length;
      const nameLower = parcel_name.toLowerCase();
      result = result.filter(p =>
        !p.name.toLowerCase().includes(nameLower) &&
        !p.parcelName.toLowerCase().includes(nameLower)
      );
      filterDescription.push(`Excl. naam: ${parcel_name}`);

      if (result.length === beforeCount) {
        warnings.push(`Geen percelen met naam "${parcel_name}" om uit te sluiten`);
      }
    }
  }

  return {
    parcels: result,
    totalMatched: result.length,
    filterApplied: filterDescription.length > 0
      ? filterDescription.join(' | ')
      : 'Alle percelen',
    warnings,
  };
}

/**
 * Apply filter directly on database (for large datasets)
 *
 * Uses Supabase query builder for efficient filtering
 */
export async function applyLocationFilterDb(
  filter: LocationFilter
): Promise<FilterResult> {
  const warnings: string[] = [];
  let query = supabase
    .from('v_sprayable_parcels')
    .select('*');

  const filterDescription: string[] = [];

  // Apply specific IDs
  if (filter.specific_ids && filter.specific_ids.length > 0) {
    query = query.in('id', filter.specific_ids);
    filterDescription.push(`IDs: ${filter.specific_ids.length}`);
  }

  // Apply include filters
  if (filter.include) {
    const { crop_type, variety, parcel_name } = filter.include;

    if (crop_type) {
      // Use ilike for case-insensitive matching
      const variants = normalizeCropName(crop_type);
      const orConditions = variants.map(v => `crop.ilike.%${v}%`).join(',');
      query = query.or(orConditions);
      filterDescription.push(`Gewas: ${crop_type}`);
    }

    if (variety) {
      query = query.ilike('variety', `%${variety}%`);
      filterDescription.push(`Ras: ${variety}`);
    }

    if (parcel_name) {
      query = query.or(`name.ilike.%${parcel_name}%,parcel_name.ilike.%${parcel_name}%`);
      filterDescription.push(`Naam: ${parcel_name}`);
    }
  }

  // Note: Supabase doesn't support NOT IN directly in a clean way,
  // so we fetch and filter client-side for excludes
  const { data, error } = await query.order('name');

  if (error) {
    console.error('[applyLocationFilterDb] Supabase error:', error);
    return {
      parcels: [],
      totalMatched: 0,
      filterApplied: 'Error',
      warnings: [`Database error: ${error.message}`],
    };
  }

  let result: SprayableParcel[] = (data || []).map(item => ({
    id: item.id,
    name: item.name,
    area: item.area,
    crop: item.crop || 'Onbekend',
    variety: item.variety,
    parcelId: item.parcel_id,
    parcelName: item.parcel_name,
    location: item.location,
    geometry: item.geometry,
    source: item.source,
    rvoId: item.rvo_id,
  }));

  // Apply exclude filters client-side
  if (filter.exclude) {
    const { crop_type, variety, parcel_name } = filter.exclude;

    if (crop_type) {
      result = result.filter(p => !cropMatches(p.crop, crop_type));
      filterDescription.push(`Excl. gewas: ${crop_type}`);
    }

    if (variety) {
      result = result.filter(p => !varietyMatches(p.variety, variety));
      filterDescription.push(`Excl. ras: ${variety}`);
    }

    if (parcel_name) {
      const nameLower = parcel_name.toLowerCase();
      result = result.filter(p =>
        !p.name.toLowerCase().includes(nameLower) &&
        !p.parcelName.toLowerCase().includes(nameLower)
      );
      filterDescription.push(`Excl. naam: ${parcel_name}`);
    }
  }

  return {
    parcels: result,
    totalMatched: result.length,
    filterApplied: filterDescription.length > 0
      ? filterDescription.join(' | ')
      : 'Alle percelen',
    warnings,
  };
}

// ============================================
// Filter Description Helpers
// ============================================

/**
 * Generate human-readable description of filter
 */
export function describeFilter(filter: LocationFilter): string {
  const parts: string[] = [];

  if (filter.specific_ids && filter.specific_ids.length > 0) {
    parts.push(`${filter.specific_ids.length} specifieke percelen`);
  }

  if (filter.include) {
    const { crop_type, variety, parcel_name } = filter.include;
    if (crop_type) parts.push(`alle ${crop_type}`);
    if (variety) parts.push(`ras ${variety}`);
    if (parcel_name) parts.push(`"${parcel_name}"`);
  }

  if (filter.exclude) {
    const { crop_type, variety, parcel_name } = filter.exclude;
    if (crop_type) parts.push(`behalve ${crop_type}`);
    if (variety) parts.push(`behalve ras ${variety}`);
    if (parcel_name) parts.push(`behalve "${parcel_name}"`);
  }

  return parts.length > 0 ? parts.join(', ') : 'alle percelen';
}

/**
 * Known varieties list - used to distinguish varieties from parcel names
 */
export const KNOWN_VARIETIES = [
  // Appelrassen
  'elstar', 'jonagold', 'braeburn', 'golden', 'boskoop', 'goudreinette',
  'tessa', 'greenstar', 'kanzi', 'junami', 'wellant', 'delbar',
  'red prince', 'fuji', 'gala', 'granny smith', 'pink lady',
  'cox', 'santana', 'topaz', 'rubinette', 'belle de boskoop',
  'golden delicious', 'red delicious', 'honeycrisp', 'jazz',

  // Perenrassen
  'conference', 'doyenne', 'doyenné', 'comice', 'doyenne du comice',
  'gieser wildeman', 'beurre hardy', 'beurré hardy',
  'triomphe de vienne', 'concorde', 'sweet sensation', 'xenia',
  'cepuna', 'qtee', 'migo', 'williams', 'bon chretien',
  'packham', 'abate fetel', 'rocha', 'alexandrine douillard',
  'clapp', 'decana', 'coscia', 'forelle', 'lucas',
];

/**
 * Known crops list
 */
export const KNOWN_CROPS = [
  'appel', 'appels', 'peer', 'peren', 'kers', 'kersen',
  'pruim', 'pruimen', 'aardbei', 'aardbeien', 'framboos', 'frambozen',
];

/**
 * Check if a word is a known variety
 */
export function isKnownVariety(word: string): boolean {
  const normalized = word.toLowerCase().trim();
  return KNOWN_VARIETIES.some(v =>
    v === normalized ||
    v.startsWith(normalized) ||
    normalized.startsWith(v)
  );
}

/**
 * Check if a word is a known crop
 */
export function isKnownCrop(word: string): boolean {
  const normalized = word.toLowerCase().trim();
  return KNOWN_CROPS.includes(normalized);
}

/**
 * Parse natural language into LocationFilter
 * Fallback for when AI parsing fails
 *
 * Supports patterns like:
 * - "alle appels" → include crop appel
 * - "de elstars" → include variety elstar
 * - "tessa percelen niet" → exclude variety tessa
 * - "niet de tessa" → exclude variety tessa
 * - "behalve tessa" → exclude variety tessa
 */
export function parseNaturalLocationFilter(input: string): LocationFilter | null {
  const normalizedInput = input.toLowerCase().trim();
  const filter: LocationFilter = {};

  // Pattern: "alle [gewas]"
  const allCropMatch = normalizedInput.match(/alle?\s+(appels?|peren?|kersen?|pruimen?|aardbeien?|frambozen?)/);
  if (allCropMatch) {
    filter.include = { crop_type: allCropMatch[1] };
  }

  // Pattern: "de [ras]s" or "de [ras]'s" or "[ras] percelen"
  // Examples: "de elstars", "de tessa's", "tessa percelen"
  // Note: Only match if NOT followed by exclusion words
  const varietyPatterns = [
    /de\s+(\w+)(?:s|\'s)?\s*(?:percelen)?(?!\s*(?:niet|trouwens))/,  // "de elstars" but NOT "de elstars niet"
    /^(\w+)\s+percelen(?!\s*(?:niet|trouwens))/,                      // "tessa percelen" at start, but NOT "tessa percelen niet"
  ];

  for (const pattern of varietyPatterns) {
    const match = normalizedInput.match(pattern);
    if (match) {
      // Strip trailing 's' or "'s" from the matched variety name
      let varietyName = match[1];
      if (varietyName.endsWith('s') && !varietyName.endsWith('ss')) {
        const stripped = varietyName.slice(0, -1);
        if (isKnownVariety(stripped)) {
          varietyName = stripped;
        }
      }

      if (isKnownVariety(varietyName)) {
        filter.include = { ...filter.include, variety: varietyName };
        break;
      }
    }
  }

  // Pattern: exclusions - "niet", "behalve", "zonder", "geen", "trouwens niet"
  // Examples: "de tessa percelen trouwens niet", "niet de elstars", "behalve tessa", "de tessa niet"
  const excludePatterns = [
    // "[ras] percelen ... niet" - variety with "percelen" and negation
    /(\w+)\s+percelen\s+(?:\w+\s+)?niet/,
    // "de [ras]s trouwens niet" - without percelen
    /(?:de\s+)?(\w+?)(?:s|\'s)?\s+trouwens\s+niet/,
    // "de [ras]s niet" - simple form: "de tessa niet", "de elstars niet"
    /de\s+(\w+?)(?:s|\'s)?\s+niet/,
    // "niet de [ras]" or "niet [ras]"
    /niet\s+(?:de\s+)?(\w+?)(?:s|\'s)?(?:\s|$)/,
    // "behalve/zonder/geen [ras]"
    /(?:behalve|zonder|geen)\s+(?:de\s+)?(\w+?)(?:s|\'s)?(?:\s|$)/,
    // "toch niet de [ras]"
    /toch\s+niet\s+(?:de\s+)?(\w+?)(?:s|\'s)?(?:\s|$)/,
  ];

  for (const pattern of excludePatterns) {
    const match = normalizedInput.match(pattern);
    if (match) {
      let excluded = match[1];

      // Strip trailing 's' for variety matching
      if (excluded.endsWith('s') && !excluded.endsWith('ss')) {
        const stripped = excluded.slice(0, -1);
        if (isKnownVariety(stripped) || isKnownCrop(stripped)) {
          excluded = stripped;
        }
      }

      if (isKnownCrop(excluded)) {
        filter.exclude = { ...filter.exclude, crop_type: excluded };
        // If we're excluding, remove from include
        if (filter.include?.crop_type === excluded) {
          delete filter.include.crop_type;
        }
        break;
      } else if (isKnownVariety(excluded)) {
        filter.exclude = { ...filter.exclude, variety: excluded };
        // If we're excluding, remove from include
        if (filter.include?.variety === excluded) {
          delete filter.include.variety;
        }
        break;
      } else {
        // Not a known variety or crop - might be a parcel name
        // But first check if it looks like a group reference
        if (!excluded.match(/percelen?|trouwens|niet|ook|en/)) {
          filter.exclude = { ...filter.exclude, parcel_name: excluded };
          break;
        }
      }
    }
  }

  // Pattern: "alles" or "alle percelen" or "overal"
  if (/\b(alles|alle\s+percelen?|overal)\b/.test(normalizedInput) &&
      !filter.include && !filter.exclude) {
    // Empty filter = all parcels
    return {};
  }

  // Clean up empty objects
  if (filter.include && Object.keys(filter.include).length === 0) {
    delete filter.include;
  }
  if (filter.exclude && Object.keys(filter.exclude).length === 0) {
    delete filter.exclude;
  }

  // Return null if no patterns matched
  if (!filter.include && !filter.exclude && !filter.specific_ids) {
    return null;
  }

  return filter;
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate that filter will match at least some parcels
 */
export async function validateFilter(filter: LocationFilter): Promise<{
  valid: boolean;
  estimatedCount: number;
  message: string;
}> {
  const result = await applyLocationFilterDb(filter);

  if (result.totalMatched === 0) {
    return {
      valid: false,
      estimatedCount: 0,
      message: `Geen percelen gevonden met filter: ${describeFilter(filter)}`,
    };
  }

  return {
    valid: true,
    estimatedCount: result.totalMatched,
    message: `${result.totalMatched} percelen geselecteerd`,
  };
}
