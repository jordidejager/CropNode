/**
 * WhatsApp-specific data access functions.
 * All functions use the service_role client (bypasses RLS)
 * because WhatsApp webhook requests have no auth cookies.
 * User identification is done via phone number lookup.
 *
 * NOTE: The WhatsApp tables (whatsapp_linked_numbers, whatsapp_conversations,
 * whatsapp_message_log) are not in the generated Supabase types.
 * We use the raw query builder (rpc-style) with explicit typing.
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { addPlus } from './phone-utils';
import type { WhatsAppLinkedNumber, WhatsAppConversation, ConversationState } from './types';
import type { SprayRegistrationGroup, ParcelHistoryEntry } from '@/lib/types';
import type { SprayableParcel } from '@/lib/supabase-store';

// Helper: get admin client, throw if unavailable
function getAdmin() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is niet ingesteld.');
  }
  return admin;
}

// Helper: untyped table access for new tables not in generated types
function fromTable(tableName: string) {
  const admin = getAdmin();
  return (admin as any).from(tableName);
}

// ============================================================================
// Phone number lookup
// ============================================================================

/**
 * Look up user_id by phone number. Returns null if not found or inactive.
 * @param phone Phone number in Meta format (without +) or E.164 (with +)
 */
export async function getUserIdByPhone(phone: string): Promise<string | null> {
  const e164 = addPlus(phone);

  const { data, error } = await fromTable('whatsapp_linked_numbers')
    .select('user_id')
    .eq('phone_number', e164)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return (data as any).user_id;
}

// ============================================================================
// Linked numbers management (for settings UI)
// ============================================================================

export async function getLinkedNumbers(userId: string): Promise<WhatsAppLinkedNumber[]> {
  const { data, error } = await fromTable('whatsapp_linked_numbers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    phoneNumber: row.phone_number,
    phoneLabel: row.phone_label || 'Hoofdnummer',
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

export async function addLinkedNumber(
  userId: string,
  phoneNumber: string,
  phoneLabel?: string
): Promise<WhatsAppLinkedNumber> {
  // Check max 5 numbers per user
  const { count } = await fromTable('whatsapp_linked_numbers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count && count >= 5) {
    throw new Error('Je kunt maximaal 5 telefoonnummers koppelen.');
  }

  const { data, error } = await fromTable('whatsapp_linked_numbers')
    .insert({
      user_id: userId,
      phone_number: phoneNumber,
      phone_label: phoneLabel || 'Hoofdnummer',
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.message?.includes('unique_phone') || error.code === '23505') {
      throw new Error('Dit telefoonnummer is al gekoppeld aan een account.');
    }
    throw new Error(error.message);
  }

  const row = data as any;
  return {
    id: row.id,
    userId: row.user_id,
    phoneNumber: row.phone_number,
    phoneLabel: row.phone_label,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function updateLinkedNumber(
  id: string,
  userId: string,
  updates: { phoneLabel?: string; isActive?: boolean }
): Promise<void> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.phoneLabel !== undefined) updateData.phone_label = updates.phoneLabel;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  const { error } = await fromTable('whatsapp_linked_numbers')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function removeLinkedNumber(id: string, userId: string): Promise<void> {
  const { error } = await fromTable('whatsapp_linked_numbers')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

// ============================================================================
// Conversation state management
// ============================================================================

export async function getActiveConversation(phoneNumber: string): Promise<WhatsAppConversation | null> {
  const e164 = addPlus(phoneNumber);

  const { data, error } = await fromTable('whatsapp_conversations')
    .select('*')
    .eq('phone_number', e164)
    .in('state', ['idle', 'awaiting_confirmation', 'awaiting_product_selection', 'awaiting_edit_choice', 'awaiting_edit_input'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as any;

  // Check expiration
  if (new Date(row.expires_at) < new Date()) {
    // Expired — update state and return null
    await fromTable('whatsapp_conversations')
      .update({ state: 'expired', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return null;
  }

  return mapConversation(row);
}

export async function createConversation(
  userId: string,
  phoneNumber: string,
  waMessageId: string,
  inputText: string
): Promise<WhatsAppConversation> {
  const e164 = addPlus(phoneNumber);

  const { data, error } = await fromTable('whatsapp_conversations')
    .insert({
      user_id: userId,
      phone_number: e164,
      wa_message_id: waMessageId,
      state: 'idle',
      last_input: inputText,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) {
    // Surface table-not-found errors clearly so the fix is obvious in logs
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      throw new Error(
        `[DB] Tabel whatsapp_conversations bestaat niet — run migratie 029_whatsapp_fix.sql in Supabase. Originele fout: ${error.message}`
      );
    }
    throw new Error(error.message);
  }
  return mapConversation(data as any);
}

export async function updateConversationState(
  conversationId: string,
  state: ConversationState,
  pendingRegistration?: SprayRegistrationGroup | null,
  lastInput?: string | null
): Promise<void> {
  const updateData: Record<string, unknown> = {
    state,
    updated_at: new Date().toISOString(),
  };

  if (pendingRegistration !== undefined) {
    updateData.pending_registration = pendingRegistration;
  }

  if (lastInput !== undefined) {
    updateData.last_input = lastInput;
  }

  // Refresh expiration when awaiting user input
  if (
    state === 'awaiting_confirmation' ||
    state === 'awaiting_product_selection' ||
    state === 'awaiting_edit_choice' ||
    state === 'awaiting_edit_input'
  ) {
    updateData.expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  }

  const { error } = await fromTable('whatsapp_conversations')
    .update(updateData)
    .eq('id', conversationId);

  if (error) throw new Error(error.message);
}

// ============================================================================
// Message logging
// ============================================================================

export async function logMessage(params: {
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  messageText?: string;
  waMessageId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const e164 = addPlus(params.phoneNumber);

  const { error } = await fromTable('whatsapp_message_log')
    .insert({
      phone_number: e164,
      direction: params.direction,
      message_text: params.messageText || null,
      wa_message_id: params.waMessageId || null,
      metadata: params.metadata || {},
    });

  if (error) {
    console.error('[WhatsApp Store] Failed to log message:', error.message);
    // Non-critical — don't throw
  }
}

/**
 * Check if a WhatsApp message ID has already been processed (dedup).
 */
export async function isMessageProcessed(waMessageId: string): Promise<boolean> {
  const { data } = await fromTable('whatsapp_message_log')
    .select('id')
    .eq('wa_message_id', waMessageId)
    .eq('direction', 'inbound')
    .limit(1);

  return ((data as any[])?.length ?? 0) > 0;
}

// ============================================================================
// User-scoped data fetches (for WhatsApp pipeline, no cookie auth)
// ============================================================================

export async function getSprayableParcelsForUser(userId: string): Promise<SprayableParcel[]> {
  const admin = getAdmin();

  // Try the view first
  const { data, error } = await admin
    .from('v_sprayable_parcels')
    .select('*')
    .eq('user_id', userId)
    .order('name');

  if (error) {
    console.error('[getSprayableParcelsForUser] View error:', error.message);
  }

  if (data && data.length > 0) {
    return data.map((item: any) => ({
      id: item.id,
      name: item.name,
      parcelId: item.parcel_id || item.id,
      parcelName: item.parcel_name || item.name,
      crop: item.crop,
      variety: item.variety,
      area: item.area || 0,
      synonyms: item.synonyms || [],
    })) as SprayableParcel[];
  }

  // Fallback: direct sub_parcels query
  const { data: subData, error: subError } = await admin
    .from('sub_parcels')
    .select('*')
    .eq('user_id', userId)
    .order('crop');

  if (subError || !subData) return [];

  return subData.map((item: any) => ({
    id: item.id,
    name: item.name || `${item.crop} ${item.variety || ''}`.trim(),
    parcelId: item.parcel_id || item.id,
    parcelName: item.name || '',
    crop: item.crop,
    variety: item.variety,
    area: item.area || 0,
    synonyms: item.synonyms || [],
  })) as SprayableParcel[];
}

export async function getParcelHistoryForUser(userId: string): Promise<ParcelHistoryEntry[]> {
  const admin = getAdmin();

  const { data, error } = await admin
    .from('parcel_history')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error || !data) return [];

  return data.map((item: any) => ({
    id: item.id,
    userId: item.user_id,
    spuitschriftId: item.spuitschrift_id,
    parcelId: item.parcel_id,
    parcelName: item.parcel_name,
    crop: item.crop,
    variety: item.variety,
    product: item.product,
    dosage: item.dosage,
    unit: item.unit,
    date: new Date(item.date),
    registrationType: item.registration_type,
    productSource: item.product_source,
  })) as unknown as ParcelHistoryEntry[];
}

export async function getParcelGroupsForUser(
  userId: string
): Promise<Array<{ id: string; name: string; subParcelIds: string[] }>> {
  const admin = getAdmin();

  const { data, error } = await admin
    .from('parcel_groups')
    .select('id, name, parcel_group_members(sub_parcel_id)')
    .eq('user_id', userId);

  if (error) return [];

  return (data || []).map((g: any) => ({
    id: g.id,
    name: g.name,
    subParcelIds: (g.parcel_group_members || []).map((m: any) => m.sub_parcel_id),
  }));
}

// ============================================================================
// Helpers
// ============================================================================

function mapConversation(row: any): WhatsAppConversation {
  return {
    id: row.id,
    userId: row.user_id,
    phoneNumber: row.phone_number,
    waMessageId: row.wa_message_id,
    state: row.state,
    pendingRegistration: row.pending_registration || null,
    lastInput: row.last_input,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
