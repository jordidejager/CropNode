/**
 * Registration Agent - Slimme Invoer 2.0
 *
 * AI Agent voor multi-turn spray registratie conversaties.
 * Neemt de conversatie over na het eerste bericht (wanneer er een draft is).
 *
 * Belangrijke eigenschappen:
 * - Structured output (JSON) voor UI rendering
 * - Tool calling voor data lookup en validatie
 * - Teler-perspectief in humanSummary
 * - Anti-hallucinatie instructies
 * - Eén vraag per bericht
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { registrationAgentTools } from '@/ai/tools/registration-agent-tools';
import type {
    SmartInputV2Response,
    ConversationMessage,
    ClarificationRequest,
} from '@/lib/types-v2';
import type { SprayRegistrationGroup } from '@/lib/types';
import type { ValidationFlag } from '@/lib/validation-service';

// ============================================================================
// AGENT INPUT/OUTPUT SCHEMAS
// ============================================================================

const AgentInputSchema = z.object({
    userMessage: z.string().describe('Het bericht van de teler'),
    currentDraft: z.object({
        groupId: z.string(),
        date: z.string(),
        rawInput: z.string(),
        units: z.array(z.object({
            id: z.string(),
            plots: z.array(z.string()),
            products: z.array(z.object({
                product: z.string(),
                dosage: z.number(),
                unit: z.string(),
                targetReason: z.string().optional(),
            })),
            label: z.string().optional(),
            status: z.enum(['pending', 'confirmed']),
            date: z.string().optional(),
        })),
    }).describe('De huidige draft registratie'),
    conversationHistory: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
    })).describe('Eerdere berichten in de conversatie'),
    userId: z.string().describe('User ID voor database operaties'),
    parcelContext: z.array(z.object({
        id: z.string(),
        name: z.string(),
        crop: z.string(),
        variety: z.string(),
    })).optional().describe('Beschikbare percelen voor context'),
});

// Flattened schema to stay within Gemini's 5-level nesting limit
// Uses comma-separated strings that get parsed in post-processing
const AgentOutputSchemaFlat = z.object({
    action: z.enum([
        'update_draft',
        'clarification_needed',
        'confirm_and_save',
        'cancel',
        'answer_query',
    ]).describe('Welke actie moet de UI nemen'),
    humanSummary: z.string().describe('Korte samenvatting in teler-perspectief'),

    // Flattened draft fields (avoid deep nesting)
    draftGroupId: z.string().optional().describe('Group ID van de draft'),
    draftDate: z.string().optional().describe('Datum van de draft (YYYY-MM-DD)'),
    draftRawInput: z.string().optional().describe('Originele invoer'),
    // Units as semicolon-separated: "unitId:status:date:label;unitId2:status:date:label"
    draftUnits: z.string().optional().describe('Units als semicolon-separated: id:status:date:label;id2:status:date:label (date/label kunnen leeg zijn)'),
    // Plots per unit: "unitId:plot1,plot2,plot3;unitId2:plot4,plot5"
    draftUnitPlots: z.string().optional().describe('Plots per unit: unitId:plot1,plot2;unitId2:plot3,plot4'),
    // Products per unit: "unitId:Product1:2:L,Product2:0.5:kg;unitId2:Product3:1:L"
    draftUnitProducts: z.string().optional().describe('Products per unit: unitId:name:dosage:unit,name2:dosage2:unit2;unitId2:...'),

    // Flattened clarification fields
    clarificationQuestion: z.string().optional().describe('Vraag aan de gebruiker'),
    clarificationOptions: z.string().optional().describe('Opties als comma-separated string'),
    clarificationField: z.string().optional().describe('Welk veld moet worden ingevuld'),

    queryAnswer: z.string().optional().describe('Antwoord op een vraag (niet registratie-gerelateerd)'),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

// The unflattened output type that the rest of the code expects
export interface AgentOutput {
    action: 'update_draft' | 'clarification_needed' | 'confirm_and_save' | 'cancel' | 'answer_query';
    humanSummary: string;
    updatedDraft?: {
        groupId: string;
        date: string;
        rawInput: string;
        units: Array<{
            id: string;
            plots: string[];
            products: Array<{
                product: string;
                dosage: number;
                unit: string;
                targetReason?: string;
            }>;
            label?: string;
            status: 'pending' | 'confirmed';
            date?: string;
        }>;
    };
    clarification?: {
        question: string;
        options?: string[];
        field: string;
    };
    queryAnswer?: string;
    toolsCalled?: string[];
}

/**
 * Parse flat product string "name:dosage:unit" into product object
 */
function parseProductString(str: string): { product: string; dosage: number; unit: string } {
    const parts = str.split(':');
    return {
        product: parts[0] || '',
        dosage: parseFloat(parts[1]) || 0,
        unit: parts[2] || 'L',
    };
}

/**
 * Convert flattened AI output to nested AgentOutput structure
 */
function unflattenAgentOutput(flat: z.infer<typeof AgentOutputSchemaFlat>): AgentOutput {
    const result: AgentOutput = {
        action: flat.action,
        humanSummary: flat.humanSummary,
    };

    // Parse clarification
    if (flat.clarificationQuestion && flat.clarificationField) {
        result.clarification = {
            question: flat.clarificationQuestion,
            field: flat.clarificationField,
            options: flat.clarificationOptions
                ? flat.clarificationOptions.split(',').map(s => s.trim()).filter(Boolean)
                : undefined,
        };
    }

    // Parse query answer
    if (flat.queryAnswer) {
        result.queryAnswer = flat.queryAnswer;
    }

    // Parse draft if present
    if (flat.draftGroupId && flat.draftUnits) {
        const unitsMap = new Map<string, {
            id: string;
            status: 'pending' | 'confirmed';
            date?: string;
            label?: string;
            plots: string[];
            products: Array<{ product: string; dosage: number; unit: string }>;
        }>();

        // Parse unit metadata: "id:status:date:label;id2:status:date:label"
        const unitParts = flat.draftUnits.split(';').filter(Boolean);
        for (const part of unitParts) {
            const [id, status, date, label] = part.split(':');
            if (id) {
                unitsMap.set(id, {
                    id,
                    status: (status === 'confirmed' ? 'confirmed' : 'pending'),
                    date: date && date !== '' ? date : undefined,
                    label: label && label !== '' ? label : undefined,
                    plots: [],
                    products: [],
                });
            }
        }

        // Parse plots: "unitId:plot1,plot2;unitId2:plot3"
        if (flat.draftUnitPlots) {
            const plotParts = flat.draftUnitPlots.split(';').filter(Boolean);
            for (const part of plotParts) {
                const colonIdx = part.indexOf(':');
                if (colonIdx > 0) {
                    const unitId = part.substring(0, colonIdx);
                    const plots = part.substring(colonIdx + 1).split(',').map(s => s.trim()).filter(Boolean);
                    const unit = unitsMap.get(unitId);
                    if (unit) {
                        unit.plots = plots;
                    }
                }
            }
        }

        // Parse products: "unitId:Product1:2:L,Product2:0.5:kg;unitId2:Product3:1:L"
        if (flat.draftUnitProducts) {
            const productParts = flat.draftUnitProducts.split(';').filter(Boolean);
            for (const part of productParts) {
                const colonIdx = part.indexOf(':');
                if (colonIdx > 0) {
                    const unitId = part.substring(0, colonIdx);
                    const productsStr = part.substring(colonIdx + 1);
                    const products = productsStr.split(',').map(s => parseProductString(s.trim())).filter(p => p.product);
                    const unit = unitsMap.get(unitId);
                    if (unit) {
                        unit.products = products;
                    }
                }
            }
        }

        result.updatedDraft = {
            groupId: flat.draftGroupId,
            date: flat.draftDate || new Date().toISOString().split('T')[0],
            rawInput: flat.draftRawInput || '',
            units: Array.from(unitsMap.values()),
        };
    }

    return result;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `Je bent een spray registratie assistent voor Nederlandse fruitteelers (appels en peren).
Je helpt telers om hun bespuitingen te registreren via een natuurlijk gesprek.

## Jouw Rol
- Je ontvangt berichten van de teler en past de lopende registratie aan
- Je hebt tools om percelen op te zoeken, producten te matchen, en te valideren
- Je geeft ALTIJD een bijgewerkte registratie terug als structured JSON
- Je geeft ALTIJD een korte, menselijke samenvatting in teler-perspectief

## Beschikbare Tools
1. **get_parcels** - Haal percelen op (gefilterd op gewas/ras)
2. **resolve_product** - Los productnaam/alias op naar officieel CTGB product
3. **validate_registration** - Valideer tegen CTGB regels
4. **get_spray_history** - Haal spuithistorie op (voor interval-checks, doseringen)
5. **save_registration** - Sla de registratie op (ALLEEN na expliciete bevestiging)

## Hoe Je Werkt
1. Analyseer het bericht van de teler in de context van de lopende registratie
2. Gebruik tools als je informatie nodig hebt (product opzoeken, valideren, etc.)
3. Pas de registratie aan
4. Als iets onduidelijk is: VRAAG het, raad niet
5. Valideer altijd na elke aanpassing

## Fruitteelt Terminologie
Telers gebruiken informeel taalgebruik:
- "getankt", "rondje gedaan", "door de bomen geweest" = gespoten
- "Merpan", "captan", "het schurftmiddel" kunnen allemaal hetzelfde product bedoelen
- Doseringen worden vaak los van productnamen genoemd → koppel op volgorde of vraag
- "Halve dosering" = huidige dosering × 0.5
- Tankmenging = meerdere producten in de tank (normaal bij fruitteelt)
- "de Conference" of "de Elstar" = een ras/perceel
- "alle peren" of "alle appels" = groep percelen gefilterd op gewas

## ⚠️ GEWAS-GRENZEN RESPECTEREN
Dit is CRUCIAAL - een teler spuit NOOIT appels en peren door elkaar tenzij expliciet genoemd:

1. **"Alle peren"** = ALLEEN percelen met crop="Peer", NOOIT appels erbij
2. **"Alle appels"** = ALLEEN percelen met crop="Appel", NOOIT peren erbij
3. **"De rest van de peren"** = Alle peer-percelen die NIET al in een andere unit zitten
4. **"Alle bomen" / "overal" / "heel het bedrijf"** = Dan WEL beide gewassen

Voorbeeld scenario:
- Teler zegt "vandaag alle peren met Surround" → Start met ALLE peer-percelen
- Teler zegt "Lucas gisteren" → Split Lucas-percelen naar aparte unit met gisteren
- Teler zegt "de rest vandaag" → De overige PEER-percelen blijven vandaag
- ⚠️ NOOIT appels toevoegen tenzij teler expliciet "ook de appels" zegt!

Als je twijfelt of een perceel appel of peer is, gebruik get_parcels tool om te checken!

## Correctie Patronen
Herken deze correctie-patronen van de teler:
- "nee 0,5 L" / "niet 2 maar 1.5" → Dosering aanpassen
- "conference niet" / "behalve kanzi" → Perceel verwijderen (ALLEEN dat ras/perceel)
- "stadhoek was gisteren" / "X trouwens eergisteren" → Datum split (apart unit)
- "ook score erbij" / "nog X toevoegen" → Product toevoegen
- "ongedaan maken" / "terug" → Laatste wijziging terugdraaien
- "klopt" / "opslaan" / "bevestig" → Opslaan (roep save_registration aan)
- "annuleer" / "stop" / "toch niet" → Annuleren

### Perceel Correcties - Wees HEEL Precies:
- "Lucas niet" → Verwijder ALLEEN Lucas percelen, behoud alle andere
- "Conference ook" → Voeg ALLEEN Conference percelen toe (check of het peren zijn!)
- "de rest wel" → De percelen die NIET in de genoemde uitzondering zitten
- "alleen de peren" → Verwijder alle appels, behoud alleen peren
- "nee, geen appels" → Verwijder appel-percelen die per ongeluk zijn toegevoegd

⚠️ Bij correcties: BEHOUD wat al goed was, WIJZIG alleen wat fout is!

## Datum Splits
Als de teler zegt dat een DEEL van de percelen op een andere datum gespoten is:
- Maak een aparte unit aan voor die percelen met de aangepaste datum
- Behoud de rest in de originele unit
- Voorbeeld: "Stadhoek was gisteren" → Split Stadhoek naar eigen unit met gisteren als datum

### Voorbeeld: Complexe datum split met peren
Situatie: Teler begon met "vandaag alle peren met Surround"
- Unit 1 bevat: alle peer-percelen (Conference, Lucas, Doyenne, etc.) met datum vandaag

Teler zegt: "Lucas gisteren gespoten"
- Actie: Split Lucas percelen naar Unit 2 met datum gisteren
- Unit 1: peer-percelen ZONDER Lucas, datum vandaag
- Unit 2: ALLEEN Lucas percelen, datum gisteren

Teler zegt: "de rest van de peren wel vandaag"
- Dit bevestigt alleen dat Unit 1 (rest van de peren) vandaag blijft
- ⚠️ VOEG GEEN APPELS TOE! "de rest van de peren" = alleen peren!

## Output Format (FLATTENED voor API compatibiliteit)
Je antwoord MOET valid JSON zijn met PLATTE strings (geen geneste objecten):
{
  "action": "update_draft" | "clarification_needed" | "confirm_and_save" | "cancel" | "answer_query",
  "humanSummary": "Korte samenvatting in teler-perspectief",

  // Draft velden (alleen bij update_draft of confirm_and_save):
  "draftGroupId": "groep-id",
  "draftDate": "2024-01-15",
  "draftRawInput": "originele invoer",
  "draftUnits": "unitId:pending::;unitId2:confirmed:2024-01-14:label",
  "draftUnitPlots": "unitId:plot1,plot2,plot3;unitId2:plot4,plot5",
  "draftUnitProducts": "unitId:Merpan:2:L,Score:0.3:L;unitId2:Delan:0.75:kg",

  // Clarification velden (alleen bij clarification_needed):
  "clarificationQuestion": "Welke dosering?",
  "clarificationOptions": "0.5 L,1 L,1.5 L",
  "clarificationField": "dosage",

  // Query antwoord (alleen bij answer_query):
  "queryAnswer": "..."
}

BELANGRIJK - Flattened format regels:
- draftUnits: "id:status:date:label" gescheiden door ; (date/label mogen leeg)
- draftUnitPlots: "unitId:plot1,plot2" gescheiden door ;
- draftUnitProducts: "unitId:ProductNaam:dosage:unit,ProductNaam2:dosage2:unit2" gescheiden door ;
- Gebruik de EXACTE unitId uit de huidige draft
- Bij een update: kopieer alle bestaande data en pas alleen het gewijzigde aan

## humanSummary Richtlijnen
- Gebruik de woorden van de teler ("alle peren", "de Conference") niet systeem-taal
- Kort en to-the-point (1-2 zinnen max)
- Bevestig wat je hebt aangepast
- Als iets ontbreekt, noem dat

Voorbeelden:
- "Dosering aangepast naar 0,5 L/ha voor Merpan."
- "Alle peren behalve Conference. Welke dosering voor de Merpan?"
- "Stadhoek nu apart op gisteren. Rest blijft vandaag."
- "Opgeslagen! 3 registraties naar spuitschrift."

## Kritieke Regels
⚠️ ALLERBELANGRIJKST - GEEN HALLUCINATIES:
- NOOIT producten verzinnen die de teler niet noemde
- NOOIT doseringen invullen zonder bron (teler noemde het, of uit historie)
- NOOIT registratie opslaan zonder expliciete bevestiging van de teler
- NOOIT meer dan 1 vraag tegelijk stellen
- ALTIJD validate_registration aanroepen na een wijziging
- NOOIT appels toevoegen als de teler alleen over peren praat (en vice versa!)
- NOOIT percelen wijzigen die de teler niet expliciet noemde

## Voorbeeld Conversatie

Teler: "nee 0,5 L"
(Huidige draft heeft unitId=abc123, met Merpan:2:L)
Jij:
{
  "action": "update_draft",
  "humanSummary": "Dosering aangepast naar 0,5 L/ha.",
  "draftGroupId": "group-id",
  "draftDate": "2024-01-15",
  "draftRawInput": "originele invoer",
  "draftUnits": "abc123:pending::",
  "draftUnitPlots": "abc123:plot1,plot2,plot3",
  "draftUnitProducts": "abc123:Merpan:0.5:L"
}

Teler: "conference niet"
(Conference percelen zijn plot2, plot3)
Jij:
{
  "action": "update_draft",
  "humanSummary": "Conference verwijderd. Nu nog 1 perceel.",
  "draftGroupId": "group-id",
  "draftDate": "2024-01-15",
  "draftRawInput": "originele invoer",
  "draftUnits": "abc123:pending::",
  "draftUnitPlots": "abc123:plot1",
  "draftUnitProducts": "abc123:Merpan:0.5:L"
}

Teler: "klopt, opslaan"
Jij:
{
  "action": "confirm_and_save",
  "humanSummary": "Opgeslagen! 1 registratie naar spuitschrift.",
  "draftGroupId": "group-id",
  "draftDate": "2024-01-15",
  "draftRawInput": "originele invoer",
  "draftUnits": "abc123:confirmed::",
  "draftUnitPlots": "abc123:plot1",
  "draftUnitProducts": "abc123:Merpan:0.5:L"
}
`;

// ============================================================================
// REGISTRATION AGENT FLOW
// ============================================================================

export const registrationAgent = ai.defineFlow(
    {
        name: 'registrationAgent',
        inputSchema: AgentInputSchema,
        // Note: outputSchema removed because we manually unflatten the AI response
    },
    async (input: AgentInput): Promise<AgentOutput> => {
        const toolsUsed: string[] = [];

        try {
            // Build conversation messages
            const messages: Array<{ role: 'user' | 'model'; content: Array<{ text: string }> }> = [];

            // Add conversation history
            for (const msg of input.conversationHistory) {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    content: [{ text: msg.content }],
                });
            }

            // Add context about current draft
            const draftContext = `
HUIDIGE REGISTRATIE (DRAFT):
${JSON.stringify(input.currentDraft, null, 2)}

BESCHIKBARE PERCELEN:
${input.parcelContext ? JSON.stringify(input.parcelContext, null, 2) : 'Gebruik get_parcels tool om percelen op te halen'}

USER ID: ${input.userId}
`;

            // Add the current user message
            messages.push({
                role: 'user',
                content: [{ text: `${draftContext}\n\nBERICHT VAN TELER: ${input.userMessage}` }],
            });

            // Call the model with tools
            const response = await ai.generate({
                system: SYSTEM_PROMPT,
                messages,
                tools: registrationAgentTools,
                returnToolRequests: true,
            });

            // Process tool calls if any
            let toolResults: Record<string, unknown> = {};

            if (response.toolRequests && response.toolRequests.length > 0) {
                // Execute each tool request
                for (const req of response.toolRequests) {
                    const toolName = req.toolRequest.name;
                    toolsUsed.push(toolName);

                    try {
                        const tool = registrationAgentTools.find(t => t.__action.name === toolName);
                        if (tool) {
                            const result = await tool(req.toolRequest.input as any);
                            toolResults[toolName] = result;
                        }
                    } catch (toolError) {
                        console.error(`[registrationAgent] Tool ${toolName} failed:`, toolError);
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
                            content: [{ text: `Tool resultaten:\n${JSON.stringify(toolResults, null, 2)}` }],
                        },
                        {
                            role: 'user' as const,
                            content: [{ text: 'Geef nu je response als valid JSON met het exacte output schema.' }],
                        },
                    ],
                    output: {
                        schema: AgentOutputSchemaFlat,
                    },
                });

                // Parse the structured output and unflatten
                const flatOutput = followUpResponse.output;
                if (flatOutput) {
                    const output = unflattenAgentOutput(flatOutput);
                    return {
                        ...output,
                        toolsCalled: toolsUsed.length > 0 ? toolsUsed : undefined,
                    };
                }

                // Fallback: try to parse from text
                return parseAgentResponse(followUpResponse.text || '', toolsUsed, input.currentDraft);
            } else {
                // No tools needed, get structured output directly
                const structuredResponse = await ai.generate({
                    system: SYSTEM_PROMPT,
                    messages,
                    output: {
                        schema: AgentOutputSchemaFlat,
                    },
                });

                // Parse the structured output and unflatten
                const flatOutput = structuredResponse.output;
                if (flatOutput) {
                    const output = unflattenAgentOutput(flatOutput);
                    return {
                        ...output,
                        toolsCalled: toolsUsed.length > 0 ? toolsUsed : undefined,
                    };
                }

                return parseAgentResponse(structuredResponse.text || '', toolsUsed, input.currentDraft);
            }
        } catch (error) {
            console.error('[registrationAgent] Error:', error);
            return {
                action: 'update_draft',
                humanSummary: 'Er ging iets mis. Probeer het opnieuw.',
                updatedDraft: input.currentDraft as any,
                toolsCalled: toolsUsed.length > 0 ? toolsUsed : undefined,
            };
        }
    }
);

// ============================================================================
// HELPER: Parse agent response from text
// ============================================================================

function parseAgentResponse(
    text: string,
    toolsUsed: string[],
    currentDraft: AgentInput['currentDraft']
): AgentOutput {
    try {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                action: parsed.action || 'update_draft',
                humanSummary: parsed.humanSummary || 'Registratie bijgewerkt.',
                updatedDraft: parsed.updatedDraft || currentDraft,
                clarification: parsed.clarification,
                queryAnswer: parsed.queryAnswer,
                toolsCalled: toolsUsed.length > 0 ? toolsUsed : undefined,
            };
        }
    } catch (e) {
        console.error('[parseAgentResponse] Failed to parse JSON:', e);
    }

    // Fallback response
    return {
        action: 'update_draft',
        humanSummary: text.slice(0, 200) || 'Registratie bijgewerkt.',
        updatedDraft: currentDraft as any,
        toolsCalled: toolsUsed.length > 0 ? toolsUsed : undefined,
    };
}

// ============================================================================
// STREAMING VERSION (for future use)
// ============================================================================

export type AgentStreamEvent =
    | { type: 'thinking' }
    | { type: 'tool_call'; tool: string; input?: unknown }
    | { type: 'tool_result'; tool: string; result: unknown }
    | { type: 'complete'; output: AgentOutput }
    | { type: 'error'; message: string };

export async function* registrationAgentStream(
    input: AgentInput
): AsyncGenerator<AgentStreamEvent> {
    const toolsUsed: string[] = [];

    try {
        yield { type: 'thinking' };

        // Build messages (same as sync version)
        const messages: Array<{ role: 'user' | 'model'; content: Array<{ text: string }> }> = [];

        for (const msg of input.conversationHistory) {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'model',
                content: [{ text: msg.content }],
            });
        }

        const draftContext = `
HUIDIGE REGISTRATIE (DRAFT):
${JSON.stringify(input.currentDraft, null, 2)}

BESCHIKBARE PERCELEN:
${input.parcelContext ? JSON.stringify(input.parcelContext, null, 2) : 'Gebruik get_parcels tool'}

USER ID: ${input.userId}
`;

        messages.push({
            role: 'user',
            content: [{ text: `${draftContext}\n\nBERICHT VAN TELER: ${input.userMessage}` }],
        });

        // Call model with tools
        const response = await ai.generate({
            system: SYSTEM_PROMPT,
            messages,
            tools: registrationAgentTools,
            returnToolRequests: true,
        });

        let toolResults: Record<string, unknown> = {};

        if (response.toolRequests && response.toolRequests.length > 0) {
            for (const req of response.toolRequests) {
                const toolName = req.toolRequest.name;
                toolsUsed.push(toolName);

                yield { type: 'tool_call', tool: toolName, input: req.toolRequest.input };

                try {
                    const tool = registrationAgentTools.find(t => t.__action.name === toolName);
                    if (tool) {
                        const result = await tool(req.toolRequest.input as any);
                        toolResults[toolName] = result;
                        yield { type: 'tool_result', tool: toolName, result };
                    }
                } catch (toolError) {
                    console.error(`[registrationAgentStream] Tool ${toolName} failed:`, toolError);
                    toolResults[toolName] = { error: 'Tool execution failed' };
                    yield { type: 'tool_result', tool: toolName, result: { error: 'Failed' } };
                }
            }

            // Get final response
            const followUpResponse = await ai.generate({
                system: SYSTEM_PROMPT,
                messages: [
                    ...messages,
                    {
                        role: 'model' as const,
                        content: [{ text: `Tool resultaten:\n${JSON.stringify(toolResults, null, 2)}` }],
                    },
                    {
                        role: 'user' as const,
                        content: [{ text: 'Geef nu je response als valid JSON.' }],
                    },
                ],
                output: {
                    schema: AgentOutputSchemaFlat,
                },
            });

            const flatOutput = followUpResponse.output;
            const output = flatOutput
                ? unflattenAgentOutput(flatOutput)
                : parseAgentResponse(followUpResponse.text || '', toolsUsed, input.currentDraft);

            yield {
                type: 'complete',
                output: {
                    ...output,
                    toolsCalled: toolsUsed.length > 0 ? toolsUsed : undefined,
                },
            };
        } else {
            // No tools, get structured output
            const structuredResponse = await ai.generate({
                system: SYSTEM_PROMPT,
                messages,
                output: {
                    schema: AgentOutputSchemaFlat,
                },
            });

            const flatOutput = structuredResponse.output;
            const output = flatOutput
                ? unflattenAgentOutput(flatOutput)
                : parseAgentResponse(structuredResponse.text || '', toolsUsed, input.currentDraft);

            yield {
                type: 'complete',
                output: {
                    ...output,
                    toolsCalled: toolsUsed.length > 0 ? toolsUsed : undefined,
                },
            };
        }
    } catch (error) {
        console.error('[registrationAgentStream] Error:', error);
        yield {
            type: 'error',
            message: error instanceof Error ? error.message : 'Onbekende fout',
        };
    }
}
