import { searchCtgbProducts } from './supabase-store';
import { generateEmbedding } from './embedding-service';
import { supabase } from './supabase';
import { CtgbProduct } from './types';

/**
 * RAG Service - Retrieval Augmented Generation
 *
 * Nu met Granular Embeddings (Sessie 11):
 * - Semantic search over product_usages (per gewas/plaag combinatie)
 * - Veel nauwkeuriger dan keyword search op productnaam
 *
 * Flow:
 * 1. generateEmbedding(query) → 768-dim vector
 * 2. match_product_usages() → Top-N relevante voorschriften
 * 3. Bouw context voor AI prompt
 */

// ============================================
// Types for semantic search results
// ============================================

export interface ProductUsageMatch {
  id: string;
  productId: string;
  productNaam: string;
  toelatingsnummer: string;
  gewas: string | null;
  doelorganisme: string | null;
  dosering: string | null;
  veiligheidstermijn: string | null;
  maxToepassingen: number | null;
  interval: string | null;
  content: string;
  similarity: number;
}

// ============================================
// Semantic Search (NEW - Fase 2.2)
// ============================================

/**
 * Semantic search over product_usages using vector similarity
 * Dit vervangt de oude keyword-based search voor betere nauwkeurigheid
 */
export async function searchProductUsages(
  query: string,
  options: {
    threshold?: number;
    limit?: number;
  } = {}
): Promise<ProductUsageMatch[]> {
  const { threshold = 0.4, limit = 10 } = options;

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Call the match_product_usages RPC function
    const { data, error } = await supabase.rpc('match_product_usages', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('Error in semantic search:', error);
      // Fallback to empty results, don't throw
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      productId: row.product_id,
      productNaam: row.product_naam,
      toelatingsnummer: row.toelatingsnummer,
      gewas: row.gewas,
      doelorganisme: row.doelorganisme,
      dosering: row.dosering,
      veiligheidstermijn: row.veiligheidstermijn,
      maxToepassingen: row.max_toepassingen,
      interval: row.interval,
      content: row.content,
      similarity: row.similarity,
    }));
  } catch (error) {
    console.error('Semantic search failed:', error);
    return [];
  }
}

/**
 * Get relevant product usages using semantic search
 * Dit is de nieuwe primaire methode voor RAG (vervangt getRelevantProducts voor queries)
 */
export async function getRelevantProductUsages(
  userInput: string,
  limit: number = 5
): Promise<ProductUsageMatch[]> {
  return searchProductUsages(userInput, { threshold: 0.35, limit });
}

/**
 * Build context string from semantic search results
 * Geoptimaliseerd voor AI prompt - bevat alle relevante voorschrift details
 */
export function buildProductUsageContext(matches: ProductUsageMatch[]): string {
  if (matches.length === 0) {
    return 'Geen specifieke voorschriften gevonden. Gebruik de opgegeven productnaam letterlijk.';
  }

  // Group by product for cleaner output
  const byProduct = new Map<string, ProductUsageMatch[]>();
  for (const match of matches) {
    const key = match.productNaam;
    if (!byProduct.has(key)) {
      byProduct.set(key, []);
    }
    byProduct.get(key)!.push(match);
  }

  const sections: string[] = [];

  for (const [productName, usages] of byProduct) {
    const first = usages[0];
    const lines: string[] = [
      `PRODUCT: ${productName} (${first.toelatingsnummer})`,
    ];

    // Add each usage as a sub-section
    for (const usage of usages.slice(0, 3)) { // Max 3 usages per product
      const usageLines: string[] = [];

      if (usage.gewas) {
        usageLines.push(`  Gewas: ${usage.gewas}`);
      }
      if (usage.doelorganisme) {
        usageLines.push(`  Doelorganisme: ${usage.doelorganisme}`);
      }
      if (usage.dosering) {
        usageLines.push(`  Dosering: ${usage.dosering}`);
      }
      if (usage.veiligheidstermijn) {
        usageLines.push(`  Veiligheidstermijn: ${usage.veiligheidstermijn}`);
      }
      if (usage.maxToepassingen) {
        usageLines.push(`  Max toepassingen: ${usage.maxToepassingen}`);
      }
      if (usage.interval) {
        usageLines.push(`  Interval: ${usage.interval}`);
      }

      if (usageLines.length > 0) {
        lines.push(...usageLines);
        lines.push(''); // Empty line between usages
      }
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n---\n');
}

// ============================================
// Legacy Keyword Search (kept for fallback)
// ============================================

// Stop-woorden die we negeren bij zoekterm extractie
const STOP_WORDS = new Set([
    'de', 'het', 'een', 'en', 'van', 'op', 'in', 'met', 'voor', 'is', 'naar', 'alle',
    'gespoten', 'spuiten', 'bespuiting', 'bespoten', 'behandeld', 'behandeling',
    'gisteren', 'vandaag', 'morgen', 'vorige', 'week', 'dag', 'dagen',
    'per', 'hectare', 'liter', 'kilo', 'gram', 'ml',
    'tegen', 'voor', 'bij', 'aan', 'tot'
]);

// Gewas-gerelateerde woorden (niet zoeken als productnaam)
const CROP_WORDS = new Set([
    'appel', 'appels', 'peer', 'peren', 'kers', 'kersen', 'pruim', 'pruimen',
    'aardbei', 'aardbeien', 'framboos', 'frambozen', 'druif', 'druiven',
    'aardappel', 'aardappelen', 'ui', 'uien', 'prei', 'preien',
    'tomaat', 'tomaten', 'paprika', 'komkommer', 'sla', 'spinazie',
    'elstar', 'jonagold', 'braeburn', 'golden', 'conference', 'doyenne'
]);

// Doelorganisme-gerelateerde woorden (nuttig voor context, maar niet voor productzoeken)
const TARGET_WORDS = new Set([
    'schurft', 'luis', 'bladluis', 'meeldauw', 'spint', 'mot', 'trips',
    'roest', 'vuur', 'botrytis', 'monilia', 'insect', 'insecten', 'onkruid'
]);

/**
 * Micro-step 1: Analyseer gebruikersinvoer en extraheer zoektermen
 * Dit is een snelle, deterministische stap (geen AI nodig)
 */
export function extractSearchTerms(userInput: string): {
    productTerms: string[];
    contextTerms: string[];
    dosageInfo: { value: number; unit: string } | null;
} {
    const normalizedInput = userInput.toLowerCase();
    const tokens = normalizedInput
        .split(/[\s,.!?]+/)
        .map(t => t.trim())
        .filter(t => t.length > 2);

    const productTerms: string[] = [];
    const contextTerms: string[] = [];

    // Patroon voor dosering: "1.5 l", "2 kg", "500 ml"
    const dosageMatch = normalizedInput.match(/(\d+[,.]?\d*)\s*(l|kg|ml|g)(?:\/ha)?/i);
    const dosageInfo = dosageMatch
        ? { value: parseFloat(dosageMatch[1].replace(',', '.')), unit: dosageMatch[2].toLowerCase() }
        : null;

    // Categoriseer tokens
    for (const token of tokens) {
        if (STOP_WORDS.has(token)) continue;

        // Getallen overslaan (dosering wordt apart verwerkt)
        if (/^\d+[,.]?\d*$/.test(token)) continue;

        if (CROP_WORDS.has(token)) {
            contextTerms.push(token);
        } else if (TARGET_WORDS.has(token)) {
            contextTerms.push(token);
        } else {
            // Potentieel een productnaam of deel ervan
            productTerms.push(token);
        }
    }

    // Multi-word product namen detecteren (bijv. "Captan 80 WG")
    const multiWordPatterns = [
        /([a-z]+)\s+(\d+)\s*(wg|wp|sc|ec|sl|sp|df|wdg|od)/gi,  // "Captan 80 WG"
        /([a-z]+)\s+(flow|spray|gold|plus|max|pro|ultra)/gi     // "Batavia Flow"
    ];

    for (const pattern of multiWordPatterns) {
        const matches = normalizedInput.matchAll(pattern);
        for (const match of matches) {
            productTerms.push(match[0].trim());
        }
    }

    return {
        productTerms: [...new Set(productTerms)], // Deduplicate
        contextTerms: [...new Set(contextTerms)],
        dosageInfo
    };
}

/**
 * Micro-step 2: Zoek relevante producten op basis van geextraheerde termen
 * Retourneert Top-5 meest relevante producten met volledige CTGB regels
 */
export async function getRelevantProducts(userInput: string): Promise<CtgbProduct[]> {
    const { productTerms, contextTerms } = extractSearchTerms(userInput);

    // Combineer productTerms en contextTerms voor bredere zoekresultaten
    const allSearchTerms = [...productTerms, ...contextTerms].filter(t => t.length >= 3);

    if (allSearchTerms.length === 0) {
        // Fallback: zoek op de originele input woorden
        const fallbackTokens = userInput.toLowerCase()
            .split(/[\s,.]+/)
            .filter(t => t.length > 3 && !STOP_WORDS.has(t));
        allSearchTerms.push(...fallbackTokens.slice(0, 3));
    }

    // Parallel zoeken voor elke term
    const searchPromises = allSearchTerms.map(term => searchCtgbProducts(term));
    const searchResults = await Promise.all(searchPromises);

    // Flatten en verzamel alle gevonden producten
    const allFound = searchResults.flat();
    const productMap = new Map<string, { product: CtgbProduct; score: number }>();

    // Score elk product
    const normalizedInput = userInput.toLowerCase();

    for (const product of allFound) {
        const naam = product.naam?.toLowerCase() || '';
        const existing = productMap.get(naam);
        let score = existing?.score || 0;

        // Scoring logica
        // Exacte naam match = hoogste score
        if (normalizedInput.includes(naam)) {
            score += 100;
        }

        // Eerste woord van productnaam match
        const firstWord = naam.split(/[\s-]/)[0];
        if (normalizedInput.includes(firstWord) && firstWord.length > 3) {
            score += 50;
        }

        // Partial matches per zoekterm
        for (const term of productTerms) {
            if (naam.includes(term)) score += 20;
            if (term.includes(firstWord)) score += 15;
        }

        // Context boost: product heeft voorschrift voor genoemd gewas
        if (product.gebruiksvoorschriften && contextTerms.length > 0) {
            for (const voorschrift of product.gebruiksvoorschriften) {
                const gewas = voorschrift.gewas?.toLowerCase() || '';
                for (const cropTerm of contextTerms) {
                    if (gewas.includes(cropTerm)) {
                        score += 30; // Boost voor gewas-match
                        break;
                    }
                }
            }
        }

        // Context boost: product heeft voorschrift voor genoemd doelorganisme
        if (product.gebruiksvoorschriften && contextTerms.length > 0) {
            for (const voorschrift of product.gebruiksvoorschriften) {
                const doel = voorschrift.doelorganisme?.toLowerCase() || '';
                for (const targetTerm of contextTerms) {
                    if (doel.includes(targetTerm)) {
                        score += 25; // Boost voor doel-match
                        break;
                    }
                }
            }
        }

        productMap.set(naam, { product, score });
    }

    // Sorteer op score en neem top 5
    const sorted = Array.from(productMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    return sorted.map(s => s.product);
}

/**
 * Bouw de compacte product context voor de AI prompt
 * Bevat alleen de essentiële informatie die de AI nodig heeft
 */
export function buildProductContext(products: CtgbProduct[]): string {
    if (products.length === 0) {
        return 'Geen specifieke producten gevonden. Gebruik de opgegeven productnaam letterlijk.';
    }

    return products.map(p => {
        const lines: string[] = [
            `PRODUCT: ${p.naam} (${p.toelatingsnummer || 'N/A'})`,
        ];

        // Voeg werkzame stoffen toe (belangrijk voor identificatie)
        if (p.werkzameStoffen && p.werkzameStoffen.length > 0) {
            lines.push(`  Werkzame stof: ${p.werkzameStoffen.join(', ')}`);
        }

        // Voeg alleen relevante gebruiksvoorschriften toe (max 3)
        if (p.gebruiksvoorschriften && p.gebruiksvoorschriften.length > 0) {
            const relevantVoorschriften = p.gebruiksvoorschriften.slice(0, 3);
            for (const v of relevantVoorschriften) {
                if (v.gewas) {
                    lines.push(`  Gewas: ${v.gewas}`);
                }
                if (v.dosering) {
                    lines.push(`  Max dosering: ${v.dosering}`);
                }
            }
        }

        return lines.join('\n');
    }).join('\n\n');
}
