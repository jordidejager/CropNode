/**
 * @fileOverview AgriBot Agent - Conversational AI with Tool Calling
 *
 * Deze agent kan zelfstandig beslissen welke tools aan te roepen
 * om complexe vragen te beantwoorden. Gebruikt een ReAct-style approach.
 *
 * Voorbeelden van complexe vragen:
 * - "Wanneer heb ik voor het laatst Captan gebruikt op de Elstar?"
 * - "Welke fungicides heb ik dit jaar het meest gebruikt?"
 * - "Wat is de dosering van Decis en wanneer heb ik het laatst gebruikt?"
 */

import { ai, withTimeout, AI_AGENT_TIMEOUT_MS } from '@/ai/genkit';
import { z } from 'genkit';
import { agribotTools } from '@/ai/tools/agribot-tools';

// ============================================================================
// AGENT INPUT/OUTPUT SCHEMAS
// ============================================================================

const AgentInputSchema = z.object({
    userQuery: z.string().describe('De vraag van de gebruiker'),
    conversationHistory: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
    })).optional().describe('Eerdere berichten in de conversatie'),
});

const AgentOutputSchema = z.object({
    answer: z.string().describe('Het antwoord op de vraag van de gebruiker'),
    toolsUsed: z.array(z.string()).optional().describe('Welke tools zijn aangeroepen'),
    confidence: z.number().min(0).max(1).optional().describe('Hoe zeker is het antwoord'),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `Je bent AgriBot, een slimme assistent voor fruittelers in Nederland.
Je helpt met het registreren van bespuitingen en het beantwoorden van vragen over gewasbeschermingsmiddelen.

Je hebt toegang tot de volgende tools:
1. **searchProducts** - Zoek gewasbeschermingsmiddelen op naam, werkzame stof, of doelorganisme
2. **getProductDetails** - Haal volledige details van een product op (dosering, VGT, voorschriften)
3. **getSprayHistory** - Bekijk de spuitgeschiedenis (gefilterd op product, perceel, periode)
4. **getParcelInfo** - Haal informatie op over percelen
5. **searchRegulations** - Zoek in de CTGB kennisbank naar regelgeving en gebruiksvoorschriften (semantische zoekfunctie)

=== CONVERSATION MEMORY ===
Je bent context-aware en kunt vervolgvragen beantwoorden op basis van de eerdere conversatie.

**REFERENTIE RESOLUTIE:**
Als de gebruiker verwijst naar iets uit de conversatie, los dit op:
- "En op perceel B?" / "En de Elstar?" → Pas de VORIGE actie (product, dosering) toe op het genoemde perceel
- "Doe maar iets meer" / "Iets hoger" → Verhoog de dosering van de vorige registratie met ~10-20%
- "Doe maar iets minder" / "Iets lager" → Verlaag de dosering van de vorige registratie met ~10-20%
- "Dat middel" / "Die spuit" → Refereer naar het laatst genoemde product
- "Hetzelfde" / "Nogmaals" → Herhaal de vorige actie
- "Daar ook" / "Die ook" → Voeg het genoemde item toe aan de vorige actie

**CONTEXT DOORREKENEN:**
Wanneer de gebruiker een vervolgvraag stelt:
1. Identificeer wat de VORIGE actie/advies was in de conversatie
2. Bepaal welk element de gebruiker wil wijzigen of toepassen
3. Behoud alle andere elementen uit de vorige context
4. Geef een compleet antwoord met de gewijzigde informatie

Voorbeeld:
- Vorige: "Spuit 1.5 kg Captan op de peren"
- Nu: "En op perceel Elstar?"
- Actie: Pas "1.5 kg Captan" toe op "Elstar" → "Je kunt 1.5 kg Captan spuiten op Elstar"

**HISTORY QUERYING:**
Als de gebruiker vraagt over de conversatie zelf:
- "Wat zei je net?" → Vat je vorige antwoord samen
- "Waarom adviseerde je dat?" → Leg de redenering achter je vorige advies uit
- "Wat was de dosering die je noemde?" → Haal de specifieke waarde op uit je vorige antwoord
- "Kun je dat herhalen?" → Herhaal je vorige antwoord, eventueel met meer detail

=== STANDAARD INSTRUCTIES ===
- Gebruik de tools om actuele informatie op te halen voordat je antwoordt
- Combineer meerdere tools indien nodig voor complexe vragen
- Voor vragen over regelgeving, veiligheidstermijnen (VGT), of "mag ik X gebruiken" → gebruik **searchRegulations**
- Geef altijd een duidelijk en behulpzaam antwoord in het Nederlands
- Als je iets niet kunt vinden, zeg dit eerlijk
- Gebruik markdown formatting voor leesbaarheid (vet, bullets, etc.)

VOORBEELDEN:
- "Wanneer heb ik Captan gebruikt?" → Gebruik getSprayHistory met productFilter="Captan"
- "Wat is de dosering van Decis?" → Gebruik getProductDetails met productName="Decis"
- "Welke middelen tegen schurft?" → Gebruik searchProducts met query="schurft"
- "Mag ik Captan gebruiken vlak voor de oogst?" → Gebruik searchRegulations met query over veiligheidstermijn
- "Wat is de VGT van Luna Sensation op peer?" → Gebruik searchRegulations met filterProduct="Luna Sensation" en filterGewas="peer"
`;

// ============================================================================
// AGRIBOT AGENT FLOW
// ============================================================================

/**
 * AgriBot Agent - Beantwoordt complexe vragen met tool calling
 *
 * @example
 * const result = await agribotAgent({
 *   userQuery: "Wanneer heb ik voor het laatst Captan gebruikt op de Elstar?"
 * });
 * // Agent roept getSprayHistory aan met productFilter="Captan" en parcelFilter="Elstar"
 */
export const agribotAgent = ai.defineFlow(
    {
        name: 'agribotAgent',
        inputSchema: AgentInputSchema,
        outputSchema: AgentOutputSchema,
    },
    async (input: AgentInput): Promise<AgentOutput> => {
        const toolsUsed: string[] = [];

        try {
            // Build conversation history for context
            const messages: Array<{ role: 'user' | 'model'; content: Array<{ text: string }> }> = [];

            if (input.conversationHistory) {
                for (const msg of input.conversationHistory) {
                    messages.push({
                        role: msg.role === 'user' ? 'user' : 'model',
                        content: [{ text: msg.content }],
                    });
                }
            }

            // Add current query
            messages.push({
                role: 'user',
                content: [{ text: input.userQuery }],
            });

            // Call the model with tools
            const response = await withTimeout(
                ai.generate({
                    system: SYSTEM_PROMPT,
                    messages,
                    tools: agribotTools,
                    returnToolRequests: true,
                }),
                AI_AGENT_TIMEOUT_MS,
                'agribotAgent'
            );

            // Process tool calls if any
            let finalAnswer = '';
            let toolResults: Record<string, unknown> = {};

            // Check if the model wants to use tools
            if (response.toolRequests && response.toolRequests.length > 0) {
                // Execute each tool request
                for (const req of response.toolRequests) {
                    const toolName = req.toolRequest.name;
                    toolsUsed.push(toolName);

                    try {
                        // Find and execute the tool
                        const tool = agribotTools.find(t => t.__action.name === toolName);
                        if (tool) {
                            const result = await tool(req.toolRequest.input as any);
                            toolResults[toolName] = result;
                        }
                    } catch (toolError) {
                        console.error(`Tool ${toolName} failed:`, toolError);
                        toolResults[toolName] = { error: 'Tool execution failed' };
                    }
                }

                // Generate final response with tool results
                const followUpResponse = await ai.generate({
                    system: SYSTEM_PROMPT,
                    messages: [
                        ...messages,
                        {
                            role: 'model' as const,
                            content: [{ text: `Ik heb de volgende informatie opgehaald:\n${JSON.stringify(toolResults, null, 2)}` }],
                        },
                        {
                            role: 'user' as const,
                            content: [{ text: 'Geef nu een duidelijk antwoord op mijn vraag op basis van deze informatie.' }],
                        },
                    ],
                });

                finalAnswer = followUpResponse.text || 'Ik kon geen antwoord genereren.';
            } else {
                // No tools needed, use direct response
                finalAnswer = response.text || 'Ik kon geen antwoord genereren.';
            }

            return {
                answer: finalAnswer,
                toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
                confidence: toolsUsed.length > 0 ? 0.9 : 0.7,
            };

        } catch (error) {
            console.error('AgriBot agent error:', error);
            return {
                answer: 'Er ging iets mis bij het verwerken van je vraag. Probeer het opnieuw.',
                toolsUsed,
                confidence: 0.3,
            };
        }
    }
);

// ============================================================================
// STREAMING VERSION
// ============================================================================

/**
 * AgriBot Agent met streaming - voor real-time feedback
 *
 * Streamt de volgende events:
 * - { type: 'thinking' } — Agent is aan het nadenken
 * - { type: 'tool_call', tool: string, input: object } — Tool wordt aangeroepen
 * - { type: 'tool_result', tool: string, result: object } — Tool resultaat
 * - { type: 'answer', content: string } — Finaal antwoord
 */
export async function* agribotAgentStream(input: AgentInput): AsyncGenerator<{
    type: 'thinking' | 'tool_call' | 'tool_result' | 'answer' | 'error';
    tool?: string;
    input?: unknown;
    result?: unknown;
    content?: string;
}> {
    yield { type: 'thinking' };

    try {
        // Build messages
        const messages: Array<{ role: 'user' | 'model'; content: Array<{ text: string }> }> = [];

        if (input.conversationHistory) {
            for (const msg of input.conversationHistory) {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    content: [{ text: msg.content }],
                });
            }
        }

        messages.push({
            role: 'user',
            content: [{ text: input.userQuery }],
        });

        // First call - may return tool requests
        const response = await ai.generate({
            system: SYSTEM_PROMPT,
            messages,
            tools: agribotTools,
            returnToolRequests: true,
        });

        // Process tool calls
        const toolResults: Record<string, unknown> = {};

        if (response.toolRequests && response.toolRequests.length > 0) {
            for (const req of response.toolRequests) {
                const toolName = req.toolRequest.name;

                yield {
                    type: 'tool_call',
                    tool: toolName,
                    input: req.toolRequest.input,
                };

                try {
                    const tool = agribotTools.find(t => t.__action.name === toolName);
                    if (tool) {
                        const result = await tool(req.toolRequest.input as any);
                        toolResults[toolName] = result;

                        yield {
                            type: 'tool_result',
                            tool: toolName,
                            result,
                        };
                    }
                } catch (toolError) {
                    console.error(`Tool ${toolName} failed:`, toolError);
                    toolResults[toolName] = { error: 'Tool execution failed' };

                    yield {
                        type: 'tool_result',
                        tool: toolName,
                        result: { error: 'Tool execution failed' },
                    };
                }
            }

            // Generate final answer with tool results
            const followUpResponse = await ai.generate({
                system: SYSTEM_PROMPT,
                messages: [
                    ...messages,
                    {
                        role: 'model' as const,
                        content: [{ text: `Ik heb de volgende informatie opgehaald:\n${JSON.stringify(toolResults, null, 2)}` }],
                    },
                    {
                        role: 'user' as const,
                        content: [{ text: 'Geef nu een duidelijk antwoord op mijn vraag op basis van deze informatie.' }],
                    },
                ],
            });

            yield {
                type: 'answer',
                content: followUpResponse.text || 'Ik kon geen antwoord genereren.',
            };
        } else {
            // Direct answer without tools
            yield {
                type: 'answer',
                content: response.text || 'Ik kon geen antwoord genereren.',
            };
        }

    } catch (error) {
        console.error('AgriBot agent stream error:', error);
        yield {
            type: 'error',
            content: 'Er ging iets mis bij het verwerken van je vraag.',
        };
    }
}
