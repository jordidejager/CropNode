/**
 * CTGB Validator - Deterministic Validation Engine
 *
 * Deze module bevat de losgekoppelde validatiefunctie voor CTGB regels.
 * Wordt NIET door de LLM uitgevoerd, maar door pure TypeScript logica.
 *
 * Voordelen:
 * - Geen hallucinatie risico
 * - Sneller dan LLM validatie
 * - Consistente resultaten
 * - Testbaar en verifieerbaar
 */

import type {
    Parcel,
    ParcelHistoryEntry,
    CtgbProduct,
    ProductEntry,
    LogStatus
} from './types';

import {
    validateSprayApplication,
    type ValidationFlag,
    type ValidationResult
} from './validation-service';

// ============================================
// Types
// ============================================

export interface DraftSprayData {
    plots: string[];
    products: ProductEntry[];
    date?: string;
}

export interface ValidationInput {
    draft: DraftSprayData;
    parcels: Parcel[];
    ctgbProducts: CtgbProduct[];
    parcelHistory: ParcelHistoryEntry[];
    applicationDate?: Date;
}

export interface CtgbValidationResult {
    isValid: boolean;
    status: LogStatus;
    flags: ValidationFlag[];
    errorCount: number;
    warningCount: number;
    infoCount: number;
    validationMessage: string | null;
    normalizedProducts: ProductEntry[];
    matchedTargets: Record<string, string>;
}

// ============================================
// Main Validation Function
// ============================================

/**
 * validateCtgbRules - Deterministische CTGB validatie
 *
 * Deze functie voert alle CTGB checks uit:
 * 1. Product naam matching en normalisatie
 * 2. Gewas toelating check
 * 3. Dosering check
 * 4. Interval check (tijd tussen toepassingen)
 * 5. Cumulatieve werkzame stof limiet
 * 6. Seizoens maxima (aantal toepassingen per teelt)
 *
 * @param input - De te valideren data plus context
 * @returns CtgbValidationResult met alle validatie resultaten
 */
export async function validateCtgbRules(input: ValidationInput): Promise<CtgbValidationResult> {
    const { draft, parcels, ctgbProducts, parcelHistory, applicationDate = new Date() } = input;

    const flags: ValidationFlag[] = [];
    const matchedTargets: Record<string, string> = {};
    const normalizedProducts: ProductEntry[] = JSON.parse(JSON.stringify(draft.products));

    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    // Build product lookup map (case-insensitive)
    const productMap = new Map<string, CtgbProduct>();
    for (const p of ctgbProducts) {
        if (p.naam) {
            productMap.set(p.naam.toLowerCase(), p);
        }
        if (p.toelatingsnummer) {
            productMap.set(p.toelatingsnummer.toLowerCase(), p);
        }
    }

    // Get selected parcels - match by ID, name, crop, or variety
    const selectedParcels: Parcel[] = [];
    const unmatchedPlots: string[] = [];

    // === DEBUG LOGGING ===
    console.log(`[validateCtgbRules] Starting parcel matching...`);
    console.log(`[validateCtgbRules] Input parcels count: ${parcels.length}`);
    console.log(`[validateCtgbRules] Draft plots count: ${draft.plots.length}`);
    if (parcels.length > 0) {
        console.log(`[validateCtgbRules] First parcel from input: id="${parcels[0].id}", name="${parcels[0].name}"`);
    }
    if (draft.plots.length > 0) {
        console.log(`[validateCtgbRules] First plot from draft: "${draft.plots[0]}"`);
    }
    // === END DEBUG ===

    for (const plotIdentifier of draft.plots) {
        if (!plotIdentifier) {
            console.warn(`[validateCtgbRules] Skipping empty/null plot identifier`);
            continue;
        }

        const plotLower = plotIdentifier.toLowerCase?.() || '';
        const plotTrimmed = plotIdentifier.trim();

        // Try exact ID match first (case-sensitive UUID)
        let matched = parcels.find(p => p.id === plotTrimmed);

        // Try case-insensitive ID match (UUIDs should be case-insensitive)
        if (!matched) {
            matched = parcels.find(p => p.id?.toLowerCase() === plotLower);
        }

        // Try name match (exact)
        if (!matched) {
            matched = parcels.find(p => p.name?.toLowerCase() === plotLower);
        }

        // Try partial name match
        if (!matched && plotLower.length >= 3) {
            matched = parcels.find(p =>
                p.name?.toLowerCase().includes(plotLower) ||
                plotLower.includes(p.name?.toLowerCase() || '')
            );
        }

        // Try crop/variety match on sub-parcels (e.g., "peren" matches parcels with crop "Peer")
        if (!matched && plotLower.length >= 3) {
            matched = parcels.find(p =>
                p.subParcels?.some(sp =>
                    sp.crop?.toLowerCase().includes(plotLower) ||
                    sp.variety?.toLowerCase().includes(plotLower) ||
                    plotLower.includes(sp.crop?.toLowerCase() || '') ||
                    plotLower.includes(sp.variety?.toLowerCase() || '')
                )
            );
        }

        // Try top-level crop/variety match (for parcels with direct crop/variety fields)
        if (!matched && plotLower.length >= 3) {
            matched = parcels.find(p =>
                p.crop?.toLowerCase().includes(plotLower) ||
                p.variety?.toLowerCase().includes(plotLower)
            );
        }

        if (matched && !selectedParcels.includes(matched)) {
            console.log(`[validateCtgbRules] ✓ Matched plot "${plotIdentifier}" → parcel "${matched.name}" (id: ${matched.id})`);
            selectedParcels.push(matched);
        } else if (!matched) {
            console.warn(`[validateCtgbRules] ✗ No match for plot "${plotIdentifier}"`);
            unmatchedPlots.push(plotIdentifier);
        }
    }

    console.log(`[validateCtgbRules] Matching complete: ${selectedParcels.length} matched, ${unmatchedPlots.length} unmatched`);

    // === DEBUG: Log crop data for matched parcels ===
    for (const parcel of selectedParcels) {
        const directCrop = parcel.crop;
        const subParcelCrop = parcel.subParcels?.[0]?.crop;
        const effectiveCrop = directCrop || subParcelCrop || 'NONE';
        console.log(`[validateCtgbRules] Parcel "${parcel.name}" crop info:`);
        console.log(`  - parcel.crop: ${directCrop || 'NULL'}`);
        console.log(`  - parcel.subParcels[0]?.crop: ${subParcelCrop || 'NULL'}`);
        console.log(`  - Effective crop: ${effectiveCrop}`);
        console.log(`  - subParcels count: ${parcel.subParcels?.length || 0}`);
    }
    // === END DEBUG ===

    if (selectedParcels.length === 0) {
        flags.push({
            type: 'error',
            message: `Geen geldige percelen geselecteerd.${unmatchedPlots.length > 0 ? ` Niet gevonden: ${unmatchedPlots.join(', ')}` : ''}`,
            field: 'plots'
        });
        errorCount++;
    } else if (unmatchedPlots.length > 0) {
        flags.push({
            type: 'warning',
            message: `Sommige percelen niet gevonden: ${unmatchedPlots.join(', ')}`,
            field: 'plots'
        });
        warningCount++;
    }

    // Validate each product
    for (let i = 0; i < normalizedProducts.length; i++) {
        const productEntry = normalizedProducts[i];

        // Guard against undefined product entries
        if (!productEntry || !productEntry.product) {
            flags.push({
                type: 'warning',
                message: `Product op positie ${i + 1} heeft geen naam.`,
                field: 'products',
                details: { index: i }
            });
            warningCount++;
            continue;
        }

        // Step 1: Find and normalize product name
        const matchedProduct = findCtgbProduct(productEntry.product, productMap);

        if (!matchedProduct) {
            flags.push({
                type: 'warning',
                message: `Product "${productEntry.product}" niet gevonden in de CTGB database.`,
                field: 'products',
                details: { productName: productEntry.product, index: i }
            });
            warningCount++;
            continue;
        }

        // Normalize the product name to official CTGB name
        normalizedProducts[i].product = matchedProduct.naam;

        // Step 2: Validate on each selected parcel
        for (const parcel of selectedParcels) {
            const relevantHistory = parcelHistory.filter(h => h.parcelId === parcel.id);

            const validationResult = await validateSprayApplication(
                parcel,
                matchedProduct,
                productEntry.dosage,
                productEntry.unit,
                applicationDate,
                relevantHistory,
                ctgbProducts,
                undefined, // expectedHarvestDate
                productEntry.targetReason
            );

            // Collect flags (deduplicate by message)
            for (const flag of validationResult.flags) {
                const existingFlag = flags.find(f => f.message === flag.message);
                if (!existingFlag) {
                    flags.push(flag);
                    if (flag.type === 'error') errorCount++;
                    else if (flag.type === 'warning') warningCount++;
                    else infoCount++;
                }
            }

            // Collect matched targets
            if (validationResult.matchedTargets) {
                validationResult.matchedTargets.forEach((target, productName) => {
                    if (target.isAssumed) {
                        matchedTargets[productName] = target.targetOrganism;
                    }
                });
            }
        }
    }

    // Determine final status
    let status: LogStatus;
    if (errorCount > 0) {
        status = 'Afgekeurd';
    } else if (warningCount > 0) {
        status = 'Waarschuwing';
    } else {
        status = 'Akkoord';
    }

    // Build validation message
    const validationMessage = flags.length > 0
        ? flags.map(f => {
            const prefix = f.type === 'error' ? '❌' : f.type === 'warning' ? '⚠️' : 'ℹ️';
            return `${prefix} ${f.message}`;
        }).join('\n')
        : null;

    return {
        isValid: errorCount === 0,
        status,
        flags,
        errorCount,
        warningCount,
        infoCount,
        validationMessage,
        normalizedProducts,
        matchedTargets
    };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Zoek een CTGB product op basis van naam (fuzzy matching)
 */
function findCtgbProduct(
    searchName: string,
    productMap: Map<string, CtgbProduct>
): CtgbProduct | null {
    // Guard against undefined/null searchName
    if (!searchName || typeof searchName !== 'string') {
        return null;
    }

    const normalized = searchName.toLowerCase().trim();
    if (!normalized) {
        return null;
    }

    // Exact match
    if (productMap.has(normalized)) {
        return productMap.get(normalized)!;
    }

    // Partial match: zoek producten die beginnen met de zoekterm
    for (const [key, product] of productMap) {
        if (key.startsWith(normalized) || normalized.startsWith(key)) {
            return product;
        }
    }

    // Fuzzy match: zoek producten die de zoekterm bevatten
    for (const [key, product] of productMap) {
        if (key.includes(normalized) || normalized.includes(key)) {
            return product;
        }
    }

    // Word-based match: eerste woord moet matchen
    const searchFirstWord = normalized.split(/[\s-]/)[0];
    if (searchFirstWord.length >= 3) {
        for (const [key, product] of productMap) {
            const productFirstWord = key.split(/[\s-]/)[0];
            if (productFirstWord === searchFirstWord) {
                return product;
            }
        }
    }

    return null;
}

/**
 * Quick validation check - alleen de essentiële checks
 * Gebruik dit voor real-time feedback tijdens typen
 */
export function quickValidateProduct(
    productName: string,
    dosage: number,
    unit: string,
    parcelCrop: string,
    ctgbProducts: CtgbProduct[]
): { isValid: boolean; hint: string | null } {
    const productMap = new Map<string, CtgbProduct>();
    for (const p of ctgbProducts) {
        if (p.naam) productMap.set(p.naam.toLowerCase(), p);
    }

    const product = findCtgbProduct(productName, productMap);

    if (!product) {
        return { isValid: false, hint: `Product "${productName}" niet gevonden` };
    }

    // Check if product is allowed for this crop
    if (product.gebruiksvoorschriften && product.gebruiksvoorschriften.length > 0) {
        const cropAllowed = product.gebruiksvoorschriften.some(v =>
            v.gewas?.toLowerCase().includes(parcelCrop.toLowerCase())
        );

        if (!cropAllowed) {
            const allowedCrops = product.gebruiksvoorschriften
                .map(v => v.gewas)
                .filter(Boolean)
                .join(', ');
            return {
                isValid: false,
                hint: `${product.naam} is niet toegelaten voor ${parcelCrop}. Toegelaten voor: ${allowedCrops}`
            };
        }
    }

    return { isValid: true, hint: null };
}

// ============================================
// Simplified Validation (using v_active_parcels view)
// ============================================

import type { ActiveParcel } from './supabase-store';

export interface SimpleValidationInput {
    draft: DraftSprayData;
    parcels: ActiveParcel[];  // From v_active_parcels view
    ctgbProducts: CtgbProduct[];
    parcelHistory: ParcelHistoryEntry[];
    applicationDate?: Date;
}

/**
 * validateCtgbRulesSimple - Simplified validation using flattened parcel data
 *
 * This version works with ActiveParcel from the v_active_parcels view,
 * which already has crop/variety resolved. No complex joins needed.
 */
export async function validateCtgbRulesSimple(input: SimpleValidationInput): Promise<CtgbValidationResult> {
    const { draft, parcels, ctgbProducts, parcelHistory, applicationDate = new Date() } = input;

    const flags: ValidationFlag[] = [];
    const matchedTargets: Record<string, string> = {};
    const normalizedProducts: ProductEntry[] = JSON.parse(JSON.stringify(draft.products));

    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    // Build product lookup map
    const productMap = new Map<string, CtgbProduct>();
    for (const p of ctgbProducts) {
        if (p.naam) productMap.set(p.naam.toLowerCase(), p);
        if (p.toelatingsnummer) productMap.set(p.toelatingsnummer.toLowerCase(), p);
    }

    console.log(`[validateCtgbRulesSimple] Starting validation with ${parcels.length} parcels, ${draft.products.length} products`);

    // Step 1: Match parcels by ID (simple - view already flattened)
    const selectedParcels: ActiveParcel[] = [];
    const unmatchedPlots: string[] = [];

    for (const plotId of draft.plots) {
        const matched = parcels.find(p => p.id === plotId);
        if (matched) {
            selectedParcels.push(matched);
            console.log(`[validateCtgbRulesSimple] ✓ Matched "${matched.name}" (crop: ${matched.crop})`);
        } else {
            unmatchedPlots.push(plotId);
            console.warn(`[validateCtgbRulesSimple] ✗ No match for ID: ${plotId}`);
        }
    }

    // Check if we have parcels
    if (selectedParcels.length === 0) {
        flags.push({
            type: 'error',
            message: `Geen geldige percelen geselecteerd.${unmatchedPlots.length > 0 ? ` Niet gevonden: ${unmatchedPlots.length} IDs` : ''}`,
            field: 'plots'
        });
        errorCount++;
    } else if (unmatchedPlots.length > 0) {
        flags.push({
            type: 'warning',
            message: `${unmatchedPlots.length} percelen niet gevonden`,
            field: 'plots'
        });
        warningCount++;
    }

    // Step 2: Validate each product against selected parcels
    for (let i = 0; i < normalizedProducts.length; i++) {
        const productEntry = normalizedProducts[i];

        if (!productEntry?.product) {
            flags.push({
                type: 'warning',
                message: `Product op positie ${i + 1} heeft geen naam`,
                field: 'products'
            });
            warningCount++;
            continue;
        }

        // Find CTGB product
        const matchedProduct = findCtgbProduct(productEntry.product, productMap);

        if (!matchedProduct) {
            flags.push({
                type: 'warning',
                message: `Product "${productEntry.product}" niet gevonden in CTGB database`,
                field: 'products',
                details: { productName: productEntry.product }
            });
            warningCount++;
            continue;
        }

        // Normalize product name
        normalizedProducts[i].product = matchedProduct.naam;

        // Check each parcel using full validateSprayApplication (includes interval, dosage, etc.)
        for (const activeParcel of selectedParcels) {
            const crop = activeParcel.crop; // Already resolved from view!

            if (crop === 'Onbekend') {
                flags.push({
                    type: 'warning',
                    message: `Perceel "${activeParcel.name}" heeft geen gewas geconfigureerd`,
                    field: 'plots'
                });
                warningCount++;
                continue;
            }

            // Convert ActiveParcel to Parcel format for validateSprayApplication
            const parcelForValidation: Parcel = {
                id: activeParcel.id, // Use sprayable parcel ID for history matching!
                name: activeParcel.name,
                area: activeParcel.area ?? 0,
                crop: activeParcel.crop,
                variety: activeParcel.variety ?? undefined,
                location: activeParcel.location ? { lat: 0, lng: 0 } : undefined,
                geometry: activeParcel.geometry,
                source: (activeParcel.source as Parcel['source']) ?? undefined,
                rvoId: activeParcel.rvoId ?? undefined,
                subParcels: [{
                    id: activeParcel.id,
                    parcelId: activeParcel.parcelId,
                    crop: activeParcel.crop,
                    variety: activeParcel.variety ?? '',
                    area: activeParcel.area ?? 0,
                    irrigationType: '',
                }]
            };

            // Filter history for this specific parcel (using sprayable parcel ID)
            const relevantHistory = parcelHistory.filter(h => h.parcelId === activeParcel.id);

            // Run full validation (crop, dosage, interval, etc.)
            const validationResult = await validateSprayApplication(
                parcelForValidation,
                matchedProduct,
                productEntry.dosage,
                productEntry.unit,
                applicationDate,
                relevantHistory,
                ctgbProducts,
                undefined, // expectedHarvestDate
                productEntry.targetReason
            );

            // Collect flags from validation result
            for (const flag of validationResult.flags) {
                // Skip info messages about target organism (too verbose)
                if (flag.field === 'targetOrganism' && flag.type === 'info') {
                    continue;
                }

                // Deduplicate: check if we already have this exact message
                const existingFlag = flags.find(f => f.message === flag.message);
                if (!existingFlag) {
                    flags.push(flag);
                    if (flag.type === 'error') errorCount++;
                    else if (flag.type === 'warning') warningCount++;
                    else if (flag.type === 'info') infoCount++;
                }
            }

            // Store matched target if found
            for (const [productName, target] of validationResult.matchedTargets ?? []) {
                if (target.targetOrganism) {
                    matchedTargets[productName] = target.targetOrganism;
                }
            }
        }
    }

    // Determine final status
    let status: LogStatus;
    if (errorCount > 0) {
        status = 'Afgekeurd';
    } else if (warningCount > 0) {
        status = 'Waarschuwing';
    } else {
        status = 'Akkoord';
    }

    // Build validation message
    const validationMessage = flags.length > 0
        ? flags.map(f => {
            const prefix = f.type === 'error' ? '❌' : f.type === 'warning' ? '⚠️' : 'ℹ️';
            return `${prefix} ${f.message}`;
        }).join('\n')
        : null;

    console.log(`[validateCtgbRulesSimple] Complete: ${status} (${errorCount} errors, ${warningCount} warnings)`);

    return {
        isValid: errorCount === 0,
        status,
        flags,
        errorCount,
        warningCount,
        infoCount,
        validationMessage,
        normalizedProducts,
        matchedTargets
    };
}
