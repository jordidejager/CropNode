/**
 * CTGB Post-processor — annotates chatbot answers with product toelatingsstatus
 *
 * Extracts product names mentioned in the generated answer, looks them up
 * against the ctgb_products table, and returns status annotations so the UI
 * can display ✓ / ✗ / ⚠️ next to each product.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CtgbAnnotation } from './types';

/**
 * Extract candidate product names from an answer. A product mention is
 * heuristically detected as any capitalized word sequence followed by a
 * dosage unit, or one of the known product names from the retrieved chunks.
 */
export function extractProductMentions(
  answer: string,
  knownProducts: string[] = [],
): string[] {
  const found = new Map<string, string>(); // canonical → display name

  // Helper: add with deduplication via canonical name
  function addProduct(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 3) return;
    if (!isLikelyProductName(trimmed)) return;

    const canonical = PRODUCT_CANONICAL[trimmed.toLowerCase()] ?? trimmed;
    // Keep the first (usually most specific) display name per canonical
    if (!found.has(canonical.toLowerCase())) {
      found.set(canonical.toLowerCase(), canonical);
    }
  }

  // 1. Match known products (from retrieved chunks) case-insensitively
  for (const product of knownProducts) {
    if (!product || product.length < 3) continue;
    // Skip werkzame stoffen that happen to be in the list (lowercase, generic chemical names)
    if (/^[a-z]/.test(product) && !product.includes(' ')) {
      // Likely a werkzame stof like "captan", "dodine" — only add if also capitalized in answer
      const capRe = new RegExp(`\\b${escapeRegex(product.charAt(0).toUpperCase() + product.slice(1))}\\b`);
      if (!capRe.test(answer)) continue;
    }
    const re = new RegExp(`\\b${escapeRegex(product)}\\b`, 'i');
    if (re.test(answer)) {
      addProduct(product);
    }
  }

  // 2. Regex match for Capitalized words followed by a dosage pattern
  const productRegex = /\b([A-Z][a-zA-Z0-9+/\- ]{2,30})\s+(?:max\s+)?\d+[.,]?\d*\s*(?:kg|l(?:tr|iter)?|gr|g|ml)(?:\/ha)?/g;
  let match: RegExpExecArray | null;
  while ((match = productRegex.exec(answer)) !== null) {
    addProduct(match[1]);
  }

  return Array.from(found.values());
}

const STOP_WORDS = new Set([
  'de', 'het', 'een', 'van', 'per', 'ha', 'max', 'tot', 'bij', 'in', 'op',
  'voor', 'na', 'tijdens', 'eerste', 'tweede', 'laatste', 'dit', 'dat',
  'als', 'kan', 'niet', 'wel', 'ook', 'nog', 'meer', 'dan', 'maar',
  'gebruik', 'altijd', 'combineren', 'combineer', 'toepassen', 'toepassing',
  'behandeling', 'behandelen', 'bestrijding', 'bestrijden',
  'nederland', 'belgie', 'belgisch', 'nederlands',
  'appel', 'peer', 'appels', 'peren', 'fruit', 'boomgaard',
  'middelen', 'doseringen', 'timing', 'aandachtspunten',
  'aanpak', 'preventief', 'curatief', 'beide',
  'volle', 'bloei', 'oogst', 'winter', 'zomer',
]);

/**
 * Extra filter: reject candidates that are clearly not product names.
 * Catches things like "In Nederland wordt", "Controleer lokale weerstations", etc.
 */
function isLikelyProductName(candidate: string): boolean {
  const trimmed = candidate.trim();
  // Must be 3-40 chars
  if (trimmed.length < 3 || trimmed.length > 40) return false;
  // Must not start with common Dutch sentence starters
  if (/^(In |De |Het |Een |Als |Bij |Na |Op |Per |Houd |Voer |Geef |Controleer |Voeg |Gebruik |Niet |Combineer |Vanaf )/i.test(trimmed)) return false;
  // Must not be all lowercase common words
  if (/^[a-z ]+$/.test(trimmed) && trimmed.split(' ').length > 2) return false;
  // Must not contain verbs/prepositions as majority
  const words = trimmed.split(/\s+/);
  const stopCount = words.filter(w => STOP_WORDS.has(w.toLowerCase())).length;
  if (stopCount > words.length / 2) return false;
  return true;
}

/**
 * Normalize a product name to a canonical base form for deduplication.
 * "Syllit Flow 400 SC" and "Syllit 544" both become "Syllit".
 * "Delan DF" and "Delan Pro" stay separate (different products).
 */
const PRODUCT_CANONICAL: Record<string, string> = {
  'syllit flow 400 sc': 'Syllit',
  'syllit 544': 'Syllit',
  'syllit flow': 'Syllit',
  'vsm dodine 544': 'VSM dodine 544',
  'dodifun sc': 'Syllit',
  'dodifun': 'Syllit',
  'geyser': 'Score/Geyser',
  'score': 'Score/Geyser',
  'difcor': 'Score/Geyser',
  'mavor': 'Belanty/Mavor',
  'belanty': 'Belanty/Mavor',
  'safir': 'Geoxe/Safir',
  'geoxe': 'Geoxe/Safir',
  'delan': 'Delan',
  'delan df': 'Delan',
  'stix': 'Siltac SF',
  'styx': 'Siltac SF',
  'kudos': 'Regalis/Kudos',
  'regalis': 'Regalis/Kudos',
  'merpan': 'Captan',
  'captan 80 wg': 'Captan',
  'captabellos': 'Captan',
  'multicap': 'Captan',
};

/**
 * Middelen die zo lang geleden verboden zijn dat ze niet meer in de actieve
 * CTGB-database staan. We moeten ze zelf hardcoded markeren als vervallen.
 * Bron: FruitConsult factsheets + CTGB besluitenlijst.
 */
const HISTORICALLY_WITHDRAWN: Record<string, { date: string; note: string }> = {
  'topsin m': { date: '2020-10-19', note: 'Toelating ingetrokken — NL en BE. Niet meer gebruiken.' },
  'topsin': { date: '2020-10-19', note: 'Toelating ingetrokken — NL en BE. Niet meer gebruiken.' },
  'thiophanaat-methyl': { date: '2020-10-19', note: 'Werkzame stof niet meer toegelaten in de EU' },
  'mancozeb': { date: '2021-01-04', note: 'EU-goedkeuring niet vernieuwd per 4 januari 2021' },
  'dithane': { date: '2021-01-04', note: 'Bevat mancozeb — EU-goedkeuring niet vernieuwd' },
  'tridex': { date: '2021-01-04', note: 'Bevat mancozeb — EU-goedkeuring niet vernieuwd' },
  'pirimor': { date: '2023-04-30', note: 'Toelating verlopen (pirimicarb) — beperkt beschikbaar via vrijstelling' },
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lookup each product in the ctgb_products table. Returns annotations
 * with status + toelatingsnummer + matched name.
 *
 * Status mapping:
 *   - status="Valid" + vervaldatum in future → 'toegelaten' ✓
 *   - status="Valid" + vervaldatum past → 'vervallen' ✗
 *   - status="Expired" / "Withdrawn" / "Cancelled" → 'vervallen' ✗
 *   - status anders / niet gevonden → 'onbekend'
 */
export async function lookupCtgbStatus(
  supabase: SupabaseClient,
  products: string[],
): Promise<CtgbAnnotation[]> {
  if (products.length === 0) return [];

  // Resolve aliases first (Pyrus → Scala, etc.)
  const resolved = await resolveProductAliases(supabase, products);

  const annotations = await Promise.all(
    products.map(async (product, i): Promise<CtgbAnnotation> => {
      const resolvedAlias = resolved[i] ?? product;
      // Also try canonical mapping for CTGB lookup
      const canonical = PRODUCT_CANONICAL[resolvedAlias.toLowerCase()];
      // Use the resolved name but split "Score/Geyser" → try both
      const lookupNames = canonical
        ? canonical.split('/').map(s => s.trim())
        : [resolvedAlias];
      const lookupName = lookupNames[0]; // primary lookup

      // 0. Check historisch-vervallen producten (niet meer in CTGB DB)
      const historical = HISTORICALLY_WITHDRAWN[resolvedAlias.toLowerCase()]
        ?? HISTORICALLY_WITHDRAWN[lookupName.toLowerCase()];
      if (historical) {
        return {
          product,
          status: 'vervallen',
          toelatingsnummer: null,
          vervaldatum: historical.date,
          matched_name: lookupName,
          note: historical.note,
        };
      }

      try {
        // Strategy: try exact match first, then fuzzy
        let { data } = await supabase
          .from('ctgb_products')
          .select('toelatingsnummer, naam, status, vervaldatum')
          .ilike('naam', lookupName)
          .limit(3);

        // Fallback to fuzzy match
        if (!data || data.length === 0) {
          const fuzzy = await supabase
            .from('ctgb_products')
            .select('toelatingsnummer, naam, status, vervaldatum')
            .ilike('naam', `%${lookupName}%`)
            .limit(5);
          data = fuzzy.data;
        }

        if (!data || data.length === 0) {
          return {
            product,
            status: 'onbekend',
            toelatingsnummer: null,
            vervaldatum: null,
            matched_name: null,
            note: 'Niet gevonden in CTGB-database',
          };
        }

        // Prefer an exact match (case-insensitive)
        const exactMatch = data.find((p) =>
          (p.naam as string).toLowerCase() === lookupName.toLowerCase()
        );
        const best = exactMatch ?? data[0];

        const rawStatus = ((best.status as string | null) ?? '').toLowerCase();
        const vervaldatum = best.vervaldatum as string | null;

        // Determine annotation status
        // In our CTGB snapshot, all active products have status="Valid".
        // So the logic is straightforward:
        let ann: CtgbAnnotation['status'];
        let note: string | null = null;

        if (vervaldatum) {
          const expiry = new Date(vervaldatum);
          const now = new Date();
          if (expiry < now) {
            ann = 'vervallen';
            note = `Toelating vervallen op ${vervaldatum.slice(0, 10)}`;
          } else {
            ann = 'toegelaten';
            note = `Geldig tot ${vervaldatum.slice(0, 10)}`;
          }
        } else if (rawStatus === 'valid' || rawStatus === 'actief' || rawStatus.includes('toegelaten')) {
          // No expiry date but status is valid → toegelaten
          ann = 'toegelaten';
        } else if (rawStatus.includes('vervallen') || rawStatus.includes('ingetrokken') ||
                   rawStatus === 'expired' || rawStatus === 'withdrawn' || rawStatus === 'cancelled') {
          ann = 'vervallen';
          note = `Status: ${best.status}`;
        } else {
          // Unknown status → still say "toegelaten" if we found it in CTGB,
          // because all our synced products are active toelatingen
          ann = 'toegelaten';
          note = `Gevonden in CTGB (status: ${best.status})`;
        }

        return {
          product,
          status: ann,
          toelatingsnummer: (best.toelatingsnummer as string | null) ?? null,
          vervaldatum: vervaldatum?.slice(0, 10) ?? null,
          matched_name: best.naam as string,
          note,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          product,
          status: 'onbekend',
          toelatingsnummer: null,
          vervaldatum: null,
          matched_name: null,
          note: `Lookup error: ${message}`,
        };
      }
    }),
  );

  return annotations;
}

// ============================================
// Product alias resolution
// ============================================

/**
 * Resolve product aliases via the product_aliases table.
 * Returns a list of canonical names parallel to the input.
 */
export async function resolveProductAliases(
  supabase: SupabaseClient,
  products: string[],
): Promise<string[]> {
  if (products.length === 0) return [];

  try {
    const lower = products.map((p) => p.toLowerCase());
    const { data } = await supabase
      .from('product_aliases')
      .select('alias, official_name')
      .in('alias', lower);

    const aliasMap = new Map<string, string>();
    for (const row of data ?? []) {
      const alias = (row.alias as string).toLowerCase();
      const official = row.official_name as string;
      if (alias && official) aliasMap.set(alias, official);
    }

    return products.map((p) => aliasMap.get(p.toLowerCase()) ?? p);
  } catch (err) {
    console.warn('[ctgb] alias lookup failed:', err);
    return products;
  }
}
