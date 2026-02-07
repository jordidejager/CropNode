/**
 * Correction Service (Fase 3.1.1 + Multi-Turn Upgrade)
 *
 * Detecteert en verwerkt correcties in gebruikersinvoer.
 * Ondersteunt zowel simpele DraftContext als complexe SprayRegistrationGroup.
 *
 * Simpele correcties:
 * - "Nee, niet die" → verwijder laatste item
 * - "Verwijder de elstar" → verwijder specifiek perceel
 * - "Toch niet dat middel" → verwijder laatste product
 * - "Maak het 1.5 kg" → update dosering
 *
 * Multi-turn correcties (werkt met SprayRegistrationGroup):
 * - "Nee de Merpan is 0,5" → update dosering voor specifiek product
 * - "Oh en de Kanzi ook" → voeg perceel toe aan bestaande registratie
 * - "Perceel X was trouwens gisteren" → split naar eigen unit met andere datum
 * - "Bij de Conference nog Score bijgedaan" → voeg product toe aan specifieke percelen
 * - "De Conference maar 1.5L" → split perceel met afwijkende dosering
 * - "Niet Merpan maar Captan" → vervang product in alle units
 */

import { isDateSplitPattern } from '@/ai/schemas/intents';
import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry } from '@/lib/types';

// ============================================
// Types
// ============================================

export type CorrectionType =
    // === Basic Corrections (existing) ===
    | 'remove_last_plot'      // "niet dat perceel", "niet die"
    | 'remove_last_product'   // "niet dat middel", "toch niet"
    | 'remove_specific_plot'  // "verwijder de elstar"
    | 'remove_specific_product' // "verwijder captan"
    | 'remove_all_plots'      // "geen percelen", "verwijder alle percelen"
    | 'remove_all_products'   // "geen middelen"
    | 'add_back_plots'        // "voeg weer toe", "nee voeg die toe" (3.1.3)
    | 'update_dosage'         // "maak het 1.5 kg", "nee, 2 liter" (global)
    | 'update_date'           // "niet vandaag, gisteren"
    | 'replace_product'       // "niet surround maar captan", "nee het was captan"
    | 'cancel_all'            // "stop", "annuleer", "begin opnieuw"
    | 'confirm'               // "ja", "klopt", "bevestig"
    | 'undo'                  // "ongedaan maken", "undo", "herstel" (3.1.2)
    // === Multi-Turn Corrections (new) ===
    | 'update_dosage_specific'    // "nee de merpan is 0,5" - dosering voor specifiek product
    | 'add_plot_to_existing'      // "oh en de Kanzi ook" - perceel toevoegen aan base registratie
    | 'add_plot_different_date'   // "perceel X was trouwens gisteren" - perceel met eigen datum
    | 'add_product_to_plots'      // "bij perceel Y nog Score bijgedaan" - product aan subset
    | 'update_dosage_for_plots'   // "perceel XY maar halve dosering" - dosering voor subset
    | 'swap_product'              // "niet Merpan maar Captan" - product vervangen
    | 'update_date_for_plots'     // "de Conference was eergisteren" - datum wijzigen voor subset
    | 'override_dosage_for_plots' // "Conference maar 1.5" - afwijkende dosering voor subset
    | 'none';                     // Geen correctie gedetecteerd

/**
 * Extended entities for multi-turn corrections
 */
export interface CorrectionEntities {
    // Target product (for product-specific operations)
    targetProduct?: string;
    // Target parcels (by name or variety)
    targetParcels?: string[];        // Parcel IDs or names
    targetVariety?: string;          // Variety name (e.g., "Conference")
    targetCrop?: string;             // Crop type (e.g., "peren")
    // Values
    newDosage?: { amount: number; unit: string };
    newDate?: Date;
    newProduct?: string;             // For add_product_to_plots or swap_product
    // Modifiers
    dosageMultiplier?: number;       // e.g., 0.5 for "halve dosering"
    reason?: string;                 // e.g., "reduced_dosage", "different_timing"
}

export interface CorrectionResult {
    type: CorrectionType;
    confidence: number;  // 0-1
    target?: string;     // Specifiek item dat verwijderd/gewijzigd moet worden
    targets?: string[];  // Meerdere items (bijv. "Busje en Jachthoek niet")
    newValue?: any;      // Nieuwe waarde bij update
    oldProduct?: string; // Voor replace_product: het te vervangen product
    explanation?: string; // Voor debugging
    // Extended entities for multi-turn corrections
    entities?: CorrectionEntities;
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
// Multi-Turn Correction Patterns (NEW)
// ============================================

// Pattern: "nee de merpan is 0,5" / "dosering captan moet 2L" / "score op 0.3"
const SPECIFIC_PRODUCT_DOSAGE_PATTERNS = [
    // "de merpan is 0.5", "merpan is 0,5" (with optional unit)
    /(?:de\s+)?(\w+)\s+(?:is|op)\s+(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)?/i,
    // "dosering merpan moet 0.5 zijn", "dosering van captan is 2"
    /dosering\s+(?:van\s+)?(\w+)\s+(?:moet|is)\s+(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)?/i,
    // "nee de merpan 0.5" - very short form (with optional unit)
    /(?:nee\s+)?(?:de\s+)?(\w+)\s+(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)?/i,
    // "nee dosering is 0,5" - without product name, means update all/single product
    /(?:nee\s+)?dosering\s+(?:is|op|moet)\s+(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)?/i,
];

// Pattern: "oh en de Kanzi ook" / "perceel X ook" / "doe de Elstar er ook bij"
const ADD_PLOT_PATTERNS = [
    // "oh en de Kanzi ook", "en de Conference ook", "Elstar ook"
    /(?:oh\s+)?(?:en\s+)?(?:de\s+)?(\w+)\s+ook/i,
    // "perceel X ook", "perceel Stadhoek er ook bij"
    /perceel\s+(\w+)\s+(?:er\s+)?ook(?:\s+bij)?/i,
    // "doe de X er ook bij", "voeg X toe"
    /(?:doe\s+)?(?:de\s+)?(\w+)\s+(?:er\s+)?(?:ook\s+)?bij/i,
];

// Pattern: "perceel X was trouwens gisteren" / "de Kanzi heb ik maandag gedaan"
const ADD_PLOT_DIFFERENT_DATE_PATTERNS = [
    // "perceel X was gisteren/maandag/..."
    /perceel\s+(\w+)\s+was\s+(?:trouwens\s+)?(gisteren|eergisteren|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|\d{1,2}[-\/]\d{1,2})/i,
    // "de X heb ik gisteren gedaan"
    /(?:de\s+)?(\w+)\s+heb\s+ik\s+(gisteren|eergisteren|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|\d{1,2}[-\/]\d{1,2})\s+(?:gedaan|gespoten)/i,
    // "X was trouwens gisteren"
    /(\w+)\s+was\s+(?:trouwens\s+)?(gisteren|eergisteren|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)/i,
];

// Pattern: "bij perceel Y nog Score bijgedaan" / "de Conference ook met Delan"
const ADD_PRODUCT_TO_PLOTS_PATTERNS = [
    // "bij perceel X nog Y bijgedaan"
    /bij\s+(?:perceel\s+)?(\w+)\s+(?:nog\s+)?(\w+)\s+(?:bijgedaan|erbij|toegevoegd)/i,
    // "bij de X nog Y bijgedaan" (variety-based)
    /bij\s+(?:de\s+)?(\w+)\s+(?:nog\s+)?(\w+)\s+(?:bijgedaan|erbij|toegevoegd)/i,
    // "de Conference ook met Delan", "Kanzi ook met Score"
    /(?:de\s+)?(\w+)\s+ook\s+(?:met|plus)\s+(\w+)/i,
    // "voor X nog Y gespoten"
    /(?:voor|op)\s+(?:de\s+)?(\w+)\s+(?:nog\s+)?(\w+)\s+gespoten/i,
];

// Pattern: "perceel XY maar halve dosering" / "de Conference op 1.5L"
const DOSAGE_FOR_PLOTS_PATTERNS = [
    // "perceel X maar halve dosering", "Kanzi halve dosering"
    /(?:perceel\s+)?(\w+)\s+(?:maar\s+)?halve\s+dosering/i,
    // "de Conference op 1.5L", "Stadhoek 2L"
    /(?:de\s+)?(\w+)\s+(?:op\s+)?(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)/i,
    // "voor X maar 1.5", "X maar 1.5 kg"
    /(?:voor\s+)?(?:de\s+)?(\w+)\s+maar\s+(\d+[,.]?\d*)\s*(kg|l|liter|ml|g)?/i,
];

// Pattern: "de Conference was eergisteren" / "stadhoek en thuis waren maandag"
const DATE_FOR_PLOTS_PATTERNS = [
    // "de X was eergisteren", "Conference was gisteren"
    /(?:de\s+)?(\w+)\s+was\s+(gisteren|eergisteren|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)/i,
    // "X en Y waren maandag"
    /(\w+(?:\s+en\s+\w+)*)\s+waren\s+(gisteren|eergisteren|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)/i,
];

// Pattern: "niet Merpan maar Captan" / "vervang Score door Bellis"
const SWAP_PRODUCT_PATTERNS = [
    // "niet X maar Y", "geen X maar Y"
    /(?:niet|geen)\s+(\w+)\s+maar\s+(\w+)/i,
    // "vervang X door Y", "wissel X met Y"
    /(?:vervang|wissel)\s+(\w+)\s+(?:door|met|voor)\s+(\w+)/i,
    // "X moet Y zijn", "X wordt Y"
    /(\w+)\s+(?:moet|wordt)\s+(\w+)(?:\s+zijn)?/i,
];

// Known varieties for parcel matching
const KNOWN_VARIETIES = new Set([
    'tessa', 'elstar', 'jonagold', 'braeburn', 'golden', 'boskoop', 'goudreinette',
    'greenstar', 'kanzi', 'junami', 'wellant', 'delbar', 'fuji', 'gala', 'granny',
    'cox', 'santana', 'topaz', 'rubinette', 'honeycrisp', 'jazz', 'red prince',
    'conference', 'doyenne', 'comice', 'gieser', 'concorde', 'xenia', 'williams',
    'stadhoek', 'thuis', 'plantsoen', 'busje', 'jachthoek', 'schele', 'coleswei'  // Common parcel names
]);

// ============================================
// Date Parsing Helper
// ============================================

/**
 * Parse relative date strings to Date objects
 */
function parseRelativeDate(dateStr: string): Date {
    const now = new Date();
    const lower = dateStr.toLowerCase();

    if (lower === 'gisteren') {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d;
    }
    if (lower === 'eergisteren') {
        const d = new Date(now);
        d.setDate(d.getDate() - 2);
        return d;
    }

    // Day of week
    const days = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    const dayIndex = days.indexOf(lower);
    if (dayIndex >= 0) {
        const d = new Date(now);
        const currentDay = d.getDay();
        let diff = currentDay - dayIndex;
        if (diff <= 0) diff += 7; // Go back to previous week
        d.setDate(d.getDate() - diff);
        return d;
    }

    // Try to parse as date string
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return now;
}

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
                    oldProduct: oldProduct || undefined,
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

    // ============================================
    // 2.7. Multi-Turn Correction Detection (NEW)
    // ============================================

    // 2.7.1. Check for swap_product: "niet Merpan maar Captan", "vervang Score door Bellis"
    for (const pattern of SWAP_PRODUCT_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            const oldProduct = match[1]?.toLowerCase();
            const newProduct = match[2]?.toLowerCase();

            // Both must be known products for swap
            if (oldProduct && newProduct &&
                (KNOWN_PRODUCTS.includes(oldProduct) || KNOWN_PRODUCTS.includes(newProduct))) {
                return {
                    type: 'swap_product',
                    confidence: 0.9,
                    oldProduct: oldProduct,
                    target: newProduct,
                    entities: {
                        targetProduct: oldProduct,
                        newProduct: newProduct
                    },
                    explanation: `Product swap: ${oldProduct} → ${newProduct}`
                };
            }
        }
    }

    // 2.7.2. Check for add_product_to_plots: "bij perceel Y nog Score bijgedaan"
    for (const pattern of ADD_PRODUCT_TO_PLOTS_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            const parcelName = match[1]?.toLowerCase();
            const productName = match[2]?.toLowerCase();

            if (parcelName && productName && KNOWN_PRODUCTS.includes(productName)) {
                return {
                    type: 'add_product_to_plots',
                    confidence: 0.85,
                    target: productName,
                    entities: {
                        targetParcels: [parcelName],
                        targetVariety: KNOWN_VARIETIES.has(parcelName) ? parcelName : undefined,
                        newProduct: productName
                    },
                    explanation: `Product ${productName} toevoegen aan ${parcelName}`
                };
            }
        }
    }

    // 2.7.3. Check for add_plot_different_date: "perceel X was trouwens gisteren"
    for (const pattern of ADD_PLOT_DIFFERENT_DATE_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            const parcelName = match[1]?.toLowerCase();
            const dateStr = match[2]?.toLowerCase();

            if (parcelName && dateStr) {
                const parsedDate = parseRelativeDate(dateStr);
                return {
                    type: 'add_plot_different_date',
                    confidence: 0.85,
                    target: parcelName,
                    entities: {
                        targetParcels: [parcelName],
                        targetVariety: KNOWN_VARIETIES.has(parcelName) ? parcelName : undefined,
                        newDate: parsedDate,
                        reason: 'different_timing'
                    },
                    explanation: `Perceel ${parcelName} met afwijkende datum ${dateStr}`
                };
            }
        }
    }

    // 2.7.4. Check for update_date_for_plots: "de Conference was eergisteren"
    for (const pattern of DATE_FOR_PLOTS_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            // Could be single or multiple parcels (X en Y)
            const parcelStr = match[1]?.toLowerCase();
            const dateStr = match[2]?.toLowerCase();

            if (parcelStr && dateStr) {
                const parcels = parcelStr.split(/\s+en\s+/).map(p => p.trim());
                const parsedDate = parseRelativeDate(dateStr);
                return {
                    type: 'update_date_for_plots',
                    confidence: 0.85,
                    targets: parcels,
                    entities: {
                        targetParcels: parcels,
                        newDate: parsedDate
                    },
                    explanation: `Datum wijzigen voor ${parcels.join(', ')} naar ${dateStr}`
                };
            }
        }
    }

    // 2.7.5. Check for add_plot_to_existing: "oh en de Kanzi ook"
    for (const pattern of ADD_PLOT_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            const parcelName = match[1]?.toLowerCase();

            // Must be a known variety or parcel name
            if (parcelName && KNOWN_VARIETIES.has(parcelName)) {
                return {
                    type: 'add_plot_to_existing',
                    confidence: 0.8,
                    target: parcelName,
                    entities: {
                        targetParcels: [parcelName],
                        targetVariety: parcelName
                    },
                    explanation: `Perceel/ras ${parcelName} toevoegen aan registratie`
                };
            }
        }
    }

    // 2.7.6. Check for override_dosage_for_plots / update_dosage_for_plots
    // "perceel X maar halve dosering", "de Conference maar 1.5L"
    for (const pattern of DOSAGE_FOR_PLOTS_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            const parcelName = match[1]?.toLowerCase();

            // Check for "halve dosering" pattern
            if (/halve\s+dosering/i.test(normalizedInput) && parcelName) {
                return {
                    type: 'override_dosage_for_plots',
                    confidence: 0.85,
                    target: parcelName,
                    entities: {
                        targetParcels: [parcelName],
                        targetVariety: KNOWN_VARIETIES.has(parcelName) ? parcelName : undefined,
                        dosageMultiplier: 0.5,
                        reason: 'reduced_dosage'
                    },
                    explanation: `Halve dosering voor ${parcelName}`
                };
            }

            // Check for specific dosage pattern (e.g., "Conference maar 1.5L")
            const dosage = match[2];
            const unit = match[3];
            if (parcelName && dosage && KNOWN_VARIETIES.has(parcelName)) {
                const amount = parseFloat(dosage.replace(',', '.'));
                return {
                    type: 'override_dosage_for_plots',
                    confidence: 0.85,
                    target: parcelName,
                    entities: {
                        targetParcels: [parcelName],
                        targetVariety: parcelName,
                        newDosage: { amount, unit: normalizeUnit(unit || 'L') },
                        reason: 'custom_dosage'
                    },
                    explanation: `Afwijkende dosering ${amount} ${unit || 'L'} voor ${parcelName}`
                };
            }
        }
    }

    // 2.7.7. Check for update_dosage_specific: "nee de merpan is 0,5"
    for (const pattern of SPECIFIC_PRODUCT_DOSAGE_PATTERNS) {
        const match = normalizedInput.match(pattern);
        if (match) {
            const productName = match[1]?.toLowerCase();
            const dosage = match[2];
            const unit = match[3];

            // Product must be a known product name
            if (productName && dosage && KNOWN_PRODUCTS.includes(productName)) {
                const amount = parseFloat(dosage.replace(',', '.'));
                return {
                    type: 'update_dosage_specific',
                    confidence: 0.9,
                    target: productName,
                    newValue: { amount, unit: normalizeUnit(unit || 'L') },
                    entities: {
                        targetProduct: productName,
                        newDosage: { amount, unit: normalizeUnit(unit || 'L') }
                    },
                    explanation: `Dosering ${productName} wijzigen naar ${amount} ${unit || 'L'}`
                };
            }
        }
    }

    // ============================================
    // End Multi-Turn Detection
    // ============================================

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

        // Multi-turn correction messages
        case 'update_dosage_specific':
            if (correction.entities?.targetProduct && correction.entities?.newDosage) {
                return `Oké, de dosering van ${correction.entities.targetProduct} is aangepast naar ${correction.entities.newDosage.amount} ${correction.entities.newDosage.unit}.`;
            }
            return 'Oké, de dosering is aangepast.';

        case 'add_plot_to_existing':
            return `Oké, ${correction.target || 'perceel'} is toegevoegd aan de registratie.`;

        case 'add_plot_different_date':
            if (correction.entities?.newDate) {
                const dateStr = correction.entities.newDate.toLocaleDateString('nl-NL');
                return `Oké, ${correction.target} is toegevoegd met datum ${dateStr}.`;
            }
            return `Oké, ${correction.target} is toegevoegd met een andere datum.`;

        case 'add_product_to_plots':
            return `Oké, ${correction.entities?.newProduct || 'product'} is toegevoegd aan ${correction.entities?.targetParcels?.join(', ') || 'de percelen'}.`;

        case 'update_dosage_for_plots':
        case 'override_dosage_for_plots':
            if (correction.entities?.dosageMultiplier === 0.5) {
                return `Oké, halve dosering toegepast voor ${correction.target}.`;
            }
            if (correction.entities?.newDosage) {
                return `Oké, dosering aangepast naar ${correction.entities.newDosage.amount} ${correction.entities.newDosage.unit} voor ${correction.target}.`;
            }
            return `Oké, dosering aangepast voor ${correction.target}.`;

        case 'swap_product':
            return `Oké, ${correction.oldProduct} is vervangen door ${correction.target}.`;

        case 'update_date_for_plots':
            if (correction.entities?.newDate) {
                const dateStr = correction.entities.newDate.toLocaleDateString('nl-NL');
                return `Oké, datum gewijzigd naar ${dateStr} voor ${correction.targets?.join(', ') || correction.target}.`;
            }
            return `Oké, datum gewijzigd voor ${correction.targets?.join(', ') || correction.target}.`;

        default:
            return '';
    }
}

// ============================================
// Apply Grouped Correction (Multi-Turn)
// ============================================

/**
 * Helper: Find parcels by variety or name in parcel info
 */
function findParcelsByVarietyOrName(
    varietyOrName: string,
    parcelInfo: ParcelInfo[]
): string[] {
    const lower = varietyOrName.toLowerCase();
    return parcelInfo
        .filter(p =>
            p.variety?.toLowerCase() === lower ||
            p.variety?.toLowerCase().includes(lower) ||
            p.name.toLowerCase().includes(lower)
        )
        .map(p => p.id);
}

/**
 * Helper: Generate unique unit ID
 */
function generateUnitId(): string {
    return `unit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper: Deep clone products array
 */
function cloneProducts(products: ProductEntry[]): ProductEntry[] {
    return products.map(p => ({
        product: p.product,
        dosage: p.dosage,
        unit: p.unit,
        targetReason: p.targetReason,
        doelorganisme: p.doelorganisme
    }));
}

/**
 * Apply a correction to a SprayRegistrationGroup (multi-unit draft)
 * Supports splitting, merging, and modifying units
 */
export function applyGroupedCorrection(
    correction: CorrectionResult,
    group: SprayRegistrationGroup,
    parcelInfo: ParcelInfo[]
): SprayRegistrationGroup {
    // Deep clone the group
    const newGroup: SprayRegistrationGroup = {
        ...group,
        groupId: group.groupId,
        date: new Date(group.date),
        rawInput: group.rawInput,
        units: group.units.map(u => ({
            ...u,
            id: u.id,
            plots: [...u.plots],
            products: cloneProducts(u.products),
            label: u.label,
            status: u.status,
            date: u.date ? new Date(u.date) : undefined
        }))
    };

    const entities = correction.entities;

    switch (correction.type) {
        // ============================================
        // update_dosage_specific
        // Update dosage for a specific product in ALL units
        // ============================================
        case 'update_dosage_specific': {
            if (!entities?.targetProduct || !entities?.newDosage) break;

            const targetLower = entities.targetProduct.toLowerCase();

            for (const unit of newGroup.units) {
                for (const product of unit.products) {
                    const productLower = product.product.toLowerCase();
                    if (productLower.includes(targetLower) ||
                        targetLower.includes(productLower.split(' ')[0].replace(/[®™]/g, ''))) {
                        product.dosage = entities.newDosage.amount;
                        product.unit = entities.newDosage.unit;
                    }
                }
            }
            break;
        }

        // ============================================
        // add_plot_to_existing
        // Add parcel(s) to the base (first) unit
        // ============================================
        case 'add_plot_to_existing': {
            if (!entities?.targetParcels && !entities?.targetVariety) break;

            // Find parcel IDs to add
            let plotIdsToAdd: string[] = [];

            if (entities.targetVariety) {
                plotIdsToAdd = findParcelsByVarietyOrName(entities.targetVariety, parcelInfo);
            } else if (entities.targetParcels) {
                // Try to resolve names to IDs
                for (const nameOrId of entities.targetParcels) {
                    const found = findParcelsByVarietyOrName(nameOrId, parcelInfo);
                    if (found.length > 0) {
                        plotIdsToAdd.push(...found);
                    } else {
                        // Assume it's already an ID
                        plotIdsToAdd.push(nameOrId);
                    }
                }
            }

            // Add to first unit (base registration), avoiding duplicates
            if (newGroup.units.length > 0 && plotIdsToAdd.length > 0) {
                const existingPlots = new Set(newGroup.units.flatMap(u => u.plots));
                const newPlots = plotIdsToAdd.filter(id => !existingPlots.has(id));
                newGroup.units[0].plots.push(...newPlots);
            }
            break;
        }

        // ============================================
        // add_plot_different_date
        // Create new unit with parcels and different date
        // ============================================
        case 'add_plot_different_date': {
            if (!entities?.targetParcels && !entities?.targetVariety) break;
            if (!entities?.newDate) break;

            // Find parcel IDs
            let plotIds: string[] = [];
            if (entities.targetVariety) {
                plotIds = findParcelsByVarietyOrName(entities.targetVariety, parcelInfo);
            } else if (entities.targetParcels) {
                for (const nameOrId of entities.targetParcels) {
                    const found = findParcelsByVarietyOrName(nameOrId, parcelInfo);
                    plotIds.push(...(found.length > 0 ? found : [nameOrId]));
                }
            }

            if (plotIds.length === 0) break;

            // Remove these plots from existing units
            for (const unit of newGroup.units) {
                unit.plots = unit.plots.filter(p => !plotIds.includes(p));
            }

            // Remove empty units
            newGroup.units = newGroup.units.filter(u => u.plots.length > 0);

            // Create new unit with the different date
            const baseProducts = group.units[0]?.products || [];
            const newUnit: SprayRegistrationUnit = {
                id: generateUnitId(),
                plots: plotIds,
                products: cloneProducts(baseProducts),
                label: entities.targetVariety
                    ? `${entities.targetVariety.charAt(0).toUpperCase()}${entities.targetVariety.slice(1)} (${entities.newDate.toLocaleDateString('nl-NL')})`
                    : `Split (${entities.newDate.toLocaleDateString('nl-NL')})`,
                status: 'pending',
                date: entities.newDate
            };

            newGroup.units.push(newUnit);
            break;
        }

        // ============================================
        // add_product_to_plots
        // Add a product to specific parcels (creates new unit if needed)
        // ============================================
        case 'add_product_to_plots': {
            if (!entities?.newProduct) break;
            if (!entities?.targetParcels && !entities?.targetVariety) break;

            // Find target parcel IDs
            let targetPlotIds: string[] = [];
            if (entities.targetVariety) {
                targetPlotIds = findParcelsByVarietyOrName(entities.targetVariety, parcelInfo);
            } else if (entities.targetParcels) {
                for (const nameOrId of entities.targetParcels) {
                    const found = findParcelsByVarietyOrName(nameOrId, parcelInfo);
                    targetPlotIds.push(...(found.length > 0 ? found : [nameOrId]));
                }
            }

            if (targetPlotIds.length === 0) break;

            // Find or create a unit that contains exactly these plots
            // Strategy: Check if there's an existing unit with these plots
            const targetSet = new Set(targetPlotIds);
            let matchingUnit = newGroup.units.find(u => {
                const unitSet = new Set(u.plots);
                return targetPlotIds.every(id => unitSet.has(id)) &&
                       u.plots.every(id => targetSet.has(id));
            });

            if (matchingUnit) {
                // Add product to existing unit
                const newProduct: ProductEntry = {
                    product: entities.newProduct.charAt(0).toUpperCase() + entities.newProduct.slice(1),
                    dosage: 0, // Will be filled by CTGB validation
                    unit: 'L'
                };
                matchingUnit.products.push(newProduct);
            } else {
                // Need to split: remove target plots from other units and create new unit

                // Remove target plots from existing units
                for (const unit of newGroup.units) {
                    unit.plots = unit.plots.filter(p => !targetSet.has(p));
                }

                // Clean up empty units
                newGroup.units = newGroup.units.filter(u => u.plots.length > 0);

                // Create new unit with base products + new product
                const baseProducts = group.units[0]?.products || [];
                const newProduct: ProductEntry = {
                    product: entities.newProduct.charAt(0).toUpperCase() + entities.newProduct.slice(1),
                    dosage: 0,
                    unit: 'L'
                };

                const newUnit: SprayRegistrationUnit = {
                    id: generateUnitId(),
                    plots: targetPlotIds,
                    products: [...cloneProducts(baseProducts), newProduct],
                    label: entities.targetVariety
                        ? `${entities.targetVariety.charAt(0).toUpperCase()}${entities.targetVariety.slice(1)} + ${entities.newProduct}`
                        : `Met extra ${entities.newProduct}`,
                    status: 'pending'
                };

                newGroup.units.push(newUnit);
            }
            break;
        }

        // ============================================
        // override_dosage_for_plots / update_dosage_for_plots
        // Create unit with modified dosage for specific parcels
        // ============================================
        case 'override_dosage_for_plots':
        case 'update_dosage_for_plots': {
            if (!entities?.targetParcels && !entities?.targetVariety) break;

            // Find target parcel IDs
            let targetPlotIds: string[] = [];
            if (entities.targetVariety) {
                targetPlotIds = findParcelsByVarietyOrName(entities.targetVariety, parcelInfo);
            } else if (entities.targetParcels) {
                for (const nameOrId of entities.targetParcels) {
                    const found = findParcelsByVarietyOrName(nameOrId, parcelInfo);
                    targetPlotIds.push(...(found.length > 0 ? found : [nameOrId]));
                }
            }

            if (targetPlotIds.length === 0) break;

            const targetSet = new Set(targetPlotIds);

            // Remove target plots from existing units
            for (const unit of newGroup.units) {
                unit.plots = unit.plots.filter(p => !targetSet.has(p));
            }

            // Clean up empty units
            newGroup.units = newGroup.units.filter(u => u.plots.length > 0);

            // Create new unit with modified dosage
            const baseProducts = group.units[0]?.products || [];
            const modifiedProducts = cloneProducts(baseProducts);

            // Apply dosage modification
            for (const product of modifiedProducts) {
                if (entities.dosageMultiplier) {
                    product.dosage = product.dosage * entities.dosageMultiplier;
                } else if (entities.newDosage) {
                    // If specific product target, only modify that product
                    if (entities.targetProduct) {
                        const targetLower = entities.targetProduct.toLowerCase();
                        if (product.product.toLowerCase().includes(targetLower)) {
                            product.dosage = entities.newDosage.amount;
                            product.unit = entities.newDosage.unit;
                        }
                    } else {
                        // Modify all products
                        product.dosage = entities.newDosage.amount;
                        product.unit = entities.newDosage.unit;
                    }
                }
            }

            const labelSuffix = entities.dosageMultiplier === 0.5 ? '(halve dosering)'
                : entities.newDosage ? `(${entities.newDosage.amount} ${entities.newDosage.unit})`
                : '(aangepaste dosering)';

            const newUnit: SprayRegistrationUnit = {
                id: generateUnitId(),
                plots: targetPlotIds,
                products: modifiedProducts,
                label: entities.targetVariety
                    ? `${entities.targetVariety.charAt(0).toUpperCase()}${entities.targetVariety.slice(1)} ${labelSuffix}`
                    : `Aangepast ${labelSuffix}`,
                status: 'pending'
            };

            newGroup.units.push(newUnit);
            break;
        }

        // ============================================
        // swap_product
        // Replace product in ALL units
        // ============================================
        case 'swap_product': {
            if (!entities?.targetProduct || !entities?.newProduct) break;

            const oldLower = entities.targetProduct.toLowerCase();
            const newName = entities.newProduct.charAt(0).toUpperCase() + entities.newProduct.slice(1);

            for (const unit of newGroup.units) {
                for (const product of unit.products) {
                    const productLower = product.product.toLowerCase();
                    if (productLower.includes(oldLower) ||
                        oldLower.includes(productLower.split(' ')[0].replace(/[®™]/g, ''))) {
                        product.product = newName;
                        // Keep existing dosage and unit
                    }
                }
            }
            break;
        }

        // ============================================
        // update_date_for_plots
        // Change date for specific parcels (split to new unit)
        // ============================================
        case 'update_date_for_plots': {
            if (!entities?.newDate) break;
            if (!entities?.targetParcels && !entities?.targetVariety) break;

            // Find target parcel IDs
            let targetPlotIds: string[] = [];
            if (entities.targetVariety) {
                targetPlotIds = findParcelsByVarietyOrName(entities.targetVariety, parcelInfo);
            } else if (entities.targetParcels) {
                for (const nameOrId of entities.targetParcels) {
                    const found = findParcelsByVarietyOrName(nameOrId, parcelInfo);
                    targetPlotIds.push(...(found.length > 0 ? found : [nameOrId]));
                }
            }

            if (targetPlotIds.length === 0) break;

            const targetSet = new Set(targetPlotIds);

            // Check if these plots are already in a unit with that date
            const existingUnit = newGroup.units.find(u => {
                if (!u.date) return false;
                const sameDate = u.date.toDateString() === entities.newDate!.toDateString();
                const hasTargetPlots = u.plots.some(p => targetSet.has(p));
                return sameDate && hasTargetPlots;
            });

            if (existingUnit) {
                // Just update the date (already correct)
                break;
            }

            // Remove target plots from existing units
            for (const unit of newGroup.units) {
                unit.plots = unit.plots.filter(p => !targetSet.has(p));
            }

            // Clean up empty units
            newGroup.units = newGroup.units.filter(u => u.plots.length > 0);

            // Create new unit with the new date
            const baseProducts = group.units[0]?.products || [];
            const newUnit: SprayRegistrationUnit = {
                id: generateUnitId(),
                plots: targetPlotIds,
                products: cloneProducts(baseProducts),
                label: `${entities.targetParcels?.join(', ') || entities.targetVariety || 'Gesplitst'} (${entities.newDate.toLocaleDateString('nl-NL')})`,
                status: 'pending',
                date: entities.newDate
            };

            newGroup.units.push(newUnit);
            break;
        }

        // ============================================
        // Basic corrections (delegate to simple applyCorrection logic)
        // ============================================
        case 'remove_specific_plot':
        case 'remove_all_plots': {
            const plotsToRemove = correction.targets || (correction.target ? [correction.target] : []);
            const removeSet = new Set(plotsToRemove.map(p => p.toLowerCase()));

            for (const unit of newGroup.units) {
                unit.plots = unit.plots.filter(p => {
                    // Check by ID
                    if (removeSet.has(p.toLowerCase())) return false;

                    // Check by parcel name
                    const info = parcelInfo.find(pi => pi.id === p);
                    if (info && removeSet.has(info.name.toLowerCase())) return false;
                    if (info && info.variety && removeSet.has(info.variety.toLowerCase())) return false;

                    return true;
                });
            }

            // Clean up empty units
            newGroup.units = newGroup.units.filter(u => u.plots.length > 0);
            break;
        }

        case 'remove_specific_product':
        case 'remove_all_products': {
            const productsToRemove = correction.targets || (correction.target ? [correction.target] : []);
            const removeSet = new Set(productsToRemove.map(p => p.toLowerCase()));

            for (const unit of newGroup.units) {
                unit.products = unit.products.filter(p => {
                    const productLower = p.product.toLowerCase();
                    for (const toRemove of removeSet) {
                        if (productLower.includes(toRemove) || toRemove.includes(productLower.split(' ')[0])) {
                            return false;
                        }
                    }
                    return true;
                });
            }

            // Clean up units with no products
            newGroup.units = newGroup.units.filter(u => u.products.length > 0);
            break;
        }

        case 'update_dosage': {
            if (!correction.newValue) break;

            // Update dosage for all products in all units (or specific product if target specified)
            for (const unit of newGroup.units) {
                for (const product of unit.products) {
                    if (correction.target) {
                        const targetLower = correction.target.toLowerCase();
                        if (product.product.toLowerCase().includes(targetLower)) {
                            product.dosage = correction.newValue.amount;
                            product.unit = correction.newValue.unit;
                        }
                    } else {
                        // Update all products
                        product.dosage = correction.newValue.amount;
                        product.unit = correction.newValue.unit;
                    }
                }
            }
            break;
        }

        case 'replace_product': {
            if (!correction.target) break;

            const oldLower = (correction.oldProduct || '').toLowerCase();
            const newName = correction.target.charAt(0).toUpperCase() + correction.target.slice(1);

            for (const unit of newGroup.units) {
                for (const product of unit.products) {
                    const productLower = product.product.toLowerCase();
                    // If oldProduct specified, only replace that one
                    if (oldLower) {
                        if (productLower.includes(oldLower)) {
                            product.product = newName;
                        }
                    } else if (unit.products.length === 1) {
                        // If only one product, replace it
                        product.product = newName;
                    }
                }
            }
            break;
        }

        case 'cancel_all': {
            newGroup.units = [];
            break;
        }

        default:
            // Unknown correction type, return unchanged
            break;
    }

    return newGroup;
}

/**
 * Generate a message for a grouped correction
 */
export function getGroupedCorrectionMessage(
    correction: CorrectionResult,
    originalGroup: SprayRegistrationGroup,
    newGroup: SprayRegistrationGroup
): string {
    // Use the standard message generator, but with additional context for grouped operations
    const baseMessage = getCorrectionMessage(
        correction,
        // Convert first unit to DraftContext format for message generation
        {
            plots: originalGroup.units.flatMap(u => u.plots),
            products: originalGroup.units[0]?.products || [],
            date: originalGroup.date.toISOString()
        },
        {
            plots: newGroup.units.flatMap(u => u.plots),
            products: newGroup.units[0]?.products || [],
            date: newGroup.date.toISOString()
        }
    );

    // Add unit count info if relevant
    if (newGroup.units.length !== originalGroup.units.length) {
        return `${baseMessage} (${newGroup.units.length} registratie${newGroup.units.length === 1 ? '' : 's'})`;
    }

    return baseMessage;
}
