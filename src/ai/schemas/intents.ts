/**
 * @fileOverview Intent Schema Definitions for AgriBot
 *
 * Dit bestand definieert alle mogelijke gebruikers-intenties die AgriBot kan herkennen.
 * De IntentRouter gebruikt deze schemas om binnenkomende input te classificeren
 * VOORDAT er zware AI-processing plaatsvindt.
 */

import { z } from 'zod';

/**
 * Alle mogelijke intent types die AgriBot kan herkennen.
 *
 * Voorbeelden per type:
 * - REGISTER_SPRAY: "Gisteren 2L Captan op alle peren"
 * - QUERY_PRODUCT: "Welke middelen tegen schurft?"
 * - QUERY_HISTORY: "Hoeveel heb ik dit jaar gespoten?"
 * - QUERY_REGULATION: "Wat is de VGT van Captan?"
 * - NAVIGATE: "Ga naar perceel Thuis"
 * - CONFIRM: "Ja, klopt" / "Nee, niet X"
 * - CANCEL: "Stop" / "Vergeet het"
 * - CLARIFY: "Wat bedoel je?" / "Hoe werkt dit?"
 * - MODIFY_DRAFT: "Nee, niet perceel X" / "Voeg ook Y toe"
 */
export const IntentType = z.enum([
  'REGISTER_SPRAY',
  'LOG_HOURS',
  'QUERY_PRODUCT',
  'QUERY_HISTORY',
  'QUERY_REGULATION',
  'NAVIGATE',
  'CONFIRM',
  'CANCEL',
  'CLARIFY',
  'MODIFY_DRAFT',
]);

export type IntentType = z.infer<typeof IntentType>;

/**
 * Output schema voor de Intent Router.
 * Bevat het gedetecteerde intent type plus een confidence score.
 */
export const IntentClassificationSchema = z.object({
  intent: IntentType.describe('Het gedetecteerde intent type'),
  confidence: z.number().min(0).max(1).describe('Confidence score tussen 0 en 1'),
  reasoning: z.string().optional().describe('Korte uitleg waarom dit intent is gekozen (voor debugging)'),
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;

/**
 * Input schema voor de Intent Router.
 * Bevat de ruwe gebruikersinput plus optionele context.
 */
export const IntentRouterInputSchema = z.object({
  userInput: z.string().describe('De ruwe tekst input van de gebruiker'),
  hasDraft: z.boolean().default(false).describe('Is er een actieve draft (voor MODIFY_DRAFT detectie)'),
  conversationContext: z.string().optional().describe('Samenvatting van eerdere berichten indien relevant'),
});

export type IntentRouterInput = z.infer<typeof IntentRouterInputSchema>;

/**
 * Signaalwoorden per intent type voor snelle pre-filtering.
 * Deze worden gebruikt voor deterministische pre-classificatie VOOR de AI.
 */
export const INTENT_SIGNALS: Record<IntentType, string[]> = {
  REGISTER_SPRAY: [
    'gespoten', 'spuiten', 'bespuiting', 'bespoten', 'behandeld',
    'gisteren', 'vandaag', 'vorige week', 'l/ha', 'kg/ha', 'liter', 'kilo',
    // [NIEUW] Gewas + product patronen
    'appels met', 'peren met', 'fruit met', 'alle appels', 'alle peren',
    // [NIEUW] Variatie-patronen wijzen op registratie, niet query
    'maar ook', 'behalve', 'halve dosering'
  ],
  LOG_HOURS: [
    // Uren/tijd indicatoren
    'uur', 'uren', 'u gewerkt', 'uur gewerkt', 'hele dag', 'halve dag',
    // Activiteiten
    'gesnoeid', 'snoeien', 'gedund', 'dunnen', 'geplukt', 'plukken',
    'gemaaid', 'maaien', 'gesorteerd', 'sorteren', 'onderhoud',
    'boomverzorging', 'gewerkt op', 'gewerkt aan',
    // Team indicatoren
    'met z\'n', 'samen met', 'man', 'personen', 'persoon', 'mensen',
    // Timer commands (not NL parsing, but for completeness)
    'start timer', 'stop timer'
  ],
  QUERY_PRODUCT: [
    'welke middelen', 'wat kan ik', 'wat mag ik', 'alternatieven',
    'waarmee', 'welk middel', 'tegen'
  ],
  QUERY_HISTORY: [
    'hoeveel', 'wanneer', 'laatste keer', 'dit seizoen', 'dit jaar',
    'geschiedenis', 'overzicht', 'totaal'
  ],
  QUERY_REGULATION: [
    'vgt', 'veiligheidstermijn', 'wachttijd', 'dosering', 'maximum',
    'toegelaten', 'mag ik', 'regels', 'voorschrift'
  ],
  NAVIGATE: [
    'ga naar', 'open', 'toon', 'laat zien', 'bekijk'
  ],
  CONFIRM: [
    'ja', 'klopt', 'correct', 'akkoord', 'bevestig', 'oke', 'ok', 'prima'
  ],
  CANCEL: [
    'stop', 'annuleer', 'vergeet', 'laat maar', 'nee bedankt', 'cancel'
  ],
  CLARIFY: [
    'wat bedoel', 'hoe werkt', 'leg uit', 'help', 'snap niet', 'onduidelijk'
  ],
  MODIFY_DRAFT: [
    'niet', 'toch niet', 'behalve', 'zonder', 'ook', 'en ook',
    'voeg toe', 'verwijder', 'wijzig', 'pas aan',
    // Date-split patterns (when hasDraft is true, these indicate modifications)
    'trouwens', 'de rest', 'eigenlijk', 'andere', 'overige'
  ],
};

/**
 * Detect date-split patterns like:
 * - "Plantsoen trouwens gisteren gespoten, de rest vandaag"
 * - "X gisteren, Y vandaag"
 * - "de rest eigenlijk vorige week"
 * - "Stadhoek heb ik gisteren gespoten" (implicit split - Bug 1 fix)
 *
 * These patterns indicate the user wants to split the draft into multiple
 * registration groups with different dates.
 */
export function isDateSplitPattern(input: string): boolean {
  const dateSplitPatterns = [
    // "X trouwens gisteren/vandaag/vorige week"
    /\btrouwens\s+(gisteren|vandaag|vorige\s+week|maandag|dinsdag|woensdag|donderdag|vrijdag)/i,
    // "de rest vandaag/gisteren"
    /\bde\s+rest\s+(vandaag|gisteren|vorige\s+week|gewoon\s+vandaag)/i,
    // "X gisteren, Y vandaag" or "X gisteren en Y vandaag"
    /\b(gisteren|vandaag|vorige\s+week).{0,30}\b(gisteren|vandaag|vorige\s+week|de\s+rest)/i,
    // "eigenlijk gisteren gespoten"
    /\beigenlijk\s+(gisteren|vandaag|vorige\s+week)/i,
    // "de overige vandaag" or "andere percelen gisteren"
    /\b(overige|andere)\s+(percelen\s+)?(gisteren|vandaag|vorige\s+week)/i,

    // === Bug 1 Fix: Implicit date-split patterns ===
    // "X heb ik gisteren gespoten" - implies X is different from the rest
    /\b\w+\s+heb\s+ik\s+(gisteren|vandaag|vorige\s+week)\s+(gespoten|gedaan|behandeld)/i,
    // "X was gisteren" or "X is gisteren gespoten"
    /\b\w+\s+(was|is|heb)\s+(gisteren|vandaag|vorige\s+week)/i,
    // "X gisteren gespoten" (without "heb ik") - direct statement
    /^\w+\s+(gisteren|vandaag|vorige\s+week)\s+(gespoten|gedaan|behandeld)/i,
    // "gisteren de X gespoten" or "gisteren X gedaan"
    /\b(gisteren|vandaag|vorige\s+week)\s+(de\s+)?\w+\s+(gespoten|gedaan|behandeld)/i,
    // "X deed ik gisteren" or "X gespoten gisteren"
    /\b\w+\s+(deed\s+ik|gespoten)\s+(gisteren|vandaag|vorige\s+week)/i,
    // "alleen X gisteren" or "wel X gisteren"
    /\b(alleen|wel)\s+\w+\s+(gisteren|vandaag|vorige\s+week)/i,
    // "alleen X was gisteren" - with "was" between name and date
    /\b(alleen|wel)\s+\w+\s+was\s+(gisteren|vandaag|vorige\s+week)/i,
    // "oh ja X was gisteren" - with "oh ja" prefix
    /\boh\s+ja\s+\w+\s+(was|heb\s+ik)?\s*(gisteren|vandaag|vorige\s+week)/i,
    // "ja X was gisteren" - with "ja" prefix
    /^ja\s+\w+\s+(was|heb\s+ik)?\s*(gisteren|vandaag|vorige\s+week)/i,
  ];

  return dateSplitPatterns.some(pattern => pattern.test(input));
}

/**
 * Pre-filter functie die op basis van signaalwoorden een waarschijnlijk intent detecteert.
 * Dit is een snelle, deterministische check VOOR de AI-classificatie.
 *
 * @returns Het meest waarschijnlijke intent of null als onduidelijk
 */
export function preClassifyIntent(
  userInput: string,
  hasDraft: boolean
): { intent: IntentType; confidence: number } | null {
  const normalizedInput = userInput.toLowerCase().trim();

  // Speciale case: korte bevestigingen/afwijzingen
  if (normalizedInput.length < 10) {
    if (/^(ja|ok|oke|prima|klopt|correct|akkoord)[\s!.]*$/i.test(normalizedInput)) {
      return { intent: 'CONFIRM', confidence: 0.95 };
    }
    if (/^(nee|stop|cancel|annuleer)[\s!.]*$/i.test(normalizedInput)) {
      return hasDraft ? { intent: 'CANCEL', confidence: 0.9 } : null;
    }
  }

  // Check voor MODIFY_DRAFT als er een draft is
  if (hasDraft) {
    // Special case: Date-split patterns like "X gisteren, Y vandaag" or "X trouwens gisteren"
    // These indicate modifying dates of specific parcels within the draft
    if (isDateSplitPattern(normalizedInput)) {
      return { intent: 'MODIFY_DRAFT', confidence: 0.9 };
    }

    const modifySignals = INTENT_SIGNALS.MODIFY_DRAFT;
    for (const signal of modifySignals) {
      if (normalizedInput.includes(signal)) {
        return { intent: 'MODIFY_DRAFT', confidence: 0.8 };
      }
    }
  }

  // Score elke intent op basis van signaalwoorden
  const scores: Partial<Record<IntentType, number>> = {};

  for (const [intent, signals] of Object.entries(INTENT_SIGNALS)) {
    let score = 0;
    for (const signal of signals) {
      if (normalizedInput.includes(signal)) {
        score += signal.split(' ').length; // Langere matches tellen meer
      }
    }
    if (score > 0) {
      scores[intent as IntentType] = score;
    }
  }

  // Vind hoogste score
  const entries = Object.entries(scores) as [IntentType, number][];
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = entries[0];

  // Alleen retourneren als duidelijk genoeg
  if (topScore >= 2) {
    const confidence = Math.min(0.7 + (topScore * 0.05), 0.9);
    return { intent: topIntent, confidence };
  }

  return null;
}

// ============================================================================
// PARAMETER SCHEMAS PER INTENT TYPE
// ============================================================================

/**
 * Parameters voor QUERY_PRODUCT intent.
 * Voorbeelden:
 * - "Welke middelen tegen schurft?" → { targetOrganism: "schurft" }
 * - "Wat kan ik gebruiken op appels?" → { crop: "appel" }
 * - "Alternatieven voor Captan?" → { productName: "Captan" }
 */
export const QueryProductParamsSchema = z.object({
  productName: z.string().optional().describe('Specifiek product waar naar gevraagd wordt'),
  crop: z.string().optional().describe('Gewas waarvoor middelen gezocht worden'),
  targetOrganism: z.string().optional().describe('Doelorganisme (schurft, luis, meeldauw, etc.)'),
  category: z.enum(['fungicide', 'insecticide', 'herbicide', 'all']).optional().describe('Type middel'),
});

export type QueryProductParams = z.infer<typeof QueryProductParamsSchema>;

/**
 * Parameters voor QUERY_HISTORY intent.
 * Voorbeelden:
 * - "Hoeveel heb ik dit jaar gespoten?" → { period: "year" }
 * - "Wanneer heb ik voor het laatst Captan gebruikt?" → { productName: "Captan" }
 * - "Overzicht van perceel Thuis" → { parcelName: "Thuis" }
 */
export const QueryHistoryParamsSchema = z.object({
  period: z.enum(['week', 'month', 'season', 'year', 'all']).optional().describe('Tijdsperiode'),
  productName: z.string().optional().describe('Filter op specifiek product'),
  parcelName: z.string().optional().describe('Filter op specifiek perceel'),
  parcelId: z.string().optional().describe('Perceel ID indien bekend'),
});

export type QueryHistoryParams = z.infer<typeof QueryHistoryParamsSchema>;

/**
 * Parameters voor QUERY_REGULATION intent.
 * Voorbeelden:
 * - "Wat is de VGT van Captan?" → { productName: "Captan", regulationType: "vgt" }
 * - "Maximum dosering voor Decis?" → { productName: "Decis", regulationType: "dosage" }
 */
export const QueryRegulationParamsSchema = z.object({
  productName: z.string().describe('Product waarvoor regelgeving gevraagd wordt'),
  regulationType: z.enum(['vgt', 'dosage', 'interval', 'max_applications', 'general']).optional()
    .describe('Type regelgeving: vgt=veiligheidstermijn, dosage=dosering, interval=spuitinterval'),
  crop: z.string().optional().describe('Specifiek gewas voor gewas-specifieke regels'),
});

export type QueryRegulationParams = z.infer<typeof QueryRegulationParamsSchema>;

/**
 * Parameters voor NAVIGATE intent.
 * Voorbeelden:
 * - "Ga naar perceel Thuis" → { target: "parcel", name: "Thuis" }
 * - "Open het spuitschrift" → { target: "logbook" }
 */
export const NavigateParamsSchema = z.object({
  target: z.enum(['parcel', 'logbook', 'products', 'dashboard', 'settings']).describe('Navigatiedoel'),
  name: z.string().optional().describe('Naam van specifiek item (bijv. perceelnaam)'),
  id: z.string().optional().describe('ID van specifiek item'),
});

export type NavigateParams = z.infer<typeof NavigateParamsSchema>;

/**
 * Unified intent result met parameters.
 * Dit schema wordt gebruikt door de enhanced intent classifier.
 */
export const IntentWithParamsSchema = z.object({
  intent: IntentType.describe('Het gedetecteerde intent type'),
  confidence: z.number().min(0).max(1).describe('Confidence score tussen 0 en 1'),

  // Intent-specifieke parameters (optioneel, afhankelijk van intent type)
  queryProductParams: QueryProductParamsSchema.optional(),
  queryHistoryParams: QueryHistoryParamsSchema.optional(),
  queryRegulationParams: QueryRegulationParamsSchema.optional(),
  navigateParams: NavigateParamsSchema.optional(),
});

export type IntentWithParams = z.infer<typeof IntentWithParamsSchema>;

/**
 * Helper om te bepalen welke parameter schema van toepassing is.
 */
export function getParamsSchemaForIntent(intent: IntentType): z.ZodObject<any> | null {
  switch (intent) {
    case 'QUERY_PRODUCT':
      return QueryProductParamsSchema;
    case 'QUERY_HISTORY':
      return QueryHistoryParamsSchema;
    case 'QUERY_REGULATION':
      return QueryRegulationParamsSchema;
    case 'NAVIGATE':
      return NavigateParamsSchema;
    default:
      return null;
  }
}

/**
 * Utility om parameters uit een IntentWithParams te halen op basis van intent type.
 */
export function extractQueryParams(result: IntentWithParams): {
  type: 'product' | 'history' | 'regulation' | 'navigate' | null;
  params: QueryProductParams | QueryHistoryParams | QueryRegulationParams | null;
} {
  switch (result.intent) {
    case 'QUERY_PRODUCT':
      return { type: 'product', params: result.queryProductParams || {} };
    case 'QUERY_HISTORY':
      return { type: 'history', params: result.queryHistoryParams || {} };
    case 'QUERY_REGULATION':
      return { type: 'regulation', params: result.queryRegulationParams || {} };
    default:
      return { type: null, params: null };
  }
}

/**
 * Snelle check of input waarschijnlijk een registratie is.
 * Kan gebruikt worden voor early-exit optimalisatie.
 */
export function isLikelySprayRegistration(userInput: string): boolean {
  const normalizedInput = userInput.toLowerCase();

  // Bevat dosering patroon
  if (/\d+[,.]?\d*\s*(l|kg|ml|g)(\/ha)?/i.test(normalizedInput)) {
    return true;
  }

  // Bevat datum-achtige woorden
  if (/(gisteren|vandaag|vorige\s+week|maandag|dinsdag|woensdag|donderdag|vrijdag)/i.test(normalizedInput)) {
    return true;
  }

  // Bevat spray-gerelateerde woorden
  if (/(gespoten|spuiten|bespuiting|behandeld|gespuit)/i.test(normalizedInput)) {
    return true;
  }

  // [NIEUW] Bevat "[gewas/perceel] met [product]" patroon - typisch registratie
  // Voorbeelden: "alle appels met Merpan", "peren met Score", "Elstar met Captan"
  if (/\b(alle|de)?\s*(appel|peer|kers|pruim|fruit|elstar|jonagold|conference|kanzi|lucas|tessa|greenstar)\w*\s+(met|gespoten)\s+\w+/i.test(normalizedInput)) {
    return true;
  }

  // [NIEUW] Bevat variatie-patronen die wijzen op grouped registratie
  // Voorbeelden: "maar ... ook", "behalve", "zonder de", "halve dosering"
  if (/\bmaar\b.*\b(ook|extra|nog)\b/i.test(normalizedInput)) {
    return true;
  }
  if (/\b(behalve|uitgezonderd|zonder de)\b/i.test(normalizedInput)) {
    return true;
  }
  if (/\bhalve\s*(dosering|dosis)\b/i.test(normalizedInput)) {
    return true;
  }

  return false;
}

/**
 * Type guard voor specifieke intents
 */
export function isQueryIntent(intent: IntentType): boolean {
  return ['QUERY_PRODUCT', 'QUERY_HISTORY', 'QUERY_REGULATION'].includes(intent);
}

export function isActionIntent(intent: IntentType): boolean {
  return ['REGISTER_SPRAY', 'CONFIRM', 'CANCEL', 'MODIFY_DRAFT'].includes(intent);
}
