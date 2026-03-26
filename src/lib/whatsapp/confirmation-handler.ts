/**
 * WhatsApp Confirmation Handler.
 * Handles the confirmation of a pending registration from WhatsApp.
 */

import { confirmRegistration } from '@/lib/registration-service';
import { sendTextMessage } from './client';
import { updateConversationState, logMessage } from './store';
import { formatConfirmationMessage, formatExpiredMessage, formatErrorMessage } from './format';
import { stripPlus } from './phone-utils';
import type { WhatsAppConversation } from './types';
import type { SprayRegistrationGroup } from '@/lib/types';

/**
 * Confirm a pending registration and save it to the spuitschrift.
 */
export async function handleConfirmation(
  userId: string,
  phoneNumber: string,
  conversation: WhatsAppConversation
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  try {
    // 1. Check if conversation is still valid
    if (!conversation.pendingRegistration) {
      const msg = formatExpiredMessage();
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      await updateConversationState(conversation.id, 'expired');
      return;
    }

    if (new Date(conversation.expiresAt) < new Date()) {
      const msg = formatExpiredMessage();
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      await updateConversationState(conversation.id, 'expired');
      return;
    }

    // 2. Extract registration data from pending
    const reg = conversation.pendingRegistration as SprayRegistrationGroup;

    // Flatten all units' plots and products
    const allPlots = reg.units.flatMap(u => u.plots);
    const allProducts = reg.units.flatMap(u => u.products);

    // 3. Save via shared confirmation service
    const result = await confirmRegistration({
      userId,
      plots: allPlots,
      products: allProducts,
      date: reg.date,
      rawInput: reg.rawInput || conversation.lastInput || 'WhatsApp registratie',
      registrationType: reg.registrationType || 'spraying',
      registrationSource: 'whatsapp',
    });

    if (!result.success) {
      const msg = `❌ ${result.message || 'Kon de registratie niet opslaan.'}`;
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    // 4. Update conversation state
    await updateConversationState(conversation.id, 'confirmed');

    // 5. Send confirmation message
    const msg = formatConfirmationMessage();
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });

  } catch (error) {
    console.error('[handleConfirmation] Error:', error);

    try {
      const errorMsg = formatErrorMessage();
      await sendTextMessage(metaPhone, errorMsg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: errorMsg });
    } catch (sendError) {
      console.error('[handleConfirmation] Failed to send error message:', sendError);
    }
  }
}
