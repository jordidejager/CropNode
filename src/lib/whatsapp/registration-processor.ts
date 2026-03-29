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
  formatErrorMessage,
} from './format';
import { processFieldNote } from './field-note-processor';
import { sendProductSelectionPrompt } from './product-selection-handler';
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
    console.log(`[processNewRegistration] Running analyzeSprayInput for user ${userId}...`);
    let result;
    try {
      result = await analyzeSprayInput(inputText, userId);
      console.log(`[processNewRegistration] Pipeline result: action=${result.action}, hasRegistration=${!!result.registration}`);
    } catch (pipelineError) {
      console.error('[processNewRegistration] Pipeline crashed:', pipelineError);
      throw pipelineError;
    }

    // 4. Handle different results
    if (result.action === 'answer_query' || !result.registration) {
      // Not a spray registration — save as field note instead
      await processFieldNote(userId, phoneNumber, inputText, waMessageId);
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

    // 5. Check for unresolved products with suggestions → product selection flow
    const allProducts = result.registration.units.flatMap(u => u.products) as any[];
    const firstUnresolved = allProducts.findIndex(
      p => p.resolved === false && p.suggestions?.length > 0
    );

    if (firstUnresolved !== -1) {
      const unresolvedProd = allProducts[firstUnresolved];
      // Find which unit/product index this is
      let unitIdx = 0, prodIdx = 0;
      outer: for (let ui = 0; ui < result.registration.units.length; ui++) {
        for (let pi = 0; pi < result.registration.units[ui].products.length; pi++) {
          const p = result.registration.units[ui].products[pi] as any;
          if (p.resolved === false && p.suggestions?.length > 0) {
            unitIdx = ui; prodIdx = pi;
            break outer;
          }
        }
      }

      // Store conversation + send product selection buttons
      await updateConversationState(conversation.id, 'awaiting_confirmation', result.registration);
      await sendProductSelectionPrompt(
        phoneNumber,
        conversation.id,
        result.registration,
        unitIdx,
        prodIdx,
        unresolvedProd.product,
        unresolvedProd.suggestions.map((s: any) => s.naam || s).slice(0, 3)
      );
      return;
    }

    // 6. Build parcel name map for formatting
    const parcels = await getSprayableParcelsForUser(userId);
    const parcelNameMap = new Map(
      parcels.map(p => [p.id, { name: p.name, area: p.area, crop: p.crop, variety: p.variety }])
    );

    // 7. Format the summary
    const summaryText = formatRegistrationSummary(result, parcelNameMap);

    // 8. Check for blocking errors — if any, send text only (no confirm button)
    const hasBlockingErrors = (result.validationFlags || []).some(f => f.type === 'error');
    if (hasBlockingErrors) {
      await sendTextMessage(metaPhone, summaryText);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: summaryText });
      return;
    }

    // 9. Store pending registration in conversation
    await updateConversationState(
      conversation.id,
      'awaiting_confirmation',
      result.registration
    );

    // 10. Send interactive buttons
    await sendInteractiveButtons(metaPhone, summaryText, [
      { id: 'confirm', title: '✓ Bevestig' },
      { id: 'edit', title: '✏ Wijzig' },
      { id: 'cancel', title: '✗ Annuleer' },
    ]);

    // 11. Log outbound
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
