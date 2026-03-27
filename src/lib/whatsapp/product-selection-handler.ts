/**
 * WhatsApp Product Selection Handler.
 *
 * When the pipeline finds an unrecognized product with CTGB suggestions,
 * it sends interactive buttons so the user can pick the right product.
 * This handler processes the button reply, swaps in the selected product,
 * and continues to the normal confirmation flow.
 */

import { sendInteractiveButtons, sendTextMessage } from './client';
import { updateConversationState, logMessage, getSprayableParcelsForUser } from './store';
import { formatRegistrationSummary, formatProductSelectionMessage, formatErrorMessage } from './format';
import { stripPlus } from './phone-utils';
import type { WhatsAppConversation, ProductSelectionContext } from './types';
import type { SprayRegistrationGroup } from '@/lib/types';

type PendingWithSelection = SprayRegistrationGroup & {
  _productSelection?: ProductSelectionContext;
};

/**
 * Send a product selection prompt with interactive buttons.
 * Stores the selection context inside pending_registration._productSelection.
 */
export async function sendProductSelectionPrompt(
  phoneNumber: string,
  conversationId: string,
  registration: SprayRegistrationGroup,
  unitIndex: number,
  productIndex: number,
  originalName: string,
  suggestions: string[]
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  // Take max 3 suggestions (WhatsApp button limit)
  const options = suggestions.slice(0, 3);

  // Store selection context in pending_registration
  const pendingWithContext: PendingWithSelection = {
    ...registration,
    _productSelection: { unitIndex, productIndex, originalName, options },
  };

  // Transition state: awaiting_product_selection
  await updateConversationState(
    conversationId,
    'awaiting_product_selection',
    pendingWithContext as SprayRegistrationGroup
  );

  const bodyText = formatProductSelectionMessage(originalName, options);

  await sendInteractiveButtons(
    metaPhone,
    bodyText,
    options.map((name, i) => ({
      id: `product_select:${i}`,
      title: name.substring(0, 20),
    }))
  );

  await logMessage({
    phoneNumber,
    direction: 'outbound',
    messageText: `${bodyText}\n${options.join(' / ')}`,
    metadata: { type: 'product_selection', options },
  });
}

/**
 * Handle a product selection button reply.
 * Swaps the selected product into the pending registration,
 * then sends the normal confirmation summary with Bevestig/Wijzig/Annuleer.
 */
export async function handleProductSelection(
  userId: string,
  phoneNumber: string,
  conversation: WhatsAppConversation,
  buttonReplyId: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  try {
    const pending = conversation.pendingRegistration as PendingWithSelection | null;
    const ctx = pending?._productSelection;

    if (!pending || !ctx) {
      // No context — treat as new message
      const msg = formatErrorMessage();
      await sendTextMessage(metaPhone, msg);
      return;
    }

    // Parse selected index from button ID "product_select:N"
    const parts = buttonReplyId.split(':');
    const selectedIndex = parseInt(parts[1] ?? '-1', 10);

    if (selectedIndex < 0 || selectedIndex >= ctx.options.length) {
      const msg = formatErrorMessage();
      await sendTextMessage(metaPhone, msg);
      return;
    }

    const selectedProduct = ctx.options[selectedIndex];
    console.log(`[ProductSelection] User selected: "${selectedProduct}" (was "${ctx.originalName}")`);

    // Swap in the selected product name
    const updatedRegistration: PendingWithSelection = JSON.parse(JSON.stringify(pending));
    const unit = updatedRegistration.units[ctx.unitIndex];
    if (unit?.products[ctx.productIndex]) {
      unit.products[ctx.productIndex].product = selectedProduct;
      unit.products[ctx.productIndex].resolved = true;
    }

    // Remove the selection context — no longer needed
    delete updatedRegistration._productSelection;

    // Check if there are still more unresolved products
    const nextUnresolved = findFirstUnresolved(updatedRegistration);

    if (nextUnresolved) {
      // Ask about the next unresolved product
      const nextUnit = updatedRegistration.units[nextUnresolved.unitIndex];
      const nextProd = nextUnit.products[nextUnresolved.productIndex];
      await sendProductSelectionPrompt(
        phoneNumber,
        conversation.id,
        updatedRegistration as SprayRegistrationGroup,
        nextUnresolved.unitIndex,
        nextUnresolved.productIndex,
        nextProd.product,
        (nextProd as any).suggestions?.map((s: any) => s.naam || s) || []
      );
      return;
    }

    // All resolved — transition to confirmation flow
    await updateConversationState(
      conversation.id,
      'awaiting_confirmation',
      updatedRegistration as SprayRegistrationGroup
    );

    // Build parcel name map for summary
    const parcels = await getSprayableParcelsForUser(userId);
    const parcelNameMap = new Map(
      parcels.map(p => [p.id, { name: p.name, area: p.area, crop: p.crop, variety: p.variety }])
    );

    // Send summary with confirmation buttons (no validation warnings for the selected product)
    const { formatRegistrationSummary: fmt } = await import('./format');
    const summaryText = fmt(
      {
        action: 'new_draft',
        humanSummary: '',
        registration: updatedRegistration as SprayRegistrationGroup,
        processingTimeMs: 0,
      },
      parcelNameMap
    );

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
    console.error('[handleProductSelection] Error:', error);
    try {
      await sendTextMessage(metaPhone, formatErrorMessage());
    } catch { /* ignore */ }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function findFirstUnresolved(
  reg: PendingWithSelection
): { unitIndex: number; productIndex: number } | null {
  for (let ui = 0; ui < reg.units.length; ui++) {
    const unit = reg.units[ui];
    for (let pi = 0; pi < unit.products.length; pi++) {
      const prod = unit.products[pi] as any;
      if (prod.resolved === false && prod.suggestions?.length > 0) {
        return { unitIndex: ui, productIndex: pi };
      }
    }
  }
  return null;
}
