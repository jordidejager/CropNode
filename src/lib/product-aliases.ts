/**
 * Product Alias Service
 *
 * Handelt de mapping van:
 * 1. Korte namen / aliassen naar officiële CTGB productnamen
 * 2. Werkzame stoffen naar historisch gebruikte producten
 * 3. Gebruikersvoorkeuren uit eerdere bespuitingen
 */

import { getParcelHistoryEntries, getUserPreferences, getAllCtgbProducts } from './supabase-store';
import type { CtgbProduct, ParcelHistoryEntry, UserPreference } from './types';

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
    'delan': 'Delan DF',
    'delan pro': 'Delan Pro',
    'dithianon': 'Delan DF',
    'scala': 'Scala',
    'pyrimethanil': 'Scala',
    'bellis': 'Bellis',
    'boscalid': 'Bellis',
    'flint': 'Flint',
    'trifloxystrobin': 'Flint',
    'chorus': 'Chorus',
    'cyprodinil': 'Chorus',
    'topsin': 'Topsin M',
    'thiophanate-methyl': 'Topsin M',
    'teldor': 'Teldor',
    'fenhexamid': 'Teldor',
    'switch': 'Switch',
    'cyprodinil + fludioxonil': 'Switch',
    'luna': 'Luna Sensation',
    'fluopyram': 'Luna Sensation',
    'score': 'Score 250 EC',
    'difenoconazool': 'Score 250 EC',
    'syllit': 'Syllit Flow',
    'dodine': 'Syllit Flow',
    'folicur': 'Folicur',
    'tebuconazool': 'Folicur',
    'fontelis': 'Fontelis',
    'penthiopyrad': 'Fontelis',
    'pristine': 'Pristine',
    'geoxe': 'Geoxe',
    'fludioxonil': 'Geoxe',
    'sercadis': 'Sercadis',
    'fluxapyroxad': 'Sercadis',
    'stroby': 'Stroby WG',
    'kresoxim-methyl': 'Stroby WG',

    // ============================================
    // Insecticiden / Bladluis / Trips
    // ============================================
    'calypso': 'Calypso',
    'thiacloprid': 'Calypso',
    'movento': 'Movento 150 OD',
    'spirotetramat': 'Movento 150 OD',
    'pirimor': 'Pirimor',
    'pirimicarb': 'Pirimor',
    'karate': 'Karate Zeon',
    'lambda-cyhalothrin': 'Karate Zeon',
    'decis': 'Decis EC',
    'deltamethrin': 'Decis EC',
    'tracer': 'Tracer',
    'spinosad': 'Tracer',
    'steward': 'Steward',
    'indoxacarb': 'Steward',
    'runner': 'Runner',
    'methoxyfenozide': 'Runner',
    'coragen': 'CORAGEN',
    'chlorantraniliprole': 'CORAGEN',
    'madex': 'Madex Top',
    'carpovirusine': 'Carpovirusine Evo 2',
    'batavia': 'Batavia',
    'teppeki': 'Teppeki',
    'flonicamid': 'Teppeki',
    'sivanto': 'Sivanto Prime',
    'flupyradifurone': 'Sivanto Prime',
    'exirel': 'Exirel',
    'cyantraniliprole': 'Exirel',

    // ============================================
    // Mijten / Acariciden
    // ============================================
    'envidor': 'Envidor',
    'spirodiclofen': 'Envidor',
    'nissorun': 'Nissorun',
    'hexythiazox': 'Nissorun',
    'apollo': 'Apollo 50 SC',
    'clofentezine': 'Apollo 50 SC',
    'floramite': 'Floramite 240 SC',
    'bifenazaat': 'Floramite 240 SC',
    'masai': 'Masai',
    'tebufenpyrad': 'Masai',
    'milbeknock': 'Milbeknock',
    'milbemectin': 'Milbeknock',
    'vertimec': 'Vertimec',
    'abamectin': 'Vertimec',

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
    'exilis': 'Exilis',
    'maxcel': 'MaxCel',
    'benzyladenine': 'MaxCel',
    'rhodofix': 'Rhodofix',
    'aba': 'Rhodofix',

    // ============================================
    // Herbiciden / Onkruidbestrijding
    // ============================================
    'roundup': 'Roundup',
    'glyfosaat': 'Roundup',
    'glyphosate': 'Roundup',
    'basta': 'Basta',
    'glufosinaat': 'Basta',
    'kerb': 'Kerb Flo',
    'propyzamide': 'Kerb Flo',
    'spotlight': 'Spotlight Plus',
    'carfentrazone': 'Spotlight Plus',

    // ============================================
    // Bladluis specifiek
    // ============================================
    'wopro': 'WOPRO Luisweg',
    'wopro luisweg': 'WOPRO Luisweg',
    'luisweg': 'WOPRO Luisweg',

    // ============================================
    // Diverse / Overige
    // ============================================
    'aliette': 'Aliette',
    'fosetyl': 'Aliette',
    'ridomil': 'Ridomil Gold',
    'metalaxyl': 'Ridomil Gold',
    'previcur': 'Previcur Energy',
    'propamocarb': 'Previcur Energy',
    'ranman': 'Ranman Top',
    'cyazofamid': 'Ranman Top',
    'revus': 'Revus',
    'mandipropamid': 'Revus',
    'amistar': 'Amistar',
    'azoxystrobin': 'Amistar',
    'kumulus': 'Kumulus WG',
    'zwavel': 'Kumulus WG',
    'spuitzwavel': 'Kumulus WG',
    'solubor': 'Solubor DF',
    'borium': 'Solubor DF',

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
    // Calypso typos
    'kalypso': 'Calypso',
    'calyps': 'Calypso',
    // Other common typos
    'movneto': 'Movento 150 OD',
    'pirimoor': 'Pirimor',
    'karaet': 'Karate Zeon',
    'regallus': 'Regalis Plus',
};

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

        // If no exact match, try fuzzy match by iterating through all aliases
        if (!aliasTarget) {
            // Normalize both input and alias keys for comparison
            const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[®™*©\s]+/g, ' ').replace(/\s+/g, ' ').trim();
            const inputNorm = normalizeForMatch(normalizedInput);

            for (const [aliasKey, aliasValue] of Object.entries(PRODUCT_ALIASES)) {
                if (normalizeForMatch(aliasKey) === inputNorm) {
                    aliasTarget = aliasValue;
                    break;
                }
            }
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

    // Niveau 5: Partial match in CTGB database (fuzzy)
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
