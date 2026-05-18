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
import type { ChatTurn, RagContext, RetrievedChunk } from './types';

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

HALLUCINATIE-PREVENTIE (ABSOLUUT KRITIEK):
18. Je MAG NOOIT je eigen kennis over biologie, levenscycli, overwinteringsvormen, of entomologie gebruiken.
    ALLES wat je antwoordt MOET letterlijk in de context staan. Als de context zegt dat een insect als
    volwassene overwintert, dan is DAT het antwoord — ook als jij denkt dat het anders is.
19. Er zijn twee soorten context: GESTRUCTUREERDE KENNIS (bovenaan, uit onze database) en BRONARTIKELEN (eronder).
    Bij tegenstrijdigheden: GESTRUCTUREERDE KENNIS WINT ALTIJD. Die is gecureerd en gevalideerd.
20. Combineer NOOIT feiten uit verschillende bronnen tot een nieuwe bewering.
21. VERBODEN te zeggen over dieren/schimmels: "overwintert als ei/larve/pop/spore" TENZIJ dat
    LETTERLIJK EN EXACT zo in de context staat. Dit is de #1 hallucinatie die je maakt.
22. Bij twijfel: citeer LETTERLIJK uit de context. Parafraseer NIET bij biologische details.

ANTWOORDSTIJL:
- Praktisch, direct, als een ervaren collega
- Geen marketingtaal, geen "ik denk" of "misschien"
- Feit-gericht: wat moet de teler doen, wanneer, met welk middel, welke dosering
- Max ~200-300 woorden tenzij de vraag complex is

SYNONIEM-HERKENNING:
22a. Als de vraag een informele/regionale term gebruikt ("dikkoppen", "springer", "wolluis", "wurm", etc.) en de context beschrijft de canonical term ("perengalmug", "perenbladvlo", "bloedluis", "fruitmot"), bevestig dit expliciet:
     Bijv. "Dikkoppen worden veroorzaakt door perengalmug (Contarinia pyrivora). De bestrijding..."
     Zo weet de teler dat jij hun term begrijpt en kunnen ze de canonical term later opzoeken.

BRONVERWIJZINGEN (inline citations):
23. Voeg aan het einde van elke concrete claim een bron-marker toe in de vorm \`[n]\`,
    waarbij n het nummer is van het BRON-blok onderaan de context (begint bij 1).
    Voorbeeld: "Spuit Scala 0,6 L/ha curatief tot 72u na infectie [1][3]."
24. Verwijs ALLEEN naar bronnen die daadwerkelijk in de context staan. Geen [4] als er maar 3 bronnen zijn.
25. GESTRUCTUREERDE KENNIS (uit onze database) krijgt GEEN marker — alleen BRONARTIKELEN.
26. Als een zin uit meerdere bronnen komt, combineer: "… [1][2]".
27. Gebruik markers spaarzaam: per zin hooguit twee. Geen markers in kopjes.`;

export interface GenerateOptions {
  query: string;
  intent: { crops?: string[]; topic: string; products?: string[] };
  context: RagContext;
  chunks: RetrievedChunk[];
  /** Product alias mappings resolved by the retriever, e.g. { "Pyrus": "Scala" } */
  productAliases?: Record<string, string>;
  /** Pre-formatted structured knowledge (product advice table, disease profile, relations) */
  structuredContext?: string | null;
  /** Prior exchanges for multi-turn follow-ups */
  history?: ChatTurn[];
}

export interface GenerateResult {
  /**
   * Async iterable of text chunks as Gemini streams them. Iterate to get
   * incremental output; the caller is responsible for accumulating the full
   * text (or call `getFullText()` after iteration completes).
   */
  stream: AsyncIterable<string>;
  /**
   * Resolves with the authoritative full text after the stream has been
   * fully consumed. Reads from the underlying Genkit `response` promise so
   * callers who don't iterate the stream can still get the final answer.
   */
  getFullText(): Promise<string>;
}

/**
 * Run the grounded generator with true SSE streaming via `ai.generateStream`.
 *
 * Genkit yields `GenerateResponseChunk` objects with a `.text` getter; we map
 * them to plain strings so the pipeline can forward each delta as an
 * `answer_chunk` SSE event.
 */
export async function generateGroundedAnswer(options: GenerateOptions): Promise<GenerateResult> {
  const userPrompt = buildPrompt(options);

  // Genkit expects conversation turns as `messages: [{role, content: [{text}]}]`.
  // We only include prior turns — the current user message goes via `prompt`.
  const priorMessages = (options.history ?? []).slice(-6).map((t) => ({
    role: t.role === 'assistant' ? ('model' as const) : ('user' as const),
    content: [{ text: t.content }],
  }));

  const { stream, response } = ai.generateStream({
    model: GENERATION_MODEL,
    system: GROUNDED_SYSTEM_PROMPT,
    messages: priorMessages.length > 0 ? priorMessages : undefined,
    prompt: userPrompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  });

  async function* textStream() {
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }

  return {
    stream: textStream(),
    getFullText: async () => {
      const final = await response;
      return final.text ?? '';
    },
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
    // Structured data is PRIMAIR — gecureerd en gevalideerd
    options.structuredContext
      ? '⚠️ PRIMAIRE BRON (gecureerd, altijd prioriteit boven artikelen):\n' + options.structuredContext + '\n'
      : '',
    '--- ONDERSTEUNENDE BRONARTIKELEN (gebruik ter aanvulling, NIET voor biologische details als die hierboven al staan) ---',
    '',
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
