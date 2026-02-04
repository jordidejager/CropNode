/**
 * AgriBot System Prompts v2.0 - Optimized for Speed and Precision
 *
 * ARCHITECTUUR:
 * - AI doet alleen intent parsing en structurele extractie
 * - Validatie gebeurt NIET door de AI maar door TypeScript code
 * - AI mag NOOIT productnamen of perceelnamen verzinnen
 * - AI geeft zoektermen terug, backend doet fuzzy matching
 */

import { z } from 'zod';

// ============================================
// Zod Schemas voor AI Output
// ============================================

/**
 * Product entry zoals geparsed door AI
 * Let op: 'search_term' i.p.v. exacte naam - backend resolveert
 */
export const ProductEntrySchema = z.object({
  search_term: z.string().describe('De ruwe zoekterm voor het product (bijv. "Chorus", "captan")'),
  dosage: z.number().describe('De dosering als nummer'),
  unit: z.string().describe('De eenheid (kg, l, ml, g) - met of zonder /ha'),
  target_reason: z.string().optional().describe('Doelorganisme indien genoemd (bijv. "schurft", "luis")'),
});

/**
 * Locatie filter met set operations
 * Voorbeeld: "Alle appels behalve Tessa" → include: {crop: "Appel"}, exclude: {variety: "Tessa"}
 */
export const LocationFilterSchema = z.object({
  include: z.object({
    crop_type: z.string().optional().describe('Gewas om te includeren (bijv. "Appel", "Peer")'),
    variety: z.string().optional().describe('Ras om te includeren'),
    parcel_name: z.string().optional().describe('Specifieke perceelnaam'),
  }).optional(),
  exclude: z.object({
    crop_type: z.string().optional().describe('Gewas om uit te sluiten'),
    variety: z.string().optional().describe('Ras om uit te sluiten (bijv. "Tessa")'),
    parcel_name: z.string().optional().describe('Specifieke perceelnaam om uit te sluiten'),
  }).optional(),
  specific_ids: z.array(z.string()).optional().describe('Specifieke perceel IDs indien letterlijk genoemd'),
});

/**
 * Intent types
 */
export const IntentTypeSchema = z.enum([
  'register_spray',      // Registreer een bespuiting
  'query_product',       // Vraag over middelen
  'query_history',       // Vraag over spuitgeschiedenis
  'query_regulation',    // Vraag over regels/VGT
  'confirm',             // Bevestiging
  'cancel',              // Annulering
  'modify_draft',        // Wijzig concept
  'unknown',             // Niet herkend
]);

/**
 * Volledig AI output schema
 */
export const AgribotParseResultSchema = z.object({
  intent: IntentTypeSchema,
  confidence: z.number().min(0).max(1).describe('Zekerheid van de parsing'),

  // Alleen voor register_spray
  date: z.string().optional().describe('Datum in YYYY-MM-DD formaat'),
  products: z.array(ProductEntrySchema).optional(),
  location_filter: LocationFilterSchema.optional(),

  // Alleen voor queries
  query_subject: z.string().optional().describe('Onderwerp van de vraag'),

  // Alleen voor modify_draft
  modification_type: z.enum(['add', 'remove', 'change']).optional(),
  modification_target: z.string().optional(),

  // Debug/explanation
  reasoning: z.string().optional().describe('Korte uitleg van parsing'),
});

export type AgribotParseResult = z.infer<typeof AgribotParseResultSchema>;

// ============================================
// System Prompts
// ============================================

/**
 * MAIN SYSTEM PROMPT - Optimized for speed and precision
 */
export const AGRIBOT_SYSTEM_PROMPT = `JE BENT: De CropNode Assistent. Een snelle, nauwkeurige interface voor gewasregistratie.

JE TAAK: Vertaal de input van de boer naar een gestructureerd JSON object.

JE REGELS (STRIKT):
1. **Geen Hallucinaties:** Verzin NOOIT productnamen of perceelnamen. Als je een naam niet herkent, geef je de ruwe zoekterm terug in het veld 'search_term'.
2. **Context Snappen:** Als de gebruiker zegt "Hetzelfde als vorige keer", kijk je in de 'last_spray_context'.
3. **Set Logic:** Vertaal "Alle peren zonder conference" naar logische filters, ga niet zelf percelen raden.
4. **Datum Inferentie:** "Gisteren" = vandaag - 1 dag. "Vorige week" = vandaag - 7 dagen.
5. **Ras Herkenning:** Bekende appelrassen: Elstar, Jonagold, Braeburn, Boskoop, Tessa, Greenstar, Kanzi, Junami, Red Prince, Gala, Fuji, Cox, Santana. Bekende perenrassen: Conference, Doyenné, Comice, Gieser Wildeman, Beurré Hardy, Concorde, Sweet Sensation, Xenia, Williams. Als gebruiker zegt "tessa percelen" of "de conference", bedoelt hij percelen met dat RAS, niet een perceelnaam. Zet dit in 'variety' filter.

INPUT VOORBEELD:
"Gisteren 0.2kg Chorus op alle appels behalve Tessa gespoten"

OUTPUT FORMAAT (JSON only):
{
  "intent": "register_spray",
  "confidence": 0.95,
  "date": "2024-10-24",
  "products": [
    {
      "search_term": "Chorus",
      "dosage": 0.2,
      "unit": "kg",
      "target_reason": null
    }
  ],
  "location_filter": {
    "include": { "crop_type": "Appel" },
    "exclude": { "variety": "Tessa" }
  }
}

MEER VOORBEELDEN:

Input: "2L Captan tegen schurft op de peren"
Output:
{
  "intent": "register_spray",
  "confidence": 0.9,
  "date": null,
  "products": [
    {
      "search_term": "Captan",
      "dosage": 2,
      "unit": "l",
      "target_reason": "schurft"
    }
  ],
  "location_filter": {
    "include": { "crop_type": "Peer" }
  }
}

Input: "Wat is de dosering van Decis?"
Output:
{
  "intent": "query_product",
  "confidence": 0.95,
  "query_subject": "Decis dosering"
}

Input: "Hoeveel captan heb ik dit jaar gebruikt?"
Output:
{
  "intent": "query_history",
  "confidence": 0.9,
  "query_subject": "captan gebruik dit jaar"
}

Input: "Ja klopt"
Output:
{
  "intent": "confirm",
  "confidence": 0.99
}

Input: "Nee, niet op de Elstar"
Output:
{
  "intent": "modify_draft",
  "confidence": 0.9,
  "modification_type": "remove",
  "modification_target": "Elstar",
  "location_filter": {
    "exclude": { "variety": "Elstar" }
  }
}

Input: "De tessa percelen trouwens niet"
Output:
{
  "intent": "modify_draft",
  "confidence": 0.95,
  "modification_type": "remove",
  "modification_target": "Tessa",
  "location_filter": {
    "exclude": { "variety": "Tessa" }
  },
  "reasoning": "Tessa is een appelras, niet een perceelnaam"
}

Input: "Niet de jonagolds"
Output:
{
  "intent": "modify_draft",
  "confidence": 0.9,
  "modification_type": "remove",
  "modification_target": "Jonagold",
  "location_filter": {
    "exclude": { "variety": "Jonagold" }
  }
}

RESPOND ALLEEN MET VALID JSON. GEEN UITLEG OF MARKDOWN.`;

/**
 * CONTEXT PROMPT - Add dynamic context before the main prompt
 */
export function buildContextPrompt(context: {
  today: string;
  availableCrops: string[];
  availableVarieties: string[];
  recentProducts?: string[];
  lastSprayContext?: {
    date: string;
    products: string[];
    parcels: string[];
  };
}): string {
  let contextStr = `VANDAAG: ${context.today}\n`;

  if (context.availableCrops.length > 0) {
    contextStr += `BESCHIKBARE GEWASSEN: ${context.availableCrops.join(', ')}\n`;
  }

  if (context.availableVarieties.length > 0) {
    contextStr += `BESCHIKBARE RASSEN: ${context.availableVarieties.join(', ')}\n`;
  }

  if (context.recentProducts && context.recentProducts.length > 0) {
    contextStr += `RECENT GEBRUIKTE MIDDELEN: ${context.recentProducts.join(', ')}\n`;
  }

  if (context.lastSprayContext) {
    contextStr += `LAATSTE BESPUITING: ${context.lastSprayContext.date} - ${context.lastSprayContext.products.join(', ')} op ${context.lastSprayContext.parcels.join(', ')}\n`;
  }

  return contextStr;
}

/**
 * Get full prompt with context
 */
export function getFullPrompt(context?: Parameters<typeof buildContextPrompt>[0]): string {
  if (context) {
    return buildContextPrompt(context) + '\n' + AGRIBOT_SYSTEM_PROMPT;
  }
  return AGRIBOT_SYSTEM_PROMPT;
}

// ============================================
// Lightweight Intent Classifier
// ============================================

/**
 * Pre-classify intent using keyword signals (no AI needed)
 * Returns null if uncertain - then use AI
 */
export function preClassifyIntent(input: string): {
  intent: z.infer<typeof IntentTypeSchema>;
  confidence: number;
} | null {
  const normalized = input.toLowerCase().trim();

  // Short confirmations
  if (normalized.length < 10) {
    if (/^(ja|ok|oke|prima|klopt|correct|akkoord)[\s!.]*$/i.test(normalized)) {
      return { intent: 'confirm', confidence: 0.99 };
    }
    if (/^(nee|stop|cancel|annuleer)[\s!.]*$/i.test(normalized)) {
      return { intent: 'cancel', confidence: 0.95 };
    }
  }

  // Check for spray registration signals
  const spraySignals = [
    /\d+[,.]?\d*\s*(l|kg|ml|g)(\/ha)?/i,  // Dosage pattern
    /(gespoten|gespuit|bespoten|behandeld)/i,
    /(gisteren|vandaag|vorige\s+week)/i,
  ];

  if (spraySignals.some(pattern => pattern.test(normalized))) {
    return { intent: 'register_spray', confidence: 0.85 };
  }

  // Check for query signals
  if (/(hoeveel|wanneer|laatste\s+keer|dit\s+jaar|overzicht)/i.test(normalized)) {
    return { intent: 'query_history', confidence: 0.8 };
  }

  if (/(welke?\s+middel|wat\s+kan|alternatieven|waarmee)/i.test(normalized)) {
    return { intent: 'query_product', confidence: 0.8 };
  }

  if (/(vgt|veiligheidstermijn|dosering|maximum|toegelaten|mag\s+ik)/i.test(normalized)) {
    return { intent: 'query_regulation', confidence: 0.8 };
  }

  // Check for modification signals
  if (/(niet|behalve|zonder|toch\s+niet|voeg.*toe|verwijder)/i.test(normalized)) {
    return { intent: 'modify_draft', confidence: 0.75 };
  }

  return null;
}

// ============================================
// Date Parser
// ============================================

/**
 * Parse Dutch date references to ISO date string
 */
export function parseDutchDate(input: string, today: Date = new Date()): string | null {
  const normalized = input.toLowerCase();

  if (normalized.includes('vandaag')) {
    return today.toISOString().split('T')[0];
  }

  // IMPORTANT: Check eergisteren BEFORE gisteren (eergisteren contains gisteren!)
  if (normalized.includes('eergisteren')) {
    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
    return dayBeforeYesterday.toISOString().split('T')[0];
  }

  if (normalized.includes('gisteren')) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  if (/vorige\s+week/i.test(normalized)) {
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    return lastWeek.toISOString().split('T')[0];
  }

  // Day names
  const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  for (let i = 0; i < dayNames.length; i++) {
    if (normalized.includes(dayNames[i])) {
      const targetDay = i;
      const currentDay = today.getDay();
      let daysAgo = currentDay - targetDay;
      if (daysAgo <= 0) daysAgo += 7;

      const date = new Date(today);
      date.setDate(date.getDate() - daysAgo);
      return date.toISOString().split('T')[0];
    }
  }

  // Try to parse explicit date formats: "24 oktober", "24-10", "24/10"
  const datePattern = /(\d{1,2})[-\/\s]*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec|\d{1,2})/i;
  const match = normalized.match(datePattern);

  if (match) {
    const day = parseInt(match[1], 10);
    let month: number;

    const monthStr = match[2].toLowerCase();
    const monthMap: Record<string, number> = {
      'jan': 0, 'feb': 1, 'mrt': 2, 'apr': 3, 'mei': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'dec': 11,
      'januari': 0, 'februari': 1, 'maart': 2, 'april': 3,
      'juni': 5, 'juli': 6, 'augustus': 7, 'september': 8,
      'oktober': 9, 'november': 10, 'december': 11,
    };

    if (monthMap[monthStr] !== undefined) {
      month = monthMap[monthStr];
    } else {
      month = parseInt(monthStr, 10) - 1;
    }

    const year = today.getFullYear();
    const date = new Date(year, month, day);

    // If date is in the future, assume last year
    if (date > today) {
      date.setFullYear(year - 1);
    }

    return date.toISOString().split('T')[0];
  }

  return null;
}

// ============================================
// Extract dosage from text
// ============================================

/**
 * Extract dosage and unit from text
 */
export function extractDosage(text: string): { dosage: number; unit: string } | null {
  // Pattern: "2L", "0.5 kg", "200ml", "1,5 l/ha"
  const pattern = /(\d+[,.]?\d*)\s*(l|kg|ml|g)(\/ha)?/i;
  const match = text.match(pattern);

  if (!match) return null;

  return {
    dosage: parseFloat(match[1].replace(',', '.')),
    unit: match[2].toLowerCase() + (match[3] || ''),
  };
}
