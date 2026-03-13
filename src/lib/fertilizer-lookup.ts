/**
 * Meststoffen Lookup Service
 *
 * Dual-database lookup: CTGB (gewasbeschermingsmiddelen) + Meststoffen
 * Met hardcoded cache voor de ~40 meest gebruikte meststoffen in fruitteelt.
 *
 * KRITIEK: Geen cross-database false positives.
 * - CTGB-producten worden NOOIT als meststof herkend
 * - Meststoffen worden NOOIT als GWB-middel herkend
 * - Fuzzy matching zoekt per database apart
 */

import type { FertilizerProduct, ProductSource, RegistrationType } from './types';

// ============================================================================
// COMMON FERTILIZERS CACHE (~40 meest gebruikte in Nederlandse fruitteelt)
// ============================================================================

export interface CachedFertilizer {
  name: string;
  aliases: string[];
  type: 'bladmeststof' | 'strooimeststof';
  element: string;
}

export const COMMON_FERTILIZERS_CACHE: CachedFertilizer[] = [
  // === BLADMESTSTOFFEN (bij spuiten) ===
  { name: "Chelal Omnical", aliases: ["omnical", "chelal calcium"], type: "bladmeststof", element: "Ca" },
  { name: "Chelal AZ", aliases: ["chelal az", "chelal sporenelementen"], type: "bladmeststof", element: "mix" },
  { name: "Chelal B", aliases: ["chelal borium"], type: "bladmeststof", element: "B" },
  { name: "Chelal BZn", aliases: ["chelal boor zink"], type: "bladmeststof", element: "B+Zn" },
  { name: "Chelal Fe", aliases: ["chelal ijzer"], type: "bladmeststof", element: "Fe" },
  { name: "Chelal Mn", aliases: ["chelal mangaan"], type: "bladmeststof", element: "Mn" },
  { name: "Chelal Mg", aliases: ["chelal magnesium"], type: "bladmeststof", element: "Mg" },
  { name: "Chelal Cu", aliases: ["chelal koper"], type: "bladmeststof", element: "Cu" },
  { name: "Kappa V", aliases: ["kappa"], type: "bladmeststof", element: "mix" },
  { name: "Aminosol", aliases: [], type: "bladmeststof", element: "N" },
  { name: "Bittersalz", aliases: ["bitterzout", "magnesiumsulfaat"], type: "bladmeststof", element: "Mg" },
  { name: "Monokalifosfaat", aliases: ["mkp", "mono kali fosfaat"], type: "bladmeststof", element: "K+P" },
  { name: "Zinksulfaat", aliases: ["zink sulfaat"], type: "bladmeststof", element: "Zn" },
  { name: "Ureum", aliases: ["ureumbladvoeding"], type: "bladmeststof", element: "N" },
  { name: "Calcimax", aliases: [], type: "bladmeststof", element: "Ca+B" },
  { name: "Calin W", aliases: ["calin"], type: "bladmeststof", element: "Ca" },
  { name: "ACS-Koper 500", aliases: ["acs koper", "acs-koper", "acs koper 500"], type: "bladmeststof", element: "Cu" },
  { name: "Copfall", aliases: [], type: "bladmeststof", element: "Cu" },
  { name: "Stimuplant Vitaal", aliases: ["stimuplant"], type: "bladmeststof", element: "mix" },
  { name: "Hortispoor Mix", aliases: ["hortispoor"], type: "bladmeststof", element: "mix" },
  { name: "Selectyc X", aliases: ["selectyc"], type: "bladmeststof", element: "mix" },
  { name: "Alsupre S", aliases: ["alsupre"], type: "bladmeststof", element: "mix" },
  { name: "Fosanit Cu", aliases: ["fosanit"], type: "bladmeststof", element: "P+Cu" },
  { name: "Monoammoniumfosfaat", aliases: ["map"], type: "bladmeststof", element: "N+P" },
  { name: "TopTrace Alimento", aliases: ["toptrace"], type: "bladmeststof", element: "mix" },
  { name: "Mag500", aliases: ["mag 500"], type: "bladmeststof", element: "Mg" },
  { name: "Mangaan 500", aliases: ["mn 500", "mn500"], type: "bladmeststof", element: "Mn" },
  { name: "Fertigofol Ultra", aliases: ["fertigofol"], type: "bladmeststof", element: "NPK+mix" },

  // === STROOIMESTSTOFFEN (granulaat/korrel) ===
  { name: "Kalkammonsalpeter", aliases: ["kas", "kas 27"], type: "strooimeststof", element: "N" },
  { name: "Kalizout 60", aliases: ["kalizout", "kali 60"], type: "strooimeststof", element: "K" },
  { name: "Patentkali", aliases: ["patent kali"], type: "strooimeststof", element: "K+Mg" },
  { name: "Kaliumsulfaat", aliases: ["kalium sulfaat", "zwavelzure kali"], type: "strooimeststof", element: "K" },
  { name: "Kalkstikstof", aliases: ["perlka"], type: "strooimeststof", element: "N+Ca" },
  { name: "Tripel Superfosfaat", aliases: ["tripel super", "tsp"], type: "strooimeststof", element: "P" },
  { name: "Magnesammonsalpeter", aliases: ["mas", "mas 21"], type: "strooimeststof", element: "N+Mg" },
  { name: "Zwavelzure ammoniak", aliases: ["zza", "za"], type: "strooimeststof", element: "N+S" },
  { name: "IPreum", aliases: ["ipreum", "ureum korrel"], type: "strooimeststof", element: "N" },
  { name: "Multi Kmg", aliases: ["multi k", "multi kmg"], type: "strooimeststof", element: "K+N" },
  { name: "Mengmest 12-10-18", aliases: ["12-10-18", "npk 12-10-18"], type: "strooimeststof", element: "NPK" },
  { name: "Haifa Multi-K", aliases: ["haifa", "multi-k", "kaliumnitraat"], type: "strooimeststof", element: "K+N" },
  { name: "Kalksalpeter", aliases: ["calciumnitraat"], type: "strooimeststof", element: "N+Ca" },
];

// Pre-build lookup maps for O(1) access
const _cacheByName = new Map<string, CachedFertilizer>();
const _cacheByAlias = new Map<string, CachedFertilizer>();

for (const fert of COMMON_FERTILIZERS_CACHE) {
  _cacheByName.set(fert.name.toLowerCase(), fert);
  for (const alias of fert.aliases) {
    _cacheByAlias.set(alias.toLowerCase(), fert);
  }
}

// ============================================================================
// REGISTRATION TYPE DETECTION
// ============================================================================

const SPRAYING_KEYWORDS = [
  'gespoten', 'spuiten', 'bespuiting', 'bespoten', 'gespuit',
  'behandeld', 'getankt', 'tanken',
];

const SPREADING_KEYWORDS = [
  'gestrooid', 'strooien', 'bemest', 'bemesting', 'kunstmest',
  'uitgereden', 'uitgestrooid',
];

/**
 * Detecteert het registration type op basis van keywords in de input.
 * Default: 'spraying' (backward compatible)
 */
export function detectRegistrationType(input: string): RegistrationType {
  const lower = input.toLowerCase();

  for (const kw of SPREADING_KEYWORDS) {
    if (lower.includes(kw)) {
      return 'spreading';
    }
  }

  // Default to spraying (backward compatible)
  return 'spraying';
}

// ============================================================================
// CACHE LOOKUP
// ============================================================================

export interface FertilizerCacheHit {
  name: string;
  cachedFertilizer: CachedFertilizer;
  matchType: 'exact_name' | 'alias';
}

/**
 * Check of een productnaam matcht in de hardcoded meststoffen-cache.
 * Case-insensitive, trim whitespace.
 *
 * @returns Cache hit met naam en type, of null als niet gevonden
 */
export function checkFertilizerCache(productName: string): FertilizerCacheHit | null {
  const normalized = productName.toLowerCase().trim();

  // Check exact name match
  const nameMatch = _cacheByName.get(normalized);
  if (nameMatch) {
    return { name: nameMatch.name, cachedFertilizer: nameMatch, matchType: 'exact_name' };
  }

  // Check alias match
  const aliasMatch = _cacheByAlias.get(normalized);
  if (aliasMatch) {
    return { name: aliasMatch.name, cachedFertilizer: aliasMatch, matchType: 'alias' };
  }

  return null;
}

// ============================================================================
// DUAL-DATABASE PRODUCT RESOLUTION
// ============================================================================

export interface ResolvedProductDual {
  originalInput: string;
  resolvedName: string;
  source: ProductSource;
  confidence: number; // 0-100
  fertilizerType?: 'bladmeststof' | 'strooimeststof';
  warning?: string; // bijv. "strooimeststof gebruikt in spuitmengsel"
}

/**
 * Resolve een productnaam via dual-database lookup.
 *
 * Bij type 'spraying':
 *   1. Check EERST in CTGB (bestaande alias resolutie)
 *   2. Als NIET gevonden: check meststoffen-cache
 *   3. Als NIET in cache: zoek in meststoffen-database
 *
 * Bij type 'spreading':
 *   1. Zoek ALLEEN in meststoffen (cache + database)
 *   2. CTGB wordt NIET gecheckt
 *
 * @param productName - De productnaam om te resolven
 * @param registrationType - 'spraying' of 'spreading'
 * @param isCtgbResolved - Of het product al succesvol is gematcht in CTGB (confidence > 0)
 * @param fertilizers - Optioneel: lijst van meststoffen uit database (voor DB fallback)
 */
export function resolveFertilizerProduct(
  productName: string,
  registrationType: RegistrationType,
  isCtgbResolved: boolean,
  fertilizers?: FertilizerProduct[],
): ResolvedProductDual | null {
  const normalized = productName.toLowerCase().trim();

  // Bij 'spraying': alleen als CTGB NIET matcht
  if (registrationType === 'spraying' && isCtgbResolved) {
    return null; // CTGB match heeft prioriteit
  }

  // Stap 1: Check hardcoded cache (instant, geen DB roundtrip)
  const cacheHit = checkFertilizerCache(productName);
  if (cacheHit) {
    let warning: string | undefined;

    // Waarschuwing als strooimeststof in spuitmengsel (maar niet blokkeren)
    if (registrationType === 'spraying' && cacheHit.cachedFertilizer.type === 'strooimeststof') {
      warning = `${cacheHit.name} is een strooimeststof maar wordt hier als spuitmiddel gebruikt`;
    }

    return {
      originalInput: productName,
      resolvedName: cacheHit.name,
      source: 'fertilizer',
      confidence: 95,
      fertilizerType: cacheHit.cachedFertilizer.type,
      warning,
    };
  }

  // Stap 2: Zoek in meststoffen-database (als beschikbaar)
  if (fertilizers && fertilizers.length > 0) {
    // Helper: normalize hyphens, dots, underscores → spaces for fuzzy comparison
    const norm = (s: string) => s.toLowerCase().replace(/[-._]/g, ' ').replace(/\s+/g, ' ').trim();
    const normalizedFuzzy = norm(productName);

    // Exact name match
    const exactMatch = fertilizers.find(f =>
      f.name.toLowerCase() === normalized
    );
    if (exactMatch) {
      return {
        originalInput: productName,
        resolvedName: exactMatch.name,
        source: 'fertilizer',
        confidence: 90,
      };
    }

    // Keyword match
    const keywordMatch = fertilizers.find(f =>
      f.searchKeywords?.some(kw => kw.toLowerCase() === normalized)
    );
    if (keywordMatch) {
      return {
        originalInput: productName,
        resolvedName: keywordMatch.name,
        source: 'fertilizer',
        confidence: 85,
      };
    }

    // Normalized name match (hyphens/spaces treated as equivalent)
    // e.g. "acs koper" matches "ACS-Koper 500" because both normalize to "acs koper ..."
    const normalizedMatch = fertilizers.find(f => {
      const nameNorm = norm(f.name);
      return nameNorm === normalizedFuzzy;
    });
    if (normalizedMatch) {
      return {
        originalInput: productName,
        resolvedName: normalizedMatch.name,
        source: 'fertilizer',
        confidence: 88,
      };
    }

    // Partial name match (contains) — with normalized comparison
    const partialMatch = fertilizers.find(f => {
      const nameNorm = norm(f.name);
      return nameNorm.includes(normalizedFuzzy) || normalizedFuzzy.includes(nameNorm);
    });
    if (partialMatch) {
      return {
        originalInput: productName,
        resolvedName: partialMatch.name,
        source: 'fertilizer',
        confidence: 70,
      };
    }

    // Starts-with match — with normalized comparison
    const startsWithMatch = fertilizers.find(f => {
      const nameNorm = norm(f.name);
      return nameNorm.startsWith(normalizedFuzzy) || normalizedFuzzy.startsWith(nameNorm);
    });
    if (startsWithMatch) {
      return {
        originalInput: productName,
        resolvedName: startsWithMatch.name,
        source: 'fertilizer',
        confidence: 60,
      };
    }
  }

  return null;
}

/**
 * Batch resolve producten via dual-database lookup.
 * Integreert met de bestaande CTGB alias resolutie.
 *
 * @param products - Array van { product, dosage, unit } met optioneel al opgeloste CTGB namen
 * @param registrationType - 'spraying' of 'spreading'
 * @param ctgbResolvedNames - Set van productnamen die al succesvol in CTGB zijn gevonden
 * @param fertilizers - Lijst van meststoffen uit database
 */
export function resolveProductSources(
  products: Array<{ product: string; dosage: number; unit: string; source?: ProductSource }>,
  registrationType: RegistrationType,
  ctgbResolvedNames: Set<string>,
  fertilizers?: FertilizerProduct[],
): Array<{ product: string; dosage: number; unit: string; source: ProductSource; warning?: string }> {
  return products.map(prod => {
    // Bij spreading: alles is fertilizer
    if (registrationType === 'spreading') {
      const fertResult = resolveFertilizerProduct(prod.product, 'spreading', false, fertilizers);
      return {
        product: fertResult?.resolvedName || prod.product,
        dosage: prod.dosage,
        unit: prod.unit,
        source: 'fertilizer' as ProductSource,
        warning: fertResult?.warning,
      };
    }

    // Bij spraying: check of CTGB match bestaat
    const isCtgb = ctgbResolvedNames.has(prod.product) || ctgbResolvedNames.has(prod.product.toLowerCase());

    if (isCtgb) {
      return {
        product: prod.product,
        dosage: prod.dosage,
        unit: prod.unit,
        source: 'ctgb' as ProductSource,
      };
    }

    // Niet in CTGB: probeer meststoffen
    const fertResult = resolveFertilizerProduct(prod.product, 'spraying', false, fertilizers);
    if (fertResult) {
      return {
        product: fertResult.resolvedName,
        dosage: prod.dosage,
        unit: prod.unit,
        source: 'fertilizer' as ProductSource,
        warning: fertResult.warning,
      };
    }

    // Niet gevonden in geen van beide databases
    return {
      product: prod.product,
      dosage: prod.dosage,
      unit: prod.unit,
      source: 'ctgb' as ProductSource, // Default: behandel als potentieel GWB (voor unknown product warning)
    };
  });
}
