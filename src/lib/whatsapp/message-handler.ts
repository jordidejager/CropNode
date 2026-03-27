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
import {
  formatUnknownNumberMessage,
  formatUnsupportedMediaMessage,
  formatCancellationMessage,
  formatEditMessage,
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

/**
 * Handle an incoming WhatsApp message.
 * This is the main entry point called from the webhook route.
 *
 * @param phoneNumber Sender's phone number (Meta format, without +)
 * @param messageText Text content (null for non-text messages)
 * @param buttonReplyId Button reply ID (null for non-interactive messages)
 * @param waMessageId WhatsApp message ID for dedup
 * @param messageType The type of message received
 */
export async function handleIncomingMessage(
  phoneNumber: string,
  messageText: string | null,
  buttonReplyId: string | null,
  waMessageId: string,
  messageType: string = 'text'
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

    // --- D. Handle unsupported message types ---
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
        await updateConversationState(conversation.id, 'idle');
        const msg = formatEditMessage();
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
