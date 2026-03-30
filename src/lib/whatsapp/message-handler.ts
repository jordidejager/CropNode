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
} from './store';
import { processNewRegistration } from './registration-processor';
import { processFieldNote, isFieldNoteIntent } from './field-note-processor';
import { handleConfirmation } from './confirmation-handler';
import { handleProductSelection } from './product-selection-handler';
import { handleEditChoice, handleEditFieldSelected, handleEditInput, handleEditListReply } from './edit-handler';
import { handleAddGpsButton, attachGpsToNote } from './field-note-processor';
import {
  formatUnknownNumberMessage,
  formatUnsupportedMediaMessage,
  formatCancellationMessage,
  formatExpiredMessage,
  formatRateLimitMessage,
} from './format';
import { addPlus, stripPlus } from './phone-utils';

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

    // --- D2. Handle location messages ---
    if (messageType === 'location' && extras?.location) {
      const loc = extras.location;

      // Check if user was asked to add GPS to an existing note
      if (conversation?.state === 'awaiting_gps' && conversation.lastInput?.startsWith('gps:')) {
        const noteId = conversation.lastInput.replace('gps:', '');
        await attachGpsToNote(noteId, loc.latitude, loc.longitude, e164Phone);
        await updateConversationState(conversation.id, 'idle');
        return;
      }

      // Otherwise save as new field note with GPS
      const noteContent = loc.name || loc.address || '📍 Locatie-notitie';
      await processFieldNote(userId, e164Phone, noteContent, waMessageId, {
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationName: loc.name || loc.address || undefined,
      });
      return;
    }

    // --- E. Handle other unsupported message types ---
    if (messageType !== 'text' && messageType !== 'interactive') {
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
      // Handle button replies
      if (buttonReplyId === 'confirm') {
        await handleConfirmation(userId, e164Phone, conversation);
        return;
      }

      if (buttonReplyId === 'cancel') {
        await updateConversationState(conversation.id, 'cancelled');
        const msg = formatCancellationMessage();
        await sendTextMessage(metaPhone, msg);
        await logMessage({ phoneNumber: e164Phone, direction: 'outbound', messageText: msg });
        return;
      }

      if (buttonReplyId === 'edit') {
        await handleEditChoice(e164Phone, conversation);
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

    // Handle "📍 Locatie toevoegen" button from field note confirmation
    if (buttonReplyId?.startsWith('addgps:')) {
      const noteId = buttonReplyId.replace('addgps:', '');
      // Create or update conversation to awaiting_gps state
      if (conversation) {
        await updateConversationState(conversation.id, 'awaiting_gps', undefined, `gps:${noteId}`);
      }
      await handleAddGpsButton(e164Phone, noteId);
      return;
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
