/**
 * WhatsApp Edit Handler.
 * Handles the "Wijzig" flow: shows a menu of what to change (date/products/parcels),
 * then accepts one piece of input and updates the pending registration accordingly.
 *
 * Uses direct parsing for simple edits (date, removal) — only falls back to the
 * full pipeline when the user provides a complete new product list with dosages.
 */

import { analyzeSprayInput } from '@/lib/spray-pipeline';
import { deterministicParse } from '@/lib/deterministic-parser';
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
import type { SprayRegistrationGroup, ProductEntry } from '@/lib/types';

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

    // Fetch parcels for name resolution
    const parcels = await getSprayableParcelsForUser(userId);
    const parcelNameMap = new Map(
      parcels.map(p => [p.id, { name: p.name, area: p.area ?? undefined, crop: p.crop ?? undefined, variety: p.variety ?? undefined }])
    );

    let updated: SprayRegistrationGroup | null = null;
    let validationFlags: Array<{ type: 'error' | 'warning' | 'info'; message: string; field?: string }> = [];

    // Try direct (fast) edit first — no pipeline needed
    if (field === 'date') {
      updated = tryDirectDateEdit(inputText, pending, parcels);
    } else if (field === 'products') {
      updated = tryDirectProductEdit(inputText, pending);
    } else if (field === 'parcels') {
      updated = tryDirectParcelEdit(inputText, pending, parcels);
    }

    // If direct edit didn't work, fall back to full pipeline
    if (!updated) {
      const syntheticMessage = buildSyntheticMessage(field, inputText, pending, parcelNameMap);
      const result = await analyzeSprayInput(syntheticMessage, userId);

      if (!result.registration) {
        const msg = `❓ Kon _"${inputText}"_ niet verwerken als ${fieldLabel(field)}. Probeer het opnieuw.`;
        await sendTextMessage(metaPhone, msg);
        await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
        return;
      }

      updated = mergeEdit(field, pending, result.registration);
      validationFlags = result.validationFlags || [];
    }

    // Store updated registration and go back to awaiting_confirmation
    await updateConversationState(
      conversation.id,
      'awaiting_confirmation',
      updated,
      conversation.lastInput
    );

    // Show updated summary with buttons
    const fakeResult = { action: 'new_draft' as const, registration: updated, humanSummary: '', validationFlags, processingTimeMs: 0 };
    const summaryText = formatRegistrationSummary(fakeResult as any, parcelNameMap);

    const hasBlockingErrors = validationFlags.some(f => f.type === 'error');
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
// Direct edit handlers — fast, no AI needed
// ============================================================================

/**
 * Try to parse a date directly from user input.
 * Handles: "gisteren", "eergisteren", "28 maart", "zaterdag", etc.
 */
function tryDirectDateEdit(
  input: string,
  pending: SprayRegistrationGroup,
  parcels: Array<{ id: string; name: string; area?: number | null }>
): SprayRegistrationGroup | null {
  // Use deterministicParse with a dummy message to extract the date
  const sprayableParcels = parcels.map(p => ({
    id: p.id, name: p.name, area: p.area ?? 0,
    crop: '', variety: null, parcelId: p.id, parcelName: p.name,
    location: null, geometry: null, source: null, rvoId: null, synonyms: [],
  }));
  const parseResult = deterministicParse(
    `${input} perceel gespoten met delan`,
    sprayableParcels as any
  );

  if (parseResult.date) {
    return { ...pending, date: parseResult.date };
  }
  return null;
}

/**
 * Try to handle product edits directly:
 * - "geen X" / "zonder X" → remove product X
 * - "X vervangen door Y" → not supported yet, fall back to pipeline
 */
function tryDirectProductEdit(
  input: string,
  pending: SprayRegistrationGroup
): SprayRegistrationGroup | null {
  const normalized = input.toLowerCase().trim();

  // Pattern: "geen X" or "zonder X" — remove a product
  const removeMatch = normalized.match(/^(?:geen|zonder|verwijder|weg met)\s+(.+)$/);
  if (removeMatch) {
    const productToRemove = removeMatch[1].trim();
    const allProducts = pending.units.flatMap(u => u.products);

    // Find matching product (fuzzy: check if product name contains the input or vice versa)
    const matchIdx = allProducts.findIndex(p =>
      p.product.toLowerCase().includes(productToRemove) ||
      productToRemove.includes(p.product.toLowerCase())
    );

    if (matchIdx === -1) {
      return null; // Product not found, fall back to pipeline
    }

    const remainingProducts = allProducts.filter((_, i) => i !== matchIdx);
    if (remainingProducts.length === 0) {
      return null; // Can't remove all products
    }

    return {
      ...pending,
      units: pending.units.map(unit => ({ ...unit, products: remainingProducts })),
    };
  }

  // Not a simple removal — fall back to pipeline
  return null;
}

/**
 * Try to resolve parcel names directly from user input.
 * Handles: "zuidhoek en busje", "alleen conference murre"
 */
function tryDirectParcelEdit(
  input: string,
  pending: SprayRegistrationGroup,
  parcels: Array<{ id: string; name: string }>
): SprayRegistrationGroup | null {
  const normalized = input.toLowerCase().replace(/^alleen\s+/, '').trim();

  // Split on common separators
  const names = normalized.split(/\s*(?:,|en)\s*/).map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return null;

  // Match each name to a parcel
  const matchedPlots: string[] = [];
  for (const name of names) {
    const match = parcels.find(p =>
      p.name.toLowerCase().includes(name) || name.includes(p.name.toLowerCase())
    );
    if (match) {
      matchedPlots.push(match.id);
    }
  }

  if (matchedPlots.length === 0) return null;

  return {
    ...pending,
    units: [{ ...pending.units[0], plots: matchedPlots, products: pending.units[0]?.products || [] }],
  };
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
 * Uses actual parcel names (resolved from IDs) so the deterministic parser can match them.
 */
function buildSyntheticMessage(
  field: 'date' | 'products' | 'parcels',
  userInput: string,
  pending: SprayRegistrationGroup,
  parcelNameMap: Map<string, { name: string; area?: number; crop?: string; variety?: string }>
): string {
  const productNames = pending.units[0]?.products.map(p => {
    const dosageStr = p.dosage > 0 ? `${p.dosage} ${p.unit || 'L'} ` : '';
    return `${dosageStr}${p.product}`;
  }).join(' en ') || 'delan';
  const plotIds = pending.units.flatMap(u => u.plots);
  const resolvedNames = plotIds.map(id => parcelNameMap.get(id)?.name).filter(Boolean);
  const plotNames = resolvedNames.length > 0 ? resolvedNames.join(', ') : 'perceel';

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
