/**
 * Slimme Invoer 2.0 API Route
 *
 * Hybride architectuur:
 * - Bericht 1 (geen draft): Snelle pipeline (classify + parse)
 * - Bericht 2+ (draft exists): AI Agent met tools
 */

import { NextResponse } from 'next/server';
import { z as zod } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requestContext } from '@/lib/request-context';
import { classifyAndParseSpray } from '@/ai/flows/classify-and-parse-spray';
import { registrationAgent, registrationAgentStream, type AgentOutput } from '@/ai/flows/registration-agent';
import { validateParsedSprayData } from '@/lib/validation-service';
import { resolveProductAliases, getProductSuggestions } from '@/lib/product-aliases';
import {
    getSprayableParcels,
    getAllCtgbProducts,
    getParcelHistoryEntries,
    getLastUsedDosages,
    getAllFertilizers,
    getParcelGroupsWithMemberIds,
    type SprayableParcel,
} from '@/lib/supabase-store';
import type {
    SmartInputV2Request,
    SmartInputV2Response,
    StreamMessageV2,
    ConversationMessage,
    SmartInputUserContext,
    CtgbProductSlim,
} from '@/lib/types-v2';
import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry, CtgbProduct, FertilizerProduct, RegistrationType, ProductSource } from '@/lib/types';
import { validateDraft, formatValidationResult, type DraftValidationResult, type DraftValidationIssue } from '@/lib/draft-validator';
import { detectRegistrationType, resolveProductSources } from '@/lib/fertilizer-lookup';

// ============================================================================
// AUTH HELPER
// ============================================================================

async function getServerUserId(): Promise<string | null> {
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id || null;
    } catch (error) {
        console.error('[getServerUserId] Auth error:', error);
        return null;
    }
}


// ============================================================================
// PRODUCT UNIT DETECTION
// ============================================================================

/**
 * Determines the correct unit (L/ha or kg/ha) for a product based on CTGB data.
 * Solid products (powders, granules) use kg/ha, liquids use L/ha.
 */
function getDefaultUnitForProduct(
    productName: string,
    allProducts: Array<{ naam: string; gebruiksvoorschriften?: Array<{ dosering?: string }> }>
): string {
    // Find the product in CTGB data
    const product = allProducts.find(p =>
        p.naam.toLowerCase() === productName.toLowerCase() ||
        p.naam.toLowerCase().includes(productName.toLowerCase())
    );

    // Check product name for hints FIRST (most reliable for formulation type)
    const nameLower = productName.toLowerCase();
    if (nameLower.includes('spuitkorrel') ||
        nameLower.includes('granulaat') ||
        nameLower.includes('poeder') ||
        nameLower.includes(' wp') ||  // Wettable Powder (space before to avoid false matches)
        nameLower.includes(' wg') ||  // Water dispersible Granule
        nameLower.includes(' wdg') || // Water Dispersible Granule
        nameLower.includes(' sg') ||  // Soluble Granule
        nameLower.includes(' sp')) {  // Soluble Powder
        console.log(`[getDefaultUnitForProduct] "${productName}" → kg/ha (name contains solid indicator)`);
        return 'kg/ha';
    }

    if (nameLower.includes(' sc') ||  // Suspension Concentrate
        nameLower.includes(' ec') ||  // Emulsifiable Concentrate
        nameLower.includes(' sl') ||  // Soluble Liquid
        nameLower.includes(' ew') ||  // Emulsion, water
        nameLower.includes(' se')) {  // Suspo-emulsion
        console.log(`[getDefaultUnitForProduct] "${productName}" → L/ha (name contains liquid indicator)`);
        return 'L/ha';
    }

    if (!product?.gebruiksvoorschriften?.length) {
        console.log(`[getDefaultUnitForProduct] "${productName}" → L/ha (no CTGB data found)`);
        return 'L/ha'; // Default fallback
    }

    // Check the dosering unit from the gebruiksvoorschriften
    for (const voorschrift of product.gebruiksvoorschriften) {
        const dosering = voorschrift.dosering?.toLowerCase() || '';

        // Check for kg indicators (solid products)
        if (dosering.includes('kg') || dosering.includes(' g ') || dosering.match(/\d+\s*g\b/)) {
            console.log(`[getDefaultUnitForProduct] "${productName}" → kg/ha (dosering: ${voorschrift.dosering})`);
            return 'kg/ha';
        }

        // Check for L indicators (liquid products)
        if (dosering.includes(' l') || dosering.includes('ml') || dosering.includes('liter')) {
            console.log(`[getDefaultUnitForProduct] "${productName}" → L/ha (dosering: ${voorschrift.dosering})`);
            return 'L/ha';
        }
    }

    console.log(`[getDefaultUnitForProduct] "${productName}" → L/ha (default fallback)`);
    return 'L/ha'; // Default for unknown
}

/**
 * Normalizes dosage units to standard format matching existing DB convention.
 * DB convention: "kg" or "L" (without "/ha" suffix, display adds "/ha").
 * Converts g→kg (÷1000), ml→L (÷1000), gram→kg, etc.
 */
function normalizeDosageUnit(dosage: number, unit: string, defaultUnit: string): { dosage: number; unit: string } {
    const unitLower = unit.toLowerCase().replace('/ha', '').trim();

    if (unitLower === 'g' || unitLower === 'gram' || unitLower === 'gr') {
        return { dosage: dosage / 1000, unit: 'kg' };
    }
    if (unitLower === 'ml') {
        return { dosage: dosage / 1000, unit: 'L' };
    }
    // Already standard units
    if (unitLower === 'kg') return { dosage, unit: 'kg' };
    if (unitLower === 'l' || unitLower === 'liter') return { dosage, unit: 'L' };

    // If unit matches default format, keep it
    if (unit === defaultUnit) return { dosage, unit };

    // Fallback: use default unit for the product (strip /ha for consistency)
    return { dosage, unit: defaultUnit.replace('/ha', '') };
}

// ============================================================================
// PRE-PROCESSING: Deterministic Crop & Exception Detection
// ============================================================================

interface PreProcessResult {
    /** Pre-resolved parcel IDs based on crop/variety keywords. null = no match found */
    preResolvedPlots: string[] | null;
    /** Parcel IDs that were excluded by "maar...niet", "behalve", "zonder" patterns */
    excludedPlots: string[];
    /** The variety/name that was excluded (for labels) */
    excludedTarget: string | null;
    /** Whether the user's input contained an exclusion pattern */
    hasExclusion: boolean;
}

/**
 * Deterministic pre-processing of crop selection and exception patterns.
 * This runs BEFORE the AI call and provides reliable plot resolution as a fallback.
 *
 * Handles:
 * - "alle appels" / "alle peren" / "overal" / "het hele bedrijf"
 * - "maar X niet" / "behalve X" / "zonder X" exclusions
 * - Variety-based selection: "alle conference" / "de elstar"
 */
function preprocessCropSelection(
    message: string,
    allParcels: SprayableParcel[]
): PreProcessResult {
    const lower = message.toLowerCase().trim();

    // Step 1: Detect and extract exclusion patterns
    let excludeTarget: string | null = null;
    let baseMessage = lower;

    // Order matters: most specific patterns first
    const exclusionPatterns = [
        /\bmaar\s+(?:de\s+)?(\w[\w\s]*?)\s+niet\b/i,
        /\bbehalve\s+(?:de\s+)?(\w[\w\s]*?)(?:\s+(?:met|op|voor)\b|$)/i,
        /\bzonder\s+(?:de\s+)?(\w[\w\s]*?)(?:\s+(?:met|op|voor)\b|$)/i,
        /\b(?:de\s+)?(\w[\w\s]*?)\s+niet\s+mee\b/i,
    ];

    for (const pattern of exclusionPatterns) {
        const match = lower.match(pattern);
        if (match) {
            excludeTarget = match[1].trim();
            // Remove the exclusion clause from base message for crop detection
            baseMessage = lower.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
            console.log(`[preprocessCropSelection] Found exclusion: "${excludeTarget}" (pattern: ${pattern.source})`);
            break;
        }
    }

    // Step 2: Detect crop-based or variety-based selection
    let preResolvedPlots: string[] | null = null;
    let selectionType = 'none';

    // "alle appels" / "de appels" / "mijn appels" / "appelpercelen" / "appelbomen"
    if (/\b(?:alle?|de|mijn)\s+appels?\b/.test(baseMessage) ||
        /\bappelpercelen\b/.test(baseMessage) ||
        /\bappelbomen\b/.test(baseMessage)) {
        preResolvedPlots = allParcels.filter(p => p.crop?.toLowerCase() === 'appel').map(p => p.id);
        selectionType = 'crop:appel';
    }
    // "alle peren" / "de peren" / "perenpercelen" / "perenbomen"
    else if (/\b(?:alle?|de|mijn)\s+peren?\b/.test(baseMessage) ||
             /\bperenpercelen\b/.test(baseMessage) ||
             /\bperenbomen\b/.test(baseMessage)) {
        preResolvedPlots = allParcels.filter(p => p.crop?.toLowerCase() === 'peer').map(p => p.id);
        selectionType = 'crop:peer';
    }
    // "overal" / "alles" / "alle bomen" / "het hele bedrijf" / "alle percelen"
    else if (/\b(?:overal|alles)\b/.test(baseMessage) ||
             /\b(?:alle?|het\s+hele?)\s+(?:bomen|bedrijf|percelen)\b/.test(baseMessage)) {
        preResolvedPlots = allParcels.map(p => p.id);
        selectionType = 'all';
    }
    // Variety-based: "alle conference" / "de conference" / "alle elstar"
    else {
        const varietyMatch = baseMessage.match(/\b(?:alle?|de|mijn)\s+(\w+)\b/);
        if (varietyMatch) {
            const varietySearch = varietyMatch[1].toLowerCase();
            const varietyMatches = allParcels.filter(p =>
                p.variety?.toLowerCase() === varietySearch ||
                p.variety?.toLowerCase().includes(varietySearch)
            );
            if (varietyMatches.length > 0) {
                preResolvedPlots = varietyMatches.map(p => p.id);
                selectionType = `variety:${varietySearch}`;
            }
        }
    }

    // Step 3: Resolve exclusions and apply them
    const excludedPlots: string[] = [];

    if (excludeTarget && preResolvedPlots) {
        const excludeNormalized = excludeTarget.toLowerCase().trim();

        // Try matching against variety first
        const excludedByVariety = allParcels.filter(p => {
            if (!p.variety) return false;
            const variety = p.variety.toLowerCase();
            return variety === excludeNormalized ||
                   variety.includes(excludeNormalized) ||
                   excludeNormalized.includes(variety);
        });

        if (excludedByVariety.length > 0) {
            excludedPlots.push(...excludedByVariety.map(p => p.id));
        } else {
            // Try matching against parcel name
            const excludedByName = allParcels.filter(p => {
                const name = p.name.toLowerCase();
                return name === excludeNormalized ||
                       name.includes(excludeNormalized) ||
                       excludeNormalized.includes(name);
            });
            if (excludedByName.length > 0) {
                excludedPlots.push(...excludedByName.map(p => p.id));
            } else {
                // Try crop matching for exclusion
                const excludeCrop = excludeNormalized.replace(/s$/, '').replace(/en$/, '');
                const cropSearch = excludeCrop === 'per' ? 'peer' : excludeCrop;
                const excludedByCrop = allParcels.filter(p =>
                    p.crop?.toLowerCase() === cropSearch
                );
                if (excludedByCrop.length > 0) {
                    excludedPlots.push(...excludedByCrop.map(p => p.id));
                }
            }
        }

        // Apply exclusions to pre-resolved plots
        if (excludedPlots.length > 0) {
            const excludeSet = new Set(excludedPlots);
            preResolvedPlots = preResolvedPlots.filter(id => !excludeSet.has(id));
            console.log(`[preprocessCropSelection] Applied exclusion: removed ${excludedPlots.length} parcels, ${preResolvedPlots.length} remaining`);
        } else {
            console.log(`[preprocessCropSelection] Exclusion target "${excludeTarget}" matched 0 parcels - could not resolve`);
        }
    }

    console.log(`[preprocessCropSelection] Result: selection=${selectionType}, plots=${preResolvedPlots?.length ?? 'null'}, excluded=${excludedPlots.length}${excludeTarget ? `, excludeTarget="${excludeTarget}"` : ''}`);

    return {
        preResolvedPlots,
        excludedPlots,
        excludedTarget: excludeTarget,
        hasExclusion: excludeTarget !== null,
    };
}

// ============================================================================
// PRODUCT PRE-PROCESSING: Deterministic Product Extraction (fallback)
// ============================================================================

interface PreProcessedProduct {
    product: string;
    dosage: number;
    unit: string;
}

/**
 * Deterministic extraction of products from raw input text.
 * Used as FALLBACK when AI fails to parse products.
 *
 * Handles:
 * - "met [product] [dosage] [unit]"
 * - Tankmix: "met [product1] [dosage1] [unit1] en [product2] [dosage2] [unit2]"
 * - Tankmix with +: "[product1] [dosage1] + [product2] [dosage2]"
 * - Tankmix with comma: "[product1] [dosage1], [product2] [dosage2] en [product3] [dosage3]"
 */
function preprocessProductExtraction(message: string): PreProcessedProduct[] {
    const lower = message.toLowerCase().trim();
    const products: PreProcessedProduct[] = [];

    // Extract everything after "met " (Dutch for "with")
    const metMatch = lower.match(/\bmet\s+(.+)/);
    if (metMatch) {
        const productsPart = metMatch[1];

        // Split on separators first: " en ", " + ", ", " → then extract per segment
        const segments = productsPart
            .split(/\s+en\s+|\s*\+\s*|\s*,\s*(?=[a-z])/i)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const segment of segments) {
            // Pattern: product_name dosage unit
            const match = segment.match(/^([a-zà-ü][a-zà-ü\s]*?)\s+(\d+[.,]?\d*)\s*(kg|l|g|gram|gr|ml|liter)(?:\/ha)?$/i);
            if (!match) continue;

            const rawName = match[1].trim();
            const rawDosage = parseFloat(match[2].replace(',', '.'));
            const rawUnit = match[3].toLowerCase();

            // Skip if name is too short or looks like a crop name
            if (rawName.length < 3) continue;
            if (/^(alle|de|mijn|het|peren|appels|elstar|conference|beurre)$/i.test(rawName)) continue;

            products.push({
                product: rawName,
                dosage: rawDosage,
                unit: rawUnit,
            });
        }
    }

    // Fallback: extract product+dosage directly from start of message (without "met" keyword)
    // Handles inputs like "merpna 0.7 kg op alle peren"
    if (products.length === 0) {
        const directMatch = lower.match(/^([a-zà-ü][a-zà-ü]*)\s+(\d+[.,]?\d*)\s*(kg|l|g|gram|gr|ml|liter)(?:\/ha)?/i);
        if (directMatch) {
            const rawName = directMatch[1].trim();
            const rawDosage = parseFloat(directMatch[2].replace(',', '.'));
            const rawUnit = directMatch[3].toLowerCase();
            if (rawName.length >= 3 && !/^(alle|de|mijn|het|peren|appels|elstar|conference|beurre)$/i.test(rawName)) {
                products.push({ product: rawName, dosage: rawDosage, unit: rawUnit });
            }
        }
    }

    if (products.length > 0) {
        console.log(`[preprocessProductExtraction] Extracted ${products.length} products: ${products.map(p => `${p.product} ${p.dosage} ${p.unit}`).join(', ')}`);
    }

    return products;
}

// ============================================================================
// PARCEL NAME-TO-ID RESOLUTION
// ============================================================================

/**
 * Resolves parcel names/varieties/crops to actual parcel IDs.
 * Handles multiple scenarios:
 * 1. Direct ID match (AI returned valid UUID)
 * 2. Exact name match
 * 3. Variety match (e.g., "conference" → all Conference parcels)
 * 4. Crop match (e.g., "appel" or "appels" → all Appel parcels)
 * 5. Partial/fuzzy name match
 */
function resolveParcelNamesToIds(
    rawPlots: string[],
    allParcels: SprayableParcel[],
    parcelGroups?: Array<{ id: string; name: string; subParcelIds: string[] }>
): string[] {
    const resolvedIds = new Set<string>();

    console.log(`[resolveParcelNamesToIds] Input rawPlots: ${JSON.stringify(rawPlots)}`);

    for (const raw of rawPlots) {
        const normalized = raw.toLowerCase().trim();
        let matchType = 'none';

        // 1. Check if it's already a valid parcel ID
        const directMatch = allParcels.find(p => p.id === raw);
        if (directMatch) {
            resolvedIds.add(directMatch.id);
            matchType = 'direct_id';
            console.log(`[resolveParcelNamesToIds] "${raw}" → direct ID match: ${directMatch.name} (${directMatch.crop})`);
            continue;
        }

        // 2. Check for parcel group name match
        if (parcelGroups) {
            const groupMatch = parcelGroups.find(
                g => g.name.toLowerCase() === normalized
            );
            if (groupMatch && groupMatch.subParcelIds.length > 0) {
                groupMatch.subParcelIds.forEach(id => resolvedIds.add(id));
                matchType = 'group';
                console.log(`[resolveParcelNamesToIds] "${raw}" → group "${groupMatch.name}": ${groupMatch.subParcelIds.length} parcels`);
                continue;
            }
        }

        // 3. Check for exact name match
        const exactNameMatch = allParcels.find(
            p => p.name.toLowerCase() === normalized
        );
        if (exactNameMatch) {
            resolvedIds.add(exactNameMatch.id);
            matchType = 'exact_name';
            console.log(`[resolveParcelNamesToIds] "${raw}" → exact name: ${exactNameMatch.name} (${exactNameMatch.crop})`);
            continue;
        }

        // 4. Check for synonym match
        const synonymMatches = allParcels.filter(p =>
            p.synonyms?.some(s => s.toLowerCase() === normalized)
        );
        if (synonymMatches.length > 0) {
            synonymMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'synonym';
            console.log(`[resolveParcelNamesToIds] "${raw}" → synonym match: ${synonymMatches.length} parcels (${synonymMatches.map(p => p.name).join(', ')})`);
            continue;
        }

        // 5. Check for variety match (e.g., "conference", "elstar")
        // Only match if variety has content (avoid empty string matching everything)
        const varietyMatches = allParcels.filter(p => {
            const variety = p.variety?.toLowerCase();
            if (!variety || variety.length < 2) return false; // Skip empty or very short varieties
            return variety === normalized ||
                   variety.includes(normalized) ||
                   (normalized.length > 3 && normalized.includes(variety)); // Only check if normalized is meaningful
        });
        if (varietyMatches.length > 0) {
            varietyMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'variety';
            console.log(`[resolveParcelNamesToIds] "${raw}" → variety match: ${varietyMatches.length} parcels (${varietyMatches.map(p => `${p.name}:${p.crop}`).join(', ')})`);
            continue;
        }

        // 4. Check for crop match (e.g., "appel", "appels", "peer", "peren")
        const cropNormalized = normalized
            .replace(/s$/, '')  // Remove trailing 's' (appels → appel)
            .replace(/en$/, ''); // Remove trailing 'en' (peren → per → peer)

        // Handle "peer" specifically since "peren" → "per" doesn't match "peer"
        const cropSearch = cropNormalized === 'per' ? 'peer' : cropNormalized;

        const cropMatches = allParcels.filter(
            p => p.crop?.toLowerCase() === cropSearch ||
                 p.crop?.toLowerCase().startsWith(cropSearch)
        );
        if (cropMatches.length > 0) {
            cropMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'crop';
            console.log(`[resolveParcelNamesToIds] "${raw}" → crop match (search="${cropSearch}"): ${cropMatches.length} parcels`);
            continue;
        }

        // 5. Check for partial name match (fuzzy)
        // Be more strict: parcel name must contain the search term, or search term starts with parcel name
        const partialMatches = allParcels.filter(p => {
            const parcelName = p.name.toLowerCase();
            const firstWord = parcelName.split(' ')[0];
            // Parcel name contains the normalized search (e.g., searching "jacht" finds "Jachthoek...")
            if (parcelName.includes(normalized) && normalized.length >= 3) return true;
            // Search starts with parcel's first word (e.g., searching "jachthoek 3" finds "Jachthoek 3Rijen")
            if (firstWord.length >= 3 && normalized.startsWith(firstWord)) return true;
            return false;
        });
        if (partialMatches.length > 0) {
            partialMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'partial';
            console.log(`[resolveParcelNamesToIds] "${raw}" → partial match: ${partialMatches.length} parcels (${partialMatches.map(p => `${p.name}:${p.crop}`).join(', ')})`);
            continue;
        }

        // 6. Check if it contains crop/variety keywords (handle plurals)
        if (normalized.includes('appel') || normalized.includes('apple')) {
            const appleMatches = allParcels.filter(p => p.crop?.toLowerCase() === 'appel');
            appleMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'keyword_appel';
            console.log(`[resolveParcelNamesToIds] "${raw}" → keyword appel: ${appleMatches.length} parcels`);
        } else if (normalized.includes('peer') || normalized.includes('pear') || normalized.includes('peren')) {
            const pearMatches = allParcels.filter(p => p.crop?.toLowerCase() === 'peer');
            pearMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'keyword_peer';
            console.log(`[resolveParcelNamesToIds] "${raw}" → keyword peer: ${pearMatches.length} parcels`);
        }

        // 7. Multi-word: try splitting "thuis appels" → parcel group "thuis" + crop filter "appel"
        if (matchType === 'none') {
            const words = normalized.split(/\s+/);
            if (words.length >= 2) {
                const groupName = words[0];
                const cropWord = words.slice(1).join(' ').replace(/s$/, '').replace(/en$/, '');
                const cropSearch = cropWord === 'per' ? 'peer' : cropWord;

                const groupCropMatches = allParcels.filter(p => {
                    const nameMatch = p.name.toLowerCase().startsWith(groupName);
                    const cropMatch = p.crop?.toLowerCase() === cropSearch ||
                                      p.crop?.toLowerCase().startsWith(cropSearch) ||
                                      p.variety?.toLowerCase() === cropSearch ||
                                      p.variety?.toLowerCase().includes(cropSearch);
                    return nameMatch && cropMatch;
                });

                if (groupCropMatches.length > 0) {
                    groupCropMatches.forEach(p => resolvedIds.add(p.id));
                    matchType = 'group_crop';
                    console.log(`[resolveParcelNamesToIds] "${raw}" → group+crop match (group="${groupName}", crop="${cropSearch}"): ${groupCropMatches.length} parcels`);
                } else {
                    // Try just the group name
                    const groupMatches = allParcels.filter(p => p.name.toLowerCase().startsWith(groupName) && groupName.length >= 3);
                    if (groupMatches.length > 0) {
                        groupMatches.forEach(p => resolvedIds.add(p.id));
                        matchType = 'group_name';
                        console.log(`[resolveParcelNamesToIds] "${raw}" → group name match ("${groupName}"): ${groupMatches.length} parcels`);
                    }
                }
            }
        }

        if (matchType === 'none') {
            console.log(`[resolveParcelNamesToIds] "${raw}" → NO MATCH FOUND`);
        }
    }

    // Log final result with crop breakdown
    const resolved = Array.from(resolvedIds);
    const cropBreakdown = new Map<string, number>();
    for (const id of resolved) {
        const parcel = allParcels.find(p => p.id === id);
        const crop = parcel?.crop || 'unknown';
        cropBreakdown.set(crop, (cropBreakdown.get(crop) || 0) + 1);
    }
    console.log(`[resolveParcelNamesToIds] Final: ${resolved.length} parcels, breakdown: ${JSON.stringify(Object.fromEntries(cropBreakdown))}`);

    return resolved;
}

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

const ConversationMessageSchema = zod.object({
    id: zod.string(),
    role: zod.enum(['user', 'assistant']),
    content: zod.string(),
    timestamp: zod.string(),
});

const ProductEntrySchema = zod.object({
    product: zod.string(),
    dosage: zod.number(),
    unit: zod.string(),
    targetReason: zod.string().optional(),
});

const SprayRegistrationUnitSchema = zod.object({
    id: zod.string(),
    plots: zod.array(zod.string()),
    products: zod.array(ProductEntrySchema),
    label: zod.string().optional(),
    status: zod.enum(['pending', 'confirmed']),
    date: zod.string().optional(),
});

const SprayRegistrationGroupSchema = zod.object({
    groupId: zod.string(),
    date: zod.string(),
    rawInput: zod.string(),
    units: zod.array(SprayRegistrationUnitSchema),
});

// User context schema (client-loaded, sent with each request)
const UserContextSchema = zod.object({
    parcels: zod.array(zod.object({
        id: zod.string(),
        name: zod.string(),
        crop: zod.string(),
        variety: zod.string().nullable(),
        area: zod.number().nullable(),
    })),
    products: zod.array(zod.object({
        id: zod.string(),
        naam: zod.string(),
        toelatingsnummer: zod.string(),
        categorie: zod.string().nullable(),
        werkzameStoffen: zod.array(zod.string()),
        gebruiksvoorschriften: zod.array(zod.object({
            gewas: zod.string(),
            doelorganisme: zod.string().optional(),
            dosering: zod.string().optional(),
            maxToepassingen: zod.number().optional(),
        })),
    })),
    recentHistory: zod.array(zod.object({
        parcelId: zod.string(),
        parcelName: zod.string(),
        product: zod.string(),
        dosage: zod.number(),
        unit: zod.string(),
        date: zod.string(),
    })),
    productAliases: zod.array(zod.object({
        alias: zod.string(),
        officialName: zod.string(),
        productId: zod.string().optional(),
    })),
    loadedAt: zod.string(),
}).optional();

const RequestSchema = zod.object({
    message: zod.string().min(1, 'Message is required').max(5000, 'Bericht te lang (max 5000 tekens)'),
    conversationHistory: zod.array(ConversationMessageSchema).max(50),
    currentDraft: SprayRegistrationGroupSchema.nullable(),
    userContext: UserContextSchema,
});

// ============================================================================
// MAIN API HANDLER
// ============================================================================

export async function POST(req: Request) {
    const encoder = new TextEncoder();
    const context = 'Smart Input V2 API';
    const startTime = Date.now();

    try {
        // Step 1: Parse and validate request
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            console.error(`[${context}] Invalid JSON in request body`);
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        const parseResult = RequestSchema.safeParse(body);
        if (!parseResult.success) {
            const issues = parseResult.error.issues.map(i => i.message);
            return NextResponse.json({ error: `Validation failed: ${issues.join(', ')}` }, { status: 400 });
        }

        const { message, conversationHistory, currentDraft, userContext } = parseResult.data;
        const hasClientContext = !!userContext?.parcels?.length;
        console.log(`[${context}] Processing: "${message.substring(0, 50)}..." draft: ${currentDraft ? 'yes' : 'no'}, clientContext: ${hasClientContext}`);

        // Step 2: Authenticate user (hard requirement, no anonymous fallback)
        const userId = await getServerUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Step 3: Create streaming response
        const stream = new ReadableStream({
            async start(controller) {
                const send = (msg: StreamMessageV2) => {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));
                    } catch (err) {
                        console.error(`[${context}] Failed to send message:`, err);
                    }
                };

                try {
                    // Route to appropriate handler
                    if (!currentDraft) {
                        // PATH 1: First message - use pipeline
                        await handleFirstMessage(message, userId, send, context, userContext);
                    } else {
                        // PATH 2: Draft exists - use agent
                        // Convert parsed draft (string dates) to SprayRegistrationGroup (Date objects)
                        const draftWithDates: SprayRegistrationGroup = {
                            groupId: currentDraft.groupId,
                            date: new Date(currentDraft.date),
                            rawInput: currentDraft.rawInput,
                            units: currentDraft.units.map(u => ({
                                ...u,
                                date: u.date ? new Date(u.date) : undefined,
                            })),
                        };
                        await handleAgentMessage(
                            message,
                            conversationHistory,
                            draftWithDates,
                            userId,
                            send,
                            context,
                            userContext
                        );
                    }
                } catch (error) {
                    console.error(`[${context}] Handler error:`, error);
                    send({
                        type: 'error',
                        message: 'Er ging iets mis bij het verwerken. Probeer het opnieuw.',
                    });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error(`[${context}] Top-level error:`, error);
        return NextResponse.json(
            { error: 'Er ging iets mis. Probeer het opnieuw.' },
            { status: 500 }
        );
    }
}

// ============================================================================
// PATH 1: First Message Handler (Pipeline)
// ============================================================================

async function handleFirstMessage(
    message: string,
    userId: string,
    send: (msg: StreamMessageV2) => void,
    context: string,
    userContext?: SmartInputUserContext
): Promise<void> {
    const startTime = Date.now();

    // Step 0: Detect registration type (spraying vs spreading)
    const registrationType = detectRegistrationType(message);
    console.log(`[${context}] Registration type: ${registrationType}`);

    // Step 1: Use client-provided context OR fetch from database (fallback)
    let allParcels: SprayableParcel[];
    let allProducts: CtgbProduct[];
    let allFertilizers: FertilizerProduct[];
    let parcelHistory: Array<{ parcelId: string; parcelName: string; product: string; dosage: number; unit: string; date: Date }>;

    if (userContext?.parcels?.length && userContext?.products?.length) {
        // Use client-provided context - NO database calls!
        console.log(`[${context}] Using client-provided context`);
        send({ type: 'processing', phase: 'Invoer analyseren...' });

        allParcels = userContext.parcels.map(p => ({
            id: p.id,
            name: p.name,
            parcelId: p.id,
            parcelName: p.name,
            crop: p.crop,
            variety: p.variety,
            area: p.area,
        })) as SprayableParcel[];

        // Convert slim products to full products (with required fields for validation)
        allProducts = userContext.products.map(p => ({
            id: p.id,
            naam: p.naam,
            toelatingsnummer: p.toelatingsnummer,
            categorie: p.categorie,
            werkzameStoffen: p.werkzameStoffen,
            gebruiksvoorschriften: p.gebruiksvoorschriften.map(g => ({
                gewas: g.gewas,
                doelorganisme: g.doelorganisme,
                dosering: g.dosering,
                maxToepassingen: g.maxToepassingen,
            })),
        })) as CtgbProduct[];

        parcelHistory = userContext.recentHistory.map(h => ({
            parcelId: h.parcelId,
            parcelName: h.parcelName,
            product: h.product,
            dosage: h.dosage,
            unit: h.unit,
            date: new Date(h.date),
        }));

        // Fetch fertilizers from DB (always needed for dual-database lookup)
        allFertilizers = await getAllFertilizers();

        console.log(`[${context}] Client context: ${allParcels.length} parcels, ${allProducts.length} products, ${allFertilizers.length} fertilizers, ${parcelHistory.length} history`);
    } else {
        // Fallback: Fetch from database
        console.log(`[${context}] No client context, fetching from database...`);
        send({ type: 'processing', phase: 'Percelen ophalen...' });

        const [fetchedParcels, fetchedProducts, fetchedHistory, fetchedFertilizers] = await Promise.all([
            getSprayableParcels(),
            getAllCtgbProducts(),
            getParcelHistoryEntries(),
            getAllFertilizers(),
        ]);

        allParcels = fetchedParcels;
        allProducts = fetchedProducts;
        allFertilizers = fetchedFertilizers;
        parcelHistory = fetchedHistory.map(h => ({
            parcelId: h.parcelId,
            parcelName: h.parcelName || '',
            product: h.product,
            dosage: h.dosage,
            unit: h.unit,
            date: h.date instanceof Date ? h.date : new Date(h.date),
        }));

        console.log(`[${context}] Database context: ${allParcels.length} parcels, ${allProducts.length} products, ${allFertilizers.length} fertilizers`);
    }

    // Step 1a: Fetch parcel groups (always from DB, lightweight query)
    let parcelGroups: Array<{ id: string; name: string; subParcelIds: string[] }> = [];
    try {
        parcelGroups = await getParcelGroupsWithMemberIds();
        if (parcelGroups.length > 0) {
            console.log(`[${context}] Loaded ${parcelGroups.length} parcel groups: ${parcelGroups.map(g => `"${g.name}" (${g.subParcelIds.length})`).join(', ')}`);
        }
    } catch (e) {
        console.warn(`[${context}] Failed to load parcel groups:`, e);
    }

    // Step 1b: Pre-process crop selection and exceptions (deterministic, no AI needed)
    const preProcessed = preprocessCropSelection(message, allParcels);
    console.log(`[${context}] Pre-processing: preResolved=${preProcessed.preResolvedPlots?.length ?? 'none'}, excluded=${preProcessed.excludedPlots.length}, hasExclusion=${preProcessed.hasExclusion}`);

    send({ type: 'processing', phase: 'Invoer analyseren...' });

    // Step 2: Run combined intent + parse flow
    const parcelContext = JSON.stringify(
        allParcels.map(p => ({
            id: p.id,
            name: p.name,
            crop: p.crop,
            variety: p.variety,
            ...(p.synonyms?.length ? { synonyms: p.synonyms } : {}),
        }))
    ) + (parcelGroups.length > 0
        ? `\nGroepen: ${parcelGroups.map(g => `"${g.name}" (${g.subParcelIds.length} percelen)`).join(', ')}`
        : '');

    const combinedResult = await classifyAndParseSpray({
        userInput: message,
        hasDraft: false,
        plots: parcelContext,
        regexHints: {
            possibleGroup: preProcessed.preResolvedPlots
                ? (preProcessed.preResolvedPlots.length === allParcels.length ? 'hele bedrijf' : `${preProcessed.preResolvedPlots.length} percelen`)
                : undefined,
            possibleException: preProcessed.excludedTarget || undefined,
        },
    });

    console.log(`[${context}] Combined result: intent=${combinedResult.intent}, confidence=${combinedResult.confidence}`);
    console.log(`[${context}] AI parsed plots: ${JSON.stringify(combinedResult.sprayData?.plots)}`);
    console.log(`[${context}] AI parsed products: ${JSON.stringify(combinedResult.sprayData?.products)}`);

    // Step 3: Check if this is a spray registration intent
    if (combinedResult.intent !== 'REGISTER_SPRAY' || !combinedResult.sprayData) {
        // Not a registration - return as query
        send({
            type: 'complete',
            response: {
                action: 'answer_query',
                humanSummary: 'Dit lijkt geen bespuiting registratie te zijn.',
                queryAnswer: 'Probeer iets als "gisteren alle peren met merpan 2L"',
                processingTimeMs: Date.now() - startTime,
            },
        });
        return;
    }

    send({ type: 'processing', phase: 'Producten resolven...' });

    // Step 4: Process spray data (handles both simple and grouped registrations)
    const sprayData = combinedResult.sprayData;
    const groupId = crypto.randomUUID();
    const today = new Date();

    // Parse date from sprayData or default to today
    let registrationDate = today;
    if (sprayData.date) {
        try {
            registrationDate = new Date(sprayData.date);
        } catch {
            registrationDate = today;
        }
    }

    // Step 5: Build registration units
    const units: Array<{
        id: string;
        plots: string[];
        products: ProductEntry[];
        label?: string;
        status: 'pending' | 'confirmed';
    }> = [];

    // Check if this is a grouped registration (multiple units with variations)
    if (sprayData.isGrouped && sprayData.registrations && sprayData.registrations.length > 0) {
        console.log(`[${context}] Processing grouped registration with ${sprayData.registrations.length} units`);

        // Collect all product names for alias resolution
        const allProductNames = sprayData.registrations.flatMap((reg: { products: Array<{ product: string }> }) =>
            reg.products.map((p: { product: string }) => p.product)
        );
        const resolvedProducts = await resolveProductAliases(allProductNames);

        for (const reg of sprayData.registrations) {
            // Resolve plots for this unit
            const rawPlots = reg.plots || [];
            let resolvedPlots = resolveParcelNamesToIds(rawPlots, allParcels, parcelGroups);

            // If AI resolution failed for this unit, try pre-processing as fallback
            if (resolvedPlots.length === 0 && preProcessed.preResolvedPlots && preProcessed.preResolvedPlots.length > 0) {
                resolvedPlots = preProcessed.preResolvedPlots;
                console.log(`[${context}] Grouped unit AI resolution failed → using pre-processed: ${resolvedPlots.length} parcels`);
            }

            // Resolve products for this unit
            const resolvedUnitProducts: ProductEntry[] = reg.products.map((prod: { product: string; dosage?: number; unit?: string }) => {
                const resolved = resolvedProducts.get(prod.product);
                const resolvedName = resolved?.resolvedName || prod.product;
                // Use smart unit detection based on product type (solid vs liquid)
                const defaultUnit = getDefaultUnitForProduct(resolvedName, allProducts);
                const rawUnit = prod.unit || defaultUnit;
                // Normalize units: g→kg, ml→L
                const normalized = normalizeDosageUnit(prod.dosage || 0, rawUnit, defaultUnit);
                return {
                    product: resolvedName,
                    dosage: normalized.dosage,
                    unit: normalized.unit,
                };
            });

            console.log(`[${context}] Unit "${reg.label || 'unnamed'}": ${rawPlots.length} raw → ${resolvedPlots.length} plots`);

            units.push({
                id: crypto.randomUUID(),
                plots: resolvedPlots,
                products: resolvedUnitProducts,
                label: reg.label,
                status: 'pending',
            });
        }
    } else {
        // Simple registration (single unit)
        console.log(`[${context}] Processing simple registration`);

        // Resolve product aliases
        const productNames = sprayData.products?.map((p: { product: string }) => p.product) || [];
        const resolvedProducts = await resolveProductAliases(productNames);

        // Build products array with resolved names
        const products: ProductEntry[] = [];
        if (sprayData.products) {
            for (const prod of sprayData.products) {
                const resolved = resolvedProducts.get(prod.product);
                const resolvedName = resolved?.resolvedName || prod.product;
                // Use smart unit detection based on product type (solid vs liquid)
                const defaultUnit = getDefaultUnitForProduct(resolvedName, allProducts);
                const rawUnit = prod.unit || defaultUnit;
                // Normalize units: g→kg, ml→L
                const normalized = normalizeDosageUnit(prod.dosage || 0, rawUnit, defaultUnit);
                products.push({
                    product: resolvedName,
                    dosage: normalized.dosage,
                    unit: normalized.unit,
                });
            }
        }

        // FALLBACK: If AI failed to parse products, try deterministic extraction from raw input
        if (products.length === 0) {
            console.log(`[${context}] AI product parsing failed → trying deterministic extraction`);
            const preProcessedProducts = preprocessProductExtraction(message);
            if (preProcessedProducts.length > 0) {
                // Resolve aliases for pre-processed products
                const ppNames = preProcessedProducts.map(p => p.product);
                const ppResolved = await resolveProductAliases(ppNames);

                for (const pp of preProcessedProducts) {
                    const resolved = ppResolved.get(pp.product);
                    const resolvedName = resolved?.resolvedName || pp.product;
                    const defaultUnit = getDefaultUnitForProduct(resolvedName, allProducts);
                    const normalized = normalizeDosageUnit(pp.dosage, pp.unit, defaultUnit);
                    products.push({
                        product: resolvedName,
                        dosage: normalized.dosage,
                        unit: normalized.unit,
                    });
                }
                console.log(`[${context}] Fallback extracted ${products.length} products: ${products.map(p => `${p.product} ${p.dosage} ${p.unit}`).join(', ')}`);
            }
        }

        // Resolve plots: try AI resolution first, then fall back to pre-processing
        const rawPlots: string[] = sprayData.plots || [];
        let plots: string[] = resolveParcelNamesToIds(rawPlots, allParcels, parcelGroups);

        // If AI resolution failed but pre-processing found plots, use pre-processing
        if (plots.length === 0 && preProcessed.preResolvedPlots && preProcessed.preResolvedPlots.length > 0) {
            plots = preProcessed.preResolvedPlots;
            console.log(`[${context}] AI plot resolution failed → using pre-processed: ${plots.length} parcels`);
        }
        // If pre-processing found exclusions, use the pre-processed result (already has exclusions applied)
        else if (preProcessed.hasExclusion && preProcessed.preResolvedPlots && preProcessed.preResolvedPlots.length > 0) {
            plots = preProcessed.preResolvedPlots;
            console.log(`[${context}] Using pre-processed plots with exclusions: ${plots.length} parcels (excluded: ${preProcessed.excludedPlots.length})`);
        }

        console.log(`[${context}] Plot resolution: ${rawPlots.length} raw → ${plots.length} resolved`);

        // Build label for exclusion cases
        let unitLabel: string | undefined;
        if (preProcessed.hasExclusion && preProcessed.excludedTarget) {
            const cropName = /appel/i.test(message) ? 'Appels' : /peer|peren/i.test(message) ? 'Peren' : 'Percelen';
            unitLabel = `${cropName} (zonder ${preProcessed.excludedTarget})`;
        }

        units.push({
            id: crypto.randomUUID(),
            plots,
            products,
            label: unitLabel,
            status: 'pending',
        });
    }

    // Post-processing: If pre-processing found a simple exclusion but AI created a grouped
    // registration, collapse into a single unit with pre-processed plots and all available products.
    // This fixes "maar X niet" / "behalve X" patterns where the AI incorrectly splits units.
    if (preProcessed.hasExclusion && preProcessed.preResolvedPlots && preProcessed.preResolvedPlots.length > 0) {
        const collectedProducts = units.flatMap(u => u.products);
        const hasUnitsWithNoProducts = units.some(u => u.products.length === 0);
        const hasUnitsWithNoPlots = units.some(u => u.plots.length === 0);

        if (hasUnitsWithNoProducts || hasUnitsWithNoPlots || units.length > 1) {
            console.log(`[${context}] Post-processing: collapsing ${units.length} units into 1 (exclusion pattern detected, fixing product distribution)`);

            // Collect all unique products from all units
            const productMap = new Map<string, ProductEntry>();
            for (const prod of collectedProducts) {
                if (prod.product && !productMap.has(prod.product.toLowerCase())) {
                    productMap.set(prod.product.toLowerCase(), prod);
                }
            }
            const mergedProducts = Array.from(productMap.values());

            // If still no products after merge, try extracting from the original message
            if (mergedProducts.length === 0) {
                console.log(`[${context}] Post-processing: No products found in AI output, attempting regex extraction from message`);
                // Try to extract product names from the input message
                const productPatterns = [
                    /\bmet\s+(\w[\w\s]*?)\s+(\d+[.,]?\d*)\s*(L|l|kg|KG|liter)\b/gi,
                    /\bmet\s+(\w[\w\s]*?)\s+(\d+[.,]?\d*)\b/gi,
                ];
                for (const pattern of productPatterns) {
                    let match;
                    while ((match = pattern.exec(message)) !== null) {
                        const rawName = match[1].trim();
                        const dosage = parseFloat(match[2].replace(',', '.'));
                        const unit = match[3] || 'L';
                        // Try to resolve the product name
                        const resolved = await resolveProductAliases([rawName]);
                        const resolvedName = resolved.get(rawName)?.resolvedName || rawName;
                        const defaultUnit = getDefaultUnitForProduct(resolvedName, allProducts);
                        mergedProducts.push({
                            product: resolvedName,
                            dosage: dosage || 0,
                            unit: unit || defaultUnit,
                        });
                    }
                    if (mergedProducts.length > 0) break;
                }
            }

            const cropName = /appel/i.test(message) ? 'Appels' : /peer|peren/i.test(message) ? 'Peren' : 'Percelen';
            const unitLabel = `${cropName} (zonder ${preProcessed.excludedTarget})`;

            // Replace all units with a single collapsed unit
            units.length = 0;
            units.push({
                id: crypto.randomUUID(),
                plots: preProcessed.preResolvedPlots,
                products: mergedProducts,
                label: unitLabel,
                status: 'pending',
            });

            console.log(`[${context}] Post-processing result: 1 unit, ${preProcessed.preResolvedPlots.length} plots, ${mergedProducts.length} products`);
        }
    }

    // Step 5b: Dual-database product source resolution (CTGB vs meststoffen)
    // Build set of products that were resolved from CTGB (confidence > 0 in alias resolution)
    const ctgbResolvedNames = new Set<string>();
    for (const prod of allProducts) {
      ctgbResolvedNames.add(prod.naam.toLowerCase());
    }

    // Apply source resolution to each unit's products
    for (const unit of units) {
      const resolvedWithSources = resolveProductSources(
        unit.products,
        registrationType,
        ctgbResolvedNames,
        allFertilizers,
      );
      unit.products = resolvedWithSources.map(p => ({
        product: p.product,
        dosage: p.dosage,
        unit: p.unit,
        source: p.source,
      }));

      // Log warnings for type mismatches (e.g., strooimeststof in spuitmengsel)
      for (const p of resolvedWithSources) {
        if (p.warning) {
          console.log(`[${context}] Product warning: ${p.warning}`);
        }
      }
    }

    // Create the registration group
    const registrationGroup: SprayRegistrationGroup = {
        groupId,
        date: registrationDate,
        rawInput: message,
        units,
        registrationType,
    };

    // For validation and summary, use all plots and products from all units
    const allUnitPlots = units.flatMap(u => u.plots);
    const allUnitProducts = units.flatMap(u => u.products);
    const plots = allUnitPlots;
    const products = allUnitProducts;

    send({ type: 'processing', phase: 'Valideren...' });

    // Step 6: Get last used dosages for products with dosage=0
    const productsNeedingDosage = products.filter(p => p.dosage === 0).map(p => p.product);
    const lastUsedDosages = productsNeedingDosage.length > 0
        ? await getLastUsedDosages(productsNeedingDosage)
        : new Map();

    console.log(`[${context}] Last used dosages found for ${lastUsedDosages.size}/${productsNeedingDosage.length} products`);

    // Step 7: Validate (only CTGB products, not fertilizers)
    // Filter out fertilizer products from CTGB validation
    const ctgbProducts = products.filter(p => !p.source || p.source === 'ctgb');
    const validationResult = ctgbProducts.length > 0
        ? await validateParsedSprayData(
            { plots, products: ctgbProducts, date: registrationDate.toISOString() },
            allParcels.map(p => ({
                id: p.id,
                name: p.name,
                area: p.area || 0,
                crop: p.crop,
                variety: p.variety,
            })) as any,
            allProducts,
            parcelHistory as any
        )
        : { isValid: true, validationMessage: '', errorCount: 0, warningCount: 0 };

    // Build validation flags from CTGB validation result
    const validationFlags: Array<{ type: 'error' | 'warning' | 'info'; message: string; field?: string }> = [];
    if (validationResult.validationMessage) {
        validationFlags.push({
            type: validationResult.errorCount > 0 ? 'error' : 'warning',
            message: validationResult.validationMessage,
        });
    }

    // Step 7b: Run draft validation (business rules)
    const draftValidationContext: SmartInputUserContext = userContext || {
        parcels: allParcels.map(p => ({
            id: p.id,
            name: p.name,
            crop: p.crop,
            variety: p.variety,
            area: p.area,
        })),
        products: allProducts.map(p => ({
            id: p.id,
            naam: p.naam,
            toelatingsnummer: p.toelatingsnummer,
            categorie: p.categorie || null,
            werkzameStoffen: p.werkzameStoffen || [],
            gebruiksvoorschriften: (p.gebruiksvoorschriften || []).map((g: { gewas?: string; doelorganisme?: string; dosering?: string; maxToepassingen?: number }) => ({
                gewas: g.gewas || '',
                doelorganisme: g.doelorganisme,
                dosering: g.dosering,
                maxToepassingen: g.maxToepassingen,
            })),
        })),
        recentHistory: [],
        productAliases: [],
        loadedAt: new Date().toISOString(),
    };

    const draftValidation = validateDraft(registrationGroup, draftValidationContext);
    console.log(`[${context}] ${formatValidationResult(draftValidation)}`);

    // Merge draft validation issues into validationFlags
    for (const issue of draftValidation.issues) {
        // Don't duplicate info about zero dosage (already handled by CTGB validation)
        if (issue.code === 'ZERO_DOSAGE') continue;

        validationFlags.push({
            type: issue.severity,
            message: issue.message,
            field: issue.field,
        });
    }

    // Step 8: Check for unknown products - enrich with resolved flag + suggestions
    const unknownProducts: string[] = [];
    for (const prod of products) {
        if (prod.source === 'fertilizer') {
            prod.resolved = true;
            continue;
        }

        const ctgbMatch = allProducts.find(cp =>
            cp.naam.toLowerCase() === prod.product.toLowerCase() ||
            cp.naam.toLowerCase().includes(prod.product.toLowerCase()) ||
            prod.product.toLowerCase().includes(cp.naam.toLowerCase())
        );
        if (ctgbMatch) {
            prod.resolved = true;
        } else {
            prod.resolved = false;
            prod.suggestions = getProductSuggestions(prod.product, allProducts);
            unknownProducts.push(prod.product);
        }
    }

    if (unknownProducts.length > 0) {
        const names = unknownProducts.join(', ');
        console.log(`[${context}] Unknown products detected: ${names}`);
        // Warning ipv error - blokkeer de draft niet
        for (const name of unknownProducts) {
            const prod = products.find(p => p.product === name);
            const suggestionText = prod?.suggestions?.length
                ? ` Bedoel je: ${prod.suggestions.map(s => s.naam).join(', ')}?`
                : '';
            validationFlags.push({
                type: 'warning',
                message: `"${name}" is niet gevonden in de CTGB database.${suggestionText} Je kunt het product later toewijzen.`,
                field: 'products',
            });
        }
    }

    // Step 9: Generate human summary
    const parcelNames = plots
        .map(id => allParcels.find(p => p.id === id)?.name || id)
        .slice(0, 3);
    const parcelSummary = parcelNames.length > 3
        ? `${parcelNames.join(', ')} en ${plots.length - 3} andere`
        : parcelNames.join(', ');

    const productSummary = products
        .map(p => p.dosage > 0 ? `${p.product} ${p.dosage} ${p.unit}` : p.product)
        .join(', ');

    let humanSummary = '';
    const needsDosage = products.some(p => p.dosage === 0);
    // Track whether user intended to specify plots (for BUG-005 fix)
    const userSpecifiedPlots = preProcessed.preResolvedPlots !== null || (sprayData.plots && sprayData.plots.length > 0);

    if (plots.length === 0 && products.length > 0 && needsDosage && userSpecifiedPlots) {
        // User specified plots AND products but plots failed to resolve AND dosage is missing
        // BUG-005 fix: prioritize the most helpful question
        humanSummary = `Kon de percelen niet herkennen. Welke percelen bedoel je?`;
    } else if (plots.length === 0 && products.length > 0 && !needsDosage && userSpecifiedPlots) {
        // User specified plots + products with dosage, but plots failed
        humanSummary = `Kon de percelen niet herkennen. Welke percelen bedoel je?`;
    } else if (plots.length === 0) {
        humanSummary = 'Welke percelen?';
    } else if (products.length === 0) {
        humanSummary = `${parcelSummary}. Welk middel?`;
    } else if (needsDosage) {
        const actionVerb = registrationType === 'spreading' ? 'Gestrooid op' : 'Gespoten op';
        humanSummary = `${actionVerb} ${parcelSummary} met ${productSummary}. Welke dosering?`;
    } else {
        const actionVerb = registrationType === 'spreading' ? 'Gestrooid op' : 'Gespoten op';
        humanSummary = `${actionVerb} ${parcelSummary} met ${productSummary}.`;
    }

    // Determine response action
    // Unknown products no longer block draft creation - they get warning flags + suggestions
    let responseAction: SmartInputV2Response['action'] = 'new_draft';
    if (needsDosage) {
        responseAction = 'clarification_needed';
    } else if (plots.length === 0) {
        responseAction = 'clarification_needed';
    }

    // Step 10: Build response
    const response: SmartInputV2Response = {
        action: responseAction,
        humanSummary,
        registration: registrationGroup,
        validationFlags: validationFlags.length > 0 ? validationFlags : undefined,
        processingTimeMs: Date.now() - startTime,
    };

    if (needsDosage) {
        const productNeedingDosage = products.find(p => p.dosage === 0);
        const productName = productNeedingDosage?.product || '';
        const lastUsed = lastUsedDosages.get(productName);

        // Build clarification with options if we have last used dosage
        const clarificationOptions: string[] = [];
        if (lastUsed) {
            const dateStr = lastUsed.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
            clarificationOptions.push(`${lastUsed.dosage} ${lastUsed.unit} (vorige keer: ${dateStr})`);
        }

        response.clarification = {
            question: lastUsed
                ? `Welke dosering voor ${productName}? Vorige keer: ${lastUsed.dosage} ${lastUsed.unit}`
                : `Welke dosering voor ${productName}?`,
            options: clarificationOptions.length > 0 ? clarificationOptions : undefined,
            field: 'dosage',
        };
    }

    send({ type: 'complete', response });
}

// ============================================================================
// PATH 2: Agent Message Handler
// ============================================================================

async function handleAgentMessage(
    message: string,
    conversationHistory: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }>,
    currentDraft: SprayRegistrationGroup,
    userId: string,
    send: (msg: StreamMessageV2) => void,
    context: string,
    userContext?: SmartInputUserContext
): Promise<void> {
    const startTime = Date.now();

    send({ type: 'processing', phase: 'Agent denkt na...' });

    // Use client-provided context OR fetch from database (fallback)
    let allParcels: SprayableParcel[];

    if (userContext?.parcels?.length) {
        // Use client-provided context - NO database calls!
        console.log(`[${context}] Agent using client-provided context`);
        allParcels = userContext.parcels.map(p => ({
            id: p.id,
            name: p.name,
            parcelId: p.id,
            parcelName: p.name,
            crop: p.crop,
            variety: p.variety,
            area: p.area,
        })) as SprayableParcel[];
    } else {
        // Fallback: Fetch from database
        console.log(`[${context}] Agent fetching parcels from database...`);
        allParcels = await getSprayableParcels();
    }

    // Fetch parcel groups for name resolution
    let parcelGroups: Array<{ id: string; name: string; subParcelIds: string[] }> = [];
    try {
        parcelGroups = await getParcelGroupsWithMemberIds();
    } catch (e) {
        console.warn(`[${context}] Agent: Failed to load parcel groups:`, e);
    }

    const parcelContext = allParcels.map(p => ({
        id: p.id,
        name: p.name,
        crop: p.crop || 'Onbekend',
        variety: p.variety || 'Onbekend',
    }));

    // Convert draft date to string if needed
    const draftForAgent = {
        ...currentDraft,
        date: currentDraft.date instanceof Date
            ? currentDraft.date.toISOString().split('T')[0]
            : String(currentDraft.date).split('T')[0],
        units: currentDraft.units.map(u => ({
            ...u,
            date: u.date
                ? (u.date instanceof Date ? u.date.toISOString().split('T')[0] : String(u.date).split('T')[0])
                : undefined,
        })),
    };

    // Wrap entire agent stream in requestContext so AI tools get verified userId
    await requestContext.run({ userId }, async () => {
        const agentStream = registrationAgentStream({
            userMessage: message,
            currentDraft: draftForAgent,
            conversationHistory: conversationHistory.map(m => ({
                role: m.role,
                content: m.content,
            })),
            userId,
            parcelContext,
        });

        let finalOutput: AgentOutput | null = null;

        for await (const event of agentStream) {
            switch (event.type) {
                case 'thinking':
                    send({ type: 'processing', phase: 'Agent analyseert...' });
                    break;

                case 'tool_call':
                    send({ type: 'tool_call', tool: event.tool, input: event.input });
                    break;

                case 'tool_result':
                    send({ type: 'tool_result', tool: event.tool, success: true });
                    break;

                case 'complete':
                    finalOutput = event.output;
                    break;

                case 'error':
                    send({ type: 'error', message: event.message });
                    return;
            }
        }

        if (!finalOutput) {
            send({ type: 'error', message: 'Agent produceerde geen output' });
            return;
        }

        // Convert agent output to API response
        const response: SmartInputV2Response = {
            action: finalOutput.action === 'update_draft' ? 'update_draft'
                : finalOutput.action === 'clarification_needed' ? 'clarification_needed'
                : finalOutput.action === 'confirm_and_save' ? 'confirm_and_save'
                : finalOutput.action === 'cancel' ? 'cancel'
                : 'answer_query',
            humanSummary: finalOutput.humanSummary,
            processingTimeMs: Date.now() - startTime,
            toolsCalled: finalOutput.toolsCalled,
        };

        // Add registration if available (with parcel name-to-ID resolution)
        if (finalOutput.updatedDraft) {
            response.registration = {
                groupId: finalOutput.updatedDraft.groupId,
                date: new Date(finalOutput.updatedDraft.date),
                rawInput: finalOutput.updatedDraft.rawInput,
                units: finalOutput.updatedDraft.units.map(u => ({
                    id: u.id,
                    // Resolve any parcel names to IDs (agent might return names)
                    plots: resolveParcelNamesToIds(u.plots, allParcels, parcelGroups),
                    products: u.products,
                    label: u.label,
                    status: u.status,
                    date: u.date ? new Date(u.date) : undefined,
                })),
            };
        }

        // Add clarification if needed
        if (finalOutput.clarification) {
            response.clarification = finalOutput.clarification;
        }

        // Add query answer if this was a question
        if (finalOutput.queryAnswer) {
            response.queryAnswer = finalOutput.queryAnswer;
        }

        send({ type: 'complete', response });
    });
}
