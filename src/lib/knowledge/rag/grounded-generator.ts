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
2. Alleen als de context HELEMAAL NIETS relevants bevat, zeg: "Dit staat niet in onze kennisbank."
   Maar als er WEL context is over het onderwerp, geef DAN altijd een antwoord — ook als het product onder een andere merknaam staat.
3. Verzin NOOIT productnamen, doseringen, timing, OF BIOLOGISCHE DETAILS. Citeer EXACT wat in de context staat.
   Als de context geen levenscyclus, symptomen, of biologie beschrijft, zeg dat eerlijk.
   Vul NOOIT zelf entomologische of mycologische details in — ook niet als je denkt dat je het weet. Alleen feiten uit de context.
4. PRODUCT SYNONIEMEN: Veel middelen hebben meerdere merknamen voor dezelfde werkzame stof.
   Als de gebruiker vraagt over "Pyrus" en de context noemt "Scala" — dat is HETZELFDE middel (pyrimethanil). Geef gewoon het antwoord.
   Andere voorbeelden: Geyser=Score=Difcor, Mavor=Belanty, Batavia=Movento, Safir=Geoxe, Kudos=Regalis.
   Check altijd de PRODUCT SYNONIEMEN sectie in de prompt voor specifieke mappings.
5. Schrijf in het Nederlands, praktisch en bondig.
6. Structureer korte antwoorden als lopende tekst; lange antwoorden met korte kopjes.
7. Gebruik GEEN bron-vermeldingen in de tekst ("volgens FruitConsult…"). Bronnen worden automatisch onderaan toegevoegd.
8. Vermeld NOOIT organisatienamen, adviseurs, of website-URLs.
9. Als de context deels relevant is maar de specifieke details ontbreken (bv. gewas of fase), benoem dat en geef aan wat wel bekend is.
10. Bij productadvies: noem naast het product ook de dosering en timing die in de context staan. Als die ontbreken, zeg dat de details ontbreken.

TEMPORELE REGELS (heel belangrijk):
11. De context-artikelen komen uit adviesberichten van MEERDERE jaren (2021-2026). ALLE tijdsreferenties zijn VEROUDERD.
12. VERBODEN FORMULERINGEN (gebruik deze NOOIT in je antwoord):
    - "de komende dagen", "eerder deze week", "volgende week", "afgelopen weekend"
    - "maandag", "dinsdag", "woensdag" of andere dagnamen
    - "begin mei", "rond 19 mei", "tot woensdag"
    - "de snelle knopontwikkeling" (dat is een moment-observatie, geen generiek feit)
    - "in de komende periode", "binnenkort", "nu snel handelen"
    Vervang deze ALTIJD door de ONDERLIGGENDE CONDITIE: "na regenval", "bij T > 15°C", "bij infectiedruk", "in het groen-puntje stadium".
13. Bij curatieve behandelingen: geef terugwerkende kracht in UREN/DAGEN ("effectief tot 48 uur na start infectie") — NIET in kalenderdata.
14. Zinnen als "Plaats een nieuwe preventieve behandeling in de komende dagen" → herformuleer als "Vernieuw de preventieve behandeling na regenval of bij nieuwe groei van vatbare delen."

REGELGEVING:
15. De context-artikelen bevatten regelgeving die MOGELIJK ACHTERHAALD is. Controleer altijd of het advies niet tegenstrijdig is met de onderstaande CTGB-context.
16. Voeg bij elk regelgevingsadvies toe: "Controleer altijd het actuele CTGB-etiket voor de meest recente toepassingsvoorwaarden."
17. Zeg NOOIT "toegelaten" of "verboden" over een middel op basis van de context-artikelen alleen — de CTGB toelatingsstatus wordt automatisch apart gecontroleerd.

HALLUCINATIE-PREVENTIE:
18. Je MAG NOOIT je eigen kennis gebruiken om feiten aan te vullen die NIET in de context staan.
    Maar als de context WEL levenscyclus-info, symptomen, of biologie bevat — geef die dan!
    Lees de context GRONDIG voordat je zegt dat er "geen informatie" is.
19. Combineer NOOIT feiten uit verschillende bronnen tot een nieuwe bewering die in geen
    enkele individuele bron staat.
20. Bij twijfel over details: citeer letterlijk uit de context.

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
