/**
 * WhatsApp Message Handler — State Machine.
 * Orchestrates message routing based on conversation state.
 */

import { sendTextMessage } from './client';
import {
  getUserIdByPhone,
  getActiveConversation,
  updateConversationState,
  isMessageProcessed,
  logMessage,
  getSprayableParcelsForUser,
} from './store';
import type { WhatsAppConversation } from './types';
import { processNewRegistration } from './registration-processor';
import { processFieldNote, isFieldNoteIntent } from './field-note-processor';
import { handleConfirmation } from './confirmation-handler';
import { handleProductSelection } from './product-selection-handler';
import { handleEditChoice, handleEditFieldSelected, handleEditInput, handleEditListReply } from './edit-handler';
import { attachGpsToNote } from './field-note-processor';
import {
  formatUnknownNumberMessage,
  formatUnsupportedMediaMessage,
  formatCancellationMessage,
  formatExpiredMessage,
  formatRateLimitMessage,
} from './format';
import { addPlus, stripPlus } from './phone-utils';
import type { SprayRegistrationGroup } from '@/lib/types';

// ============================================================================
// Rate limiting (in-memory, per phone number)
// ============================================================================

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max messages per minute

function checkRateLimit(phoneNumber: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(phoneNumber);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(phoneNumber, { count: 1, windowStart: now });
    return true; // allowed
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return false; // rate limited
  }
  return true;
}

// ============================================================================
// Main message handler
// ============================================================================

/** Extra data from webhook (media, location) */
interface MessageExtras {
  mediaId?: string | null;
  location?: { latitude: number; longitude: number; name?: string; address?: string } | null;
}

/**
 * Handle an incoming WhatsApp message.
 * This is the main entry point called from the webhook route.
 */
export async function handleIncomingMessage(
  phoneNumber: string,
  messageText: string | null,
  buttonReplyId: string | null,
  waMessageId: string,
  messageType: string = 'text',
  extras?: MessageExtras
): Promise<void> {
  const e164Phone = addPlus(phoneNumber);
  const metaPhone = stripPlus(phoneNumber);

  try {
    // --- A. Dedup check ---
    if (await isMessageProcessed(waMessageId)) {
      console.log(`[WhatsApp Handler] Duplicate message ${waMessageId}, skipping`);
      return;
    }

    // --- B. Rate limiting ---
    if (!checkRateLimit(e164Phone)) {
      console.log(`[WhatsApp Handler] Rate limited: ${e164Phone}`);
      await sendTextMessage(metaPhone, formatRateLimitMessage());
      return;
    }

    // --- C. Identify user ---
    const userId = await getUserIdByPhone(phoneNumber);
    if (!userId) {
      console.log(`[WhatsApp Handler] Unknown number: ${e164Phone}`);
      const msg = formatUnknownNumberMessage();
      await sendTextMessage(metaPhone, msg);
      await logMessage({
        phoneNumber: e164Phone,
        direction: 'inbound',
        messageText: messageText || `[${messageType}]`,
        waMessageId,
      });
      await logMessage({
        phoneNumber: e164Phone,
        direction: 'outbound',
        messageText: msg,
      });
      return;
    }

    // --- D. Handle image messages → save as field note with photo ---
    if (messageType === 'image') {
      const noteContent = messageText || '📸 Foto-notitie';
      await processFieldNote(userId, e164Phone, noteContent, waMessageId, {
        mediaId: extras?.mediaId || undefined,
      });
      return;
    }

    // --- E. Handle other unsupported message types ---
    if (messageType !== 'text' && messageType !== 'interactive' && messageType !== 'location') {
      const msg = formatUnsupportedMediaMessage();
      await sendTextMessage(metaPhone, msg);
      await logMessage({
        phoneNumber: e164Phone,
        direction: 'inbound',
        messageText: `[${messageType}]`,
        waMessageId,
      });
      await logMessage({
        phoneNumber: e164Phone,
        direction: 'outbound',
        messageText: msg,
      });
      return;
    }

    // --- E. Get conversation state ---
    const conversation = await getActiveConversation(phoneNumber);
    const state = conversation?.state || 'idle';

    console.log(`[WhatsApp Handler] User ${userId}, state: ${state}, type: ${messageType}${buttonReplyId ? `, button: ${buttonReplyId}` : ''}`);

    // --- F. Route based on state ---

    // Location messages: attach to recent note or save as new
    if (messageType === 'location' && extras?.location) {
      const loc = extras.location;

      // Check if there's a recent WhatsApp note without GPS (last 10 min)
      // This is stateless — works across Vercel serverless instances
      try {
        const { getSupabaseAdmin } = await import('@/lib/supabase-client');
        const admin = getSupabaseAdmin();
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recentNote } = await (admin as any)
          .from('field_notes')
          .select('id')
          .eq('user_id', userId)
          .is('latitude', null)
          .eq('source', 'whatsapp')
          .gte('created_at', tenMinAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentNote?.id) {
          await attachGpsToNote(recentNote.id, loc.latitude, loc.longitude, e164Phone, userId);
          return;
        }
      } catch (err) {
        console.warn('[WhatsApp Handler] Pending GPS lookup failed:', err);
      }

      // No recent note found — save as new field note with GPS
      const noteContent = loc.name || loc.address || '📍 Locatie-notitie';
      await processFieldNote(userId, e164Phone, noteContent, waMessageId, {
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationName: loc.name || loc.address || undefined,
      });
      return;
    }

    // Product selection: user picks from CTGB suggestions
    if (state === 'awaiting_product_selection' && conversation) {
      if (buttonReplyId?.startsWith('product_select:')) {
        await handleProductSelection(userId, e164Phone, conversation, buttonReplyId);
        return;
      }
      // User typed a new message instead → treat as new registration
      if (messageText) {
        await updateConversationState(conversation.id, 'cancelled');
        await processNewRegistration(userId, e164Phone, messageText, waMessageId);
        return;
      }
    }

    if (state === 'awaiting_confirmation' && conversation) {
      // "Verzenden" → show send-type choice (Notitie / Spuitschrift + Notitie)
      if (buttonReplyId === 'send') {
        await updateConversationState(conversation.id, 'awaiting_send_choice');
        const { sendInteractiveButtons } = await import('./client');
        await sendInteractiveButtons(metaPhone, 'Waar wil je het opslaan?', [
          { id: 'send_note', title: '📝 Alleen notitie' },
          { id: 'send_both', title: '📋 Spuitschrift' },
        ]);
        await logMessage({ phoneNumber: e164Phone, direction: 'outbound', messageText: 'Waar wil je het opslaan?' });
        return;
      }

      if (buttonReplyId === 'edit') {
        await handleEditChoice(e164Phone, conversation);
        return;
      }

      if (buttonReplyId === 'cancel') {
        await updateConversationState(conversation.id, 'cancelled');
        const { formatCancellationMessage } = await import('./format');
        const msg = formatCancellationMessage();
        await sendTextMessage(metaPhone, msg);
        await logMessage({ phoneNumber: e164Phone, direction: 'outbound', messageText: msg });
        return;
      }

      // If user sends a NEW text message while awaiting confirmation,
      // treat it as a new registration (reset + process)
      if (messageText) {
        await updateConversationState(conversation.id, 'cancelled');
        await processNewRegistration(userId, e164Phone, messageText, waMessageId);
        return;
      }
    }

    // State: awaiting_send_choice — user picks where to save
    if (state === 'awaiting_send_choice' && conversation) {
      if (buttonReplyId === 'send_note') {
        await handleSaveAsNote(userId, e164Phone, conversation);
        return;
      }
      if (buttonReplyId === 'send_both') {
        // Save as field note first (uses pending registration), then confirm to spuitschrift
        await handleSaveAsNote(userId, e164Phone, conversation, true); // silent = true
        await handleConfirmation(userId, e164Phone, conversation);
        return;
      }
      // Text message → new registration
      if (messageText) {
        await updateConversationState(conversation.id, 'cancelled');
        await processNewRegistration(userId, e164Phone, messageText, waMessageId);
        return;
      }
    }

    // State: awaiting_edit_choice — user picks which field to edit
    if (state === 'awaiting_edit_choice' && conversation) {
      if (buttonReplyId === 'edit:date') {
        await handleEditFieldSelected(e164Phone, conversation, 'date', userId);
        return;
      }
      if (buttonReplyId === 'edit:products') {
        await handleEditFieldSelected(e164Phone, conversation, 'products', userId);
        return;
      }
      if (buttonReplyId === 'edit:parcels') {
        await handleEditFieldSelected(e164Phone, conversation, 'parcels', userId);
        return;
      }
      // User typed something instead of picking → treat as new registration
      if (messageText) {
        await updateConversationState(conversation.id, 'cancelled');
        await processNewRegistration(userId, e164Phone, messageText, waMessageId);
        return;
      }
    }

    // State: awaiting_edit_input — user picks from list or types a new value
    if (state === 'awaiting_edit_input' && conversation) {
      // List reply (editdate:*, editprod:*, editparcel:*)
      if (buttonReplyId?.startsWith('edit')) {
        await handleEditListReply(userId, e164Phone, conversation, buttonReplyId);
        return;
      }
      // Free-text fallback
      if (messageText) {
        await handleEditInput(userId, e164Phone, conversation, messageText);
        return;
      }
    }

    // STATE: idle (or no active conversation) + text message
    if (messageText) {
      // Quick check: if message looks like a field note, skip spray pipeline
      if (isFieldNoteIntent(messageText)) {
        await processFieldNote(userId, e164Phone, messageText, waMessageId);
        return;
      }
      await processNewRegistration(userId, e164Phone, messageText, waMessageId);
      return;
    }

    // Fallback: shouldn't reach here, but handle gracefully
    console.warn(`[WhatsApp Handler] Unhandled state: ${state}, messageType: ${messageType}`);

  } catch (error) {
    console.error(`[WhatsApp Handler] Unhandled error for ${e164Phone}:`, error);
    // Don't throw — the webhook must always return 200
  }
}

// ============================================================================
// Save pending registration as field note (user tapped "📝 Notitie")
// ============================================================================

async function handleSaveAsNote(
  userId: string,
  phoneNumber: string,
  conversation: WhatsAppConversation,
  silent: boolean = false
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);
  const reg = conversation.pendingRegistration as SprayRegistrationGroup | null;

  if (!reg) {
    await sendTextMessage(metaPhone, '❌ Geen registratie gevonden.');
    return;
  }

  try {
    // Build readable note content from the registration
    const products = reg.units.flatMap(u => u.products)
      .map(p => `${p.product}${p.dosage ? ` ${p.dosage} ${p.unit || ''}/ha` : ''}`)
      .join(', ');

    const parcels = await getSprayableParcelsForUser(userId);
    const parcelNameMap = new Map(parcels.map(p => [p.id, p.name]));
    const plotNames = reg.units.flatMap(u => u.plots)
      .map(id => parcelNameMap.get(id) || id.substring(0, 8))
      .join(', ');

    const dateStr = reg.date
      ? new Date(reg.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'onbekend';

    const noteContent = `Bespuiting: ${products} — ${plotNames} — ${dateStr}`;

    // Get parcel IDs for linking
    const parcelIds = reg.units.flatMap(u => u.plots);

    // Save as field note
    const { getSupabaseAdmin } = await import('@/lib/supabase-client');
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Admin client niet beschikbaar');

    const { error: insertError } = await (admin as any)
      .from('field_notes')
      .insert({
        user_id: userId,
        content: noteContent,
        source: 'whatsapp',
        status: 'open',
        auto_tag: reg.registrationType === 'spreading' ? 'bemesting' : 'bespuiting',
        is_pinned: false,
        parcel_ids: parcelIds.length > 0 ? parcelIds : null,
      });

    if (insertError) throw new Error(insertError.message);

    if (!silent) {
      // Update conversation + send confirmation
      await updateConversationState(conversation.id, 'cancelled');
      const msg = `📝 *Opgeslagen als veldnotitie*\n\n${noteContent}\n\nJe kunt deze later officieel registreren via Veldnotities op CropNode.`;
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
    }
    // When silent=true: no message, no state change (caller handles that)

  } catch (err) {
    console.error('[handleSaveAsNote] Error:', err);
    const msg = '❗ Kon notitie niet opslaan. Probeer het opnieuw.';
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
  }
}
