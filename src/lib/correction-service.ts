/**
 * Correction Service (Fase 3.1.1)
 *
 * Detecteert en verwerkt correcties in gebruikersinvoer.
 * Voorbeelden:
 * - "Nee, niet die" → verwijder laatste item
 * - "Verwijder de elstar" → verwijder specifiek perceel
 * - "Toch niet dat middel" → verwijder laatste product
 * - "Maak het 1.5 kg" → update dosering
 */

import { isDateSplitPattern } from '@/ai/schemas/intents';

// ============================================
// Types
// ============================================

export type CorrectionType =
    | 'remove_last_plot'      // "niet dat perceel", "niet die"
    | 'remove_last_product'   // "niet dat middel", "toch niet"
    | 'remove_specific_plot'  // "verwijder de elstar"
    | 'remove_specific_product' // "verwijder captan"
    | 'remove_all_plots'      // "geen percelen", "verwijder alle percelen"
    | 'remove_all_products'   // "geen middelen"
    | 'add_back_plots'        // "voeg weer toe", "nee voeg die toe" (3.1.3)
    | 'update_dosage'         // "maak het 1.5 kg", "nee, 2 liter"
    | 'update_date'           // "niet vandaag, gisteren"
    | 'replace_product'       // "niet surround maar captan", "nee het was captan"
    | 'cancel_all'            // "stop", "annuleer", "begin opnieuw"
    | 'confirm'               // "ja", "klopt", "bevestig"
    | 'undo'                  // "ongedaan maken", "undo", "herstel" (3.1.2)
    | 'none';                 // Geen correctie gedetecteerd

export interface CorrectionResult {
    type: CorrectionType;
    confidence: number;  // 0-1
    target?: string;     // Specifiek item dat verwijderd/gewijzigd moet worden
    targets?: string[];  // Meerdere items (bijv. "Busje en Jachthoek niet")
    newValue?: any;      // Nieuwe waarde bij update
    oldProduct?: string; // Voor replace_product: het te vervangen product
    explanation?: string; // Voor debugging
}

export interface ParcelInfo {
    id: string;
    name: string;
    variety?: string;
    crop?: string;
}

export interface DraftContext {
    plots: string[];          // Parcel IDs
    parcelInfo?: ParcelInfo[]; // Parcel metadata for name resolution
    products: Array<{
        product: string;
        dosage: number;
        unit: string;
    }>;
    date?: string;
}

// ============================================
// Correction Patterns
// ============================================

// Negatie patronen die correcties aanduiden
const NEGATION_PATTERNS = [
    /^nee\b/i,
    /^niet\b/i,
    /^nope\b/i,
    /toch\s*niet/i,
    /eigenlijk\s*niet/i,
    /^fout\b/i,
    /^verkeerd\b/i,
    /trouwens\s*niet/i,      // "Busje trouwens niet"
    /\bniets?\b.*$/i,         // Eindigt op "niet" - "Busje en Jachthoek niet"
    /maar\s*niet/i,          // "maar niet X"
    /hoeft\s*niet/i,         // "hoeft niet"
];

// Verwijder patronen
const REMOVE_PATTERNS = [
    /verwijder/i,
    /haal\s*(weg|eruit)/i,
    /schrap/i,
    /delete/i,
    /weg\s*met/i,
    /zonder/i,
    /behalve/i,
    /skip/i,
    /doe\s*(maar)?\s*niet/i,  // "doe maar niet X"
    /laat\s*(maar)?\s*weg/i,  // "laat weg"
];

// Update patronen
const UPDATE_PATTERNS = [
    /maak\s*(het|dat|die)?\s*(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)/i,
    /moet\s*(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)\s*zijn/i,
    /wijzig\s*(naar|in|tot)/i,
    /verander\s*(naar|in|tot)/i,
    /pas\s*aan/i,
];

// Pattern to extract product name before "moet" (e.g., "Surround moet 3 kg zijn" -> "Surround")
const PRODUCT_UPDATE_PATTERN = /(\w+)\s*moet\s*(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)/i;

// Product replacement patterns - for switching one product with another
// e.g., "niet surround maar captan", "nee het was captan niet surround"
const PRODUCT_REPLACE_PATTERNS = [
    // "niet X maar Y", "geen X maar Y"
    /(?:niet|geen)\s+(\w+)\s+maar\s+(\w+)/i,
    // "nee het was Y niet X", "nee het was Y"
    /nee\s+(?:het\s+)?was\s+(\w+)(?:\s+niet\s+(\w+))?/i,
    // "fout, moet X zijn", "verkeerd, X"
    /(?:fout|verkeerd)[,\s]+(?:moet\s+)?(\w+)(?:\s+zijn)?/i,
    // "ik bedoelde X", "sorry, X bedoel ik"
    /(?:ik\s+)?bedoel(?:de)?\s+(\w+)/i,
    // "sorry, X"
    /sorry[,\s]+(\w+)/i,
];

// Common product names for matching
const KNOWN_PRODUCTS = [
    'captan', 'merpan', 'surround', 'delan', 'scala', 'topsin', 'chorus',
    'bellis', 'frupica', 'teldor', 'switch', 'luna', 'geoxe', 'fontelis',
    'flint', 'folicur', 'score', 'syllit', 'thiram', 'malvin', 'dithane',
];

// Bevestiging patronen
const CONFIRM_PATTERNS = [
    /^ja\b/i,
    /^jep\b/i,
    /^yes\b/i,
    /^ok(ay|é)?\b/i,
    /^klopt\b/i,
    /^correct\b/i,
    /^goed\s*zo\b/i,
    /^prima\b/i,
    /^top\b/i,
    /bevestig/i,
    /sla\s*op/i,
];

// Annuleer patronen
const CANCEL_PATTERNS = [
    /^stop\b/i,
    /^annuleer/i,
    /^cancel/i,
    /begin\s*opnieuw/i,
    /start\s*over/i,
    /vergeet\s*(alles|het)/i,
    /laat\s*maar/i,
];

// Undo patronen (3.1.2)
const UNDO_PATTERNS = [
    /^undo\b/i,
    /ongedaan\s*(maken)?/i,
    /^herstel\b/i,
    /^terug\b/i,
    /vorige\s*stap/i,
    /ga\s*terug/i,
    /maak\s*ongedaan/i,
    /^ctrl.?z\b/i,  // In case someone types ctrl+z
];

// Add back patronen (3.1.3) - voor het terugzetten van verwijderde items
const ADD_BACK_PATTERNS = [
    /voeg\s*(ze|die|dat|die\s*percelen?)?\s*(weer|terug)?\s*toe/i,  // "voeg weer toe", "voeg die weer toe"
    /zet\s*(ze|die|dat)?\s*(weer|terug)\s*(erbij)?/i,              // "zet terug", "zet ze weer erbij"
    /toch\s*(wel|toevoegen)/i,                                       // "toch wel", "toch toevoegen"
    /nee\s*(voeg|zet).*toe/i,                                       // "nee voeg toe"
    /(voeg|zet)\s*(die|dat|ze)\s*(er)?\s*bij/i,                    // "voeg die erbij"
];

// Item type detectie
const PLOT_INDICATORS = [
    /perceel|percelen/i,
    /blok|blokken/i,
    /veld|velden/i,
    /boomgaard/i,
    /die|dat|deze|die\s*laatste/i,  // Als context over percelen gaat
];

const PRODUCT_INDICATORS = [
    /middel|middelen/i,
    /product|producten/i,
    /spuitmiddel/i,
    /dat\s*middel/i,
    /die\s*spray/i,
];

// ============================================
// Main Detection Function
// ============================================

/**
 * Detecteer of de gebruikersinvoer een correctie is
 */
export function detectCorrection(
    input: string,
    draft: DraftContext | null
): CorrectionResult {
    const normalizedInput = input.toLowerCase().trim();

    // Bug 2 Fix: Skip correction detection for date-split patterns
    // These should be handled by the intent router, not the correction service
    // Patterns like "Stadhoek heb ik gisteren gespoten" look like removal/modification
    // but are actually date-split requests
    if (draft && isDateSplitPattern(normalizedInput)) {
        return {
            type: 'none',
            confidence: 0,
            explanation: 'Date-split patroon gedetecteerd - geen correctie'
        };
    }

    // 1. Check voor bevestiging (hoogste prioriteit bij slot filling)
    if (CONFIRM_PATTERNS.some(p => p.test(normalizedInput))) {
        return {
            type: 'confirm',
            confidence: 0.9,
            explanation: 'Bevestigingspatroon gedetecteerd'
        };
    }

    // 2. Check voor volledige annulering
    if (CANCEL_PATTERNS.some(p => p.test(normalizedInput))) {
        return {
            type: 'cancel_all',
            confidence: 0.9,
            explanation: 'Annuleringspatroon gedetecteerd'
        };
    }

    // 2.5. Check voor undo (3.1.2)
    if (UNDO_PATTERNS.some(p => p.test(normalizedInput))) {
        return {
            type: 'undo',
            confidence: 0.9,
            explanation: 'Undo/herstel patroon gedetecteerd'
        };
    }

    // 2.55. Check voor product replacement (e.g., "niet surround maar captan")
    // This must come BEFORE other negation checks to catch replacement patterns
    for (const pattern of PRODUCT_REPLACE_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            // Extract product names from the match
            let newProduct: string | null = null;
            let oldProduct: string | null = null;

            if (pattern.source.includes('maar')) {
                // "niet X maar Y" pattern - X is old, Y is new
                oldProduct = match[1]?.toLowerCase();
                newProduct = match[2]?.toLowerCase();
            } else if (pattern.source.includes('was')) {
                // "nee het was Y niet X" pattern - Y is new, X is old (optional)
                newProduct = match[1]?.toLowerCase();
                oldProduct = match[2]?.toLowerCase();
            } else {
                // Other patterns - just the new product
                newProduct = match[1]?.toLowerCase();
            }

            // Validate that the new product is a known product
            if (newProduct && KNOWN_PRODUCTS.includes(newProduct)) {
                // If we have a draft and oldProduct is not specified, use draft's product
                if (!oldProduct && draft?.products?.length) {
                    oldProduct = draft.products[0].product.toLowerCase();
                }

                return {
                    type: 'replace_product',
                    confidence: 0.85,
                    target: newProduct,
                    oldProduct: oldProduct,
                    explanation: `Product vervanging: ${oldProduct || 'huidig product'} → ${newProduct}`
                };
            }
        }
    }

    // 2.6. Check voor "voeg toe" / "zet terug" (3.1.3) - BEFORE remove checks!
    if (ADD_BACK_PATTERNS.some(p => p.test(normalizedInput))) {
        return {
            type: 'add_back_plots',
            confidence: 0.9,
            explanation: 'Toevoegen/terugzetten patroon gedetecteerd - gebruik undo'
        };
    }

    // 3. Check voor negatie + specifieke update (bijv. "nee, 1.5 kg")
    const dosageMatch = normalizedInput.match(/(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)/i);
    if (dosageMatch && NEGATION_PATTERNS.some(p => p.test(normalizedInput))) {
        const amount = parseFloat(dosageMatch[1].replace(',', '.'));
        const unit = normalizeUnit(dosageMatch[2]);

        return {
            type: 'update_dosage',
            confidence: 0.85,
            newValue: { amount, unit },
            explanation: `Dosering correctie: ${amount} ${unit}`
        };
    }

    // 4. Check voor expliciete verwijder commando's
    const hasRemovePattern = REMOVE_PATTERNS.some(p => p.test(normalizedInput));

    if (hasRemovePattern) {
        // Bepaal wat verwijderd moet worden
        const targetInfo = extractRemovalTarget(normalizedInput, draft);
        return targetInfo;
    }

    // 5. Check voor negatie zonder specifiek commando
    const hasNegation = NEGATION_PATTERNS.some(p => p.test(normalizedInput));

    if (hasNegation && draft) {
        // FIRST: Check if specific items are mentioned in the negation
        // This handles "Busje en Jachthoek niet" or "Busje trouwens niet"
        const specificTarget = extractRemovalTarget(input, draft);
        if (specificTarget.type !== 'none' && specificTarget.confidence > 0.5) {
            // We found specific items mentioned in the negation
            return specificTarget;
        }

        // Probeer te bepalen wat de negatie betreft
        const isAboutPlots = PLOT_INDICATORS.some(p => p.test(normalizedInput));
        const isAboutProducts = PRODUCT_INDICATORS.some(p => p.test(normalizedInput));

        // "Niet die" of "niet dat" zonder context → verwijder laatste item
        if (/niet\s*(die|dat|deze)(\s*laatste)?/i.test(normalizedInput)) {
            // Context bepaalt of het perceel of product is
            if (isAboutProducts || normalizedInput.includes('middel')) {
                return {
                    type: 'remove_last_product',
                    confidence: 0.8,
                    explanation: 'Negatie met "die/dat" → laatste product'
                };
            }
            // Default naar perceel als er percelen zijn
            if (draft.plots.length > 0) {
                return {
                    type: 'remove_last_plot',
                    confidence: 0.75,
                    explanation: 'Negatie met "die/dat" → laatste perceel'
                };
            }
        }

        // Algemene negatie → check context
        if (isAboutPlots) {
            return {
                type: 'remove_last_plot',
                confidence: 0.7,
                explanation: 'Negatie over percelen'
            };
        }

        if (isAboutProducts) {
            return {
                type: 'remove_last_product',
                confidence: 0.7,
                explanation: 'Negatie over producten'
            };
        }
    }

    // 6. Check voor update patronen
    for (const pattern of UPDATE_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            // Extract the new value
            const valueMatch = normalizedInput.match(/(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)/i);
            if (valueMatch) {
                // Try to extract product name from "X moet Y kg zijn" pattern
                const productMatch = input.match(PRODUCT_UPDATE_PATTERN);
                const targetProduct = productMatch?.[1]?.toLowerCase();

                return {
                    type: 'update_dosage',
                    confidence: 0.85,
                    target: targetProduct,  // Product name to update (e.g., "surround")
                    newValue: {
                        amount: parseFloat(valueMatch[1].replace(',', '.')),
                        unit: normalizeUnit(valueMatch[2])
                    },
                    explanation: targetProduct
                        ? `Update dosering van ${targetProduct} naar ${valueMatch[1]} ${valueMatch[2]}`
                        : 'Update patroon met dosering'
                };
            }
        }
    }

    // Geen correctie gedetecteerd
    return {
        type: 'none',
        confidence: 0,
        explanation: 'Geen correctiepatroon gevonden'
    };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract wat specifiek verwijderd moet worden
 * Ondersteunt nu meerdere targets, parcel name resolution, EN variety-based exclusions
 */
function extractRemovalTarget(
    input: string,
    draft: DraftContext | null
): CorrectionResult {
    const normalizedInput = input.toLowerCase();

    // Check voor "alle" verwijderingen
    if (/alle\s*(percelen|blokken|velden)/i.test(input)) {
        return {
            type: 'remove_all_plots',
            confidence: 0.9,
            explanation: 'Verwijder alle percelen'
        };
    }

    if (/alle\s*(middelen|producten)/i.test(input)) {
        return {
            type: 'remove_all_products',
            confidence: 0.9,
            explanation: 'Verwijder alle producten'
        };
    }

    // Check voor specifieke perceel namen in de input (using parcelInfo for name resolution)
    // IMPORTANT: Skip this if parcelInfo is not available - let the AI handle it instead
    if (draft && draft.parcelInfo && draft.parcelInfo.length > 0) {
        // === FIRST: Check for VARIETY-based exclusions ===
        // Patterns like "de tessa trouwens niet", "de elstars niet", "tessa niet"
        // Should remove ALL parcels with that variety
        const varietyExcludePatterns = [
            /(?:de\s+)?(\w+?)(?:s|\'s)?\s+trouwens\s+niet/i,  // "de tessa trouwens niet"
            /de\s+(\w+?)(?:s|\'s)?\s+niet/i,                   // "de tessa niet"
            /niet\s+(?:de\s+)?(\w+?)(?:s|\'s)?(?:\s|$)/i,     // "niet de tessa"
            /(?:behalve|zonder)\s+(?:de\s+)?(\w+?)(?:s|\'s)?(?:\s|$)/i, // "behalve tessa"
        ];

        // Known varieties for matching
        const knownVarieties = new Set([
            'tessa', 'elstar', 'jonagold', 'braeburn', 'golden', 'boskoop', 'goudreinette',
            'greenstar', 'kanzi', 'junami', 'wellant', 'delbar', 'fuji', 'gala', 'granny',
            'cox', 'santana', 'topaz', 'rubinette', 'honeycrisp', 'jazz', 'red prince',
            'conference', 'doyenne', 'comice', 'gieser', 'concorde', 'xenia', 'williams'
        ]);

        for (const pattern of varietyExcludePatterns) {
            const match = normalizedInput.match(pattern);
            if (match) {
                let varietyName = match[1].toLowerCase();
                // Strip trailing 's' if present
                if (varietyName.endsWith('s') && !varietyName.endsWith('ss')) {
                    const stripped = varietyName.slice(0, -1);
                    if (knownVarieties.has(stripped)) {
                        varietyName = stripped;
                    }
                }

                // Check if this is a known variety
                if (knownVarieties.has(varietyName)) {
                    // Find ALL parcels with this variety in the current draft
                    const searchableItems = draft.parcelInfo.filter(p => draft.plots.includes(p.id));
                    const matchedPlotIds: string[] = [];
                    const matchedPlotNames: string[] = [];

                    for (const parcel of searchableItems) {
                        const parcelVariety = parcel.variety?.toLowerCase();
                        if (parcelVariety &&
                            (parcelVariety === varietyName ||
                             parcelVariety.includes(varietyName) ||
                             varietyName.includes(parcelVariety))) {
                            matchedPlotIds.push(parcel.id);
                            matchedPlotNames.push(parcel.name);
                        }
                    }

                    if (matchedPlotIds.length > 0) {
                        return {
                            type: 'remove_specific_plot',
                            confidence: 0.95,
                            target: matchedPlotIds[0],
                            targets: matchedPlotIds,
                            explanation: `Verwijder alle ${varietyName} percelen: ${matchedPlotNames.join(', ')}`
                        };
                    }
                }
            }
        }

        // === THEN: Check for specific parcel names ===
        const matchedPlotIds: string[] = [];
        const matchedPlotNames: string[] = [];

        // Build searchable list from parcelInfo (only if available)
        const searchableItems = draft.parcelInfo.filter(p => draft.plots.includes(p.id));

        // Extract words from input for smarter matching
        const inputWords = normalizedInput.split(/\s+/).filter(w => w.length > 2);

        // Check each parcel name against the input
        // IMPORTANT: Variety alone is NOT enough - the parcel name must also match!
        for (const parcel of searchableItems) {
            const nameLower = parcel.name.toLowerCase();
            const varietyLower = parcel.variety?.toLowerCase();

            // Split parcel name into parts (e.g., "Thuis Coleswei" -> ["thuis", "coleswei"])
            const nameParts = nameLower.split(/\s+/).filter(w => w.length > 2);

            // A parcel matches if:
            // 1. The full name is in the input, OR
            // 2. At least one significant part of the name is in the input (but NOT just the variety)
            const fullNameMatch = normalizedInput.includes(nameLower);
            const partialNameMatch = nameParts.some(part =>
                inputWords.includes(part) && part !== varietyLower
            );

            // Match with variety context: "plantsoen conference" should match "Plantsoen (Conference)"
            // but "conference" alone should NOT match all Conference parcels
            const nameWithVarietyMatch = varietyLower && nameParts.some(part =>
                normalizedInput.includes(part) && normalizedInput.includes(varietyLower)
            );

            if (fullNameMatch || partialNameMatch || nameWithVarietyMatch) {
                matchedPlotIds.push(parcel.id);
                matchedPlotNames.push(parcel.name);
            }
        }

        // If we found matching parcels
        if (matchedPlotIds.length > 0) {
            return {
                type: 'remove_specific_plot',
                confidence: 0.9,
                target: matchedPlotIds[0],  // Keep single target for backwards compat
                targets: matchedPlotIds,    // All matched IDs
                explanation: `Specifiek percelen verwijderen: ${matchedPlotNames.join(', ')}`
            };
        }

        // Check voor specifieke product namen
        const matchedProducts: string[] = [];
        for (const product of draft.products) {
            const productLower = product.product.toLowerCase();
            // Check for exact match or partial match (e.g., "captan" matches "Captan 80 WDG")
            if (normalizedInput.includes(productLower) ||
                productLower.split(' ').some(word => normalizedInput.includes(word) && word.length > 3)) {
                matchedProducts.push(product.product);
            }
        }

        if (matchedProducts.length > 0) {
            return {
                type: 'remove_specific_product',
                confidence: 0.85,
                target: matchedProducts[0],
                targets: matchedProducts,
                explanation: `Specifiek producten verwijderen: ${matchedProducts.join(', ')}`
            };
        }
    }

    // Check of het over percelen of producten gaat
    const isAboutPlots = PLOT_INDICATORS.some(p => p.test(input));
    const isAboutProducts = PRODUCT_INDICATORS.some(p => p.test(input));

    if (isAboutPlots && !isAboutProducts) {
        return {
            type: 'remove_last_plot',
            confidence: 0.7,
            explanation: 'Verwijder commando over percelen'
        };
    }

    if (isAboutProducts && !isAboutPlots) {
        return {
            type: 'remove_last_product',
            confidence: 0.7,
            explanation: 'Verwijder commando over producten'
        };
    }

    // Kan niet bepalen wat verwijderd moet worden
    return {
        type: 'none',
        confidence: 0.3,
        explanation: 'Verwijder commando maar onduidelijk wat'
    };
}

/**
 * Normalize unit strings
 */
function normalizeUnit(unit: string): string {
    const normalized = unit.toLowerCase();
    if (normalized === 'liter' || normalized === 'l') return 'L';
    if (normalized === 'kg') return 'kg';
    if (normalized === 'g') return 'g';
    if (normalized === 'ml') return 'ml';
    return normalized;
}

// ============================================
// Apply Correction to Draft
// ============================================

/**
 * Pas een correctie toe op de draft
 */
export function applyCorrection(
    correction: CorrectionResult,
    draft: DraftContext
): DraftContext {
    const newDraft = {
        plots: [...draft.plots],
        products: [...draft.products],
        date: draft.date
    };

    switch (correction.type) {
        case 'remove_last_plot':
            if (newDraft.plots.length > 0) {
                newDraft.plots.pop();
            }
            break;

        case 'remove_last_product':
            if (newDraft.products.length > 0) {
                newDraft.products.pop();
            }
            break;

        case 'remove_specific_plot':
            // Support multiple targets
            if (correction.targets && correction.targets.length > 0) {
                const targetsLower = new Set(correction.targets.map(t => t.toLowerCase()));
                newDraft.plots = newDraft.plots.filter(
                    p => !targetsLower.has(p.toLowerCase())
                );
            } else if (correction.target) {
                newDraft.plots = newDraft.plots.filter(
                    p => p.toLowerCase() !== correction.target!.toLowerCase()
                );
            }
            break;

        case 'remove_specific_product':
            // Support multiple targets
            if (correction.targets && correction.targets.length > 0) {
                const targetsLower = new Set(correction.targets.map(t => t.toLowerCase()));
                newDraft.products = newDraft.products.filter(
                    p => !targetsLower.has(p.product.toLowerCase())
                );
            } else if (correction.target) {
                newDraft.products = newDraft.products.filter(
                    p => p.product.toLowerCase() !== correction.target!.toLowerCase()
                );
            }
            break;

        case 'remove_all_plots':
            newDraft.plots = [];
            break;

        case 'remove_all_products':
            newDraft.products = [];
            break;

        case 'update_dosage':
            if (correction.newValue && newDraft.products.length > 0) {
                // Find the target product by name, or use the last one
                let productToUpdate = newDraft.products[newDraft.products.length - 1];

                if (correction.target) {
                    const targetLower = correction.target.toLowerCase();
                    // Find product by partial name match (e.g., "surround" matches "SURROUND® WP...")
                    const matchedProduct = newDraft.products.find(p =>
                        p.product.toLowerCase().includes(targetLower) ||
                        targetLower.includes(p.product.toLowerCase().split(' ')[0].replace(/[®™]/g, ''))
                    );
                    if (matchedProduct) {
                        productToUpdate = matchedProduct;
                    }
                }

                productToUpdate.dosage = correction.newValue.amount;
                productToUpdate.unit = correction.newValue.unit;
            }
            break;

        case 'replace_product':
            // Replace one product with another
            if (correction.target && newDraft.products.length > 0) {
                const newProductName = correction.target;
                const oldProductName = correction.oldProduct;

                // Find the product to replace (by oldProduct name or first product)
                let productIndex = 0;
                if (oldProductName) {
                    const idx = newDraft.products.findIndex(p =>
                        p.product.toLowerCase().includes(oldProductName)
                    );
                    if (idx >= 0) productIndex = idx;
                }

                // Keep the dosage and unit from the old product
                const oldDosage = newDraft.products[productIndex].dosage;
                const oldUnit = newDraft.products[productIndex].unit;

                // Replace with the new product name (capitalize first letter)
                const capitalizedName = newProductName.charAt(0).toUpperCase() + newProductName.slice(1);
                newDraft.products[productIndex] = {
                    product: capitalizedName,
                    dosage: oldDosage,
                    unit: oldUnit
                };
            }
            break;

        case 'cancel_all':
            newDraft.plots = [];
            newDraft.products = [];
            newDraft.date = undefined;
            break;
    }

    return newDraft;
}

/**
 * Genereer een response message voor de correctie
 */
export function getCorrectionMessage(
    correction: CorrectionResult,
    draft: DraftContext,
    newDraft: DraftContext
): string {
    switch (correction.type) {
        case 'remove_last_plot':
            const removedPlot = draft.plots[draft.plots.length - 1];
            return `Oké, ik heb "${removedPlot}" verwijderd. ${newDraft.plots.length} percelen over.`;

        case 'remove_last_product':
            const removedProduct = draft.products[draft.products.length - 1];
            return `Oké, ik heb "${removedProduct.product}" verwijderd. ${newDraft.products.length} middelen over.`;

        case 'remove_specific_plot':
            if (correction.targets && correction.targets.length > 1) {
                // Find names from parcelInfo if available
                const names = draft.parcelInfo
                    ? correction.targets.map(id => {
                        const info = draft.parcelInfo!.find(p => p.id === id);
                        return info?.name || id;
                    })
                    : correction.targets;
                return `Oké, ik heb ${names.join(' en ')} verwijderd. ${newDraft.plots.length} percelen over.`;
            }
            // Single target - try to find name
            const singleName = draft.parcelInfo
                ? draft.parcelInfo.find(p => p.id === correction.target)?.name || correction.target
                : correction.target;
            return `Oké, ik heb "${singleName}" verwijderd. ${newDraft.plots.length} percelen over.`;

        case 'remove_specific_product':
            if (correction.targets && correction.targets.length > 1) {
                return `Oké, ik heb ${correction.targets.join(' en ')} verwijderd. ${newDraft.products.length} middelen over.`;
            }
            return `Oké, ik heb "${correction.target}" verwijderd. ${newDraft.products.length} middelen over.`;

        case 'remove_all_plots':
            return 'Oké, alle percelen zijn verwijderd.';

        case 'remove_all_products':
            return 'Oké, alle middelen zijn verwijderd.';

        case 'update_dosage':
            if (correction.newValue) {
                return `Oké, de dosering is aangepast naar ${correction.newValue.amount} ${correction.newValue.unit}.`;
            }
            return 'Oké, de dosering is aangepast.';

        case 'replace_product':
            const newProductName = correction.target || 'nieuw product';
            const oldProductName = correction.oldProduct || 'oud product';
            return `Oké, ik heb ${oldProductName} vervangen door ${newProductName}.`;

        case 'cancel_all':
            return 'Oké, de registratie is geannuleerd. Je kunt opnieuw beginnen.';

        case 'confirm':
            return 'Begrepen!';

        case 'undo':
            return 'Oké, de laatste actie is ongedaan gemaakt.';

        case 'add_back_plots':
            return 'Oké, ik zet de verwijderde percelen weer terug.';

        default:
            return '';
    }
}
