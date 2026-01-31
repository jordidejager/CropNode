/**
 * Parcel Resolver Service
 *
 * Handelt de resolutie van groepsaanduidingen naar specifieke percelen:
 * - "alle peren" → alle percelen met gewas 'Peer'
 * - "alle appels" → alle percelen met gewas 'Appel'
 * - "alles" / "alle percelen" → alle actieve percelen
 * - "de elstars" → alle percelen met ras 'Elstar'
 *
 * Uses SprayableParcel (from v_sprayable_parcels view) where sub-parcels
 * are the "unit of work" with pre-resolved crop/variety.
 */

import type { SprayableParcel } from './supabase-store';

// Type alias for backward compatibility
type ActiveParcel = SprayableParcel;

// ============================================
// Group Keywords Detection
// ============================================

/**
 * Patronen voor het detecteren van groepsaanduidingen
 */
const GROUP_PATTERNS = {
    // "alle X" patronen
    allCrops: /alle?\s+(appels?|peren?|kersen?|pruimen?|aardbeien?|frambozen?|druiven?|aardappels?|uien?|tomaten?|paprika'?s?)/i,

    // "de X" patronen (voor rassen)
    theVariety: /de\s+(elstars?|jonagolds?|braeburns?|goldens?|conferences?|doyennes?|boskoop)/i,

    // "alles" of "alle percelen"
    everything: /\b(alles|alle\s+percelen?|overal)\b/i,

    // Specifieke gewas groepen
    fruitTrees: /\b(alle?\s+)?(fruit|fruitbomen?|boomgaard)\b/i,
    stoneFruit: /\b(alle?\s+)?(steenvruchten?|pitvruchten?)\b/i,
};

/**
 * Mapping van groepsnamen naar gewas-zoektermen
 * Inclusief variaties en afkortingen
 */
const CROP_MAPPINGS: Record<string, string[]> = {
    // Enkelvoud en meervoud - met meer variaties
    'appel': ['appel', 'apple', 'appels'],
    'appels': ['appel', 'apple', 'appels'],
    'peer': ['peer', 'pear', 'peren', 'conference', 'doyenne'],
    'peren': ['peer', 'pear', 'peren', 'conference', 'doyenne'],
    'kers': ['kers', 'cherry', 'kersen'],
    'kersen': ['kers', 'cherry', 'kersen'],
    'pruim': ['pruim', 'plum', 'pruimen'],
    'pruimen': ['pruim', 'plum', 'pruimen'],
    'aardbei': ['aardbei', 'strawberry', 'aardbeien'],
    'aardbeien': ['aardbei', 'strawberry', 'aardbeien'],
    'framboos': ['framboos', 'raspberry', 'frambozen'],
    'frambozen': ['framboos', 'raspberry', 'frambozen'],
    'druif': ['druif', 'grape', 'druiven'],
    'druiven': ['druif', 'grape', 'druiven'],
    'aardappel': ['aardappel', 'potato', 'aardappelen'],
    'aardappelen': ['aardappel', 'potato', 'aardappelen'],
    'ui': ['ui', 'onion', 'uien'],
    'uien': ['ui', 'onion', 'uien'],
    'tomaat': ['tomaat', 'tomato', 'tomaten'],
    'tomaten': ['tomaat', 'tomato', 'tomaten'],
    'paprika': ['paprika', 'pepper'],
    "paprika's": ['paprika', 'pepper'],
};

/**
 * Mapping van rasnamen naar zoektermen
 */
const VARIETY_MAPPINGS: Record<string, string[]> = {
    'elstar': ['elstar'],
    'elstars': ['elstar'],
    'jonagold': ['jonagold'],
    'jonagolds': ['jonagold'],
    'braeburn': ['braeburn'],
    'braeburns': ['braeburn'],
    'golden': ['golden', 'golden delicious'],
    'goldens': ['golden', 'golden delicious'],
    'conference': ['conference'],
    'conferences': ['conference'],
    'doyenne': ['doyenne', 'doyenné'],
    'doyennes': ['doyenne', 'doyenné'],
    'boskoop': ['boskoop', 'goudreinette'],
};

// ============================================
// Types
// ============================================

export interface ParcelResolutionResult {
    type: 'specific' | 'crop_group' | 'variety_group' | 'all';
    matchedParcels: ActiveParcel[];
    originalQuery: string;
    resolvedTo: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract crop from SprayableParcel.
 * The v_sprayable_parcels view provides crop directly from sub_parcels,
 * so we just need to return it. Falls back to name parsing only if crop is 'Onbekend'.
 */
function getParcelCrop(parcel: ActiveParcel): string {
    // The view already resolves crop from sub_parcels with COALESCE to 'Onbekend'
    const crop = parcel.crop.toLowerCase();

    // If we have a real crop value, use it
    if (crop && crop !== 'onbekend') {
        return crop;
    }

    // Fallback: try to extract from parcel name (for legacy data)
    const nameLower = parcel.name.toLowerCase();
    if (nameLower.includes('peer') || nameLower.includes('pear') || nameLower.includes('conference') || nameLower.includes('doyenne')) {
        return 'peer';
    }
    if (nameLower.includes('appel') || nameLower.includes('apple') || nameLower.includes('elstar') || nameLower.includes('jonagold') || nameLower.includes('braeburn')) {
        return 'appel';
    }
    if (nameLower.includes('kers') || nameLower.includes('cherry')) {
        return 'kers';
    }
    if (nameLower.includes('pruim') || nameLower.includes('plum')) {
        return 'pruim';
    }

    return '';
}

/**
 * Extract variety from SprayableParcel.
 * The v_sprayable_parcels view provides variety directly from sub_parcels.
 * Falls back to name parsing only if variety is null.
 */
function getParcelVariety(parcel: ActiveParcel): string {
    // The view already resolves variety from sub_parcels
    if (parcel.variety) {
        return parcel.variety.toLowerCase();
    }

    // Fallback: try to extract from parcel name (for legacy data)
    const nameLower = parcel.name.toLowerCase();
    const varieties = ['elstar', 'jonagold', 'braeburn', 'golden', 'conference', 'doyenne', 'boskoop', 'goudreinette'];
    for (const variety of varieties) {
        if (nameLower.includes(variety)) {
            return variety;
        }
    }

    return '';
}

// ============================================
// Main Resolution Functions
// ============================================

/**
 * Detecteer en resoleer groepsaanduidingen in gebruikersinvoer
 */
export function detectParcelGroups(userInput: string): {
    hasGroupKeyword: boolean;
    groupType: 'all' | 'crop' | 'variety' | null;
    groupValue: string | null;
} {
    const normalizedInput = userInput.toLowerCase();

    // Check "alles" of "alle percelen"
    if (GROUP_PATTERNS.everything.test(normalizedInput)) {
        return { hasGroupKeyword: true, groupType: 'all', groupValue: 'alles' };
    }

    // Check "alle [gewas]"
    const cropMatch = normalizedInput.match(GROUP_PATTERNS.allCrops);
    if (cropMatch) {
        return { hasGroupKeyword: true, groupType: 'crop', groupValue: cropMatch[1].toLowerCase() };
    }

    // Check "de [ras]"
    const varietyMatch = normalizedInput.match(GROUP_PATTERNS.theVariety);
    if (varietyMatch) {
        return { hasGroupKeyword: true, groupType: 'variety', groupValue: varietyMatch[1].toLowerCase() };
    }

    // Check fruit categorieën
    if (GROUP_PATTERNS.fruitTrees.test(normalizedInput)) {
        return { hasGroupKeyword: true, groupType: 'crop', groupValue: 'fruit' };
    }

    return { hasGroupKeyword: false, groupType: null, groupValue: null };
}

/**
 * Resoleer percelen op basis van groepsaanduiding.
 * Uses SprayableParcel which has crop/variety pre-resolved from v_sprayable_parcels view.
 */
export function resolveParcelGroup(
    groupType: 'all' | 'crop' | 'variety',
    groupValue: string,
    allParcels: ActiveParcel[]
): ActiveParcel[] {
    console.log(`[resolveParcelGroup] Resolving ${groupType}="${groupValue}" from ${allParcels.length} parcels`);

    switch (groupType) {
        case 'all':
            return allParcels;

        case 'crop': {
            // Special case: "fruit" = appels + peren + kersen + pruimen
            if (groupValue === 'fruit') {
                const result = allParcels.filter(p => {
                    const crop = getParcelCrop(p);
                    return crop.includes('appel') || crop.includes('peer') ||
                        crop.includes('kers') || crop.includes('pruim');
                });
                console.log(`[resolveParcelGroup] "fruit" matched ${result.length} parcels`);
                return result;
            }

            const cropTerms = CROP_MAPPINGS[groupValue] || [groupValue];
            const result = allParcels.filter(p => {
                const crop = getParcelCrop(p);
                const matches = cropTerms.some(term => crop.includes(term));
                if (matches) {
                    console.log(`[resolveParcelGroup] Parcel "${p.name}" matched crop="${crop}" with terms [${cropTerms.join(', ')}]`);
                }
                return matches;
            });
            console.log(`[resolveParcelGroup] crop="${groupValue}" matched ${result.length} parcels: ${result.map(p => p.name).join(', ')}`);
            return result;
        }

        case 'variety': {
            const varietyTerms = VARIETY_MAPPINGS[groupValue] || [groupValue];
            const result = allParcels.filter(p => {
                const variety = getParcelVariety(p);
                return varietyTerms.some(term => variety.includes(term));
            });
            console.log(`[resolveParcelGroup] variety="${groupValue}" matched ${result.length} parcels`);
            return result;
        }

        default:
            return [];
    }
}

/**
 * Volledige perceel resolutie vanuit natuurlijke taal.
 * Uses SprayableParcel which has crop/variety pre-resolved from v_sprayable_parcels view.
 */
export function resolvePercelsFromInput(
    userInput: string,
    allParcels: ActiveParcel[]
): ParcelResolutionResult | null {
    const { hasGroupKeyword, groupType, groupValue } = detectParcelGroups(userInput);

    if (!hasGroupKeyword || !groupType || !groupValue) {
        return null;
    }

    const matchedParcels = resolveParcelGroup(groupType, groupValue, allParcels);

    let resolvedTo: string;
    switch (groupType) {
        case 'all':
            resolvedTo = `Alle ${matchedParcels.length} percelen`;
            break;
        case 'crop':
            resolvedTo = `Alle ${groupValue} percelen (${matchedParcels.length})`;
            break;
        case 'variety':
            resolvedTo = `Alle ${groupValue} percelen (${matchedParcels.length})`;
            break;
        default:
            resolvedTo = `${matchedParcels.length} percelen`;
    }

    return {
        type: groupType === 'all' ? 'all' : groupType === 'crop' ? 'crop_group' : 'variety_group',
        matchedParcels,
        originalQuery: userInput,
        resolvedTo
    };
}

/**
 * Pre-process perceel context voor AI prompt.
 * Voegt groepsinformatie toe zodat de AI weet welke groepen beschikbaar zijn.
 * Uses SprayableParcel which has crop/variety pre-resolved from v_sprayable_parcels view.
 */
export function buildParcelContextWithGroups(parcels: ActiveParcel[]): {
    parcelList: Array<{ id: string; name: string; crop: string; variety: string }>;
    availableGroups: string[];
} {
    // Extract crop and variety using helpers that check sub-parcels
    const parcelList = parcels.map(p => ({
        id: p.id,
        name: p.name,
        crop: getParcelCrop(p),
        variety: getParcelVariety(p)
    }));

    // Collect unique crops and varieties (now from helper functions)
    const crops = new Set<string>();
    const varieties = new Set<string>();

    for (const p of parcels) {
        const crop = getParcelCrop(p);
        const variety = getParcelVariety(p);
        if (crop) crops.add(crop);
        if (variety) varieties.add(variety);
    }

    console.log(`[buildParcelContextWithGroups] Found crops: ${[...crops].join(', ')}`);
    console.log(`[buildParcelContextWithGroups] Found varieties: ${[...varieties].join(', ')}`);

    // Build available group descriptions
    const availableGroups: string[] = [];

    // Add crop groups
    for (const crop of crops) {
        const count = parcels.filter(p => getParcelCrop(p) === crop).length;
        if (count > 0) {
            // Better pluralization for Dutch
            let plural = crop;
            if (crop === 'appel') plural = 'appels';
            else if (crop === 'peer') plural = 'peren';
            else if (crop === 'kers') plural = 'kersen';
            else if (crop === 'pruim') plural = 'pruimen';
            else if (crop.endsWith('l')) plural = crop + 'en';
            else plural = crop + 's';

            availableGroups.push(`"alle ${plural}" → ${count} percelen met gewas ${crop}`);
        }
    }

    // Add variety groups
    for (const variety of varieties) {
        const count = parcels.filter(p => getParcelVariety(p) === variety).length;
        if (count > 0) {
            availableGroups.push(`"de ${variety}s" → ${count} percelen met ras ${variety}`);
        }
    }

    // Add "alles" option
    availableGroups.push(`"alles" of "alle percelen" → alle ${parcels.length} percelen`);

    return { parcelList, availableGroups };
}
