/**
 * Spuit-inbox: messages from the dedicated spray/fertilizer WhatsApp number.
 *
 * Flow: message → logbook draft (status 'Nieuw') + instant ack → background
 * processSprayDraft() → status 'Te Controleren' → review in the web app.
 * No interactive buttons, no questions back to the user.
 */

import { runRegistrationPipeline, getOrLoadContext } from '@/lib/registration-pipeline';
import { getLastUsedDosagesForUser, getUserProductNames } from '@/lib/supabase-store';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import type { CtgbProduct, ParsedSprayData, ProductEntry, SprayReviewAssumption, SprayReviewMeta, UserPreference } from '@/lib/types';
import { sendTextMessage } from './client';
import { formatUnknownNumberMessage } from './format';
import { processFieldNote } from './field-note-processor';
import { addPlus, stripPlus } from './phone-utils';
import {
  getUserIdByPhone,
  isMessageProcessed,
  logMessage,
  insertSprayDraft,
  getSprayDraft,
  updateSprayDraft,
  getLinkedNumbers,
} from './store';

export const SPRAY_ACK_MESSAGE = '✓ Genoteerd — staat in CropNode › Gewasbescherming › Inbox.';
const TEXT_ONLY_MESSAGE = 'Stuur hier alleen tekst met je spuit-/bemestingsnotitie, bijv. "X en Y gespoten met captan en 0,5 soriale".';
const PROCESSING_FAILED_MESSAGE = '⚠️ Kon je notitie niet automatisch lezen — staat als ruwe tekst in de Inbox van CropNode.';

export function getSprayPhoneNumberId(): string | null {
  return process.env.WHATSAPP_SPRAY_PHONE_NUMBER_ID || null;
}

// ============================================================================
// 1. Receive (synchronous, must be fast)
// ============================================================================

export async function handleSprayInboxMessage(params: {
  phoneNumber: string;
  messageText: string | null;
  waMessageId: string;
  messageType: string;
  timestamp: string;
  phoneNumberId: string;
}): Promise<string | null> {
  const { phoneNumber, messageText, waMessageId, messageType, phoneNumberId } = params;
  const metaPhone = stripPlus(phoneNumber);
  const e164Phone = addPlus(phoneNumber);
  const send = (text: string) => sendTextMessage(metaPhone, text, { phoneNumberId });

  if (await isMessageProcessed(waMessageId)) {
    console.log(`[SprayInbox] Duplicate message ${waMessageId}, skipping`);
    return null;
  }

  const userId = await getUserIdByPhone(phoneNumber);
  if (!userId) {
    const msg = formatUnknownNumberMessage();
    await send(msg);
    await logMessage({ phoneNumber: e164Phone, direction: 'inbound', messageText: messageText || `[${messageType}]`, waMessageId, metadata: { channel: 'spray' } });
    await logMessage({ phoneNumber: e164Phone, direction: 'outbound', messageText: msg, metadata: { channel: 'spray' } });
    return null;
  }

  const text = (messageText || '').trim();
  if (!text) {
    await send(TEXT_ONLY_MESSAGE);
    await logMessage({ phoneNumber: e164Phone, direction: 'inbound', messageText: `[${messageType}]`, waMessageId, metadata: { channel: 'spray' } });
    await logMessage({ phoneNumber: e164Phone, direction: 'outbound', messageText: TEXT_ONLY_MESSAGE, metadata: { channel: 'spray' } });
    return null;
  }

  return createSprayDraft({ userId, phoneNumber, text, waMessageId, timestamp: params.timestamp, phoneNumberId });
}

/**
 * Store a spray note as a logbook draft and send the ack. Shared by the dedicated
 * spray number and the general bot's spray fallback (single-number setup).
 */
export async function createSprayDraft(params: {
  userId: string;
  phoneNumber: string;
  text: string;
  waMessageId: string;
  timestamp?: string;
  /** Business number to reply from; omit for the default WHATSAPP_PHONE_NUMBER_ID. */
  phoneNumberId?: string;
}): Promise<string> {
  const { userId, text, waMessageId, phoneNumberId } = params;
  const metaPhone = stripPlus(params.phoneNumber);
  const e164Phone = addPlus(params.phoneNumber);
  const sendOpts = phoneNumberId ? { phoneNumberId } : undefined;

  const tsSeconds = Number(params.timestamp);
  const messageDate = Number.isFinite(tsSeconds) && tsSeconds > 0 ? new Date(tsSeconds * 1000) : new Date();

  const logbookId = await insertSprayDraft({
    userId,
    rawInput: text,
    waMessageId,
    messageDate,
    reviewMeta: { receivedAt: new Date().toISOString() },
  });

  await logMessage({ phoneNumber: e164Phone, direction: 'inbound', messageText: text, waMessageId, metadata: { channel: 'spray', logbookId } });
  await sendTextMessage(metaPhone, SPRAY_ACK_MESSAGE, sendOpts);
  await logMessage({ phoneNumber: e164Phone, direction: 'outbound', messageText: SPRAY_ACK_MESSAGE, metadata: { channel: 'spray', logbookId } });

  console.log(`[SprayInbox] Draft ${logbookId} created for user ${userId}`);
  return logbookId;
}

// ============================================================================
// 2. Process (background: after(), cron, or manual retry)
// ============================================================================

export interface ProcessSprayDraftOptions {
  /** Phone (Meta format or E.164) to notify when processing crashes. Resolved from linked numbers when omitted. */
  notifyPhone?: string | null;
  /** Skip the WhatsApp failure notification (e.g. manual retry from the web UI). */
  silent?: boolean;
  /**
   * What to do when the text is not a spray registration at all.
   * 'empty_card' (default, dedicated spray number): keep an editable empty card in the inbox.
   * 'field_note' (general bot): drop the draft and store the text as a veldnotitie instead.
   */
  nonRegistration?: 'empty_card' | 'field_note';
  /** Business number to send replies from (single-number setup omits it). */
  phoneNumberId?: string;
}

export async function processSprayDraft(logbookId: string, options: ProcessSprayDraftOptions = {}): Promise<void> {
  const started = Date.now();
  const draft = await getSprayDraft(logbookId);
  if (!draft) {
    console.warn(`[SprayInbox] Draft ${logbookId} not found`);
    return;
  }
  if (draft.status === 'Akkoord') return;

  const baseMeta: SprayReviewMeta = { ...draft.reviewMeta, error: undefined };
  await updateSprayDraft(logbookId, { status: 'Analyseren...' });

  try {
    const preferences = await getUserPreferencesAdmin(draft.userId);
    const assumptions: SprayReviewAssumption[] = [];
    const { text: pipelineInput, substitutions } = applyUserPreferencesToText(draft.rawInput, preferences);
    for (const s of substitutions) {
      assumptions.push({ field: 'product', from: s.from, to: s.to, reason: 'jouw voorkeur' });
    }

    const result = await runRegistrationPipeline(pipelineInput, draft.userId);

    if (result.action === 'answer_query' || !result.registration) {
      if (options.nonRegistration === 'field_note' && options.notifyPhone) {
        await getSupabaseAdmin().from('logbook').delete().eq('id', logbookId);
        await processFieldNote(draft.userId, addPlus(options.notifyPhone), draft.rawInput, draft.waMessageId || `draft-${logbookId}`);
        console.log(`[SprayInbox] Draft ${logbookId} was not a registration → stored as field note`);
        return;
      }
      await updateSprayDraft(logbookId, {
        status: 'Te Controleren',
        parsedData: { plots: [], products: [] },
        registrationType: 'spraying',
        validationMessage: null,
        reviewMeta: {
          ...baseMeta,
          processingMs: Date.now() - started,
          assumptions,
          uncertainFields: ['plots', 'products'],
          validationFlags: [{ type: 'warning', message: 'Niet automatisch herkend als registratie — vul handmatig aan.' }],
        },
      });
      return;
    }

    const ctx = await getOrLoadContext(draft.userId);
    const [userProductNames, lastUsed] = await Promise.all([
      getUserProductNames(draft.userId),
      getLastUsedDosagesForUser(
        draft.userId,
        result.registration.units.flatMap(u => u.products).filter(p => !p.dosage).map(p => p.product)
      ),
    ]);

    const registrationType = result.registration.registrationType || 'spraying';
    const pipelineFlags = result.validationFlags || [];
    const groupId = result.registration.units.length > 1 ? result.registration.groupId : undefined;
    const date = pickDraftDate(result.registration.date, draft.date);

    for (let unitIdx = 0; unitIdx < result.registration.units.length; unitIdx++) {
      const unit = result.registration.units[unitIdx];
      const enriched = enrichUnit(unit.products, ctx.products, userProductNames, lastUsed);
      const uncertainFields = [...enriched.uncertainFields];
      if (unit.plots.length === 0) uncertainFields.push('plots');
      if (enriched.products.length === 0) uncertainFields.push('products');

      const parsedData: ParsedSprayData = { plots: unit.plots, products: enriched.products };
      const validationFlags = pipelineFlags.filter(f => !f.message.includes('niet gevonden in CTGB database'));
      const validationMessage = validationFlags.length
        ? validationFlags.map(f => `${f.type === 'error' ? '❌' : f.type === 'warning' ? '⚠️' : 'ℹ️'} ${f.message}`).join('\n')
        : null;
      const reviewMeta: SprayReviewMeta = {
        ...baseMeta,
        groupId,
        processingMs: Date.now() - started,
        assumptions: [...assumptions, ...enriched.assumptions],
        uncertainFields,
        validationFlags,
      };

      if (unitIdx === 0) {
        await updateSprayDraft(logbookId, {
          status: 'Te Controleren',
          date,
          parsedData,
          registrationType,
          validationMessage,
          reviewMeta,
        });
      } else {
        await insertSprayDraft({
          userId: draft.userId,
          rawInput: draft.rawInput,
          waMessageId: draft.waMessageId,
          messageDate: date,
          status: 'Te Controleren',
          parsedData,
          registrationType,
          reviewMeta,
        });
      }
    }

    console.log(`[SprayInbox] Draft ${logbookId} processed in ${Date.now() - started}ms (${result.registration.units.length} unit(s))`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SprayInbox] Processing failed for ${logbookId}:`, message);
    await updateSprayDraft(logbookId, {
      status: 'Fout',
      reviewMeta: { ...baseMeta, error: message, processingMs: Date.now() - started },
    }).catch(err => console.error('[SprayInbox] Could not mark draft as Fout:', err));

    if (!options.silent) {
      await notifyProcessingFailure(draft.userId, options.notifyPhone ?? null, options.phoneNumberId);
    }
  }
}

// ============================================================================
// Enrichment helpers
// ============================================================================

interface EnrichResult {
  products: ProductEntry[];
  assumptions: SprayReviewAssumption[];
  uncertainFields: string[];
}

/**
 * Resolve active-ingredient names to the user's own brand, fill missing dosages
 * from history, and mark whatever is still uncertain for the review UI.
 */
export function enrichUnit(
  products: ProductEntry[],
  ctgbProducts: CtgbProduct[],
  userProductNames: string[],
  lastUsed: Map<string, { dosage: number; unit: string; date: Date }>
): EnrichResult {
  const assumptions: SprayReviewAssumption[] = [];
  const uncertainFields: string[] = [];
  const historySet = new Set(userProductNames.map(n => n.toLowerCase()));

  const enriched = products.map((original, i) => {
    const p: ProductEntry = { ...original };

    if (p.resolved === false && p.source !== 'fertilizer') {
      const candidates = findBySubstance(p.product, ctgbProducts);
      const preferred = userProductNames.filter(n => candidates.some(c => c.naam.toLowerCase() === n.toLowerCase()));

      if (preferred.length >= 1) {
        assumptions.push({
          field: 'product',
          productIndex: i,
          from: p.product,
          to: preferred[0],
          reason: preferred.length === 1 ? 'werkzame stof, eerder gebruikt' : 'werkzame stof, laatst gebruikt',
        });
        p.product = preferred[0];
        p.resolved = true;
        p.suggestions = preferred.length > 1
          ? preferred.slice(0, 5).map(naam => ({ naam, score: 90 }))
          : undefined;
        if (preferred.length > 1) uncertainFields.push(`products[${i}].product`);
      } else if (candidates.length > 0) {
        p.suggestions = candidates.slice(0, 5).map(c => ({ naam: c.naam, toelatingsnummer: c.toelatingsnummer, score: 80 }));
        uncertainFields.push(`products[${i}].product`);
      } else {
        uncertainFields.push(`products[${i}].product`);
      }
    } else if (p.resolved !== false && p.source !== 'fertilizer' && historySet.size > 0 && !historySet.has(p.product.toLowerCase())) {
      // Resolved via a generic alias (e.g. "captan" → Merpan) but this grower uses a different
      // brand with the same active ingredient(s) — prefer their own product.
      const resolved = ctgbProducts.find(c => c.naam.toLowerCase() === p.product.toLowerCase());
      const substances = (resolved?.werkzameStoffen || []).map(s => s.toLowerCase());
      if (substances.length > 0) {
        const sameSubstance = ctgbProducts.filter(c =>
          c.naam.toLowerCase() !== p.product.toLowerCase() &&
          (c.werkzameStoffen || []).some(s => substances.includes(s.toLowerCase()))
        );
        const preferred = userProductNames.filter(n => sameSubstance.some(c => c.naam.toLowerCase() === n.toLowerCase()));
        if (preferred.length > 0) {
          assumptions.push({ field: 'product', productIndex: i, from: p.product, to: preferred[0], reason: 'zelfde werkzame stof, eerder gebruikt' });
          p.product = preferred[0];
          if (preferred.length > 1) {
            p.suggestions = preferred.slice(0, 5).map(naam => ({ naam, score: 90 }));
            uncertainFields.push(`products[${i}].product`);
          }
        }
      }
    }

    if (!p.dosage || p.dosage <= 0) {
      const hit = lastUsed.get(original.product) || lastUsed.get(p.product);
      if (hit) {
        p.dosage = hit.dosage;
        p.unit = hit.unit || p.unit;
        assumptions.push({
          field: 'dosage',
          productIndex: i,
          from: '',
          to: `${hit.dosage} ${hit.unit}`,
          reason: 'vorige keer',
        });
      } else {
        uncertainFields.push(`products[${i}].dosage`);
      }
    }

    return p;
  });

  return { products: enriched, assumptions, uncertainFields };
}

function findBySubstance(input: string, ctgbProducts: CtgbProduct[]): CtgbProduct[] {
  const token = input.toLowerCase().trim();
  if (token.length < 4) return [];
  return ctgbProducts.filter(p =>
    (p.werkzameStoffen || []).some(ws => {
      const s = ws.toLowerCase();
      return s === token || s.startsWith(token) || token.startsWith(s);
    })
  );
}

/** Pipeline defaults the date to "now" when the text has none; prefer the WhatsApp message time then. */
function pickDraftDate(pipelineDate: Date, messageDate: Date): Date {
  const d = pipelineDate instanceof Date ? pipelineDate : new Date(pipelineDate);
  if (isNaN(d.getTime())) return messageDate;
  const looksLikeDefault = Math.abs(Date.now() - d.getTime()) < 5 * 60 * 1000;
  return looksLikeDefault ? messageDate : d;
}

// ============================================================================
// User preferences (admin client — no cookie session here)
// ============================================================================

export async function getUserPreferencesAdmin(userId: string): Promise<UserPreference[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('user_preferences')
    .select('id, alias, preferred')
    .eq('user_id', userId);
  if (error || !data) return [];
  return data.map(r => ({ id: r.id, alias: r.alias, preferred: r.preferred }));
}

export function applyUserPreferencesToText(
  text: string,
  preferences: UserPreference[]
): { text: string; substitutions: Array<{ from: string; to: string }> } {
  let out = text;
  const substitutions: Array<{ from: string; to: string }> = [];
  for (const pref of preferences) {
    const alias = pref.alias.replace(/^middel_/i, '').trim();
    if (alias.length < 3 || !pref.preferred) continue;
    const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
    const match = out.match(re);
    if (match && match[0].toLowerCase() !== pref.preferred.toLowerCase()) {
      out = out.replace(re, pref.preferred);
      substitutions.push({ from: match[0], to: pref.preferred });
    }
  }
  return { text: out, substitutions };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Failure notification
// ============================================================================

async function notifyProcessingFailure(userId: string, phone: string | null, phoneNumberId?: string): Promise<void> {
  try {
    let target = phone;
    if (!target) {
      const linked = await getLinkedNumbers(userId);
      target = linked.find(n => n.isActive)?.phoneNumber || linked[0]?.phoneNumber || null;
    }
    if (!target) return;
    await sendTextMessage(stripPlus(target), PROCESSING_FAILED_MESSAGE, phoneNumberId ? { phoneNumberId } : undefined);
    await logMessage({ phoneNumber: addPlus(target), direction: 'outbound', messageText: PROCESSING_FAILED_MESSAGE, metadata: { channel: 'spray' } });
  } catch (err) {
    console.warn('[SprayInbox] Failure notification could not be sent:', err);
  }
}
