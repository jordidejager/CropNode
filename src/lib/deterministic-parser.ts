/**
 * Deterministic Parser for Slimme Invoer V3
 *
 * Regex-based parser that handles 60-70% of spray registration inputs WITHOUT AI.
 * Only falls back to AI for complex/ambiguous inputs.
 *
 * Supported patterns:
 * - "alle peren met Merpan 2L"
 * - "gisteren alle appels met Captan 0.5 kg en Score 0.3L"
 * - "Merpan 2L op alle peren"
 * - "alle appels behalve Elstar met Score 0.3L"
 * - "alle appels met Delan, maar Kanzi ook Score" (grouped)
 */

import { extractDateFromText } from './dutch-date-parser';
import type { SprayableParcel } from './supabase-store';
import type { ParcelGroup } from './types';

// ============================================================================
// Types
// ============================================================================

export interface ParsedProduct {
  product: string;
  dosage: number;
  unit: string;
}

export interface ParsedRegistration {
  parcelIds: string[];
  products: ParsedProduct[];
  label?: string;
}

export interface DeterministicParseResult {
  success: boolean;
  confidence: number;
  date?: Date;
  parcelIds?: string[];
  products?: ParsedProduct[];
  isGrouped?: boolean;
  registrations?: ParsedRegistration[];
  // Debug info
  rawParcelText?: string;
  rawProductText?: string;
  parsePath?: string;
}

// ============================================================================
// Crop / variety keywords that should NOT be treated as product names
// ============================================================================

// Words that should NOT be treated as product names (used in extractProducts)
const PRODUCT_STOP_WORDS = new Set([
  'alle', 'de', 'mijn', 'het', 'op', 'voor', 'met', 'en', 'ook',
  'peren', 'peer', 'appels', 'appel', 'kersen', 'kers', 'pruimen', 'pruim',
  'fruit', 'bomen', 'percelen', 'bedrijf', 'overal', 'alles',
  // Common varieties (these are NOT products)
  'elstar', 'jonagold', 'conference', 'kanzi', 'lucas', 'tessa',
  'greenstar', 'beurre', 'gala', 'braeburn', 'granny',
  // Common parcel group names
  'thuis', 'steketee', 'spoor', 'pompus',
  // Date words
  'vandaag', 'gisteren', 'eergisteren', 'vorige', 'week', 'afgelopen',
  'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag',
  // Exclusion words
  'maar', 'niet', 'behalve', 'zonder', 'uitgezonderd',
  // Filler words
  'gespoten', 'gespuit', 'bespoten', 'behandeld', 'gedaan',
  'gestrooid', 'bemest', 'uitgereden',
  // Time of day
  'avond', 'ochtend', 'middag', 'nacht', 'avonds', 'ochtends', 'middags',
]);

// Minimal stop words for parcel name search (only generic prepositions, NOT parcel/crop names!)
const PARCEL_SEARCH_STOP_WORDS = new Set([
  'alle', 'de', 'het', 'mijn', 'op', 'voor', 'met', 'ook',
  'maar', 'niet', 'behalve', 'zonder', 'uitgezonderd',
  'gespoten', 'gespuit', 'bespoten', 'behandeld', 'gedaan',
  'gestrooid', 'bemest', 'uitgereden',
  'vandaag', 'gisteren', 'eergisteren', 'vorige', 'week', 'afgelopen',
  'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag',
  'avond', 'ochtend', 'middag', 'nacht', 'avonds', 'ochtends', 'middags',
]);

// Backward compat alias
const CROP_STOP_WORDS = PRODUCT_STOP_WORDS;

// Dutch crop plural → singular mapping for crop field matching
const CROP_PLURAL_MAP: Record<string, string> = {
  appels: 'appel', appel: 'appel',
  peren: 'peer', peer: 'peer',
  kersen: 'kers', kers: 'kers',
  pruimen: 'pruim', pruim: 'pruim',
};

function matchesCrop(cropField: string, searchWord: string): boolean {
  const normalized = CROP_PLURAL_MAP[searchWord.toLowerCase()];
  if (!normalized) return false;
  return cropField.toLowerCase() === normalized;
}

// ============================================================================
// Main Parse Function
// ============================================================================

export function deterministicParse(
  input: string,
  parcels: SprayableParcel[],
  parcelGroups?: ParcelGroup[]
): DeterministicParseResult {
  const lower = input.toLowerCase().trim();

  // Step 1: Extract date (removes date text from input)
  const { date, textWithoutDate } = extractDateFromText(input);
  const cleanInput = textWithoutDate;
  const cleanLower = cleanInput.toLowerCase().trim();

  // Step 2a: Check for comma-separated multi-registration (each group has own parcels+products)
  // e.g., "Spoor met 100 kg Kalk, Yese met 240 kg Kalk"
  const commaGrouped = tryParseCommaGrouped(cleanInput, cleanLower, parcels, parcelGroups);
  if (commaGrouped && commaGrouped.success) {
    return { ...commaGrouped, date: date ?? new Date() };
  }

  // Step 2b: Check for grouped registration pattern (variation/exception that needs multiple units)
  const groupedResult = tryParseGrouped(cleanLower, parcels, parcelGroups);
  if (groupedResult && groupedResult.success) {
    return { ...groupedResult, date: date ?? new Date() };
  }

  // Step 3: Try standard patterns
  // Pattern A: "[percelen] met [product(en)] [dosering]"
  const patternA = tryPatternParcelenMetProduct(cleanLower, parcels, parcelGroups);
  if (patternA && patternA.success) {
    return { ...patternA, date: date ?? new Date() };
  }

  // Pattern B: "[product] [dosering] op [percelen]"
  const patternB = tryPatternProductOpPercelen(cleanLower, parcels, parcelGroups);
  if (patternB && patternB.success) {
    return { ...patternB, date: date ?? new Date() };
  }

  // Pattern C: "[product] [dosering] [percelen]" (no preposition)
  const patternC = tryPatternProductPercelen(cleanLower, parcels, parcelGroups);
  if (patternC && patternC.success) {
    return { ...patternC, date: date ?? new Date() };
  }

  // No pattern matched
  return { success: false, confidence: 0, date: date ?? undefined };
}

// ============================================================================
// Pattern A: "[percelen] met [product(en)]"
// "alle peren met Merpan 2L"
// "alle appels behalve Elstar met Captan 0.5 kg en Score 0.3L"
// ============================================================================

function tryPatternParcelenMetProduct(
  input: string,
  parcels: SprayableParcel[],
  parcelGroups?: ParcelGroup[]
): DeterministicParseResult | null {
  const metIndex = input.indexOf(' met ');
  if (metIndex === -1) return null;

  const parcelPart = input.substring(0, metIndex).trim();
  const productPart = input.substring(metIndex + 5).trim();

  if (!parcelPart || !productPart) return null;

  const resolvedParcels = resolveParcelsByText(parcelPart, parcels, parcelGroups);
  const products = extractProducts(productPart);

  if (resolvedParcels.ids.length === 0 && products.length === 0) return null;

  const confidence = calculateConfidence(resolvedParcels.ids.length > 0, products.length > 0, products.some(p => p.dosage > 0));

  return {
    success: confidence >= 0.85,
    confidence,
    parcelIds: resolvedParcels.ids,
    products,
    isGrouped: false,
    rawParcelText: parcelPart,
    rawProductText: productPart,
    parsePath: 'pattern_a_met',
  };
}

// ============================================================================
// Pattern B: "[product] [dosering] op [percelen]"
// "Merpan 2L op alle peren"
// "Captan 0.5 kg en Score 0.3L op alle appels"
// ============================================================================

function tryPatternProductOpPercelen(
  input: string,
  parcels: SprayableParcel[],
  parcelGroups?: ParcelGroup[]
): DeterministicParseResult | null {
  const opIndex = input.lastIndexOf(' op ');
  if (opIndex === -1) return null;

  const productPart = input.substring(0, opIndex).trim();
  const parcelPart = input.substring(opIndex + 4).trim();

  if (!parcelPart || !productPart) return null;

  const resolvedParcels = resolveParcelsByText(parcelPart, parcels, parcelGroups);
  const products = extractProducts(productPart);

  if (resolvedParcels.ids.length === 0 && products.length === 0) return null;

  const confidence = calculateConfidence(resolvedParcels.ids.length > 0, products.length > 0, products.some(p => p.dosage > 0));

  return {
    success: confidence >= 0.85,
    confidence,
    parcelIds: resolvedParcels.ids,
    products,
    isGrouped: false,
    rawParcelText: parcelPart,
    rawProductText: productPart,
    parsePath: 'pattern_b_op',
  };
}

// ============================================================================
// Pattern C: "[product] [dosering] [percelen]" (no preposition)
// "Merpan 2L alle peren"
// ============================================================================

function tryPatternProductPercelen(
  input: string,
  parcels: SprayableParcel[],
  parcelGroups?: ParcelGroup[]
): DeterministicParseResult | null {
  // Try to find a product+dosage at the start, then parcels after
  const productDosageMatch = input.match(
    /^([a-zà-ü][\w\s-]*?)\s+(\d+[.,]?\d*)\s*(kg|l|g|gram|gr|ml|liter)(?:\/ha)?\s+(.+)$/i
  );
  if (!productDosageMatch) return null;

  const productName = productDosageMatch[1].trim();
  const dosage = parseFloat(productDosageMatch[2].replace(',', '.'));
  const unit = normalizeUnit(productDosageMatch[3]);
  const parcelPart = productDosageMatch[4].trim();

  if (CROP_STOP_WORDS.has(productName.toLowerCase())) return null;

  const resolvedParcels = resolveParcelsByText(parcelPart, parcels, parcelGroups);
  if (resolvedParcels.ids.length === 0) return null;

  return {
    success: true,
    confidence: 0.90,
    parcelIds: resolvedParcels.ids,
    products: [{ product: productName, dosage, unit }],
    isGrouped: false,
    rawParcelText: parcelPart,
    rawProductText: `${productName} ${dosage} ${unit}`,
    parsePath: 'pattern_c_no_prep',
  };
}

// ============================================================================
// Comma-Separated Multi-Registration Pattern
// "Spoor (Kanzi) met 100 kg Kalk, Yese met 240 kg Kalk, alle Tessa met 200 kg Kalk"
// Each comma-separated segment has its own "[parcels] met [product] [dosage]"
// ============================================================================

function tryParseCommaGrouped(
  input: string,       // Original casing (for labels)
  inputLower: string,  // Lowercased (for matching)
  parcels: SprayableParcel[],
  parcelGroups?: ParcelGroup[]
): DeterministicParseResult | null {
  // Detect: input has multiple " met " — sign of comma-separated groups
  const metCount = (inputLower.match(/ met /g) || []).length;
  if (metCount < 2) return null;

  // Split on commas (use original casing for labels), filter empty segments from trailing commas
  const rawSegments = input.split(/\s*,\s*/).filter(s => s.trim().length > 0);

  // Merge segments: segments without " met " belong to preceding group (tankmix products)
  const groups: string[] = [];
  for (const seg of rawSegments) {
    if (/ met /i.test(seg) || groups.length === 0) {
      groups.push(seg.trim());
    } else {
      // No " met " → tankmix product, append to previous group
      groups[groups.length - 1] += ', ' + seg.trim();
    }
  }

  // Need at least 2 groups to be a multi-registration
  if (groups.length < 2) return null;

  const registrations: ParsedRegistration[] = [];

  for (const group of groups) {
    const groupLower = group.toLowerCase();
    const metIndex = groupLower.indexOf(' met ');
    if (metIndex === -1) continue;

    const parcelPart = group.substring(0, metIndex).trim();
    const productPart = group.substring(metIndex + 5).trim().replace(/[,;.\s]+$/, '');

    if (!parcelPart || !productPart) continue;

    const resolved = resolveParcelsByText(parcelPart, parcels, parcelGroups);
    const products = extractProducts(productPart.toLowerCase());

    registrations.push({
      parcelIds: resolved.ids,
      products,
      label: cleanLabel(parcelPart),
    });
  }

  if (registrations.length < 2) return null;

  // For comma-grouped, the structural pattern (multiple "X met Y" separated by commas)
  // is itself a very strong signal. Don't require all parcels to resolve — parcels
  // can be added by the user via follow-up. Focus on product/dosage quality.
  const allProductsResolved = registrations.every(r => r.products.length > 0);
  const allDosagesPresent = registrations.every(r => r.products.every(p => p.dosage > 0));

  const confidence = allProductsResolved && allDosagesPresent ? 0.95
    : allProductsResolved ? 0.88
    : 0.5;

  return {
    success: confidence >= 0.85,
    confidence,
    isGrouped: true,
    registrations,
    parsePath: 'comma_grouped',
  };
}

/** Strip filler verbs from label text for display */
function cleanLabel(text: string): string {
  return text
    .replace(/\b(?:gespoten|gespuit|bespoten|behandeld|gedaan|gestrooid|bemest|uitgereden)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Grouped Registration Pattern
// "alle appels met Delan, maar Kanzi ook Score"
// "peren met 1 kg Captan, Lucas halve dosering"
// ============================================================================

function tryParseGrouped(
  input: string,
  parcels: SprayableParcel[],
  parcelGroups?: ParcelGroup[]
): DeterministicParseResult | null {
  // Detect grouped indicators
  const hasGroupIndicator =
    /\bmaar\b.*\b(ook|extra|nog)\b/i.test(input) ||
    /\bhalve\s*(dosering|dosis)\b/i.test(input);

  if (!hasGroupIndicator) return null;

  // Split on "maar" to get base registration and variation
  const maarMatch = input.match(/^(.+?)\s*,?\s*maar\s+(.+)$/i);
  if (!maarMatch) return null;

  const basePart = maarMatch[1].trim();
  const variationPart = maarMatch[2].trim();

  // Parse base registration (e.g., "alle appels met Delan")
  const baseResult = tryPatternParcelenMetProduct(basePart, parcels, parcelGroups);
  if (!baseResult || !baseResult.parcelIds || baseResult.parcelIds.length === 0) return null;

  // Parse variation - determine which parcels are the exception
  // "Kanzi ook Score" → Kanzi parcels get extra product Score
  const ookMatch = variationPart.match(/^(.+?)\s+ook\s+(.+)$/i);
  if (ookMatch) {
    const exceptionTarget = ookMatch[1].trim();
    const extraProductText = ookMatch[2].trim();

    const exceptionParcels = resolveParcelsByText(exceptionTarget, parcels, parcelGroups);
    const extraProducts = extractProducts(extraProductText);

    if (exceptionParcels.ids.length > 0 && extraProducts.length > 0 && baseResult.products) {
      // Base parcels = all - exception
      const exceptionSet = new Set(exceptionParcels.ids);
      const baseParcels = baseResult.parcelIds.filter(id => !exceptionSet.has(id));

      const registrations: ParsedRegistration[] = [
        {
          parcelIds: baseParcels,
          products: baseResult.products,
          label: `${getCropLabel(baseParcels, parcels)} (zonder ${exceptionTarget})`,
        },
        {
          parcelIds: exceptionParcels.ids,
          products: [...baseResult.products, ...extraProducts],
          label: capitalize(exceptionTarget),
        },
      ];

      return {
        success: true,
        confidence: 0.90,
        isGrouped: true,
        registrations,
        parsePath: 'grouped_ook',
      };
    }
  }

  // "Lucas halve dosering" → Lucas parcels get half dosage
  const halveMatch = variationPart.match(/^(.+?)\s+halve\s*(dosering|dosis)$/i);
  if (halveMatch && baseResult.products) {
    const exceptionTarget = halveMatch[1].trim();
    const exceptionParcels = resolveParcelsByText(exceptionTarget, parcels, parcelGroups);

    if (exceptionParcels.ids.length > 0) {
      const exceptionSet = new Set(exceptionParcels.ids);
      const baseParcels = baseResult.parcelIds.filter(id => !exceptionSet.has(id));
      const halfProducts = baseResult.products.map(p => ({ ...p, dosage: p.dosage / 2 }));

      const registrations: ParsedRegistration[] = [
        {
          parcelIds: baseParcels,
          products: baseResult.products,
          label: `${getCropLabel(baseParcels, parcels)} (zonder ${exceptionTarget})`,
        },
        {
          parcelIds: exceptionParcels.ids,
          products: halfProducts,
          label: `${capitalize(exceptionTarget)} (halve dosering)`,
        },
      ];

      return {
        success: true,
        confidence: 0.88,
        isGrouped: true,
        registrations,
        parsePath: 'grouped_halve',
      };
    }
  }

  return null;
}

// ============================================================================
// Parcel Resolution
// ============================================================================

interface ResolvedParcels {
  ids: string[];
  matchType: string;
  excludedIds: string[];
}

export function resolveParcelsByText(
  text: string,
  parcels: SprayableParcel[],
  parcelGroups?: ParcelGroup[]
): ResolvedParcels {
  // Clean input: strip parentheses (treat content as variety hint), remove filler words
  let lower = text.toLowerCase().trim();

  // Strip day names (including compound forms like "woensdagavond", "dinsdagochtend")
  lower = lower.replace(/\b(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)(?:avonds?|ochtends?|middags?|nachts?|morgens?)?\b/g, ' ');

  // Strip other date/time words (including "vanavond", "vanochtend", etc.)
  lower = lower.replace(/\b(?:vandaag|gisteren|eergisteren|vorige|afgelopen|vanavond|vanochtend|vanmiddag|vannacht|vanmorgen)\b/g, ' ');

  // Strip filler/verb words that shouldn't be in parcel resolution
  lower = lower.replace(/\b(?:gespoten|gespuit|bespoten|behandeld|gedaan|gestrooid|bemest|uitgereden|avond|ochtend|middag|nacht)\b/g, ' ');

  // Strip leading "op" — leftover from date expressions like "op 4 maart" where the date is extracted but "op" remains
  lower = lower.replace(/^op\s+/i, '');

  // Convert parentheses to spaces: "Steketee (Tessa)" → "Steketee Tessa"
  lower = lower.replace(/[()]/g, ' ');

  // Normalize whitespace
  lower = lower.replace(/\s+/g, ' ').trim();

  const result: ResolvedParcels = { ids: [], matchType: 'none', excludedIds: [] };

  // Step 1: Extract exclusion pattern
  let baseText = lower;
  let excludeTarget: string | null = null;

  // Exclusion patterns: capture everything after "behalve/zonder/maar...niet" until an action word
  // Action words that signal end of exclusion list: gespoten, gestrooid, met, op, bespoten, behandeld, gedaan
  const actionBoundary = '(?=\\s+(?:gespoten|gestrooid|bespoten|behandeld|gedaan|gespuit|strooien|spuiten|met|op\\s+\\d))|$';
  const exclusionPatterns = [
    new RegExp(`\\bmaar\\s+(?:de\\s+)?(.+?)\\s+niet\\b`, 'i'),
    new RegExp(`\\bbehalve\\s+(?:de\\s+)?(.+?)(?:${actionBoundary})`, 'i'),
    new RegExp(`\\bzonder\\s+(?:de\\s+)?(.+?)(?:${actionBoundary})`, 'i'),
  ];

  for (const pattern of exclusionPatterns) {
    const match = lower.match(pattern);
    if (match) {
      excludeTarget = match[1].trim();
      baseText = lower.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // Step 2a: If text contains commas or " en " separators, split and resolve each part
  // e.g., "thuis alle peren, pompus, murre, peren jan van w" → 4 parts resolved independently
  // e.g., "peren jan van w en alles murre" → 2 parts resolved independently
  const hasSeparators = /,/.test(baseText) || /\s+en\s+/.test(baseText);
  if (hasSeparators) {
    const splitParts = baseText.split(/\s*,\s*|\s+en\s+/).map(s => s.trim()).filter(s => s.length >= 2);
    if (splitParts.length >= 2) {
      const allIds: string[] = [];
      for (const part of splitParts) {
        const sub = resolveParcelsByText(part, parcels, parcelGroups);
        sub.ids.forEach(id => { if (!allIds.includes(id)) allIds.push(id); });
      }
      if (allIds.length > 0) {
        result.ids = allIds;
        result.matchType = 'split';
        // Apply exclusions and return early
        if (excludeTarget && result.ids.length > 0) {
          const excludeParts2 = excludeTarget
            .split(/\s*,\s*|\s+en\s+/)
            .map(s => s.replace(/^(?:de|het)\s+/i, '').trim())
            .filter(s => s.length >= 2);
          for (const ep of excludeParts2) {
            const excludeWords = ep.split(/\s+/).filter((w: string) => w.length >= 2 && !PARCEL_SEARCH_STOP_WORDS.has(w));
            const excludeHits = parcels.filter(p => {
              const name = p.name.toLowerCase();
              const parcelName = (p as any).parcelName?.toLowerCase() || '';
              const combined = name + ' ' + parcelName;
              return excludeWords.length > 0 && excludeWords.every((w: string) => combined.includes(w));
            });
            excludeHits.forEach(h => {
              const idx = result.ids.indexOf(h.id);
              if (idx >= 0) {
                result.ids.splice(idx, 1);
                result.excludedIds.push(h.id);
              }
            });
          }
        }
        return result;
      }
    }
  }

  // Step 2b: Location-scoped patterns BEFORE global patterns
  // These are more specific and must be checked first to prevent false global matches.
  // Build location map once for all location-based checks.
  const locations = new Map<string, SprayableParcel[]>();
  for (const p of parcels) {
    const loc = (p.parcelName || '').toLowerCase();
    if (!loc) continue;
    if (!locations.has(loc)) locations.set(loc, []);
    locations.get(loc)!.push(p);
  }

  // Step 2b-i: "[location] alle peren/appels" OR "alle peren/appels [location]"
  {
    const locCropPrefixMatch = baseText.match(/^(\w[\w\s]*?)\s+(?:alle?|de|mijn)\s+(appels?|peren?)\b/);
    const locCropSuffixMatch = baseText.match(/\b(?:alle?|de|mijn)\s+(appels?|peren?)\s+(\w[\w\s]*?)$/);
    const locCropMatch = locCropPrefixMatch || locCropSuffixMatch;
    if (locCropMatch) {
      let locName: string;
      let cropSearch: string;
      if (locCropPrefixMatch) {
        locName = locCropPrefixMatch[1].trim();
        cropSearch = locCropPrefixMatch[2].startsWith('appel') ? 'appel' : 'peer';
      } else {
        locName = locCropSuffixMatch![2].trim();
        cropSearch = locCropSuffixMatch![1].startsWith('appel') ? 'appel' : 'peer';
      }
      const locParcels = locations.get(locName);
      if (locParcels && locParcels.length > 0) {
        result.ids = locParcels.filter(p => p.crop?.toLowerCase() === cropSearch).map(p => p.id);
        result.matchType = `location_crop:${locName}:${cropSearch}`;
      }
    }
  }

  // Step 2b-ii: "alles [location]" / "heel [location]" — all parcels at a specific location
  // MUST run before global "alles/overal" to prevent "alles murre" → ALL parcels
  if (result.ids.length === 0) {
    const locationAllMatch = baseText.match(/\b(?:alles|heel|alle?\s+(?:bomen|percelen))\s+(\w[\w\s]*?)$/);
    if (locationAllMatch) {
      const locName = locationAllMatch[1].trim();
      const locParcels = locations.get(locName);
      if (locParcels && locParcels.length > 0) {
        result.ids = locParcels.map(p => p.id);
        result.matchType = `location:${locName}`;
      }
    }
  }

  // Step 2b-iii: "alle [crop] [location]" — e.g., "alle peren thuis" (already handled by 2b-i suffix)
  // Step 2b-iv: "alle [variety] [location]" — e.g., "alle conference thuis"
  if (result.ids.length === 0) {
    const locationVarietyMatch = baseText.match(/\b(?:alle?|de|mijn)\s+(\w+)\s+(\w[\w\s]*?)$/);
    if (locationVarietyMatch) {
      const varietySearch = locationVarietyMatch[1].toLowerCase();
      const locName = locationVarietyMatch[2].trim();
      const locParcels = locations.get(locName);
      if (locParcels && locParcels.length > 0) {
        const varietyHits = locParcels.filter(p =>
          p.variety?.toLowerCase() === varietySearch ||
          p.variety?.toLowerCase().includes(varietySearch)
        );
        if (varietyHits.length > 0) {
          result.ids = varietyHits.map(p => p.id);
          result.matchType = `location_variety:${locName}:${varietySearch}`;
        }
      }
    }
  }

  // Step 2c: Global crop patterns (only if location-scoped didn't match)
  // "alle appels" / "de appels" / "mijn appels"
  if (result.ids.length === 0 && (/\b(?:alle?|de|mijn)\s+appels?\b/.test(baseText) || /\bappelpercelen\b/.test(baseText))) {
    result.ids = parcels.filter(p => p.crop?.toLowerCase() === 'appel').map(p => p.id);
    result.matchType = 'crop:appel';
  }
  // "alle peren" / "de peren"
  else if (result.ids.length === 0 && (/\b(?:alle?|de|mijn)\s+peren?\b/.test(baseText) || /\bperenpercelen\b/.test(baseText))) {
    result.ids = parcels.filter(p => p.crop?.toLowerCase() === 'peer').map(p => p.id);
    result.matchType = 'crop:peer';
  }
  // "overal" / "alles" / "alle bomen" / "het hele bedrijf"
  // ONLY match if "alles"/"overal" stands alone or is followed by non-location words
  else if (result.ids.length === 0 && (/\boveral\b/.test(baseText) || /\b(?:alle?|het\s+hele?)\s+(?:bomen|bedrijf|percelen)\b/.test(baseText))) {
    result.ids = parcels.map(p => p.id);
    result.matchType = 'all';
  }
  // "alles" alone (without location after it — location already handled in step 2b-ii)
  else if (result.ids.length === 0 && /\balles\b/.test(baseText)) {
    // Check if "alles" is followed by a known location — if so, skip (already handled)
    const allesMatch = baseText.match(/\balles\s+(\w+)/);
    const isAllesWithLocation = allesMatch && locations.has(allesMatch[1].trim());
    if (!isAllesWithLocation) {
      result.ids = parcels.map(p => p.id);
      result.matchType = 'all';
    }
  }
  else {
    // Try variety match: "alle conference" / "de elstar"
    // BUT: skip if text has "en"-separated parts (e.g., "alle tessa en thuis appels en jonagold spoor")
    // In that case, the name prefix search below handles multi-part resolution correctly.
    const hasEnSeparator = /\s+en\s+/.test(baseText);
    const varietyMatch = baseText.match(/\b(?:alle?|de|mijn)\s+(\w+)\b/);
    if (varietyMatch && !hasEnSeparator) {
      const search = varietyMatch[1].toLowerCase();
      const varietyHits = parcels.filter(p =>
        p.variety?.toLowerCase() === search ||
        p.variety?.toLowerCase().includes(search)
      );
      if (varietyHits.length > 0) {
        result.ids = varietyHits.map(p => p.id);
        result.matchType = `variety:${search}`;
      }
    }

    // Location-based patterns already handled in Step 2b above.

    // Try parcel group name match
    if (result.ids.length === 0 && parcelGroups) {
      const groupMatch = parcelGroups.find(g => baseText.includes(g.name.toLowerCase()));
      if (groupMatch?.subParcelIds?.length) {
        result.ids = groupMatch.subParcelIds;
        result.matchType = `group:${groupMatch.name}`;
      }
    }

    // Try parcel name prefix match (e.g., "steketee" matches "Steketee Appels", "Steketee Peren")
    if (result.ids.length === 0) {
      // Split text on "en" / "+" / "," to handle "steketee en de greenstar"
      const parts = baseText.split(/\s+en\s+|\s*\+\s*|\s*,\s*/).map(s => s.replace(/^(?:de|het|alle?)\s+/i, '').trim()).filter(s => s.length >= 3);

      for (const part of parts) {
        // Split multi-word part into individual search words (e.g., "steketee tessa" → ["steketee", "tessa"])
        // Use PARCEL_SEARCH_STOP_WORDS (NOT PRODUCT_STOP_WORDS!) to keep parcel/variety names
        const searchWords = part.split(/\s+/).filter(w => w.length >= 3 && !PARCEL_SEARCH_STOP_WORDS.has(w));

        const hits = parcels.filter(p => {
          const name = p.name.toLowerCase();
          const firstWord = name.split(' ')[0];
          const variety = p.variety?.toLowerCase() || '';
          const parcelName = (p as any).parcelName?.toLowerCase() || '';

          // Helper: word-boundary-aware match to prevent "murre 1" matching "murre 10"
          const wordMatch = (haystack: string, needle: string) => {
            if (haystack === needle) return true;
            // Use regex word boundary to prevent partial number matches
            try {
              const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              return new RegExp(`(?:^|\\s|\\()${escaped}(?:\\s|\\)|$)`, 'i').test(haystack);
            } catch {
              return haystack.includes(needle);
            }
          };

          // Full part match with word boundaries
          if (wordMatch(name, part) || firstWord === part) return true;
          if (variety === part || wordMatch(variety, part)) return true;
          if (parcelName === part || wordMatch(parcelName, part)) return true;
          if (p.synonyms?.some(s => s.toLowerCase() === part)) return true;

          // Multi-word match: all significant words must match name, variety, crop, or parcelName
          if (searchWords.length >= 2) {
            return searchWords.every(w =>
              wordMatch(name, w) || wordMatch(variety, w) ||
              matchesCrop(p.crop || '', w) ||
              wordMatch(parcelName, w) ||
              p.synonyms?.some(s => wordMatch(s.toLowerCase(), w))
            );
          }

          // Single word: try individual word match
          if (searchWords.length === 1) {
            const w = searchWords[0];
            return wordMatch(name, w) || wordMatch(variety, w) ||
                   matchesCrop(p.crop || '', w) ||
                   firstWord === w || wordMatch(parcelName, w) ||
                   p.synonyms?.some(s => wordMatch(s.toLowerCase(), w));
          }

          return false;
        });
        hits.forEach(h => {
          if (!result.ids.includes(h.id)) result.ids.push(h.id);
        });
      }
      if (result.ids.length > 0) result.matchType = 'name_search';
    }
  }

  // Step 3: Apply exclusions (supports multiple targets: "jachthoek, schele en kloetinge")
  if (excludeTarget && result.ids.length > 0) {
    // Split exclusion target on commas and "en" to handle lists
    const excludeParts = excludeTarget
      .split(/\s*,\s*|\s+en\s+/)
      .map(s => s.replace(/^(?:de|het)\s+/i, '').trim())
      .filter(s => s.length >= 2);

    const excludedIds: string[] = [];

    for (const part of excludeParts) {
      const partLower = part.toLowerCase();

      // Try variety match first
      const excludeByVariety = parcels.filter(p =>
        p.variety?.toLowerCase() === partLower ||
        (p.variety && p.variety.toLowerCase().includes(partLower))
      );
      if (excludeByVariety.length > 0) {
        excludedIds.push(...excludeByVariety.map(p => p.id));
      } else {
        // Try name match with word-order-independent matching
        // "nieuwe conference jachthoek" should match "Jachthoek Nieuwe Conference (Conference)"
        const excludeWords = partLower.split(/\s+/).filter(w => w.length >= 2 && !PARCEL_SEARCH_STOP_WORDS.has(w));
        const excludeByName = parcels.filter(p => {
          const name = p.name.toLowerCase();
          const parcelName = (p as any).parcelName?.toLowerCase() || '';
          const combined = name + ' ' + parcelName;
          // All exclude words must appear somewhere in the parcel name (order-independent)
          return excludeWords.length > 0 && excludeWords.every(w => combined.includes(w));
        });
        excludedIds.push(...excludeByName.map(p => p.id));
      }
    }

    if (excludedIds.length > 0) {
      const excludeSet = new Set(excludedIds);
      result.ids = result.ids.filter(id => !excludeSet.has(id));
      result.excludedIds = excludedIds;
    }
  }

  return result;
}

// ============================================================================
// Product Extraction
// ============================================================================

export function extractProducts(text: string): ParsedProduct[] {
  const products: ParsedProduct[] = [];

  // Split on " en " / " + " / ", " to handle tankmixes
  // Lookahead matches both letters AND digits (e.g. "surroun, 5 kg Luxan")
  // Negative lookbehind (?<!\d) prevents splitting Dutch decimal commas like "0,5"
  const segments = text
    .split(/\s+en\s+|\s*\+\s*|(?<!\d)\s*,\s*(?=[a-zà-ü\d])/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const segment of segments) {
    const parsed = parseSingleProduct(segment);
    if (parsed) products.push(parsed);
  }

  // Fallback: try the entire text as a single product
  if (products.length === 0) {
    const single = parseSingleProduct(text);
    if (single) products.push(single);
  }

  return products;
}

function parseSingleProduct(segment: string): ParsedProduct | null {
  const s = segment.trim();

  // Pattern 1: "productName dosage unit" (e.g., "Merpan 2 L", "Captan 0.5 kg")
  const matchA = s.match(/^([a-zà-ü][\w\s®*-]*?)\s+(\d+[.,]?\d*)\s*(kg|l|g|gram|gr|ml|liter)(?:\/ha)?$/i);
  if (matchA) {
    const name = matchA[1].trim();
    if (name.length >= 2 && !CROP_STOP_WORDS.has(name.toLowerCase())) {
      return {
        product: name,
        dosage: parseFloat(matchA[2].replace(',', '.')),
        unit: normalizeUnit(matchA[3]),
      };
    }
  }

  // Pattern 2: "dosage unit productName" (e.g., "2L Merpan", "0.5 kg Captan")
  const matchB = s.match(/^(\d+[.,]?\d*)\s*(kg|l|g|gram|gr|ml|liter)(?:\/ha)?\s+([a-zà-ü][\w\s®*-]+)$/i);
  if (matchB) {
    const name = matchB[3].trim();
    if (name.length >= 2 && !CROP_STOP_WORDS.has(name.toLowerCase())) {
      return {
        product: name,
        dosage: parseFloat(matchB[1].replace(',', '.')),
        unit: normalizeUnit(matchB[2]),
      };
    }
  }

  // Pattern 3: "productName dosageUnit" without space (e.g., "Merpan 2L")
  const matchC = s.match(/^([a-zà-ü][\w\s®*-]*?)\s+(\d+[.,]?\d*)(kg|l|g|ml)(?:\/ha)?$/i);
  if (matchC) {
    const name = matchC[1].trim();
    if (name.length >= 2 && !CROP_STOP_WORDS.has(name.toLowerCase())) {
      return {
        product: name,
        dosage: parseFloat(matchC[2].replace(',', '.')),
        unit: normalizeUnit(matchC[3]),
      };
    }
  }

  // Pattern 4: "dosage productName" WITHOUT unit (e.g., "0,75 Pyrus 400 SC", "3 ACS-Koper 500")
  // Common in Dutch farming where unit is implied (defaults to L for liquids, kg for solids)
  const matchD = s.match(/^(\d+[.,]?\d*)\s+([a-zà-ü][\w\s®*-]+)$/i);
  if (matchD) {
    const name = matchD[2].trim();
    if (name.length >= 2 && !CROP_STOP_WORDS.has(name.toLowerCase())) {
      return {
        product: name,
        dosage: parseFloat(matchD[1].replace(',', '.')),
        unit: 'L', // Default to L when no unit specified
      };
    }
  }

  // Pattern 5: Product name only (no dosage) - e.g., "Surround"
  const nameOnly = s.replace(/\s+/g, ' ').trim();
  if (nameOnly.length >= 3 && !CROP_STOP_WORDS.has(nameOnly.toLowerCase()) && !/^\d/.test(nameOnly)) {
    return { product: nameOnly, dosage: 0, unit: 'L' };
  }

  return null;
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().replace('/ha', '').trim();
  if (u === 'l' || u === 'liter') return 'L';
  if (u === 'kg') return 'kg';
  if (u === 'g' || u === 'gram' || u === 'gr') return 'g';
  if (u === 'ml') return 'ml';
  return 'L';
}

function calculateConfidence(hasParcels: boolean, hasProducts: boolean, hasDosage: boolean): number {
  if (hasParcels && hasProducts && hasDosage) return 0.95;
  if (hasParcels && hasProducts) return 0.85;
  if (hasProducts && hasDosage) return 0.6;
  if (hasParcels) return 0.4;
  if (hasProducts) return 0.5;
  return 0;
}

function getCropLabel(parcelIds: string[], allParcels: SprayableParcel[]): string {
  const crops = new Set<string>();
  for (const id of parcelIds) {
    const p = allParcels.find(p => p.id === id);
    if (p?.crop) crops.add(p.crop);
  }
  if (crops.size === 1) {
    const crop = crops.values().next().value;
    return crop === 'Appel' ? 'Appels' : crop === 'Peer' ? 'Peren' : crop + 's';
  }
  return 'Percelen';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
