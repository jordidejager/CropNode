/**
 * WhatsApp Edit Handler.
 * Handles the "Wijzig" flow using WhatsApp interactive list menus:
 *
 * 1. User taps "Wijzig" → shows field choice (Datum/Middelen/Percelen)
 * 2. User picks field → shows a list menu with inline options:
 *    - Datum: common date choices (vandaag, gisteren, eergisteren, etc.)
 *    - Middelen: current products with "verwijder" + "Andere middelen" fallback
 *    - Percelen: current parcels with "verwijder" + user's other parcels to add
 * 3. User picks from list → direct update, no typing needed
 *    (fallback: "Andere…" option → asks user to type freely)
 */

import { analyzeSprayInput } from '@/lib/spray-pipeline';
import { deterministicParse } from '@/lib/deterministic-parser';
import { sendInteractiveButtons, sendListMessage, sendTextMessage } from './client';
import { updateConversationState, logMessage, getSprayableParcelsForUser } from './store';
import {
  formatEditChoiceBody,
  formatRegistrationSummary,
  formatErrorMessage,
} from './format';
import { stripPlus } from './phone-utils';
import type { WhatsAppConversation } from './types';
import type { SprayRegistrationGroup } from '@/lib/types';

// ============================================================================
// Step 1: Show the edit-choice menu (called when user clicks "Wijzig")
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
// Step 2: User picked a field → show interactive list for that field
// ============================================================================

export async function handleEditFieldSelected(
  phoneNumber: string,
  conversation: WhatsAppConversation,
  field: 'date' | 'products' | 'parcels',
  userId?: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);
  const pending = conversation.pendingRegistration as SprayRegistrationGroup | null;

  // Store which field is being edited
  await updateConversationState(
    conversation.id,
    'awaiting_edit_input',
    undefined,
    `edit:${field}`
  );

  if (!pending) {
    const msg = '❌ Geen registratie gevonden om te wijzigen.';
    await sendTextMessage(metaPhone, msg);
    return;
  }

  // Show a list menu based on the field
  if (field === 'date') {
    await sendDateList(metaPhone, phoneNumber, pending);
  } else if (field === 'products') {
    await sendProductList(metaPhone, phoneNumber, pending);
  } else if (field === 'parcels' && userId) {
    await sendParcelList(metaPhone, phoneNumber, pending, userId);
  } else {
    // Fallback to text input
    const msg = '📍 Typ de percelen, bijv. _"zuidhoek en busje"_:';
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
  }
}

// ============================================================================
// Step 3: User picked from list → apply edit directly
// ============================================================================

export async function handleEditInput(
  userId: string,
  phoneNumber: string,
  conversation: WhatsAppConversation,
  inputText: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  try {
    const lastInput = conversation.lastInput || '';
    const pending = conversation.pendingRegistration as SprayRegistrationGroup | null;

    if (!pending) {
      await updateConversationState(conversation.id, 'idle');
      return;
    }

    // Handle dosage input: "dosage:ProductName"
    if (lastInput.startsWith('dosage:')) {
      const productName = lastInput.replace('dosage:', '');
      const updated = tryDosageUpdate(inputText, productName, pending);
      if (updated) {
        await finishEdit(userId, phoneNumber, conversation, updated);
      } else {
        const msg = `❓ Kon _"${inputText}"_ niet herkennen als dosering. Typ bijv. _"0,6 kg"_ of _"1,5 L"_:`;
        await sendTextMessage(metaPhone, msg);
        await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
      }
      return;
    }

    const field = lastInput.replace('edit:', '') as 'date' | 'products' | 'parcels' | undefined;

    if (!field) {
      await updateConversationState(conversation.id, 'idle');
      return;
    }

    // Fetch parcels for name resolution
    const parcels = await getSprayableParcelsForUser(userId);
    const parcelNameMap = new Map(
      parcels.map(p => [p.id, { name: p.name, area: p.area ?? undefined, crop: p.crop ?? undefined, variety: p.variety ?? undefined }])
    );

    let updated: SprayRegistrationGroup | null = null;

    // Try direct (fast) edit first — no pipeline needed
    if (field === 'date') {
      updated = tryDirectDateEdit(inputText, pending, parcels);
    } else if (field === 'products') {
      updated = tryDirectProductEdit(inputText, pending);
    } else if (field === 'parcels') {
      updated = tryDirectParcelEdit(inputText, pending, parcels);
    }

    // If direct edit didn't work, fall back to full pipeline
    let validationFlags: Array<{ type: 'error' | 'warning' | 'info'; message: string; field?: string }> = [];
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

    // Store updated registration and show summary
    await updateConversationState(conversation.id, 'awaiting_confirmation', updated);

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

/**
 * Handle a list selection for editing (called from message handler for list reply IDs).
 * This is the fast path — directly modifies the pending registration.
 */
export async function handleEditListReply(
  userId: string,
  phoneNumber: string,
  conversation: WhatsAppConversation,
  replyId: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);
  const pending = conversation.pendingRegistration as SprayRegistrationGroup | null;

  if (!pending) {
    await sendTextMessage(metaPhone, '❌ Geen registratie gevonden.');
    return;
  }

  // Parse the reply ID
  // Formats: "editdate:gisteren", "editprod:remove:Delan DF", "editprod:type", "editparcel:remove:uuid", "editparcel:add:uuid"

  if (replyId.startsWith('editdate:')) {
    const dateKey = replyId.replace('editdate:', '');
    const newDate = resolveDateKey(dateKey);
    if (newDate) {
      await handleEditInput(userId, phoneNumber, conversation, newDate);
    }
    return;
  }

  if (replyId === 'editprod:type') {
    // User wants to type a new product list — ask for text input
    const msg = '🌿 Typ de *volledige nieuwe lijst* van middelen en doseringen, bijv:\n_"0,5 kg delan en 0,75 L pyrus"_';
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
    return; // Stay in awaiting_edit_input state
  }

  if (replyId.startsWith('editprod:dosage:')) {
    const productName = replyId.replace('editprod:dosage:', '');
    const product = pending.units.flatMap(u => u.products).find(p => p.product === productName);
    const currentDos = product ? `${product.dosage} ${product.unit || 'L'}/ha` : '';

    // Switch to dosage input mode — store the product name
    await updateConversationState(conversation.id, 'awaiting_edit_input', undefined, `dosage:${productName}`);

    const msg = `📏 *${productName}*\nHuidige dosering: ${currentDos}\n\nTyp de nieuwe dosering, bijv. _"0,6 kg"_ of _"1,5 L"_:`;
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
    return;
  }

  if (replyId.startsWith('editprod:remove:')) {
    const productName = replyId.replace('editprod:remove:', '');
    await handleEditInput(userId, phoneNumber, conversation, `geen ${productName}`);
    return;
  }

  if (replyId.startsWith('editparcel:remove:')) {
    const parcelId = replyId.replace('editparcel:remove:', '');
    const currentPlots = pending.units.flatMap(u => u.plots);
    const remainingPlots = currentPlots.filter(id => id !== parcelId);

    if (remainingPlots.length === 0) {
      await sendTextMessage(metaPhone, '❌ Je moet minimaal 1 perceel overhouden.');
      return;
    }

    const updated: SprayRegistrationGroup = {
      ...pending,
      units: [{ ...pending.units[0], plots: remainingPlots }],
    };

    await finishEdit(userId, phoneNumber, conversation, updated);
    return;
  }

  if (replyId.startsWith('editparcel:add:')) {
    const parcelId = replyId.replace('editparcel:add:', '');
    const currentPlots = pending.units.flatMap(u => u.plots);
    if (!currentPlots.includes(parcelId)) {
      currentPlots.push(parcelId);
    }

    const updated: SprayRegistrationGroup = {
      ...pending,
      units: [{ ...pending.units[0], plots: currentPlots }],
    };

    await finishEdit(userId, phoneNumber, conversation, updated);
    return;
  }

  // Unknown reply ID — ignore
  console.warn(`[handleEditListReply] Unknown reply ID: ${replyId}`);
}

// ============================================================================
// List builders
// ============================================================================

async function sendDateList(
  metaPhone: string,
  phoneNumber: string,
  pending: SprayRegistrationGroup
): Promise<void> {
  const currentDate = pending.date ? new Date(pending.date) : new Date();
  const currentStr = currentDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

  const rows = buildDateRows();

  await sendListMessage(
    metaPhone,
    `📅 Huidige datum: *${currentStr}*\n\nKies een nieuwe datum:`,
    'Kies datum',
    [{ title: 'Datum', rows }]
  );
  await logMessage({ phoneNumber, direction: 'outbound', messageText: `Datumkeuze getoond` });
}

async function sendProductList(
  metaPhone: string,
  phoneNumber: string,
  pending: SprayRegistrationGroup
): Promise<void> {
  // Filter out unresolved products (parcel names parsed as products)
  const allProducts = pending.units.flatMap(u => u.products);
  const products = allProducts.filter(p => (p as any).resolved !== false);

  if (products.length === 0) {
    const msg = '🌿 Geen middelen gevonden. Typ de middelen en doseringen opnieuw:';
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
    return;
  }

  const sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> = [];

  // Section 1: Dosering aanpassen
  const dosageRows = products.map(prod => ({
    id: `editprod:dosage:${prod.product}`,
    title: `📏 ${prod.product}`.substring(0, 24),
    description: `Nu: ${prod.dosage} ${prod.unit || 'L'}/ha — tik om te wijzigen`,
  }));
  sections.push({ title: 'Dosering aanpassen', rows: dosageRows });

  // Section 2: Verwijderen (only if 2+ products, and we have room)
  if (products.length > 1 && dosageRows.length + products.length + 1 <= 10) {
    const removeRows = products.map(prod => ({
      id: `editprod:remove:${prod.product}`,
      title: `❌ ${prod.product}`.substring(0, 24),
      description: 'Verwijder dit middel',
    }));
    sections.push({ title: 'Verwijderen', rows: removeRows });
  }

  // Section 3: Type new list (always, if we have room)
  const totalRows = sections.reduce((s, sec) => s + sec.rows.length, 0);
  if (totalRows < 10) {
    sections.push({
      title: 'Overig',
      rows: [{ id: 'editprod:type', title: '📝 Nieuwe lijst typen', description: 'Typ alle middelen opnieuw' }],
    });
  }

  const bodyLines = products.map(p => `• ${p.product} — ${p.dosage} ${p.unit || 'L'}/ha`);
  await sendListMessage(
    metaPhone,
    `🌿 Huidige middelen:\n${bodyLines.join('\n')}\n\nWat wil je wijzigen?`,
    'Wijzig middelen',
    sections
  );
  await logMessage({ phoneNumber, direction: 'outbound', messageText: 'Middelenkeuze getoond' });
}

async function sendParcelList(
  metaPhone: string,
  phoneNumber: string,
  pending: SprayRegistrationGroup,
  userId: string
): Promise<void> {
  const currentPlots = pending.units.flatMap(u => u.plots);
  const allParcels = await getSprayableParcelsForUser(userId);

  // WhatsApp interactive lists have a HARD limit of 10 rows total across all sections.
  // Strategy: split budget between removing current + adding others.
  const MAX_TOTAL_ROWS = 10;
  const selectedParcels = allParcels.filter(p => currentPlots.includes(p.id));
  const otherParcels = allParcels.filter(p => !currentPlots.includes(p.id));

  // Budget: up to 4 slots for removal, rest for adding
  const removeBudget = selectedParcels.length > 1
    ? Math.min(selectedParcels.length, 4)
    : 0;
  const addBudget = MAX_TOTAL_ROWS - removeBudget;

  const sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> = [];

  if (removeBudget > 0) {
    const removeRows = selectedParcels.slice(0, removeBudget).map(p => ({
      id: `editparcel:remove:${p.id}`,
      title: `❌ ${p.name}`.substring(0, 24),
      description: `Verwijder — ${p.area?.toFixed(2) || '?'} ha`,
    }));
    sections.push({ title: 'Verwijder', rows: removeRows });
  }

  if (otherParcels.length > 0 && addBudget > 0) {
    const addRows = otherParcels.slice(0, addBudget).map(p => ({
      id: `editparcel:add:${p.id}`,
      title: `➕ ${p.name}`.substring(0, 24),
      description: `Toevoegen — ${p.area?.toFixed(2) || '?'} ha`,
    }));
    sections.push({ title: 'Toevoegen', rows: addRows });
  }

  if (sections.length === 0) {
    const msg = '📍 Typ de percelen die je wil, bijv. _"zuidhoek en busje"_:';
    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });
    return;
  }

  const selectedNames = selectedParcels.map(p => p.name).join(', ');
  const totalShown = sections.reduce((sum, s) => sum + s.rows.length, 0);
  const totalAvailable = selectedParcels.length + otherParcels.length;
  const moreHint = totalAvailable > totalShown
    ? `\n\n_Staat je perceel er niet bij? Typ de naam._`
    : '';

  await sendListMessage(
    metaPhone,
    `📍 Huidige percelen: *${selectedNames}*\n\nKies een perceel om toe te voegen of te verwijderen:${moreHint}`,
    'Wijzig percelen',
    sections
  );
  await logMessage({ phoneNumber, direction: 'outbound', messageText: 'Perceelkeuze getoond' });
}

// ============================================================================
// Shared finish-edit helper
// ============================================================================

async function finishEdit(
  userId: string,
  phoneNumber: string,
  conversation: WhatsAppConversation,
  updated: SprayRegistrationGroup
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);
  const parcels = await getSprayableParcelsForUser(userId);
  const parcelNameMap = new Map(
    parcels.map(p => [p.id, { name: p.name, area: p.area ?? undefined, crop: p.crop ?? undefined, variety: p.variety ?? undefined }])
  );

  await updateConversationState(conversation.id, 'awaiting_confirmation', updated);

  const fakeResult = { action: 'new_draft' as const, registration: updated, humanSummary: '', validationFlags: [] as any[], processingTimeMs: 0 };
  const summaryText = formatRegistrationSummary(fakeResult as any, parcelNameMap);

  await sendInteractiveButtons(metaPhone, summaryText, [
    { id: 'send', title: '📤 Verzenden' },
    { id: 'edit', title: '✏ Wijzigen' },
    { id: 'cancel', title: '✗ Annuleren' },
  ]);
  await logMessage({
    phoneNumber,
    direction: 'outbound',
    messageText: summaryText,
    metadata: { buttons: ['send', 'edit', 'cancel'] },
  });
}

// ============================================================================
// Date helpers
// ============================================================================

function buildDateRows(): Array<{ id: string; title: string; description?: string }> {
  const today = new Date();
  const rows: Array<{ id: string; title: string; description?: string }> = [];

  // Today
  rows.push({
    id: 'editdate:vandaag',
    title: 'Vandaag',
    description: formatDateDescription(today),
  });

  // Yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  rows.push({
    id: 'editdate:gisteren',
    title: 'Gisteren',
    description: formatDateDescription(yesterday),
  });

  // Day before yesterday
  const eergisteren = new Date(today);
  eergisteren.setDate(eergisteren.getDate() - 2);
  rows.push({
    id: 'editdate:eergisteren',
    title: 'Eergisteren',
    description: formatDateDescription(eergisteren),
  });

  // Previous 4 days
  for (let i = 3; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayName = d.toLocaleDateString('nl-NL', { weekday: 'long' });
    const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    rows.push({
      id: `editdate:${i}daggeleden`,
      title: capitalized,
      description: formatDateDescription(d),
    });
  }

  return rows;
}

function formatDateDescription(date: Date): string {
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function resolveDateKey(key: string): string | null {
  const today = new Date();

  if (key === 'vandaag') return 'vandaag';
  if (key === 'gisteren') return 'gisteren';
  if (key === 'eergisteren') return 'eergisteren';

  // "3daggeleden", "4daggeleden", etc.
  const match = key.match(/^(\d+)daggeleden$/);
  if (match) {
    const days = parseInt(match[1], 10);
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  }

  return null;
}

// ============================================================================
// Direct edit handlers — fast, no AI needed
// ============================================================================

function tryDirectDateEdit(
  input: string,
  pending: SprayRegistrationGroup,
  parcels: Array<{ id: string; name: string; area?: number | null }>
): SprayRegistrationGroup | null {
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

    const matchIdx = allProducts.findIndex(p =>
      p.product.toLowerCase().includes(productToRemove) ||
      productToRemove.includes(p.product.toLowerCase())
    );

    if (matchIdx === -1) return null;

    const remainingProducts = allProducts.filter((_, i) => i !== matchIdx);
    if (remainingProducts.length === 0) return null;

    return {
      ...pending,
      units: pending.units.map(unit => ({ ...unit, products: remainingProducts })),
    };
  }

  return null;
}

function tryDirectParcelEdit(
  input: string,
  pending: SprayRegistrationGroup,
  parcels: Array<{ id: string; name: string }>
): SprayRegistrationGroup | null {
  const normalized = input.toLowerCase().trim();

  // "alleen X" → replace with only X
  const alleenMatch = normalized.match(/^alleen\s+(.+)/);
  if (alleenMatch) {
    const names = alleenMatch[1].split(/\s*(?:,|en)\s*/).map(n => n.trim()).filter(Boolean);
    const matchedPlots: string[] = [];
    for (const name of names) {
      const match = parcels.find(p =>
        p.name.toLowerCase().includes(name) || name.includes(p.name.toLowerCase())
      );
      if (match) matchedPlots.push(match.id);
    }
    if (matchedPlots.length === 0) return null;
    return {
      ...pending,
      units: [{ ...pending.units[0], plots: matchedPlots, products: pending.units[0]?.products || [] }],
    };
  }

  // "verwijder X" / "geen X" → remove from current selection
  const removeMatch = normalized.match(/^(?:verwijder|geen|zonder|weg met)\s+(.+)/);
  if (removeMatch) {
    const name = removeMatch[1].trim();
    const match = parcels.find(p =>
      p.name.toLowerCase().includes(name) || name.includes(p.name.toLowerCase())
    );
    if (!match) return null;
    const currentPlots = pending.units.flatMap(u => u.plots);
    const newPlots = currentPlots.filter(id => id !== match.id);
    if (newPlots.length === 0) return null; // Can't remove all
    return {
      ...pending,
      units: [{ ...pending.units[0], plots: newPlots, products: pending.units[0]?.products || [] }],
    };
  }

  // Default: ADD parcels to current selection (toggle if already present)
  const addMatch = normalized.replace(/^(?:voeg toe|plus|\+)\s+/, '');
  const names = addMatch.split(/\s*(?:,|en)\s*/).map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return null;

  const currentPlots = new Set(pending.units.flatMap(u => u.plots));
  let changed = false;
  for (const name of names) {
    const match = parcels.find(p =>
      p.name.toLowerCase().includes(name) || name.includes(p.name.toLowerCase())
    );
    if (match && !currentPlots.has(match.id)) {
      currentPlots.add(match.id);
      changed = true;
    }
  }

  if (!changed) return null;

  return {
    ...pending,
    units: [{ ...pending.units[0], plots: Array.from(currentPlots), products: pending.units[0]?.products || [] }],
  };
}

/**
 * Parse a dosage string like "0,6 kg", "1.5 L", "0,75" and update the product.
 */
function tryDosageUpdate(
  input: string,
  productName: string,
  pending: SprayRegistrationGroup
): SprayRegistrationGroup | null {
  const normalized = input.toLowerCase().replace(',', '.').trim();

  // Parse: "0.6 kg", "1.5 L", "0.75", "0.5 kg/ha"
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(kg|l|liter|ml)?/);
  if (!match) return null;

  const newDosage = parseFloat(match[1]);
  if (isNaN(newDosage) || newDosage <= 0) return null;

  let newUnit = match[2] || null;
  if (newUnit === 'liter') newUnit = 'L';
  if (newUnit === 'l') newUnit = 'L';
  if (newUnit === 'ml') { newUnit = 'L'; } // Keep as-is, user likely means ml

  return {
    ...pending,
    units: pending.units.map(unit => ({
      ...unit,
      products: unit.products.map(p => {
        if (p.product !== productName) return p;
        return {
          ...p,
          dosage: newDosage,
          ...(newUnit && { unit: newUnit }),
        };
      }),
    })),
  };
}

// ============================================================================
// Pipeline fallback helpers
// ============================================================================

function fieldLabel(field: 'date' | 'products' | 'parcels'): string {
  if (field === 'date') return 'datum';
  if (field === 'products') return 'middelen';
  return 'percelen';
}

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

  if (field === 'date') return `${userInput} ${plotNames} gespoten met ${productNames}`;
  if (field === 'products') return `${plotNames} gespoten met ${userInput}`;
  return `${userInput} gespoten met ${productNames}`;
}

function mergeEdit(
  field: 'date' | 'products' | 'parcels',
  pending: SprayRegistrationGroup,
  parsed: SprayRegistrationGroup
): SprayRegistrationGroup {
  if (field === 'date') return { ...pending, date: parsed.date };

  if (field === 'products') {
    const newProducts = parsed.units.flatMap(u => u.products);
    return {
      ...pending,
      units: pending.units.map(unit => ({ ...unit, products: newProducts })),
    };
  }

  const newPlots = parsed.units.flatMap(u => u.plots);
  return {
    ...pending,
    units: [{ ...pending.units[0], plots: newPlots, products: pending.units[0]?.products || [] }],
  };
}
