/**
 * Grounded Generator — produces the chatbot's answer from retrieved chunks
 *
 * Uses Genkit streaming with gemini-2.5-flash-lite. The system prompt is
 * strict: the model MAY ONLY use information from the provided context,
 * and MUST say "dit staat niet in onze kennisbank" when information is missing.
 *
 * Yields text chunks as they stream so the API route can forward them via SSE.
 */

import { ai } from '@/ai/genkit';
import { MONTH_LABELS_LONG } from '../ui-tokens';
import type { RagContext, RetrievedChunk } from './types';

const GENERATION_MODEL = 'googleai/gemini-2.5-flash-lite';

const GROUNDED_SYSTEM_PROMPT = `Je bent CropNode's teelt-assistent voor Nederlandse appel- en perentelers.

KRITISCHE REGELS:
1. Beantwoord de vraag ALLEEN op basis van de onderstaande context-artikelen.
2. Als de context onvoldoende informatie bevat voor een deel van de vraag, zeg dat LETTERLIJK:
   "Dit specifieke onderdeel staat niet in onze kennisbank, raadpleeg een adviseur."
3. Verzin NOOIT productnamen, doseringen of timing. Citeer exact wat in de context staat.
4. Als de vraag over een middel gaat dat niet in de context voorkomt, zeg expliciet dat je daar geen informatie over hebt.
5. Schrijf in het Nederlands, praktisch en bondig.
6. Structureer korte antwoorden als lopende tekst; lange antwoorden met korte kopjes.
7. Gebruik GEEN bron-vermeldingen in de tekst ("volgens FruitConsult…"). Bronnen worden automatisch onderaan toegevoegd.
8. Vermeld NOOIT organisatienamen, adviseurs, of website-URLs.
9. Als de context deels relevant is maar de specifieke details ontbreken (bv. gewas of fase), benoem dat en geef aan wat wel bekend is.
10. Bij productadvies: noem naast het product ook de dosering en timing die in de context staan. Als die ontbreken, zeg dat de details ontbreken.

TEMPORELE REGELS (heel belangrijk):
11. De context-artikelen komen uit adviesberichten van MEERDERE jaren (2021-2026). Specifieke datums, dagen (maandag, woensdag), weken ("volgende week", "deze week") uit die context zijn VEROUDERD en NIET van toepassing op vandaag.
12. Gebruik NOOIT specifieke datumreferenties uit de context (geen "tot woensdag", "begin mei", "rond 19 mei"). Geef in plaats daarvan de ONDERLIGGENDE LOGICA: "binnen 48 uur na infectie", "bij T > 15°C", "tot 10 mm regen".
13. Bij curatieve behandelingen: geef de terugwerkende kracht in UREN/DAGEN ("effectief tot 48 uur na start infectie") — NIET in specifieke kalenderdata.
14. Als een context-artikel een datum noemt als timing, vertaal dat naar de fenologische conditie of weersomstandigheid die erachter zit.

REGELGEVING:
15. De context-artikelen bevatten regelgeving die MOGELIJK ACHTERHAALD is. Controleer altijd of het advies niet tegenstrijdig is met de onderstaande CTGB-context.
16. Voeg bij elk regelgevingsadvies toe: "Controleer altijd het actuele CTGB-etiket voor de meest recente toepassingsvoorwaarden."
17. Zeg NOOIT "toegelaten" of "verboden" over een middel op basis van de context-artikelen alleen — de CTGB toelatingsstatus wordt automatisch apart gecontroleerd.

ANTWOORDSTIJL:
- Praktisch, direct, als een ervaren collega
- Geen marketingtaal, geen "ik denk" of "misschien"
- Feit-gericht: wat moet de teler doen, wanneer, met welk middel, welke dosering
- Max ~200-300 woorden tenzij de vraag complex is`;

export interface GenerateOptions {
  query: string;
  intent: { crops?: string[]; topic: string; products?: string[] };
  context: RagContext;
  chunks: RetrievedChunk[];
  /** Product alias mappings resolved by the retriever, e.g. { "Pyrus": "Scala" } */
  productAliases?: Record<string, string>;
  /** Pre-formatted structured knowledge (product advice table, disease profile, relations) */
  structuredContext?: string | null;
}

export interface GenerateResult {
  /** The full text after streaming completes */
  fullText: string;
  /** Async iterable of text chunks (yields incrementally) */
  stream: AsyncIterable<string>;
}

/**
 * Run the grounded generator. Returns a streaming async iterable.
 *
 * NOTE: Genkit's `ai.generateStream` returns chunks as StreamChunk objects.
 * We wrap it so callers get simple strings.
 */
export async function generateGroundedAnswer(options: GenerateOptions): Promise<GenerateResult> {
  const { query, intent, context, chunks } = options;

  const userPrompt = buildPrompt({ query, intent, context, chunks });

  // Use non-streaming variant for now (simpler to wire into SSE; we can batch
  // the full response as one "chunk" since gemini-flash-lite is very fast)
  const result = await ai.generate({
    model: GENERATION_MODEL,
    system: GROUNDED_SYSTEM_PROMPT,
    prompt: userPrompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  });

  const text = (result as { text?: string; output?: { text?: string } }).text
    ?? (result as { output?: { text?: string } }).output?.text
    ?? '';

  // Wrap single response as a minimal async iterable (for future upgrade to true streaming)
  async function* singleChunkStream() {
    yield text;
  }

  return {
    fullText: text,
    stream: singleChunkStream(),
  };
}

// ============================================
// Prompt builder
// ============================================

function buildPrompt(options: GenerateOptions): string {
  const { query, intent, context, chunks } = options;
  const monthName = MONTH_LABELS_LONG[context.currentMonth - 1];
  const prettyPhase = context.currentPhaseDetail.replace(/-/g, ' ').replace(/\//g, ' / ');

  const chunkBlocks = chunks
    .map((chunk, i) => formatChunk(chunk, i + 1))
    .join('\n\n---\n\n');

  // Build alias hint if the user used a product synonym
  const aliasHint = options.productAliases && Object.keys(options.productAliases).length > 0
    ? `\nPRODUCT SYNONIEMEN: ${Object.entries(options.productAliases).map(([alias, canonical]) => `${alias} = ${canonical} (zelfde middel)`).join('; ')}. Als de gebruiker naar "${Object.keys(options.productAliases)[0]}" vraagt en de context noemt "${Object.values(options.productAliases)[0]}", geef dan het antwoord voor dat middel.`
    : '';

  return [
    `Vandaag is het ${context.today} (${monthName}). Huidige fenologische fase: ${prettyPhase}.`,
    intent.crops && intent.crops.length > 0
      ? `De vraag gaat over: ${intent.crops.join(', ')}.`
      : '',
    aliasHint,
    '',
    '== RELEVANTE KENNIS UIT DE CROPNODE KENNISBANK ==',
    '',
    // Inject structured data BEFORE the article chunks — this gives the model
    // precise facts (dosages, timing, curative windows) that it can use
    // alongside the richer narrative context from the article chunks.
    options.structuredContext ? options.structuredContext + '\n' : '',
    chunkBlocks,
    '',
    '== VRAAG VAN DE GEBRUIKER ==',
    query,
    '',
    'Geef een beknopt, feitelijk antwoord dat ALLEEN gebruikmaakt van bovenstaande context.',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatChunk(chunk: RetrievedChunk, index: number): string {
  const header = `[BRON ${index} — ${chunk.category}${chunk.subcategory ? ' / ' + chunk.subcategory : ''}]`;
  const metadata = [
    chunk.crops.length > 0 ? `Gewas: ${chunk.crops.join(', ')}` : null,
    chunk.season_phases.length > 0 ? `Fase: ${chunk.season_phases.join(', ')}` : null,
    chunk.products_mentioned.length > 0
      ? `Genoemde producten: ${chunk.products_mentioned.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return [
    header,
    `Titel: ${chunk.title}`,
    metadata,
    '',
    chunk.content,
  ]
    .filter(Boolean)
    .join('\n');
}
