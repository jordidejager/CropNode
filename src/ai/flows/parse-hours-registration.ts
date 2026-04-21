/**
 * @fileOverview AI Flow for Hours/Workforce Natural Language Parsing
 *
 * This flow parses natural language input like:
 * - "Vandaag 3 uur gesnoeid op Plantsoen"
 * - "Gisteren 8 uur geplukt met 4 man"
 * - "Piet en Jan vandaag 6 uur gesnoeid op Grote wei"
 *
 * Output structure matches the task_logs table schema.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// ============================================
// Schemas - FLATTENED to avoid Gemini nesting limits
// ============================================

/**
 * Single hours registration entry (flattened)
 */
const FlatHoursEntrySchema = z.object({
  hours: z.number().describe('Number of hours worked (e.g., 3, 4.5, 8)'),
  activity: z.string().describe('Activity type: Snoeien, Dunnen, Plukken, Spuiten, Maaien, Boomverzorging, Onderhoud, Sorteren'),
  parcelNames: z.string().describe('Comma-separated parcel names (e.g., "Plantsoen,Stadhoek"). Empty string if not specified.'),
  date: z.string().describe('Date in YYYY-MM-DD format'),
  peopleCount: z.number().describe('Number of people. Default 1.'),
  teamMembers: z.string().optional().describe('Comma-separated team member names (e.g., "Piet,Jan"). Empty if not specified.'),
  notes: z.string().optional().describe('Additional notes extracted from input'),
});

/**
 * Input schema for the hours parsing flow
 */
const ParseHoursInputSchema = z.object({
  userInput: z.string().describe('The raw user input text'),
  availableParcels: z.string().optional().describe('JSON string of available parcels [{id, name, crop, variety}]'),
  availableTaskTypes: z.string().optional().describe('Comma-separated available task types'),
  previousEntry: z.string().optional().describe('JSON string of previous entry for corrections'),
  chatContext: z.string().optional().describe('Previous conversation for context'),
});

/**
 * Output schema - flattened for Gemini compatibility
 */
const ParseHoursOutputSchema = z.object({
  // Classification
  isHoursRegistration: z.boolean().describe('True if input is an hours registration'),
  isCorrection: z.boolean().describe('True if this is correcting a previous entry'),
  isTimerCommand: z.boolean().describe('True if this is start/stop timer command'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),

  // For timer commands
  timerAction: z.string().optional().describe('"start" or "stop" for timer commands'),
  timerTaskType: z.string().optional().describe('Task type for timer start command'),

  // For registration (single or multiple)
  entries: z.string().describe('JSON array of entries: [{hours, activity, parcelNames, date, peopleCount, teamMembers?, notes?}]'),

  // Correction details
  correctionType: z.string().optional().describe('Type of correction: hours, activity, parcel, date, people'),
  correctedField: z.string().optional().describe('The field being corrected'),
  correctedValue: z.string().optional().describe('The new value'),

  // Reply message
  replyMessage: z.string().optional().describe('Suggested reply message to user'),
});

// ============================================
// Internal Types (after parsing)
// ============================================

export interface HoursEntry {
  hours: number;
  activity: string;
  parcelNames: string[];
  parcelIds?: string[];
  date: string;
  peopleCount: number;
  teamMembers?: string[];
  notes?: string;
}

export interface ParseHoursOutput {
  isHoursRegistration: boolean;
  isCorrection: boolean;
  isTimerCommand: boolean;
  confidence: number;
  timerAction?: 'start' | 'stop';
  timerTaskType?: string;
  entries: HoursEntry[];
  correctionType?: string;
  correctedField?: string;
  correctedValue?: string;
  replyMessage?: string;
}

export type ParseHoursInput = z.infer<typeof ParseHoursInputSchema>;
export type ParseHoursOutputRaw = z.infer<typeof ParseHoursOutputSchema>;

// ============================================
// Activity Type Mapping
// ============================================

const ACTIVITY_ALIASES: Record<string, string> = {
  // Snoeien
  'gesnoeid': 'Snoeien',
  'snoei': 'Snoeien',
  'snoeien': 'Snoeien',
  // Dunnen
  'gedund': 'Dunnen',
  'dun': 'Dunnen',
  'dunnen': 'Dunnen',
  // Plukken
  'geplukt': 'Plukken',
  'pluk': 'Plukken',
  'plukken': 'Plukken',
  'oogsten': 'Plukken',
  'geoogst': 'Plukken',
  // Spuiten (uren, niet registratie)
  'gespoten': 'Spuiten',
  'spuit': 'Spuiten',
  'spuiten': 'Spuiten',
  // Maaien
  'gemaaid': 'Maaien',
  'maai': 'Maaien',
  'maaien': 'Maaien',
  // Boomverzorging
  'boomverzorging': 'Boomverzorging',
  'verzorging': 'Boomverzorging',
  // Onderhoud
  'onderhoud': 'Onderhoud',
  // Sorteren
  'gesorteerd': 'Sorteren',
  'sorteer': 'Sorteren',
  'sorteren': 'Sorteren',
};

/**
 * Normalize activity name to standard format
 */
export function normalizeActivity(activity: string): string {
  const lower = activity.toLowerCase().trim();
  return ACTIVITY_ALIASES[lower] || activity;
}

// ============================================
// Date Parsing Helpers
// ============================================

/**
 * Get today's date in YYYY-MM-DD format
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Parse relative date strings
 */
export function parseRelativeDate(dateStr: string): string {
  const lower = dateStr.toLowerCase().trim();

  if (lower === 'vandaag' || lower === 'today') {
    return getToday();
  }
  if (lower === 'gisteren' || lower === 'yesterday') {
    return getYesterday();
  }
  if (lower.includes('vorige week')) {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }

  // Day names (Dutch)
  const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const dayIndex = dayNames.indexOf(lower);
  if (dayIndex !== -1) {
    const d = new Date();
    const currentDay = d.getDay();
    let daysAgo = currentDay - dayIndex;
    if (daysAgo <= 0) daysAgo += 7; // Last week's day
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  }

  // If it looks like a date already, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Default to today
  return getToday();
}

// ============================================
// Combined Prompt
// ============================================

const parseHoursPrompt = ai.definePrompt({
  name: 'parseHoursRegistrationPrompt',
  input: { schema: ParseHoursInputSchema },
  output: { schema: ParseHoursOutputSchema },
  prompt: `Je bent een expert in het parsen van Nederlandse urenregistraties voor fruitteelt.

## TAAK
Parse de gebruikersinvoer en extraheer urenregistratie data.

## INPUT TYPES

1. **Timer Commands** (isTimerCommand=true)
   - "start snoeien" → timerAction: "start", timerTaskType: "Snoeien"
   - "stop" → timerAction: "stop"

2. **Hours Registration** (isHoursRegistration=true)
   - "Vandaag 3 uur gesnoeid op Plantsoen"
   - "Gisteren 8 uur geplukt met 4 man op Stadhoek"
   - "Piet en Jan vandaag 6 uur gesnoeid op Grote wei"

3. **Multiple Activities** (multiple entries)
   - "Vanmorgen 2 uur gespoten, vanmiddag 4 uur dunnen op Jachthoek"
   → 2 entries in the entries array

4. **Corrections** (isCorrection=true)
   - Na "5 uur gesnoeid" komt "Was maar 4 uur" → correction
   - correctionType: "hours", correctedField: "hours", correctedValue: "4"

## ACTIVITY TYPES
Map deze woorden naar standaard activiteiten:
- gesnoeid/snoeien → "Snoeien"
- gedund/dunnen → "Dunnen"
- geplukt/plukken/oogsten → "Plukken"
- gespoten/spuiten → "Spuiten"
- gemaaid/maaien → "Maaien"
- boomverzorging/verzorging → "Boomverzorging"
- onderhoud → "Onderhoud"
- gesorteerd/sorteren → "Sorteren"

## DATE PARSING
- "vandaag" → ${getToday()}
- "gisteren" → ${getYesterday()}
- "vorige week" → 7 dagen terug
- Geen datum genoemd → vandaag (${getToday()})

## PEOPLE PARSING
- "met 4 man" → peopleCount: 4
- "Piet en Jan" → peopleCount: 2, teamMembers: "Piet,Jan"
- Geen indicatie → peopleCount: 1

## PARCEL MATCHING
{{#if availableParcels}}
Beschikbare percelen (match fuzzy):
{{{availableParcels}}}
{{else}}
Geen percelen beschikbaar - extraheer namen uit input.
{{/if}}

{{#if availableTaskTypes}}
Beschikbare taaktypen: {{{availableTaskTypes}}}
{{/if}}

{{#if previousEntry}}
## VORIGE INVOER (voor correctie-detectie):
{{{previousEntry}}}

Let op correctie-patronen:
- "Was maar X" / "Was eigenlijk X" → uren correctie
- "Nee, [activity]" → activiteit correctie
- "Niet op X, maar Y" → perceel correctie
{{/if}}

{{#if chatContext}}
## CHAT CONTEXT:
{{{chatContext}}}
{{/if}}

## OUTPUT FORMAT

**entries** moet een JSON array string zijn:
\`[{"hours":3,"activity":"Snoeien","parcelNames":"Plantsoen","date":"${getToday()}","peopleCount":1}]\`

Voor meerdere entries:
\`[{"hours":2,"activity":"Spuiten","parcelNames":"","date":"${getToday()}","peopleCount":1},{"hours":4,"activity":"Dunnen","parcelNames":"Jachthoek","date":"${getToday()}","peopleCount":1}]\`

---

**Gebruikersinvoer:**
"{{{userInput}}}"

Parse en retourneer de JSON output.`,
});

// ============================================
// Flow Definition
// ============================================

/**
 * Parse flat output to structured HoursEntry objects
 */
function parseEntriesString(entriesJson: string): HoursEntry[] {
  try {
    const parsed = JSON.parse(entriesJson);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((entry: Record<string, unknown>) => ({
      hours: typeof entry.hours === 'number' ? entry.hours : parseFloat(String(entry.hours)) || 0,
      activity: normalizeActivity(String(entry.activity || '')),
      parcelNames: typeof entry.parcelNames === 'string'
        ? entry.parcelNames.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      date: parseRelativeDate(String(entry.date || 'vandaag')),
      peopleCount: typeof entry.peopleCount === 'number' ? entry.peopleCount : parseInt(String(entry.peopleCount)) || 1,
      teamMembers: typeof entry.teamMembers === 'string'
        ? entry.teamMembers.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
      notes: entry.notes ? String(entry.notes) : undefined,
    }));
  } catch (e) {
    console.error('[PARSE-HOURS] Failed to parse entries JSON:', e);
    return [];
  }
}

/**
 * Convert raw AI output to structured output
 */
function convertRawOutput(raw: ParseHoursOutputRaw): ParseHoursOutput {
  return {
    isHoursRegistration: raw.isHoursRegistration,
    isCorrection: raw.isCorrection,
    isTimerCommand: raw.isTimerCommand,
    confidence: raw.confidence,
    timerAction: raw.timerAction as 'start' | 'stop' | undefined,
    timerTaskType: raw.timerTaskType,
    entries: parseEntriesString(raw.entries),
    correctionType: raw.correctionType,
    correctedField: raw.correctedField,
    correctedValue: raw.correctedValue,
    replyMessage: raw.replyMessage,
  };
}

/**
 * Parse Hours Registration Flow
 *
 * @example
 * const result = await parseHoursRegistration({
 *   userInput: "Vandaag 3 uur gesnoeid op Plantsoen",
 *   availableParcels: JSON.stringify(parcels),
 *   availableTaskTypes: "Snoeien,Dunnen,Plukken"
 * });
 */
export const parseHoursRegistration = ai.defineFlow(
  {
    name: 'parseHoursRegistration',
    inputSchema: ParseHoursInputSchema,
  },
  async (input: ParseHoursInput): Promise<ParseHoursOutput> => {
    const startTime = Date.now();

    try {
      // Quick check for timer commands (skip AI for simple cases)
      const trimmedInput = input.userInput.trim().toLowerCase();
      if (/^start\s+\w+/i.test(trimmedInput)) {
        const taskName = trimmedInput.replace(/^start\s+/i, '').trim();
        return {
          isHoursRegistration: false,
          isCorrection: false,
          isTimerCommand: true,
          confidence: 0.95,
          timerAction: 'start',
          timerTaskType: normalizeActivity(taskName),
          entries: [],
        };
      }
      if (/^stop$/i.test(trimmedInput)) {
        return {
          isHoursRegistration: false,
          isCorrection: false,
          isTimerCommand: true,
          confidence: 0.95,
          timerAction: 'stop',
          entries: [],
        };
      }

      // Use AI for natural language parsing
      const llmResponse = await parseHoursPrompt(input);
      const output = llmResponse.output;

      if (!output) {
        console.error('[PARSE-HOURS] AI returned no output');
        return {
          isHoursRegistration: false,
          isCorrection: false,
          isTimerCommand: false,
          confidence: 0.3,
          entries: [],
          replyMessage: 'Kon de invoer niet begrijpen. Probeer: "3 uur gesnoeid op Plantsoen"',
        };
      }

      const duration = Date.now() - startTime;
      console.log(`[PARSE-HOURS] Completed in ${duration}ms: isHours=${output.isHoursRegistration}, confidence=${output.confidence.toFixed(2)}`);

      return convertRawOutput(output);
    } catch (error) {
      console.error('[PARSE-HOURS] Error:', error);
      return {
        isHoursRegistration: false,
        isCorrection: false,
        isTimerCommand: false,
        confidence: 0.2,
        entries: [],
        replyMessage: 'Er ging iets mis bij het parsen. Probeer opnieuw.',
      };
    }
  }
);

/**
 * Check if input is likely an hours registration (pre-AI filter).
 *
 * IMPORTANT: reject if the input contains a spray dosage pattern
 * ("5 liter X", "1.5 kg Y", "2 L/ha") — those are spray registrations,
 * not labour-hours registrations. "gespoten" alone is ambiguous, so
 * we only accept it if there's an explicit hour marker too.
 */
export function isLikelyHoursRegistration(input: string): boolean {
  const lower = input.toLowerCase();

  // Reject spray registrations: any dosage pattern = spray, not hours
  const hasDosage = /\d+[,.]?\d*\s*(?:l|kg|ml|g|liter)(?:\/ha)?\b/i.test(lower);

  // Timer commands (always win — even with dosage-like text this is a timer)
  if (/^(start|stop)\s/i.test(lower) || /^(start|stop)$/i.test(lower.trim())) return true;

  // Hours patterns (explicit time markers)
  const hasHourMarker = /\d+\s*(uur|uren)\b/i.test(lower) || /\b\d+u\b/i.test(lower) || /hele\s*dag|halve\s*dag/i.test(lower);
  if (hasHourMarker && !hasDosage) return true;

  // Pure labour activities (NOT "gespoten" — too ambiguous with spray)
  const activities = ['gesnoeid', 'gedund', 'geplukt', 'gemaaid', 'gesorteerd', 'gewerkt'];
  if (activities.some(a => lower.includes(a)) && !hasDosage) return true;

  // "gespoten" alone only counts if an hour marker is present (e.g. "4 uur gespoten")
  if (lower.includes('gespoten') && hasHourMarker && !hasDosage) return true;

  return false;
}

/**
 * Check if input is a correction
 */
export function isLikelyCorrection(input: string): boolean {
  const lower = input.toLowerCase();
  const correctionPatterns = [
    /^was\s+(maar|eigenlijk|slechts)/i,
    /^nee[,\s]/i,
    /^niet\s+\d/i,
    /^eigenlijk\s+\d/i,
    /^correctie/i,
  ];
  return correctionPatterns.some(p => p.test(lower));
}
