/**
 * WhatsApp Field Note Processor.
 * Handles field note (veldnotitie) messages via WhatsApp.
 * Saves notes directly to the field_notes table using the admin client.
 * Triggers async AI classification for better tagging + parcel matching.
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { sendTextMessage } from './client';
import { logMessage } from './store';
import { stripPlus } from './phone-utils';

// ============================================================================
// Field note intent detection (simple keyword-based, no AI needed)
// ============================================================================

// Explicit prefixes that clearly indicate a field note
const FIELD_NOTE_PREFIXES = [
  'notitie:', 'noteer:', 'onthoud:', 'memo:', 'note:', 'notitie ',
  'veldnotitie:', 'noteer ', 'onthoud ',
];

// Observation keywords (without spray/fertilizer context → field note)
const OBSERVATION_KEYWORDS = [
  'gezien', 'opgemerkt', 'gevonden', 'waarneming', 'let op',
  'bladluis', 'spint', 'meeldauw', 'brand', 'hagelschade', 'vorstschade',
  'schade', 'aantasting', 'plaag', 'ziek', 'ziekte',
  'bloei', 'knop', 'groei', 'oogst', 'rijp',
  'haag', 'snoei', 'dun', 'dunning',
];

// Words that indicate it's NOT a field note (it's a spray/fertilizer)
const SPRAY_KEYWORDS = [
  'gespoten', 'spuiten', 'bespoten', 'behandeld',
  'gestrooid', 'bemest', 'bemesting', 'uitgereden',
  'liter', 'l/ha', 'kg/ha', 'ml/ha',
];

/**
 * Detect if this message is a field note.
 * Returns true if the message should be saved as a field note.
 */
export function isFieldNoteIntent(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Explicit prefix → definitely a field note
  if (FIELD_NOTE_PREFIXES.some(prefix => lower.startsWith(prefix))) {
    return true;
  }

  // Contains spray keywords → NOT a field note
  if (SPRAY_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return false;
  }

  // Contains dosage pattern → NOT a field note
  if (/\d+[,.]?\d*\s*(l|kg|ml|g)(\/ha)?/i.test(lower)) {
    return false;
  }

  // Contains observation keywords without spray context → field note
  if (OBSERVATION_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return true;
  }

  return false;
}

/**
 * Strip field note prefixes from text before saving.
 */
function cleanNoteContent(text: string): string {
  const lower = text.toLowerCase().trim();
  for (const prefix of FIELD_NOTE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return text.substring(prefix.length).trim();
    }
  }
  return text.trim();
}

/**
 * Determine auto_tag based on note content (fast regex fallback).
 * AI classification will improve this later.
 */
function detectAutoTag(text: string): 'bespuiting' | 'bemesting' | 'taak' | 'waarneming' | 'overig' {
  const lower = text.toLowerCase();

  if (/bladluis|spint|meeldauw|aantasting|plaag|ziek|schade|schurft/.test(lower)) {
    return 'waarneming';
  }
  if (/snoei|snoeien|dun|dunnen|maaien|onderhoud|repareer/.test(lower)) {
    return 'taak';
  }
  if (/bemest|bemesting|mest|kunstmest/.test(lower)) {
    return 'bemesting';
  }
  if (/gespoten|spuiten|middel/.test(lower)) {
    return 'bespuiting';
  }

  return 'overig';
}

// ============================================================================
// Field note processor
// ============================================================================

interface FieldNoteOptions {
  isPhoto?: boolean;
}

/**
 * Save a field note from WhatsApp to the field_notes table.
 * Optionally handles photo messages (saves caption, no photo upload yet).
 */
export async function processFieldNote(
  userId: string,
  phoneNumber: string,
  inputText: string,
  waMessageId: string,
  options?: FieldNoteOptions
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);
  const isPhoto = options?.isPhoto ?? false;

  try {
    // Log inbound
    await logMessage({
      phoneNumber,
      direction: 'inbound',
      messageText: isPhoto ? `[foto] ${inputText}` : inputText,
      waMessageId,
    });

    const content = cleanNoteContent(inputText);
    const autoTag = detectAutoTag(content);

    // Save to field_notes using admin client (bypasses RLS)
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Admin client niet beschikbaar');

    const { data: inserted, error } = await (admin as any)
      .from('field_notes')
      .insert({
        user_id: userId,
        content,
        source: isPhoto ? 'whatsapp' : 'whatsapp',
        status: 'open',
        auto_tag: autoTag,
        is_pinned: false,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);

    // Send confirmation
    const tagEmoji: Record<string, string> = {
      waarneming: '👁️',
      taak: '✅',
      bemesting: '🌱',
      bespuiting: '🌿',
      overig: '📝',
    };

    const emoji = isPhoto ? '📸' : (tagEmoji[autoTag] || '📝');
    const photoNote = isPhoto ? '\n\n📎 _Foto-bijlage wordt binnenkort ondersteund._' : '';

    const msg = [
      `${emoji} *Veldnotitie opgeslagen*`,
      '',
      `💬 ${content}`,
      '',
      `🏷️ _${autoTag}_`,
      photoNote,
      '✅ Zichtbaar in je Veldnotities.',
    ].filter(Boolean).join('\n');

    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });

    // Fire-and-forget: AI classification for better tagging + parcel matching
    if (inserted?.id) {
      classifyFieldNoteAsync(inserted.id, content, userId).catch(err => {
        console.error('[processFieldNote] AI classification failed (non-fatal):', err);
      });
    }

  } catch (error) {
    console.error('[processFieldNote] Error:', error);

    try {
      const errMsg = '❗ Sorry, ik kon je notitie niet opslaan. Probeer het opnieuw.';
      await sendTextMessage(metaPhone, errMsg);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: errMsg });
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// Async AI classification (fire-and-forget)
// ============================================================================

/**
 * Run AI classification on a saved field note to improve the auto_tag,
 * match parcel_ids, and fill observation metadata. Non-blocking.
 */
async function classifyFieldNoteAsync(
  noteId: string,
  content: string,
  userId: string
): Promise<void> {
  try {
    const { getOrLoadContext } = await import('@/lib/registration-pipeline');
    const { classifyFieldNote } = await import('@/ai/flows/classify-field-note');

    const ctx = await getOrLoadContext(userId);

    // Build parcel context for classification
    const parcels = ctx.parcels.map(p => ({
      id: p.id,
      name: p.name,
      parcel_name: p.parcelName || p.name,
      crop: p.crop || 'Onbekend',
      variety: p.variety || null,
      synonyms: p.synonyms || [],
    }));

    const groups = ctx.parcelGroups.map(g => ({
      id: g.id,
      name: g.name,
      sub_parcel_ids: g.subParcelIds,
    }));

    const result = await classifyFieldNote(content, parcels, groups);

    // Update the note with AI classification
    const admin = getSupabaseAdmin();
    if (!admin) return;

    const updateData: Record<string, unknown> = {};
    if (result.tag) updateData.auto_tag = result.tag;
    if (result.parcel_ids.length > 0) updateData.parcel_ids = result.parcel_ids;
    if (result.observation_subject) updateData.observation_subject = result.observation_subject;
    if (result.observation_category) updateData.observation_category = result.observation_category;

    if (Object.keys(updateData).length > 0) {
      await (admin as any)
        .from('field_notes')
        .update(updateData)
        .eq('id', noteId);

      console.log(`[classifyFieldNoteAsync] Updated note ${noteId}: tag=${result.tag}, parcels=${result.parcel_ids.length}`);
    }
  } catch (err) {
    // Non-fatal — the note is already saved with regex tag
    console.error('[classifyFieldNoteAsync] Failed:', err);
  }
}
