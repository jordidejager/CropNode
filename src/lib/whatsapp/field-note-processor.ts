/**
 * WhatsApp Field Note Processor.
 * Handles field note (veldnotitie) messages via WhatsApp.
 * Saves notes directly to the field_notes table using the admin client.
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
 * Determine auto_tag based on note content.
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

/**
 * Save a field note from WhatsApp to the field_notes table.
 */
export async function processFieldNote(
  userId: string,
  phoneNumber: string,
  inputText: string,
  waMessageId: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);

  try {
    // Log inbound
    await logMessage({
      phoneNumber,
      direction: 'inbound',
      messageText: inputText,
      waMessageId,
    });

    const content = cleanNoteContent(inputText);
    const autoTag = detectAutoTag(content);

    // Save to field_notes using admin client (bypasses RLS)
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Admin client niet beschikbaar');

    const { error } = await admin
      .from('field_notes')
      .insert({
        user_id: userId,
        content,
        status: 'open',
        auto_tag: autoTag,
        is_pinned: false,
      });

    if (error) throw new Error(error.message);

    // Send confirmation
    const tagEmoji: Record<string, string> = {
      waarneming: '👁️',
      taak: '✅',
      bemesting: '🌱',
      bespuiting: '🌿',
      overig: '📝',
    };

    const msg = [
      `${tagEmoji[autoTag] || '📝'} *Veldnotitie opgeslagen*`,
      '',
      `💬 ${content}`,
      '',
      `🏷️ _${autoTag}_`,
      '',
      '✅ Zichtbaar in je Veldnotities.',
    ].join('\n');

    await sendTextMessage(metaPhone, msg);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: msg });

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
