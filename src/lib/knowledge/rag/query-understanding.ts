/**
 * Query understanding — extracts intent + entities from a user question
 *
 * First stage of the RAG pipeline. Converts free-text into a structured
 * QueryIntent so downstream retrieval can apply the right filters and
 * detect off-topic questions early.
 */

import { ai } from '@/ai/genkit';
import { QueryIntentSchema, type QueryIntent } from './types';

const INTENT_MODEL = 'googleai/gemini-2.5-flash-lite';

const INTENT_SYSTEM_PROMPT = `Je bent een intent-extractor voor CropNode, een kennisbank voor Nederlandse appel- en perentelers.

TAAK: Analyseer de vraag van de gebruiker en extraheer gestructureerde metadata.

CATEGORIEËN (topic):
- ziekte: schimmelziektes (schurft, meeldauw, vruchtrot, stemphylium, etc.)
- plaag: insecten/mijten/knaagdieren (fruitmot, perenbladvlo, wants, bladluis)
- bemesting: stikstof, kalium, bladbemesting, fertigatie
- snoei: snoeitechniek per ras en fase
- dunning: hand + chemisch dunnen
- bewaring: koelcel, ULO, bewaarziektes
- rassenkeuze: nieuwe rassen, raseigenschappen
- teelttechniek: vruchtzetting, bloei, bestuiving, groei-management, gibberelline (GA3, GA4/7, GA47), groeistoffen, ethrel, ATS, regalis
- middel_advies: specifieke vragen over een gewasbeschermingsmiddel of groeistof
- wetgeving: CTGB, toelatingen, veiligheidstermijnen, regelgeving
- algemeen: overig teeltnieuws dat niet elders past
- off_topic: vraag gaat NIET over appel/peer/kers/pruim/blauwe bes teelt

OFF_TOPIC detectie — wees VOORZICHTIG, markeer ALLEEN als off_topic als je ZEKER bent:
- Vragen over andere gewassen (tomaten, aardappelen, bloemen, granen) → off_topic
- Algemene plantenkunde zonder fruitteelt context → off_topic
- Niet-teelt vragen (weer, financiën, juridisch non-teelt) → off_topic
- Persoonlijke vragen, chit-chat → off_topic
- Zet dan altijd een reject_reason
- BIJ TWIJFEL: kies "algemeen" of "middel_advies", NIET off_topic. Laat de retriever beslissen.
- GA3, GA4/7, GA47, ATS, Ethrel, Regalis, NAA, BA, Brevis zijn TEELT-gerelateerd (groeistoffen/dunning), NOOIT off_topic

GEWASSEN (crops): appel, peer, kers, pruim, blauwe_bes
  (lijst van gewassen die in de vraag genoemd worden. Als de vraag generiek is, zet beide: ["appel", "peer"])

SPECIFIC_SUBJECTS: specifieke ziekte/plaag/onderwerp-namen (schurft, perenbladvlo, meeldauw, etc.)
VARIETIES: rassen die genoemd worden (Conference, Elstar, Jonagold, etc.)
PRODUCTS: productnamen van gewasbeschermingsmiddelen EN groeistoffen.
  Dit omvat ook: GA3, GA4/7, GA47, Ethrel, ATS, Regalis, Kudos, NAA, BA, Brevis, AmidThin, Topper.
  Let op: sommige merken hebben synoniemen of hetzelfde product onder een andere naam:
  - Pyrus = Scala (pyrimethanil)
  - Mavor = Belanty (mefentrifluconazool)
  - Score = Geyser = Difcor (difenoconazool)
  - Geoxe = Safir (fludioxonil)
  - GA47 = GA4/7 (gibberelline A4+A7)
  - Regalis = Kudos (prohexadion-calcium)
  Neem ALLE genoemde varianten op in de products array. Bij GA47 zet ook "GA4/7" erbij.

TIMING_QUESTION: true als de vraag over "wanneer", "op welk moment", "hoe vaak" gaat
DOSAGE_QUESTION: true als de vraag over dosering of "hoeveel" gaat

EXTRACTOR_CONFIDENCE: 0-1, hoe zeker je bent van de extractie

OUTPUT: JSON object met alle velden.`;

export async function extractQueryIntent(query: string): Promise<QueryIntent> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return {
      topic: 'off_topic',
      crops: [],
      specific_subjects: [],
      varieties: [],
      products: [],
      timing_question: false,
      dosage_question: false,
      extractor_confidence: 0,
      reject_reason: 'Query te kort',
    };
  }

  try {
    const result = await ai.generate({
      model: INTENT_MODEL,
      system: INTENT_SYSTEM_PROMPT,
      prompt: `Vraag van de gebruiker:\n"${trimmed}"\n\nExtraheer de metadata.`,
      output: {
        schema: QueryIntentSchema,
        format: 'json',
      },
      config: {
        temperature: 0.1,
      },
    });

    const output = (result as { output?: unknown }).output;
    if (!output) {
      throw new Error('Geen output van intent extractor');
    }
    return QueryIntentSchema.parse(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[query-understanding] extractor fout: ${message}`);
    // Fallback: assume general, let retriever figure it out
    return {
      topic: 'algemeen',
      crops: ['appel', 'peer'],
      specific_subjects: [],
      varieties: [],
      products: [],
      timing_question: /wanneer|moment|hoe vaak|interval/i.test(trimmed),
      dosage_question: /hoeveel|dosering|dosis|kg|liter/i.test(trimmed),
      extractor_confidence: 0.3,
      reject_reason: null,
    };
  }
}
