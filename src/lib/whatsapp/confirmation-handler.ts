/**
 * WhatsApp Confirmation Handler.
 * Handles the confirmation of a pending registration from WhatsApp.
 */

import { confirmRegistration } from '@/lib/registration-service';
import { addParcelHistoryEntries } from '@/lib/supabase-store';
import { invalidateContextCache } from '@/lib/registration-pipeline';
import { sendTextMessage } from './client';
import { updateConversationState, logMessage } from './store';
import { formatConfirmationMessage, formatExpiredMessage, formatErrorMessage } from './format';
import { stripPlus } from './phone-utils';
import { getSupabaseAdmin } from '@/lib/supabase-client';
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

    // 3. Save via shared confirmation service (with parcel history for interval tracking)
    const result = await confirmRegistration(
      {
        userId,
        plots: allPlots,
        products: allProducts,
        date: reg.date,
        rawInput: reg.rawInput || conversation.lastInput || 'WhatsApp registratie',
        registrationType: reg.registrationType || 'spraying',
        registrationSource: 'whatsapp',
      },
      async ({ logbookEntry, sprayableParcels, isConfirmation, spuitschriftId }) => {
        await addParcelHistoryEntries({
          logbookEntry,
          sprayableParcels,
          isConfirmation,
          spuitschriftId,
          providedUserId: userId,
        });
      }
    );

    if (!result.success) {
      const msg = `❌ ${result.message || 'Kon de registratie niet opslaan.'}`;
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    // 4. Mirror to field_notes as transferred note (complete logbook)
    try {
      const admin = getSupabaseAdmin();
      const rawInput = reg.rawInput || conversation.lastInput || 'WhatsApp registratie';
      await (admin as any).from('field_notes').insert({
        user_id: userId,
        content: rawInput,
        source: 'whatsapp',
        status: 'transferred',
        auto_tag: reg.registrationType === 'fertilization' ? 'bemesting' : 'bespuiting',
        is_pinned: false,
      });
    } catch (mirrorErr) {
      // Mirror failure must never block the registration
      console.warn('[handleConfirmation] field_notes mirror failed:', mirrorErr);
    }

    // 5. Invalidate pipeline context cache so next validation uses fresh history
    invalidateContextCache(userId);

    // 5. Update conversation state
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
