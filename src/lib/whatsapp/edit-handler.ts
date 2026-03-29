/**
 * WhatsApp Edit Handler.
 * Handles the "Wijzig" flow: shows a menu of what to change (date/products/parcels),
 * then accepts one piece of input and updates the pending registration accordingly.
 */

import { analyzeSprayInput } from '@/lib/spray-pipeline';
import { sendInteractiveButtons, sendTextMessage } from './client';
import { updateConversationState, logMessage, getSprayableParcelsForUser } from './store';
import {
  formatEditChoiceBody,
  formatEditInputPrompt,
  formatRegistrationSummary,
  formatErrorMessage,
} from './format';
import { stripPlus } from './phone-utils';
import type { WhatsAppConversation } from './types';
import type { SprayRegistrationGroup } from '@/lib/types';

// ============================================================================
// Show the edit-choice menu (called when user clicks "Wijzig")
// ============================================================================

export async function handleEditChoice(
  phoneNumber: string,
  conversation: WhatsAppConversation
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  await updateConversationState(conversation.id, 'awaiting_edit_choice');

  const body = formatEditChoiceBody();
  await sendInteractiveButtons(metaPhone, body, [
    { id: 'edit:date', title: '📅 Datum' },
    { id: 'edit:products', title: '🌿 Middelen' },
    { id: 'edit:parcels', title: '📍 Percelen' },
  ]);
  await logMessage({ phoneNumber, direction: 'outbound', messageText: body });
}

// ============================================================================
// User picked a field to edit — ask for new value
// ============================================================================

export async function handleEditFieldSelected(
  phoneNumber: string,
  conversation: WhatsAppConversation,
  field: 'date' | 'products' | 'parcels'
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  // Store which field is being edited in lastInput
  await updateConversationState(
    conversation.id,
    'awaiting_edit_input',
    undefined,
    `edit:${field}`
  );

  const prompt = formatEditInputPrompt(field);
  await sendTextMessage(metaPhone, prompt);
  await logMessage({ phoneNumber, direction: 'outbound', messageText: prompt });
}

// ============================================================================
// User typed the new value — parse & update pending registration
// ============================================================================

export async function handleEditInput(
  userId: string,
  phoneNumber: string,
  conversation: WhatsAppConversation,
  inputText: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  try {
    const field = conversation.lastInput?.replace('edit:', '') as 'date' | 'products' | 'parcels' | undefined;
    const pending = conversation.pendingRegistration as SprayRegistrationGroup | null;

    if (!field || !pending) {
      // Fallback: treat as new registration
      await updateConversationState(conversation.id, 'idle');
      return;
    }

    // Build a synthetic full-message that the pipeline can parse
    const syntheticMessage = buildSyntheticMessage(field, inputText, pending);
    const result = await analyzeSprayInput(syntheticMessage, userId);

    if (!result.registration) {
      const msg = `❓ Kon _"${inputText}"_ niet verwerken als ${fieldLabel(field)}. Probeer het opnieuw.`;
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      return;
    }

    // Merge the parsed part back into the pending registration
    const updated = mergeEdit(field, pending, result.registration);

    // Build parcel name map for formatting
    const parcels = await getSprayableParcelsForUser(userId);
    const parcelNameMap = new Map(
      parcels.map(p => [p.id, { name: p.name, area: p.area, crop: p.crop, variety: p.variety }])
    );

    // Store updated registration and go back to awaiting_confirmation
    await updateConversationState(
      conversation.id,
      'awaiting_confirmation',
      updated,
      conversation.lastInput  // keep lastInput unchanged (not used in confirmation state)
    );

    // Show updated summary with buttons
    const fakeResult = { ...result, registration: updated };
    const summaryText = formatRegistrationSummary(fakeResult as any, parcelNameMap);

    const hasBlockingErrors = (result.validationFlags || []).some(f => f.type === 'error');
    if (hasBlockingErrors) {
      await sendTextMessage(metaPhone, summaryText);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: summaryText });
      return;
    }

    await sendInteractiveButtons(metaPhone, summaryText, [
      { id: 'confirm', title: '✓ Bevestig' },
      { id: 'edit', title: '✏ Wijzig' },
      { id: 'cancel', title: '✗ Annuleer' },
    ]);
    await logMessage({
      phoneNumber,
      direction: 'outbound',
      messageText: summaryText,
      metadata: { buttons: ['confirm', 'edit', 'cancel'] },
    });

  } catch (error) {
    console.error('[handleEditInput] Error:', error);
    try {
      const msg = formatErrorMessage();
      await sendTextMessage(metaPhone, msg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
    } catch { /* ignore */ }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function fieldLabel(field: 'date' | 'products' | 'parcels'): string {
  if (field === 'date') return 'datum';
  if (field === 'products') return 'middelen';
  return 'percelen';
}

/**
 * Build a synthetic full-spray message so the pipeline can parse just the changed part.
 */
function buildSyntheticMessage(
  field: 'date' | 'products' | 'parcels',
  userInput: string,
  pending: SprayRegistrationGroup
): string {
  // Use names from pending registration for the unchanged parts
  const productNames = pending.units[0]?.products.map(p => p.product).join(' en ') || 'delan';
  const plotNames = pending.units.flatMap(u => u.plots).join(', ') || 'perceel';

  if (field === 'date') {
    return `${userInput} ${plotNames} gespoten met ${productNames}`;
  }
  if (field === 'products') {
    return `${plotNames} gespoten met ${userInput}`;
  }
  // parcels
  return `${userInput} gespoten met ${productNames}`;
}

/**
 * Merge the newly parsed part into the original pending registration.
 */
function mergeEdit(
  field: 'date' | 'products' | 'parcels',
  pending: SprayRegistrationGroup,
  parsed: SprayRegistrationGroup
): SprayRegistrationGroup {
  if (field === 'date') {
    return { ...pending, date: parsed.date };
  }

  if (field === 'products') {
    // Replace products in ALL units with the newly parsed products
    const newProducts = parsed.units.flatMap(u => u.products);
    return {
      ...pending,
      units: pending.units.map(unit => ({ ...unit, products: newProducts })),
    };
  }

  // parcels — replace plots across units, keeping products
  const newPlots = parsed.units.flatMap(u => u.plots);
  return {
    ...pending,
    units: [{ ...pending.units[0], plots: newPlots, products: pending.units[0]?.products || [] }],
  };
}
