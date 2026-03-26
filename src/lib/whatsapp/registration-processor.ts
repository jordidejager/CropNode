/**
 * WhatsApp Registration Processor.
 * Processes a new registration message by calling the shared pipeline,
 * formatting the result for WhatsApp, and sending interactive buttons.
 */

import { analyzeSprayInput } from '@/lib/spray-pipeline';
import { sendInteractiveButtons, sendTextMessage } from './client';
import {
  createConversation,
  updateConversationState,
  logMessage,
  getSprayableParcelsForUser,
} from './store';
import {
  formatRegistrationSummary,
  formatNotRecognizedMessage,
  formatErrorMessage,
} from './format';
import { stripPlus } from './phone-utils';

/**
 * Process a new registration message from WhatsApp.
 * Calls the shared pipeline, formats the result, sends buttons.
 */
export async function processNewRegistration(
  userId: string,
  phoneNumber: string,
  inputText: string,
  waMessageId: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  try {
    // 1. Log inbound message
    await logMessage({
      phoneNumber,
      direction: 'inbound',
      messageText: inputText,
      waMessageId,
    });

    // 2. Create conversation record
    const conversation = await createConversation(userId, phoneNumber, waMessageId, inputText);

    // 3. Run the shared analysis pipeline
    const result = await analyzeSprayInput(inputText, userId);

    // 4. Handle different results
    if (result.action === 'answer_query' || !result.registration) {
      // Not a registration — send help message
      const msg = formatNotRecognizedMessage();
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    if (result.action === 'clarification_needed') {
      // Pipeline needs more info (missing plots, dosage, etc.)
      // For WhatsApp V1: send the summary as-is and let the user resend with full info
      const msg = result.humanSummary + '\n\nStuur je registratie opnieuw met de ontbrekende gegevens.';
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    // 5. Build parcel name map for formatting
    const parcels = await getSprayableParcelsForUser(userId);
    const parcelNameMap = new Map(
      parcels.map(p => [p.id, { name: p.name, area: p.area, crop: p.crop, variety: p.variety }])
    );

    // 6. Format the summary
    const summaryText = formatRegistrationSummary(result, parcelNameMap);

    // 7. Store pending registration in conversation
    await updateConversationState(
      conversation.id,
      'awaiting_confirmation',
      result.registration
    );

    // 8. Send interactive buttons
    await sendInteractiveButtons(metaPhone, summaryText, [
      { id: 'confirm', title: '✓ Bevestig' },
      { id: 'edit', title: '✏ Wijzig' },
      { id: 'cancel', title: '✗ Annuleer' },
    ]);

    // 9. Log outbound
    await logMessage({
      phoneNumber,
      direction: 'outbound',
      messageText: summaryText,
      metadata: { buttons: ['confirm', 'edit', 'cancel'] },
    });

  } catch (error) {
    console.error('[processNewRegistration] Error:', error);

    // Send error message to user
    try {
      const errorMsg = formatErrorMessage();
      await sendTextMessage(metaPhone, errorMsg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: errorMsg });
    } catch (sendError) {
      console.error('[processNewRegistration] Failed to send error message:', sendError);
    }
  }
}
