/**
 * Slimme Invoer V3 API Route
 *
 * Deterministic-first architecture:
 * - First message: Regex parser first, AI only as fallback
 * - Follow-up messages: Existing AI agent with tools
 *
 * Key differences from V2:
 * - Server-side context cache (no 5MB payload per request)
 * - Deterministic parser handles 60-70% of inputs without AI
 * - Much smaller codebase (~350 lines vs V2's ~1600)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limiter';
import { requestContext } from '@/lib/request-context';
import { registrationAgentStream, type AgentOutput } from '@/ai/flows/registration-agent';
import { resolveParcelsByText } from '@/lib/deterministic-parser';
import type {
  SmartInputV2Response,
  StreamMessageV2,
} from '@/lib/types-v2';
import type {
  SprayRegistrationGroup,
} from '@/lib/types';
import {
  getOrLoadContext,
  runRegistrationPipeline,
  normalizeDosageUnit,
  type CachedContext,
} from '@/lib/registration-pipeline';

// ============================================================================
// AUTH
// ============================================================================

async function getServerUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user?.id) return user.id;
    if (error) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) return session.user.id;
    }
    return null;
  } catch {
    return null;
  }
}

// getOrLoadContext, CachedContext, getDefaultUnitForProduct, normalizeDosageUnit
// are now imported from @/lib/registration-pipeline

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

const RequestSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string(),
  })).max(50),
  currentDraft: z.any().nullable(),
});

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      console.error('[V3] Invalid JSON body');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.error('[V3] Request validation failed:', parseResult.error.issues);
      return NextResponse.json({ error: `Validation failed: ${parseResult.error.issues.map(i => i.message).join(', ')}` }, { status: 400 });
    }

    const { message, conversationHistory, currentDraft } = parseResult.data;
    console.log(`[V3] POST: message="${message.substring(0, 80)}", history=${conversationHistory.length}, hasDraft=${!!currentDraft}`);

    const userId = await getServerUserId();
    if (!userId) {
      console.error('[V3] Auth failed - no userId');
      return NextResponse.json({ error: 'Unauthorized - niet ingelogd' }, { status: 401 });
    }
    console.log(`[V3] Auth OK: userId=${userId.substring(0, 8)}...`);

    // Rate limit: 10 requests per minute per user
    const rl = rateLimit(`smart-input:${userId}`, 10, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (msg: StreamMessageV2) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));
          } catch { /* stream closed */ }
        };

        try {
          if (!currentDraft) {
            await handleFirstMessage(message, userId, send);
          } else {
            // Try deterministic follow-up FIRST (parcel removal, dosage changes, etc.)
            const ctx = await getOrLoadContext(userId);
            const deterFollowUp = tryDeterministicFollowUp(message, currentDraft, ctx);
            if (deterFollowUp) {
              console.log(`[V3] ⚡ Deterministic follow-up handled: ${deterFollowUp.action}`);
              send({ type: 'complete', response: deterFollowUp });
            } else {
              await handleAgentMessage(message, conversationHistory, currentDraft, userId, send);
            }
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          const errStack = error instanceof Error ? error.stack : '';
          console.error('[V3] Handler error:', errMsg, '\nStack:', errStack);
          send({ type: 'error', message: `Er ging iets mis: ${errMsg}` });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[V3] Top-level error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ============================================================================
// PATH 1: First Message (delegates to shared registration pipeline)
// ============================================================================

async function handleFirstMessage(
  message: string,
  userId: string,
  send: (msg: StreamMessageV2) => void
): Promise<void> {
  send({ type: 'processing', phase: 'Context laden...' });

  // Run the shared pipeline (deterministic-first, admin-auth, cached context)
  const result = await runRegistrationPipeline(message, userId);

  // Wrap the AnalysisResult for the streaming response format
  const response: SmartInputV2Response = {
    action: result.action as SmartInputV2Response['action'],
    humanSummary: result.humanSummary,
    registration: result.registration,
    validationFlags: result.validationFlags,
    clarification: result.clarification,
    processingTimeMs: result.processingTimeMs,
    toolsCalled: ['registration_pipeline'],
  };

  send({ type: 'complete', response });
}

// ============================================================================
// PATH 1.5: Deterministic Follow-Up (parcel removal, dosage changes, etc.)
// ============================================================================

function tryDeterministicFollowUp(
  message: string,
  currentDraft: any,
  ctx: CachedContext
): SmartInputV2Response | null {
  const msgLower = message.toLowerCase().trim();
  const startTime = Date.now();

  // --- Pattern 1: Parcel removal ---
  // "Kloetinge ook niet", "Conference niet", "Nieuwe Conference Jachthoek niet"
  // "zonder Kloetinge", "behalve de Conference"
  const removalPatterns = [
    /^(.+?)\s+ook\s+niet$/i,           // "Kloetinge ook niet"
    /^(.+?)\s+niet$/i,                 // "Conference niet"
    /^(.+?)\s+(?:weg|eruit|verwijderen)$/i, // "Kloetinge verwijderen"
    /^(?:zonder|behalve)\s+(?:de\s+)?(.+)$/i, // "zonder Kloetinge"
  ];

  for (const pattern of removalPatterns) {
    const match = msgLower.match(pattern);
    if (match) {
      const targetText = match[1].trim();
      // Skip if the text looks like a product or dosage, not a parcel
      if (/^\d/.test(targetText) || /\d\s*(l|kg|ml|g)\b/i.test(targetText)) continue;

      const resolved = resolveParcelsByText(targetText, ctx.parcels, ctx.parcelGroups);
      if (resolved.ids.length > 0) {
        const removeSet = new Set(resolved.ids);
        const updatedUnits = currentDraft.units
          .map((u: any) => ({
            ...u,
            plots: u.plots.filter((p: string) => !removeSet.has(p)),
          }))
          .filter((u: any) => u.plots.length > 0);

        const totalRemoved = resolved.ids.length;
        const totalRemaining = updatedUnits.reduce((sum: number, u: any) => sum + u.plots.length, 0);
        const removedNames = resolved.ids
          .map(id => ctx.parcels.find(p => p.id === id)?.name || id)
          .slice(0, 3);
        const nameSummary = removedNames.length > 3
          ? `${removedNames.join(', ')} en ${totalRemoved - 3} andere`
          : removedNames.join(', ');

        const registration: SprayRegistrationGroup = {
          groupId: currentDraft.groupId,
          date: new Date(currentDraft.date),
          rawInput: currentDraft.rawInput,
          registrationType: currentDraft.registrationType,
          units: updatedUnits.map((u: any) => ({
            ...u,
            date: u.date ? new Date(u.date) : undefined,
          })),
        };

        console.log(`[V3 FollowUp] Removed ${totalRemoved} parcels (${nameSummary}), ${totalRemaining} remaining`);

        return {
          action: 'update_draft',
          humanSummary: `${nameSummary} ${totalRemoved > 1 ? 'zijn' : 'is'} verwijderd uit de registratie. Nog ${totalRemaining} ${totalRemaining === 1 ? 'perceel' : 'percelen'} over.`,
          registration,
          toolsCalled: ['deterministic_followup'],
          processingTimeMs: Date.now() - startTime,
        };
      }
    }
  }

  // --- Pattern 2: Add parcels ---
  // "Conference ook", "Conference erbij", "ook de appels"
  const addPatterns = [
    /^(.+?)\s+(?:ook|erbij|toevoegen)$/i,     // "Conference ook"
    /^ook\s+(?:de\s+)?(.+)$/i,                 // "ook de appels"
  ];

  for (const pattern of addPatterns) {
    const match = msgLower.match(pattern);
    if (match) {
      const targetText = match[1].trim();
      if (/^\d/.test(targetText) || /\d\s*(l|kg|ml|g)\b/i.test(targetText)) continue;

      const resolved = resolveParcelsByText(targetText, ctx.parcels, ctx.parcelGroups);
      if (resolved.ids.length > 0) {
        // Add to the first unit (or the only unit)
        const existingPlots = new Set(currentDraft.units.flatMap((u: any) => u.plots));
        const newPlots = resolved.ids.filter(id => !existingPlots.has(id));

        if (newPlots.length === 0) {
          return {
            action: 'update_draft',
            humanSummary: 'Die percelen zitten al in de registratie.',
            registration: {
              groupId: currentDraft.groupId,
              date: new Date(currentDraft.date),
              rawInput: currentDraft.rawInput,
              registrationType: currentDraft.registrationType,
              units: currentDraft.units.map((u: any) => ({
                ...u,
                date: u.date ? new Date(u.date) : undefined,
              })),
            },
            toolsCalled: ['deterministic_followup'],
            processingTimeMs: Date.now() - startTime,
          };
        }

        const updatedUnits = [...currentDraft.units];
        updatedUnits[0] = {
          ...updatedUnits[0],
          plots: [...updatedUnits[0].plots, ...newPlots],
        };

        const addedNames = newPlots
          .map(id => ctx.parcels.find(p => p.id === id)?.name || id)
          .slice(0, 3);
        const nameSummary = addedNames.length > 3
          ? `${addedNames.join(', ')} en ${newPlots.length - 3} andere`
          : addedNames.join(', ');

        const registration: SprayRegistrationGroup = {
          groupId: currentDraft.groupId,
          date: new Date(currentDraft.date),
          rawInput: currentDraft.rawInput,
          registrationType: currentDraft.registrationType,
          units: updatedUnits.map((u: any) => ({
            ...u,
            date: u.date ? new Date(u.date) : undefined,
          })),
        };

        console.log(`[V3 FollowUp] Added ${newPlots.length} parcels (${nameSummary})`);

        return {
          action: 'update_draft',
          humanSummary: `${nameSummary} ${newPlots.length > 1 ? 'zijn' : 'is'} toegevoegd. Nu ${updatedUnits[0].plots.length} percelen.`,
          registration,
          toolsCalled: ['deterministic_followup'],
          processingTimeMs: Date.now() - startTime,
        };
      }
    }
  }

  // --- Pattern 3: Simple dosage correction ---
  // "0,5 L", "nee 2 kg", "niet 2 maar 1.5", "2 L/ha"
  const dosagePatterns = [
    /^(?:nee\s+)?(\d+[.,]?\d*)\s*(l|liter|kg|kilo|ml|g|gram|gr|l\/ha|kg\/ha)\s*$/i,                          // "0,5 L" or "nee 2 kg" or "500 gram"
    /^(?:nee\s+|niet\s+\d+[.,]?\d*\s*\w*\s+maar\s+)(\d+[.,]?\d*)\s*(l|liter|kg|kilo|ml|g|gram|gr|l\/ha|kg\/ha)\s*$/i, // "niet 2 maar 1.5 L"
  ];

  for (const pattern of dosagePatterns) {
    const match = msgLower.match(pattern);
    if (match) {
      const rawDosage = parseFloat(match[1].replace(',', '.'));
      const rawUnit = match[2].replace('/ha', '').trim();
      const normalized = normalizeDosageUnit(rawDosage, rawUnit);

      // Find the product with dosage 0 or the last product
      const allProducts = currentDraft.units.flatMap((u: any) => u.products);
      const zeroDosageProduct = allProducts.find((p: any) => p.dosage === 0);

      if (zeroDosageProduct || allProducts.length === 1) {
        const targetProduct = zeroDosageProduct || allProducts[0];

        const updatedUnits = currentDraft.units.map((u: any) => ({
          ...u,
          products: u.products.map((p: any) =>
            p.product === targetProduct.product
              ? { ...p, dosage: normalized.dosage, unit: normalized.unit }
              : p
          ),
        }));

        const registration: SprayRegistrationGroup = {
          groupId: currentDraft.groupId,
          date: new Date(currentDraft.date),
          rawInput: currentDraft.rawInput,
          registrationType: currentDraft.registrationType,
          units: updatedUnits.map((u: any) => ({
            ...u,
            date: u.date ? new Date(u.date) : undefined,
          })),
        };

        // Check if there are still products without dosage
        const remainingZero = updatedUnits.flatMap((u: any) => u.products).filter((p: any) => p.dosage === 0);

        const response: SmartInputV2Response = {
          action: 'update_draft',
          humanSummary: `Dosering voor ${targetProduct.product} aangepast naar ${normalized.dosage} ${normalized.unit}/ha.`,
          registration,
          toolsCalled: ['deterministic_followup'],
          processingTimeMs: Date.now() - startTime,
        };

        if (remainingZero.length > 0) {
          response.action = 'clarification_needed';
          response.clarification = {
            question: `Welke dosering voor ${remainingZero[0].product}?`,
            field: 'dosage',
          };
        }

        console.log(`[V3 FollowUp] Dosage corrected: ${targetProduct.product} → ${normalized.dosage} ${normalized.unit}`);
        return response;
      }
    }
  }

  // --- Pattern 4: Confirmation ---
  // "klopt", "opslaan", "bevestig", "ja"
  if (/^(?:klopt|opslaan|bevestig(?:en)?|ja(?:\s+klopt)?|sla op|bewaar|ok[eé]?|akkoord)\s*[.!]?\s*$/i.test(msgLower)) {
    // Don't handle this deterministically if there are unresolved issues
    const hasZeroDosage = currentDraft.units.some((u: any) =>
      u.products.some((p: any) => p.dosage === 0)
    );
    if (!hasZeroDosage) {
      // Let the agent handle save (it calls the save_registration tool)
      return null;
    }
  }

  // --- Pattern 5: Cancellation ---
  if (/^(?:annuleer|stop|toch\s+niet|laat\s+maar|cancel)\s*[.!]?\s*$/i.test(msgLower)) {
    return {
      action: 'cancel',
      humanSummary: 'Registratie geannuleerd.',
      toolsCalled: ['deterministic_followup'],
      processingTimeMs: Date.now() - startTime,
    };
  }

  // No deterministic match → fall through to AI agent
  return null;
}

// ============================================================================
// PATH 2: Agent Message (reuse V2 agent)
// ============================================================================

async function handleAgentMessage(
  message: string,
  conversationHistory: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }>,
  currentDraft: any,
  userId: string,
  send: (msg: StreamMessageV2) => void
): Promise<void> {
  const startTime = Date.now();
  send({ type: 'processing', phase: 'Agent denkt na...' });

  const ctx = await getOrLoadContext(userId);

  const draftWithDates: SprayRegistrationGroup = {
    groupId: currentDraft.groupId,
    date: new Date(currentDraft.date),
    rawInput: currentDraft.rawInput,
    registrationType: currentDraft.registrationType,
    units: currentDraft.units.map((u: any) => ({
      ...u,
      date: u.date ? new Date(u.date) : undefined,
    })),
  };

  const draftForAgent = {
    ...draftWithDates,
    date: draftWithDates.date.toISOString().split('T')[0],
    units: draftWithDates.units.map(u => ({
      ...u,
      date: u.date ? (u.date instanceof Date ? u.date.toISOString().split('T')[0] : String(u.date).split('T')[0]) : undefined,
    })),
  };

  await requestContext.run({ userId }, async () => {
    const agentStream = registrationAgentStream({
      userMessage: message,
      currentDraft: draftForAgent,
      conversationHistory: conversationHistory.map(m => ({ role: m.role, content: m.content })),
      userId,
      parcelContext: ctx.parcels.map(p => ({
        id: p.id, name: p.name, crop: p.crop || 'Onbekend', variety: p.variety || 'Onbekend',
      })),
    });

    let finalOutput: AgentOutput | null = null;

    for await (const event of agentStream) {
      switch (event.type) {
        case 'thinking':
          send({ type: 'processing', phase: 'Agent analyseert...' });
          break;
        case 'tool_call':
          send({ type: 'tool_call', tool: event.tool, input: event.input });
          break;
        case 'tool_result':
          send({ type: 'tool_result', tool: event.tool, success: true });
          break;
        case 'complete':
          finalOutput = event.output;
          break;
        case 'error':
          send({ type: 'error', message: event.message });
          return;
      }
    }

    if (!finalOutput) {
      send({ type: 'error', message: 'Agent produceerde geen output' });
      return;
    }

    const response: SmartInputV2Response = {
      action: finalOutput.action === 'update_draft' ? 'update_draft'
        : finalOutput.action === 'clarification_needed' ? 'clarification_needed'
        : finalOutput.action === 'confirm_and_save' ? 'confirm_and_save'
        : finalOutput.action === 'cancel' ? 'cancel'
        : 'answer_query',
      humanSummary: finalOutput.humanSummary,
      processingTimeMs: Date.now() - startTime,
      toolsCalled: finalOutput.toolsCalled,
    };

    if (finalOutput.updatedDraft) {
      response.registration = {
        groupId: finalOutput.updatedDraft.groupId,
        date: new Date(finalOutput.updatedDraft.date),
        rawInput: finalOutput.updatedDraft.rawInput,
        registrationType: draftWithDates.registrationType,
        units: finalOutput.updatedDraft.units.map(u => {
          // Try to resolve parcel names to IDs (only if agent returned names, not UUIDs)
          const resolvedPlots = resolveParcelsByText(u.plots.join(' '), ctx.parcels, ctx.parcelGroups);
          return {
            id: u.id,
            plots: resolvedPlots.ids.length > 0 ? resolvedPlots.ids : u.plots,
            products: u.products,
            label: u.label,
            status: u.status,
            date: u.date ? new Date(u.date) : undefined,
          };
        }),
      };
    }

    if (finalOutput.clarification) response.clarification = finalOutput.clarification;
    if (finalOutput.queryAnswer) response.queryAnswer = finalOutput.queryAnswer;

    send({ type: 'complete', response });
  });
}

// resolveProducts moved to @/lib/registration-pipeline
