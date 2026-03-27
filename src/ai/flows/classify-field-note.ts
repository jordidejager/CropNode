/**
 * @fileoverview Field Note Classification Flow
 *
 * Single Gemini call that does two things:
 * 1. Classifies the note into a tag (bespuiting, bemesting, taak, waarneming, overig)
 * 2. Detects a parcel name/id from the note text
 *
 * Used by the Veldnotities V2 feature for auto-tagging + parcel linking.
 * Follows the same Genkit pattern as classify-and-parse-spray.ts.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { sanitizeForPrompt } from '@/lib/ai-sanitizer';

// ============================================
// Schemas
// ============================================

const ClassifyFieldNoteInputSchema = z.object({
  content: z.string().describe('The raw field note text from the farmer'),
  parcelsJson: z.string().describe('JSON array of available parcels: [{id, name, crop, variety}]'),
});

const ClassifyFieldNoteOutputSchema = z.object({
  tag: z.enum(['bespuiting', 'bemesting', 'taak', 'waarneming', 'overig']).describe(
    'The category of the note'
  ),
  parcel_id: z.string().nullable().describe(
    'The sub_parcel id if a parcel name was detected in the note, otherwise null'
  ),
  confidence: z.number().describe('Confidence score 0.0–1.0'),
});

// ============================================
// Flow
// ============================================

const classifyFieldNoteFlow = ai.defineFlow(
  {
    name: 'classifyFieldNote',
    inputSchema: ClassifyFieldNoteInputSchema,
    outputSchema: ClassifyFieldNoteOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.5-flash-lite',
      prompt: `Je bent een classificatie-assistent voor een fruitteler-platform. Analyseer de volgende notitie van een Nederlandse fruitteler.

Doe twee dingen:

1. CATEGORIE — classificeer de notitie in exact één van deze categorieën:
   - "bespuiting" — gaat over spuiten, gewasbescherming, fungicide, insecticide, middelen (bijv. Captan, Delan, Score, Merpan, Luna Sensation, spuiten)
   - "bemesting" — gaat over bemesten, meststoffen, voeding, bladvoeding (bijv. MKP, Ureum, kalium, stikstof, strooien)
   - "taak" — een to-do, actie, reminder, iets dat gedaan moet worden (bijv. bellen, checken, bestellen, repareren, regelen)
   - "waarneming" — een observatie in het veld (bijv. schurft gezien, luis ontdekt, bloei, vruchtzetting, hagelschade, beschadiging)
   - "overig" — past niet in bovenstaande categorieën

2. PERCEEL — als de notitie een perceelnaam, bloknaam of locatie noemt die matcht met de onderstaande lijst, geef dan het id terug. Als er geen perceel herkenbaar is, geef null.

Beschikbare percelen (id, naam, gewas, ras):
${input.parcelsJson}

Notitie: "${sanitizeForPrompt(input.content)}"

Antwoord ALLEEN met JSON, geen uitleg:
{
  "tag": "bespuiting" | "bemesting" | "taak" | "waarneming" | "overig",
  "parcel_id": "perceel-id-string" | null,
  "confidence": 0.0 t/m 1.0
}`,
      output: {
        schema: ClassifyFieldNoteOutputSchema,
      },
    });

    if (!output) {
      return { tag: 'overig' as const, parcel_id: null, confidence: 0 };
    }

    return output;
  }
);

// ============================================
// Public API
// ============================================

export interface ParcelForClassification {
  id: string;
  name: string;
  crop: string;
  variety: string;
}

export interface ClassifyFieldNoteResult {
  tag: 'bespuiting' | 'bemesting' | 'taak' | 'waarneming' | 'overig' | null;
  parcel_id: string | null;
}

/**
 * Classify a field note: detect tag + parcel in a single AI call.
 * Returns null values on failure — never throws.
 * Low confidence (<0.5) tag is discarded (returns null).
 */
export async function classifyFieldNote(
  content: string,
  parcels: ParcelForClassification[]
): Promise<ClassifyFieldNoteResult> {
  try {
    const parcelsCompact = parcels.slice(0, 50).map(p => ({
      id: p.id,
      name: p.name,
      crop: p.crop,
      variety: p.variety,
    }));

    const result = await classifyFieldNoteFlow({
      content,
      parcelsJson: JSON.stringify(parcelsCompact),
    });

    return {
      tag: result.confidence >= 0.5 ? result.tag : null,
      parcel_id: result.parcel_id ?? null,
    };
  } catch (error) {
    console.error('[classifyFieldNote] AI classification failed:', error);
    return { tag: null, parcel_id: null };
  }
}
