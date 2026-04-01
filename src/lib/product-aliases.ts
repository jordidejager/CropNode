/**
 * Product Alias Service
 *
 * Handelt de mapping van:
 * 1. Korte namen / aliassen naar officiële CTGB productnamen
 * 2. Werkzame stoffen naar historisch gebruikte producten
 * 3. Gebruikersvoorkeuren uit eerdere bespuitingen
 */

import { getParcelHistoryEntries, getUserPreferences, getAllCtgbProducts } from './supabase-store';
import type { CtgbProduct, ParcelHistoryEntry, UserPreference, ProductSuggestion } from './types';

// ============================================
// Statische Alias Mapping
// ============================================

/**
 * Handmatige mapping van veelgebruikte korte namen naar officiële productnamen
 * Dit is de "directe fix" voor bekende aliassen
 */
export const PRODUCT_ALIASES: Record<string, string> = {
    // ============================================
    // Schurft / Fungiciden
    // ============================================
    'captan': 'Merpan Spuitkorrel',
    'captaan': 'Merpan Spuitkorrel',
    'merpan': 'Merpan Spuitkorrel',
    'captosan': 'Captosan 500 SC',
    'delan': 'Delan DF',
    'delan pro': 'Delan Pro',
    'dithianon': 'Delan DF',
    'scala': 'Scala',
    'pyrimethanil': 'Scala',
    'bellis': 'Bellis',
    'boscalid': 'Bellis',
    'flint': 'FLINT',
    'trifloxystrobin': 'FLINT',
    'chorus': 'CHORUS 50 WG',
    'cyprodinil': 'CHORUS 50 WG',
    'teldor': 'Teldor',
    'fenhexamid': 'Teldor',
    'switch': 'Switch',
    'cyprodinil + fludioxonil': 'Switch',
    'luna experience': 'LUNA EXPERIENCE',
    // NB: 'luna' zonder suffix is ambig (Experience, Privilege, Care) - verwijderd
    // NB: 'fluopyram' zit in meerdere Luna-producten - verwijderd
    'score': 'Score 250 EC',
    'difenoconazool': 'Score 250 EC',
    'syllit': 'Syllit Flow 400 SC',
    'syllit flow': 'Syllit Flow 400 SC',
    'dodine': 'Syllit Flow 400 SC',
    'folicur': 'Folicur',
    'tebuconazool': 'Folicur',
    'geoxe': 'Geoxe',
    'fludioxonil': 'Geoxe',
    'sercadis': 'Sercadis',
    'fluxapyroxad': 'Sercadis',
    'stroby': 'Stroby WG',
    'kresoxim-methyl': 'Stroby WG',

    // ============================================
    // Insecticiden / Bladluis / Trips
    // ============================================
    'pirimor': 'Pirimor',
    'pirimicarb': 'Pirimor',
    'karate next': 'Karate Next',
    // NB: 'karate' en 'karate zeon' verwijderd - Karate Zeon (lambda-cyhalothrin) ≠ Karate Next (tau-fluvalinaat)
    // NB: 'lambda-cyhalothrin' verwijderd - dat is Karate Zeon, niet Karate Next
    'decis': 'Decis Protech',
    'decis protech': 'Decis Protech',
    'deltamethrin': 'Decis Protech',
    'tracer': 'TRACER',
    'spinosad': 'TRACER',
    'coragen': 'CORAGEN',
    'chlorantraniliprole': 'CORAGEN',
    'madex': 'Madex Top SC',
    'carpovirusine': 'CARPOVIRUSINE EVO 2',
    'teppeki': 'TEPPEKI',
    'flonicamid': 'TEPPEKI',
    'sivanto': 'Sivanto Prime',
    'flupyradifurone': 'Sivanto Prime',
    'exirel': 'Exirel',
    'cyantraniliprole': 'Exirel',
    'milbeknock': 'Milbeknock',
    'milbemectin': 'Milbeknock',

    // ============================================
    // Mijten / Acariciden
    // ============================================
    'nissorun': 'Nissorun vloeibaar',
    'hexythiazox': 'Nissorun vloeibaar',
    'floramite': 'FLORAMITE 240 SC',
    'bifenazaat': 'FLORAMITE 240 SC',
    'vertimec': 'Vertimec Gold',
    'abamectin': 'Vertimec Gold',

    // ============================================
    // Dunning / Groeiregulatie
    // ============================================
    'surround': 'SURROUND® WP CROP PROTECTANT',
    'surround wp': 'SURROUND® WP CROP PROTECTANT',
    'surround wp crop protectant': 'SURROUND® WP CROP PROTECTANT',
    'surround* wp crop protectant': 'SURROUND® WP CROP PROTECTANT',  // AI sometimes uses * instead of ®
    'kaoline': 'SURROUND® WP CROP PROTECTANT',
    'kaolin': 'SURROUND® WP CROP PROTECTANT',
    'regalis': 'Regalis Plus',
    'prohexadion': 'Regalis Plus',
    'prohexadion-calcium': 'Regalis Plus',
    'brevis': 'Brevis',
    'metamitron': 'Brevis',
    'exilis': 'Exilis 100 SC',
    'maxcel': 'MaxCel',
    'benzyladenine': 'MaxCel',

    // ============================================
    // Herbiciden / Onkruidbestrijding
    // ============================================
    'kerb': 'Kerb Flo',
    'propyzamide': 'Kerb Flo',
    'spotlight': 'Spotlight Plus',
    'carfentrazone': 'Spotlight Plus',

    // ============================================
    // Diverse / Overige
    // ============================================
    'aliette': 'Aliette',
    'fosetyl': 'Aliette',
    'ridomil': 'Ridomil Gold SL',
    'metalaxyl': 'Ridomil Gold SL',
    'previcur': 'Previcur Energy',
    'propamocarb': 'Previcur Energy',
    'ranman': 'Ranman Top',
    'cyazofamid': 'Ranman Top',
    'revus': 'Revus',
    'mandipropamid': 'Revus',
    'amistar': 'Amistar',
    'amistar top': 'Amistar Top',
    'azoxystrobin': 'Amistar',
    // NB: Amistar (solo azoxystrobin) en Amistar Top (+difenoconazool) zijn VERSCHILLENDE producten
    // NB: "KUMULUS" in CTGB is alleen voor graan. "Kumulus S" is voor fruitteelt (appel, peer, pitvruchten).
    // Fruitboeren bedoelen altijd Kumulus S als ze "kumulus" of "zwavel" zeggen.
    'kumulus': 'Kumulus S',
    'kumulus s': 'Kumulus S',
    'zwavel': 'Kumulus S',
    'spuitzwavel': 'Kumulus S',

    // ============================================
    // Common Typos / Fuzzy Matching
    // ============================================
    // Surround typos
    'surond': 'SURROUND® WP CROP PROTECTANT',
    'suround': 'SURROUND® WP CROP PROTECTANT',
    'surrond': 'SURROUND® WP CROP PROTECTANT',
    'surrround': 'SURROUND® WP CROP PROTECTANT',
    'surrund': 'SURROUND® WP CROP PROTECTANT',
    // Merpan typos
    'merspan': 'Merpan Spuitkorrel',
    'merpaan': 'Merpan Spuitkorrel',
    'merapn': 'Merpan Spuitkorrel',
    'mrpan': 'Merpan Spuitkorrel',
    // Captan typos
    'kaptan': 'Merpan Spuitkorrel',
    'capton': 'Merpan Spuitkorrel',
    'captna': 'Merpan Spuitkorrel',
    // Delan typos
    'delaan': 'Delan DF',
    'delen': 'Delan DF',
    'dlean': 'Delan DF',
    // Scala typos
    'skala': 'Scala',
    'scalla': 'Scala',
    // Bellis typos
    'belis': 'Bellis',
    'belliss': 'Bellis',
    // Other common typos
    'pirimoor': 'Pirimor',
    // NB: 'karaet' typo verwijderd - was foutief gekoppeld aan Karate Next
    'regallus': 'Regalis Plus',
};

// ============================================
// Levenshtein Distance (Typo Tolerance)
// ============================================

/**
 * Berekent de Levenshtein-afstand tussen twee strings.
 * Gebruikt voor typo-tolerante productnaam matching.
 */
function levenshteinDistance(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
        const row = new Array(n + 1).fill(0);
        row[0] = i;
        return row;
    });
    for (let j = 1; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
            }
        }
    }
    return dp[m][n];
}

/**
 * Fuzzy match een input tegen PRODUCT_ALIASES keys.
 * Threshold: max 1 edit voor namen <= 5 tekens, max 2 voor langere namen.
 * Retourneert de alias-target (officiële productnaam) of null.
 */
function fuzzyMatchProductAlias(input: string): string | null {
    if (input.length < 4) return null;

    const maxDist = input.length <= 5 ? 1 : 2;
    let bestMatch: string | null = null;
    let bestDist = Infinity;

    for (const [alias, target] of Object.entries(PRODUCT_ALIASES)) {
        if (alias.length < 4) continue;
        // Skip als lengteverschil al te groot is (optimalisatie)
        if (Math.abs(input.length - alias.length) > maxDist) continue;

        const dist = levenshteinDistance(input, alias);
        if (dist <= maxDist && dist < bestDist) {
            bestDist = dist;
            bestMatch = target;
        }
    }

    return bestMatch;
}

/**
 * Fuzzy match een input tegen CTGB productnamen (eerste woord).
 * Retourneert de volledige productnaam of null.
 */
function fuzzyMatchCtgbName(input: string, ctgbProducts: Array<{ naam: string }>): string | null {
    if (input.length < 4) return null;

    const maxDist = input.length <= 5 ? 1 : 2;
    let bestMatch: string | null = null;
    let bestDist = Infinity;

    for (const product of ctgbProducts) {
        const naam = product.naam?.toLowerCase() || '';
        const firstWord = naam.split(/[\s-]/)[0];
        if (firstWord.length < 4) continue;
        if (Math.abs(input.length - firstWord.length) > maxDist) continue;

        const dist = levenshteinDistance(input, firstWord);
        if (dist <= maxDist && dist < bestDist) {
            bestDist = dist;
            bestMatch = product.naam;
        }
    }

    return bestMatch;
}

// ============================================
// Product Suggestions (voor onbekende producten)
// ============================================

const FRUIT_REGEX = /appel|peer|pit.?fruit|kern.?fruit|fruit/i;

/**
 * Genereer "Bedoel je...?" suggesties voor een onbekend product.
 * Zoekt via Levenshtein, substring match, en werkzame stof matching.
 * Retourneert top-3 matches gesorteerd op score.
 */
export function getProductSuggestions(
    input: string,
    allProducts: Array<{ naam: string; toelatingsnummer: string; werkzameStoffen?: string[]; gebruiksvoorschriften?: Array<{ gewas?: string }> }>
): ProductSuggestion[] {
    const normalized = input.toLowerCase().trim();
    if (normalized.length < 2) return [];

    // Filter op fruit-relevante producten
    const fruitProducts = allProducts.filter(p =>
        (p.gebruiksvoorschriften || []).some(g => FRUIT_REGEX.test(g.gewas || ''))
    );

    const scored: Array<ProductSuggestion & { _sort: number }> = [];

    // Split input into words for multi-word matching
    const inputWords = normalized.split(/[\s-]+/).filter(w => w.length >= 3);

    for (const product of fruitProducts) {
        const naam = product.naam.toLowerCase();
        const naamWords = naam.split(/[\s-]+/);
        const firstWord = naamWords[0];
        let score = 0;

        // 1. Levenshtein op eerste woord van product vs input (of input-woorden)
        const dist = levenshteinDistance(normalized, firstWord);
        if (dist === 0) {
            score = 95;
        } else if (dist === 1 && firstWord.length >= 4) {
            score = 85;
        } else if (dist === 2 && firstWord.length >= 5) {
            score = 70;
        }

        // 1b. Levenshtein per input-woord tegen elk productwoord
        if (score === 0) {
            for (const iw of inputWords) {
                for (const nw of naamWords) {
                    if (nw.length < 3) continue;
                    const d = levenshteinDistance(iw, nw);
                    if (d === 0 && nw.length >= 4) {
                        score = Math.max(score, 80);
                    } else if (d === 1 && nw.length >= 4) {
                        score = Math.max(score, 70);
                    }
                }
            }
        }

        // 2. Substring match
        if (score === 0) {
            if (naam.includes(normalized) && normalized.length >= 3) {
                score = 75;
            } else if (normalized.includes(firstWord) && firstWord.length >= 4) {
                score = 65;
            }
            // Also check individual input words against product name
            if (score === 0) {
                for (const iw of inputWords) {
                    if (naam.includes(iw) && iw.length >= 4) {
                        score = Math.max(score, 60);
                    }
                }
            }
        }

        // 3. Werkzame stof match
        if (score === 0 && product.werkzameStoffen) {
            for (const stof of product.werkzameStoffen) {
                const stofLower = stof.toLowerCase();
                if (stofLower.includes(normalized) || normalized.includes(stofLower)) {
                    score = 55;
                    break;
                }
                // Check input words against stof
                for (const iw of inputWords) {
                    if (stofLower.includes(iw) || iw.includes(stofLower)) {
                        score = Math.max(score, 50);
                    }
                }
            }
        }

        if (score > 0) {
            scored.push({
                naam: product.naam,
                toelatingsnummer: product.toelatingsnummer,
                score,
                _sort: score,
            });
        }
    }

    // Sorteer op score (hoog → laag), neem top 3
    scored.sort((a, b) => b._sort - a._sort);
    return scored.slice(0, 3).map(({ _sort, ...s }) => s);
}

// ============================================
// Dynamic Alias Resolution
// ============================================

export interface ResolvedProduct {
    originalInput: string;
    resolvedName: string;
    source: 'static_alias' | 'history' | 'user_preference' | 'ctgb_match' | 'direct';
    confidence: number; // 0-100
}

/**
 * Resolve een product alias naar de officiële naam
 *
 * GEOPTIMALISEERD (Punt 1): Niveau 1-3 (snelle lookups) draaien parallel.
 * Alleen naar niveau 4-5 (database queries) als geen snelle match met confidence >= 0.90.
 *
 * Prioriteit:
 * 1. Exacte match in CTGB database (confidence: 100)
 * 2. Statische alias mapping (confidence: 95)
 * 3. Gebruikersvoorkeur (eerder gecorrigeerde aliassen) (confidence: 90)
 * 4. Historische data (eerder gebruikt product met zelfde werkzame stof) (confidence: 80)
 * 5. Partial match in CTGB database (confidence: 60)
 */
export async function resolveProductAlias(
    inputName: string,
    ctgbProducts: CtgbProduct[],
    userPreferences: UserPreference[] | null,
    parcelHistory: ParcelHistoryEntry[]
): Promise<ResolvedProduct> {
    const normalizedInput = inputName.toLowerCase().trim();
    // Also create a version stripped of special characters for fuzzy matching
    const strippedInput = normalizedInput.replace(/[®™*©]/g, '').replace(/\s+/g, ' ').trim();

    // === FASE 1: Snelle lookups parallel uitvoeren (0ms, geen I/O) ===
    // Niveau 1, 2, en 3 zijn allemaal in-memory lookups

    // Niveau 1: Exacte match in CTGB database (lokale array)
    const checkExactMatch = (): ResolvedProduct | null => {
        const exactMatch = ctgbProducts.find(p =>
            p.naam?.toLowerCase() === normalizedInput ||
            p.toelatingsnummer?.toLowerCase() === normalizedInput
        );
        if (exactMatch) {
            return {
                originalInput: inputName,
                resolvedName: exactMatch.naam,
                source: 'direct',
                confidence: 100
            };
        }
        return null;
    };

    // Niveau 2: Statische alias mapping (in-memory object)
    const checkStaticAlias = (): ResolvedProduct | null => {
        // Try exact match first, then stripped version
        let aliasTarget = PRODUCT_ALIASES[normalizedInput] || PRODUCT_ALIASES[strippedInput];

        // If no exact match, try normalized match by iterating through all aliases
        if (!aliasTarget) {
            const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[®™*©\s]+/g, ' ').replace(/\s+/g, ' ').trim();
            const inputNorm = normalizeForMatch(normalizedInput);

            for (const [aliasKey, aliasValue] of Object.entries(PRODUCT_ALIASES)) {
                if (normalizeForMatch(aliasKey) === inputNorm) {
                    aliasTarget = aliasValue;
                    break;
                }
            }
        }

        // If still no match, try Levenshtein fuzzy match (typo tolerance)
        if (!aliasTarget) {
            aliasTarget = fuzzyMatchProductAlias(normalizedInput) ?? undefined;
        }

        if (aliasTarget) {
            // Verify the alias target exists in CTGB database
            const targetExists = ctgbProducts.some(p =>
                p.naam?.toLowerCase() === aliasTarget!.toLowerCase()
            );
            if (targetExists) {
                return {
                    originalInput: inputName,
                    resolvedName: aliasTarget,
                    source: 'static_alias',
                    confidence: 95
                };
            }
            // Alias exists but target not in database - still return it (static aliases are trusted)
            return {
                originalInput: inputName,
                resolvedName: aliasTarget,
                source: 'static_alias',
                confidence: 95
            };
        }
        return null;
    };

    // Niveau 3: Gebruikersvoorkeur (in-memory array)
    const checkUserPreference = (): ResolvedProduct | null => {
        if (!userPreferences) return null;
        const prefKey = `middel_${normalizedInput}`;
        const userPref = userPreferences.find(p =>
            p.alias.toLowerCase() === prefKey.toLowerCase() ||
            p.alias.toLowerCase() === normalizedInput
        );
        if (userPref) {
            return {
                originalInput: inputName,
                resolvedName: userPref.preferred,
                source: 'user_preference',
                confidence: 90
            };
        }
        return null;
    };

    // Voer niveau 1-3 parallel uit en neem de beste match
    const fastResults = [checkExactMatch(), checkStaticAlias(), checkUserPreference()];

    // Sorteer op confidence en neem de hoogste
    const bestFastResult = fastResults
        .filter((r): r is ResolvedProduct => r !== null)
        .sort((a, b) => b.confidence - a.confidence)[0];

    // Als we een match hebben met confidence >= 90, return direct (skip slow lookups)
    if (bestFastResult && bestFastResult.confidence >= 90) {
        return bestFastResult;
    }

    // === FASE 2: Langzame lookups (alleen als nodig) ===

    // Niveau 4: Historische data (in-memory maar complexe berekening)
    const matchingBySubstance = ctgbProducts.filter(p =>
        p.werkzameStoffen?.some(ws =>
            ws.toLowerCase().includes(normalizedInput) ||
            normalizedInput.includes(ws.toLowerCase())
        )
    );

    if (matchingBySubstance.length > 0) {
        // Find which of these products was most recently used
        const historyProductCounts = new Map<string, { count: number; lastUsed: Date }>();

        for (const historyEntry of parcelHistory) {
            const productName = historyEntry.product.toLowerCase();
            const matchingProduct = matchingBySubstance.find(p =>
                p.naam.toLowerCase() === productName
            );

            if (matchingProduct) {
                const existing = historyProductCounts.get(matchingProduct.naam) || { count: 0, lastUsed: new Date(0) };
                existing.count++;
                const entryDate = new Date(historyEntry.date);
                if (entryDate > existing.lastUsed) {
                    existing.lastUsed = entryDate;
                }
                historyProductCounts.set(matchingProduct.naam, existing);
            }
        }

        // Return the most frequently used product
        let bestMatch: string | null = null;
        let bestScore = 0;

        for (const [productName, stats] of historyProductCounts) {
            const score = stats.count * 10 + (Date.now() - stats.lastUsed.getTime()) / (1000 * 60 * 60 * 24 * 365); // Recency bonus
            if (score > bestScore) {
                bestScore = score;
                bestMatch = productName;
            }
        }

        if (bestMatch) {
            return {
                originalInput: inputName,
                resolvedName: bestMatch,
                source: 'history',
                confidence: 80
            };
        }

        // No history, but we found matching products - return the first one
        return {
            originalInput: inputName,
            resolvedName: matchingBySubstance[0].naam,
            source: 'ctgb_match',
            confidence: 70
        };
    }

    // Niveau 4b: Levenshtein fuzzy match tegen CTGB productnamen
    const fuzzyCtgbResult = fuzzyMatchCtgbName(normalizedInput, ctgbProducts);
    if (fuzzyCtgbResult) {
        return {
            originalInput: inputName,
            resolvedName: fuzzyCtgbResult,
            source: 'ctgb_match',
            confidence: 75
        };
    }

    // Niveau 5: Partial match in CTGB database (prefix)
    const partialMatch = ctgbProducts.find(p => {
        const naam = p.naam?.toLowerCase() || '';
        const firstWord = naam.split(/[\s-]/)[0];
        return firstWord === normalizedInput || naam.startsWith(normalizedInput);
    });

    if (partialMatch) {
        return {
            originalInput: inputName,
            resolvedName: partialMatch.naam,
            source: 'ctgb_match',
            confidence: 60
        };
    }

    // Niveau 6: Geen match gevonden - return originele input
    return {
        originalInput: inputName,
        resolvedName: inputName,
        source: 'direct',
        confidence: 0
    };
}

/**
 * Batch resolve multiple product aliases - GEOPTIMALISEERD
 * Voert alle snelle lookups parallel uit per product
 */
export async function resolveProductAliasesParallel(
    inputNames: string[],
    ctgbProducts: CtgbProduct[],
    userPreferences: UserPreference[] | null,
    parcelHistory: ParcelHistoryEntry[]
): Promise<Map<string, ResolvedProduct>> {
    // Resolve alle producten parallel
    const results = await Promise.all(
        inputNames.map(name => resolveProductAlias(name, ctgbProducts, userPreferences, parcelHistory))
    );

    const resultMap = new Map<string, ResolvedProduct>();
    inputNames.forEach((name, index) => {
        resultMap.set(name, results[index]);
    });

    return resultMap;
}

/**
 * Batch resolve multiple product aliases (backwards compatible wrapper)
 * @deprecated Use resolveProductAliasesParallel for better performance
 */
export async function resolveProductAliases(
    inputNames: string[]
): Promise<Map<string, ResolvedProduct>> {
    const [ctgbProducts, userPreferences, parcelHistory] = await Promise.all([
        getAllCtgbProducts(),
        getUserPreferences(),
        getParcelHistoryEntries()
    ]);

    return resolveProductAliasesParallel(inputNames, ctgbProducts, userPreferences, parcelHistory);
}

/**
 * Get frequently used products from history
 * Returns the top N most used products in the last X days
 */
export async function getFrequentlyUsedProducts(
    topN: number = 10,
    daysBack: number = 365
): Promise<string[]> {
    const parcelHistory = await getParcelHistoryEntries();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const productCounts = new Map<string, number>();

    for (const entry of parcelHistory) {
        const entryDate = new Date(entry.date);
        if (entryDate >= cutoffDate) {
            const count = productCounts.get(entry.product) || 0;
            productCounts.set(entry.product, count + 1);
        }
    }

    return Array.from(productCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([name]) => name);
}
