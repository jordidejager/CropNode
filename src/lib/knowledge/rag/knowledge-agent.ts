/**
 * Knowledge Agent — Genkit agent with tools for multi-step reasoning
 *
 * Replaces the linear grounded-generator for complex queries. The agent
 * decides which tools to call based on the question, combines results,
 * and produces a grounded answer.
 *
 * Flow:
 *   User question → agent decides tools to call →
 *   lookupProductAdvice / getDiseaseProfile / getProductRelations / searchKnowledgeBase / getCurrentSeason
 *   → agent synthesizes answer from tool results
 */

import { ai } from '@/ai/genkit';
import {
  knowledgeTools,
  setToolSupabaseClient,
} from '@/ai/tools/knowledge-tools';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryIntent, RagContext, RetrievedChunk } from './types';

const AGENT_MODEL = 'googleai/gemini-2.5-flash-lite';

const AGENT_SYSTEM_PROMPT = `Je bent CropNode's teelt-assistent voor Nederlandse appel- en perentelers. Je hebt toegang tot tools die de CropNode kennisbank doorzoeken.

WERKWIJZE:
1. Analyseer de vraag en bepaal welke informatie je nodig hebt
2. Gebruik de JUISTE tools om die informatie op te halen:
   - lookupProductAdvice: voor specifieke middelen, doseringen, timing per ziekte/gewas
   - getDiseaseProfile: voor overzicht van een ziekte/plaag (symptomen, strategie, rassen)
   - getProductRelations: voor alternatieven en resistentiegroepen
   - searchKnowledgeBase: voor gedetailleerde teeltkennis en context
   - getCurrentSeason: om te weten welke fase het nu is
3. Combineer de informatie tot een praktisch antwoord

REGELS:
1. Gebruik ALLEEN informatie uit de tools. Verzin NOOIT productnamen, doseringen of timing.
2. Als een tool geen resultaten oplevert, zeg eerlijk: "Dit staat niet in onze kennisbank."
3. Noem bij productadvies altijd: product, dosering, type (preventief/curatief), en timing.
4. Bij curatieve middelen: vermeld altijd de terugwerkende kracht in uren (als beschikbaar).
5. Noem NOOIT specifieke datums of weekdagen uit de kennisbank — geef fenologische timing.
6. Vermeld NOOIT organisatienamen (FruitConsult, Delphy, etc.) of adviseurs.
7. Bij elke regelgevingsuitspraak: voeg toe "Controleer altijd het actuele CTGB-etiket."
8. Wees praktisch, direct, als een ervaren collega die meedenkt.
9. Max ~200-300 woorden tenzij de vraag complex is.
10. Noem bij resistentiemanagement welke middelen je moet afwisselen en waarom.

HALLUCINATIE-PREVENTIE:
11. Gebruik NOOIT je eigen kennis om biologische details, levenscycli, of taxonomie in te vullen.
    Als een tool geen info over de levenscyclus retourneert, zeg dat eerlijk.
12. Combineer NOOIT feiten uit verschillende tools tot een nieuwe bewering die nergens staat.
13. Bij twijfel: citeer letterlijk uit tool-output. Onjuist is ERGER dan onvolledig.

VOORBEELD TOOL-GEBRUIK:
- "Wat spuiten tegen schurft?" → lookupProductAdvice(target="schurft") + getCurrentSeason()
- "Alternatieven voor Captan?" → getProductRelations(product="Captan") + lookupProductAdvice(product="Captan") (om te zien waartegen het gebruikt wordt)
- "Hoe herken ik perenbladvlo?" → getDiseaseProfile(name="perenbladvlo")
- "Curatieve behandeling na infectie?" → lookupProductAdvice(type="curatief") + getCurrentSeason()`;

export interface AgentOptions {
  supabase: SupabaseClient;
  query: string;
  intent: QueryIntent;
  context: RagContext;
  /** Pre-retrieved chunks from the retriever (optional, passed as extra context) */
  preRetrievedChunks?: RetrievedChunk[];
  /** Product alias mappings (Pyrus → Scala) */
  productAliases?: Record<string, string>;
}

export interface AgentResult {
  fullText: string;
  toolCalls: Array<{ tool: string; input: unknown; output: unknown }>;
}

export async function runKnowledgeAgent(options: AgentOptions): Promise<AgentResult> {
  const { supabase, query, intent, context, preRetrievedChunks, productAliases } = options;

  // Set the Supabase client for all tools
  setToolSupabaseClient(supabase);

  // Build the user prompt with context hints
  const userPrompt = buildAgentPrompt(query, intent, context, preRetrievedChunks, productAliases);

  // Run the agent with tools
  const result = await ai.generate({
    model: AGENT_MODEL,
    system: AGENT_SYSTEM_PROMPT,
    prompt: userPrompt,
    tools: knowledgeTools,
    config: {
      temperature: 0.2,
      maxOutputTokens: 1500,
    },
  });

  // Extract text and tool call log
  const text = (result as { text?: string }).text ?? '';
  const toolCalls: AgentResult['toolCalls'] = [];

  // Genkit stores tool calls in the response messages
  const messages = (result as { messages?: Array<{ role: string; content: Array<{ toolRequest?: unknown; toolResponse?: unknown }> }> }).messages;
  if (messages) {
    for (const msg of messages) {
      for (const part of msg.content ?? []) {
        if ((part as { toolRequest?: { name: string; input: unknown } }).toolRequest) {
          const req = (part as { toolRequest: { name: string; input: unknown } }).toolRequest;
          toolCalls.push({
            tool: req.name,
            input: req.input,
            output: null, // output is in the next message
          });
        }
      }
    }
  }

  return {
    fullText: text,
    toolCalls,
  };
}

function buildAgentPrompt(
  query: string,
  intent: QueryIntent,
  context: RagContext,
  preRetrievedChunks?: RetrievedChunk[],
  productAliases?: Record<string, string>,
): string {
  const monthNames = [
    'januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december',
  ];
  const monthName = monthNames[context.currentMonth - 1];
  const prettyPhase = context.currentPhaseDetail.replace(/-/g, ' ').replace(/\//g, ' / ');

  const parts: string[] = [
    `Vandaag is het ${context.today} (${monthName}). Huidige fenologische fase: ${prettyPhase}.`,
  ];

  if (intent.crops.length > 0) {
    parts.push(`De vraag gaat over: ${intent.crops.join(', ')}.`);
  }

  if (productAliases && Object.keys(productAliases).length > 0) {
    const aliasStr = Object.entries(productAliases)
      .map(([alias, canonical]) => `${alias} = ${canonical}`)
      .join(', ');
    parts.push(`Product-synoniemen: ${aliasStr}. Zoek op de canonieke namen.`);
  }

  // Include pre-retrieved context if available
  if (preRetrievedChunks && preRetrievedChunks.length > 0) {
    parts.push('');
    parts.push('== VOORAF OPGEHAALDE CONTEXT (uit kennisbank-zoekresultaten) ==');
    for (const [i, chunk] of preRetrievedChunks.slice(0, 3).entries()) {
      parts.push(`[BRON ${i + 1}: ${chunk.category}/${chunk.subcategory ?? ''}] ${chunk.title}`);
      parts.push(chunk.content.slice(0, 1000));
      parts.push('');
    }
  }

  parts.push('');
  parts.push(`Vraag: ${query}`);
  parts.push('');
  parts.push('Gebruik je tools om de informatie op te halen die je nodig hebt, en geef dan een beknopt antwoord.');

  return parts.join('\n');
}
