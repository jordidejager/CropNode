/**
 * @fileoverview Field Note Classification Flow — V2
 *
 * Single Gemini call that does three things:
 * 1. Classifies the note into a tag (bespuiting, bemesting, taak, waarneming, overig)
 * 2. Detects ALL parcel/location/variety/group references in the text
 * 3. Detects observation subject + category (for "waarneming" notes only)
 *
 * Parcel resolution strategy mirrors V3 Slimme Invoer:
 * - Match against parcel GROUPS (e.g., "spoor" → Spoor Noord + Spoor Zuid)
 * - Match against parent PARCEL NAME / location (e.g., "jachthoek" → all Jachthoek sub-parcels)
 * - Match against VARIETY (e.g., "conference" → all Conference sub-parcels)
 * - Match against sub-parcel BLOCK NAME (e.g., "noord")
 * - Match against SYNONYMS (user-defined aliases)
 * - Handles crop patterns: "alle appels", "alle peren", "alles"
 */

import { ai, DEFAULT_MODEL, withTimeout, AI_TIMEOUT_MS } from '@/ai/genkit';
import { z } from 'genkit';
import { sanitizeForPrompt } from '@/lib/ai-sanitizer';

// ============================================
// Types
// ============================================

export interface ParcelForClassification {
  id: string;
  name: string;        // sub-parcel block name (e.g., "Noord", "Blok 2")
  parcel_name: string; // parent parcel / location name (e.g., "Jachthoek", "Steketee")
  crop: string;        // "Appel" | "Peer"
  variety: string | null; // "Conference", "Elstar", etc.
  synonyms: string[];
}

export interface ParcelGroupForClassification {
  id: string;
  name: string;           // group name (e.g., "Spoor")
  sub_parcel_ids: string[];
}

export interface ClassifyFieldNoteResult {
  tag: 'bespuiting' | 'bemesting' | 'taak' | 'waarneming' | 'overig' | null;
  parcel_ids: string[];
  observation_subject: string | null;
  observation_category: 'insect' | 'schimmel' | 'ziekte' | 'fysiologisch' | 'overig' | null;
  due_date: string | null; // ISO date YYYY-MM-DD (for taak only)
}

// ============================================
// Gemini schema
// ============================================

const ClassifyFieldNoteInputSchema = z.object({
  content: z.string().describe('The raw field note text from the farmer'),
  parcelContext: z.string().describe('Available parcel locations, groups, varieties and block names'),
  photoUrl: z.string().optional().describe('Public URL of attached photo for vision analysis'),
});

const ClassifyFieldNoteOutputSchema = z.object({
  tag: z.enum(['bespuiting', 'bemesting', 'taak', 'waarneming', 'overig']).describe(
    'Category of the note'
  ),
  parcel_mentions: z.array(z.string()).describe(
    'Exact words/phrases from the note text that refer to parcel locations, groups, varieties, blocks, or crops'
  ),
  observation_subject: z.string().nullable().describe(
    'For waarneming only: the exact pest/disease/disorder name from the text (e.g., "Perenknopkever", "Bloedluis", "Schurft"). Null for other tags.'
  ),
  observation_category: z.enum(['insect', 'schimmel', 'ziekte', 'fysiologisch', 'overig']).nullable().describe(
    'For waarneming only: category of the observation. Null for other tags.'
  ),
  due_date: z.string().nullable().describe(
    'For taak only: ISO date string (YYYY-MM-DD) if a deadline/date is mentioned ("morgen", "vrijdag", "volgende week", "voor 1 april"). Null if no date mentioned or for other tags.'
  ),
  confidence: z.number().describe('Confidence score 0.0–1.0'),
});

// ============================================
// Gemini flow
// ============================================

const classifyFieldNoteFlow = ai.defineFlow(
  {
    name: 'classifyFieldNote',
    inputSchema: ClassifyFieldNoteInputSchema,
    outputSchema: ClassifyFieldNoteOutputSchema,
  },
  async (input) => {
    const hasPhoto = !!input.photoUrl;

    const promptText = `Je bent een classificatie-assistent voor een fruitteler-platform. Analyseer de volgende notitie van een Nederlandse fruitteler.${hasPhoto ? ' Er is ook een foto bijgevoegd.' : ''}

Doe ${hasPhoto ? 'vier' : 'drie'} dingen:

1. CATEGORIE — classificeer in exact één categorie:
   - "bespuiting" — spuiten, gewasbescherming, fungicide, insecticide, middelen (Captan, Delan, Score, Merpan, Luna Sensation)
   - "bemesting" — bemesten, meststoffen, voeding, bladvoeding (MKP, Ureum, kalium, stikstof, strooien)
   - "taak" — to-do, actie, reminder (bellen, checken, bestellen, repareren, regelen)
   - "waarneming" — observatie in het veld (ziekte gezien, plaag ontdekt, bloei, vruchtzetting, hagelschade)
   - "overig" — past niet in bovenstaande

2. PERCEELVERMELDINGEN — geef alle exacte woorden/zinsdelen terug uit de tekst die verwijzen naar:
   - Locaties/perceelnamen (bijv. "jachthoek", "steketee", "koleswei", "yese", "spoor")
   - Perceelgroepen (bijv. "spoor" als dat een groepsnaam is)
   - Rassen als perceelverwijzing (bijv. "conference", "elstar", "kanzi") — ALLEEN als ze als locatie gebruikt worden, niet als productbeschrijving
   - Blokken (bijv. "noord", "oost", "blok 1")
   - Gewasgroepen: "alle appels", "alle peren", "alles", "de peren", "de appels" → letterlijk teruggeven

   ${input.parcelContext ? `Beschikbare percelen: ${input.parcelContext}` : ''}

   NOOIT: productnamen, doseringen, merknamen, datums, tijdsaanduidingen
   Altijd een array: ["koleswei"] of ["jachthoek", "steketee"] of []

3. WAARNEMING (alleen als tag="waarneming") — extraheer het geobserveerde:
   - observation_subject: de exacte naam van de plaag/ziekte/aandoening uit de tekst
     Voorbeelden: "Perenknopkever", "Bloedluis", "Appelbloesemkever", "Schurft", "Meeldauw", "Hagelschade"
   - observation_category:
     * "insect" — insecten en mijten (bloedluis, perenknopkever, appelbloesemkever, spintmijt, fruitmot, schildluis, letselmuisje)
     * "schimmel" — schimmelziekten (schurft, meeldauw, monilia, kanker, roest)
     * "ziekte" — bacteriële/virale ziekten (bacterievuur, pseudomonas, phytophthora)
     * "fysiologisch" — fysieke beschadiging of fysiologische problemen (hagel, vorst, zonnebrand, stip, droogval, glazigheid)
     * "overig" — overige waarnemingen (bloei, vruchtzetting, kleur, groei)
   - Als tag NIET "waarneming" is → geef null voor beide

${hasPhoto ? `4. FOTOANALYSE — Bekijk de bijgevoegde foto en gebruik deze om:
   - De categorie nauwkeuriger te bepalen (zichtbare ziekte/plaag → waarneming)
   - Het onderwerp van de waarneming te identificeren (specifieke plaag of ziekte op het blad/vrucht)
   - Als de tekst vaag is maar de foto duidelijk een ziekte/plaag toont, gebruik de foto als primaire bron
   - Dit is een AI-suggestie, geen diagnose
` : ''}
${hasPhoto ? '5' : '4'}. DEADLINE (alleen als tag="taak") — als de tekst een datum of tijdsaanduiding bevat:
   - "morgen" → datum van morgen (YYYY-MM-DD)
   - "vrijdag" → eerstvolgende vrijdag
   - "volgende week" → maandag van volgende week
   - "voor 1 april" → 2026-04-01
   - "over 3 dagen" → vandaag + 3 dagen
   - Als GEEN datum herkenbaar → null
   - Als tag NIET "taak" is → null
   - Vandaag is: ${new Date().toISOString().split('T')[0]}

Notitie: "${sanitizeForPrompt(input.content)}"

Antwoord ALLEEN met JSON:
{
  "tag": "...",
  "parcel_mentions": ["..."],
  "observation_subject": "..." | null,
  "observation_category": "..." | null,
  "due_date": "YYYY-MM-DD" | null,
  "confidence": 0.0
}`;

    // Build multimodal prompt: text + optional photo
    const prompt = hasPhoto
      ? [
          { text: promptText },
          { media: { url: input.photoUrl!, contentType: 'image/jpeg' } },
        ]
      : promptText;

    const { output } = await withTimeout(
      ai.generate({
        model: DEFAULT_MODEL,
        prompt,
        output: {
          schema: ClassifyFieldNoteOutputSchema,
        },
      }),
      AI_TIMEOUT_MS,
      'classifyFieldNote'
    );

    if (!output) {
      return {
        tag: 'overig' as const,
        parcel_mentions: [],
        observation_subject: null,
        observation_category: null,
        due_date: null,
        confidence: 0,
      };
    }

    return output;
  }
);

// ============================================
// Parcel context builder
// ============================================

function buildParcelContext(
  parcels: ParcelForClassification[],
  groups: ParcelGroupForClassification[]
): string {
  const locations = [...new Set(parcels.map(p => p.parcel_name).filter(n => n.length > 0))].slice(0, 25);
  const varieties = [...new Set(parcels.map(p => p.variety).filter(Boolean) as string[])].slice(0, 20);
  const groupNames = groups.map(g => g.name);

  const parts: string[] = [];
  if (locations.length) parts.push(`Locaties: ${locations.join(', ')}`);
  if (groupNames.length) parts.push(`Groepen: ${groupNames.join(', ')}`);
  if (varieties.length) parts.push(`Rassen: ${varieties.join(', ')}`);

  return parts.join(' | ');
}

// ============================================
// Parcel resolver (V3-style)
// ============================================

// Crop keywords that map to crop names
const CROP_KEYWORDS: Record<string, string[]> = {
  'appel': ['Appel'],
  'appels': ['Appel'],
  'alle appels': ['Appel'],
  'alle appel': ['Appel'],
  'de appels': ['Appel'],
  'peer': ['Peer'],
  'peren': ['Peer'],
  'alle peren': ['Peer'],
  'alle peer': ['Peer'],
  'de peren': ['Peer'],
  'alles': ['Appel', 'Peer'],
  'overal': ['Appel', 'Peer'],
  'heel bedrijf': ['Appel', 'Peer'],
  'hele bedrijf': ['Appel', 'Peer'],
};

function resolveParcelIds(
  mentions: string[],
  parcels: ParcelForClassification[],
  groups: ParcelGroupForClassification[]
): string[] {
  const ids = new Set<string>();

  for (const mention of mentions) {
    const m = mention.toLowerCase().trim();
    if (m.length < 2) continue;

    // 0. Crop/global patterns ("alle appels", "peren", "alles")
    const cropMatch = CROP_KEYWORDS[m];
    if (cropMatch) {
      parcels.filter(p => cropMatch.includes(p.crop)).forEach(p => ids.add(p.id));
      continue; // crop pattern is definitive
    }

    // 1. Parcel group — name prefix or exact match
    for (const g of groups) {
      const gn = g.name.toLowerCase();
      if (gn.startsWith(m) || m.startsWith(gn)) {
        g.sub_parcel_ids.forEach(id => ids.add(id));
      }
    }

    // 2. Parent parcel / location — prefix match (highest priority for normal mentions)
    // "jachthoek" → all sub-parcels where parcel_name starts with "jachthoek"
    parcels
      .filter(p => p.parcel_name.toLowerCase().startsWith(m))
      .forEach(p => ids.add(p.id));

    // 3. Sub-parcel block name — prefix match
    // "noord" → all sub-parcels where block name starts with "noord"
    parcels
      .filter(p => p.name.toLowerCase().startsWith(m))
      .forEach(p => ids.add(p.id));

    // 4. Variety — prefix match
    // "conference" → all sub-parcels with variety starting with "conference"
    parcels
      .filter(p => p.variety?.toLowerCase().startsWith(m))
      .forEach(p => ids.add(p.id));

    // 5. Synonyms — exact match (user-defined aliases)
    for (const p of parcels) {
      if (p.synonyms.some(s => s.toLowerCase() === m)) {
        ids.add(p.id);
      }
    }
  }

  return [...ids];
}

// ============================================
// Public API
// ============================================

/**
 * Classify a field note using a single Gemini call.
 * Returns tag, parcel_ids (resolved from all match strategies), and observation metadata.
 * Never throws — returns null values on failure.
 */
export async function classifyFieldNote(
  content: string,
  parcels: ParcelForClassification[],
  groups: ParcelGroupForClassification[] = [],
  photoUrl?: string | null
): Promise<ClassifyFieldNoteResult> {
  try {
    const parcelContext = buildParcelContext(parcels, groups);
    const result = await classifyFieldNoteFlow({
      content,
      parcelContext,
      ...(photoUrl ? { photoUrl } : {}),
    });
    const parcel_ids = resolveParcelIds(result.parcel_mentions ?? [], parcels, groups);

    const tag = result.confidence >= 0.6 ? result.tag : null;
    return {
      tag,
      parcel_ids,
      observation_subject: result.observation_subject ?? null,
      observation_category: result.observation_category ?? null,
      due_date: tag === 'taak' && result.due_date ? result.due_date : null,
    };
  } catch (error) {
    console.error('[classifyFieldNote] failed:', error);
    return { tag: null, parcel_ids: [], observation_subject: null, observation_category: null, due_date: null };
  }
}
