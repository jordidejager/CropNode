/**
 * WhatsApp Hours Registration Handler
 * Processes parsed hours entries from parse-hours-registration.ts
 * and saves them as task_logs or manages timer sessions.
 */

import { sendTextMessage } from './client';
import { logMessage } from './store';
import { stripPlus } from './phone-utils';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { parseHoursRegistration, isLikelyHoursRegistration } from '@/ai/flows/parse-hours-registration';
import type { HoursEntry, ParseHoursOutput } from '@/ai/flows/parse-hours-registration';

export { isLikelyHoursRegistration };

/**
 * Process a WhatsApp message as an hours registration.
 * Called from message-handler when isLikelyHoursRegistration returns true.
 */
export async function handleHoursRegistration(
  userId: string,
  phoneNumber: string,
  messageText: string,
  waMessageId: string
): Promise<void> {
  const metaPhone = stripPlus(phoneNumber);
  const admin = getSupabaseAdmin();
  if (!admin) {
    await sendTextMessage(metaPhone, '❌ Er ging iets mis. Probeer het later opnieuw.');
    return;
  }

  try {
    // Log inbound message
    await logMessage({
      phoneNumber,
      direction: 'inbound',
      messageText,
      waMessageId,
    });

    // Get user's parcels for name matching
    const { data: parcels } = await (admin as any)
      .from('v_sprayable_parcels')
      .select('id, name')
      .eq('user_id', userId);

    const parcelNames = parcels?.map((p: { id: string; name: string }) => p.name) || [];

    // Get user's task types
    const { data: taskTypes } = await (admin as any)
      .from('task_types')
      .select('id, name')
      .eq('user_id', userId)
      .order('name');

    // Parse the message
    const taskTypeNames = taskTypes?.map((t: { name: string }) => t.name).join(', ') || '';
    const result: ParseHoursOutput = await parseHoursRegistration({
      userInput: messageText,
      availableParcels: JSON.stringify(parcels?.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) || []),
      availableTaskTypes: taskTypeNames,
    });

    if (!result.isHoursRegistration || result.entries.length === 0) {
      // Not recognized as hours registration despite pre-filter
      await sendTextMessage(metaPhone, '🤔 Ik kon geen urenregistratie herkennen. Probeer bijv. "4 uur gesnoeid met 3 man".');
      await logMessage({ phoneNumber, direction: 'outbound', messageText: 'Niet herkend als urenregistratie' });
      return;
    }

    // Handle timer commands
    if (result.isTimerCommand) {
      await handleTimerCommand(userId, metaPhone, phoneNumber, result, taskTypes || []);
      return;
    }

    // Process each entry
    const confirmations: string[] = [];

    for (const entry of result.entries) {
      const taskType = matchTaskType(entry.activity, taskTypes || []);
      if (!taskType) {
        confirmations.push(`⚠️ Taaktype "${entry.activity}" niet gevonden, overgeslagen`);
        continue;
      }

      // Match parcel names to IDs
      const subParcelId = matchParcel(entry.parcelNames, parcels || []);

      // Calculate date
      const date = entry.date || new Date().toISOString().split('T')[0];

      // Insert task log
      const { error } = await (admin as any)
        .from('task_logs')
        .insert({
          user_id: userId,
          start_date: date,
          end_date: date,
          days: 1,
          sub_parcel_id: subParcelId,
          task_type_id: taskType.id,
          people_count: entry.peopleCount,
          hours_per_person: entry.hours,
          notes: entry.notes || null,
        });

      if (error) {
        console.error('[Hours Handler] Insert error:', error.message);
        confirmations.push(`❌ Fout bij opslaan: ${entry.activity}`);
        continue;
      }

      const parcelStr = subParcelId
        ? ` op ${parcels?.find((p: { id: string }) => p.id === subParcelId)?.name || 'perceel'}`
        : '';
      const peopleStr = entry.peopleCount > 1 ? ` met ${entry.peopleCount} personen` : '';
      const totalHours = entry.hours * entry.peopleCount;

      confirmations.push(
        `✅ ${entry.hours}u ${entry.activity.toLowerCase()}${peopleStr}${parcelStr} (${totalHours}u totaal)`
      );
    }

    const reply = confirmations.join('\n');
    await sendTextMessage(metaPhone, reply);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: reply });

  } catch (error) {
    console.error('[Hours Handler] Error:', error);
    await sendTextMessage(metaPhone, '❌ Er ging iets mis bij het verwerken van je uren. Probeer het opnieuw.');
    await logMessage({ phoneNumber, direction: 'outbound', messageText: 'Fout bij urenverwerking' });
  }
}

/**
 * Handle timer start/stop commands
 */
async function handleTimerCommand(
  userId: string,
  metaPhone: string,
  phoneNumber: string,
  result: ParseHoursOutput,
  taskTypes: Array<{ id: string; name: string }>
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  if (result.timerAction === 'start' && result.timerTaskType) {
    const taskType = matchTaskType(result.timerTaskType, taskTypes);
    if (!taskType) {
      const reply = `⚠️ Taaktype "${result.timerTaskType}" niet gevonden. Beschikbaar: ${taskTypes.map(t => t.name).join(', ')}`;
      await sendTextMessage(metaPhone, reply);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: reply });
      return;
    }

    const { error } = await (admin as any)
      .from('active_task_sessions')
      .insert({
        user_id: userId,
        task_type_id: taskType.id,
        start_time: new Date().toISOString(),
        people_count: 1,
      });

    if (error) {
      console.error('[Hours Handler] Start timer error:', error.message);
      const reply = '❌ Kon timer niet starten. Probeer het opnieuw.';
      await sendTextMessage(metaPhone, reply);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: reply });
      return;
    }

    const reply = `⏱️ Timer gestart: ${taskType.name}`;
    await sendTextMessage(metaPhone, reply);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: reply });
    return;
  }

  if (result.timerAction === 'stop') {
    // Find active session for this user
    const { data: sessions } = await (admin as any)
      .from('v_active_task_sessions_enriched')
      .select('id, task_type_id, task_type_name, start_time, people_count')
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .limit(1);

    if (!sessions || sessions.length === 0) {
      const reply = '⚠️ Geen actieve timer gevonden om te stoppen.';
      await sendTextMessage(metaPhone, reply);
      await logMessage({ phoneNumber, direction: 'outbound', messageText: reply });
      return;
    }

    const session = sessions[0];
    const startTime = new Date(session.start_time);
    const now = new Date();
    const diffHours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);

    // Deduct lunch if > 5 hours
    let hoursPerPerson = Math.round(diffHours * 2) / 2; // Round to 0.5
    if (hoursPerPerson > 5) hoursPerPerson -= 1;
    hoursPerPerson = Math.max(0.5, hoursPerPerson);

    // Create task log from session
    const date = startTime.toISOString().split('T')[0];
    const { error: insertError } = await (admin as any)
      .from('task_logs')
      .insert({
        user_id: userId,
        start_date: date,
        end_date: date,
        days: 1,
        task_type_id: session.task_type_id,
        people_count: session.people_count,
        hours_per_person: hoursPerPerson,
      });

    if (insertError) {
      console.error('[Hours Handler] Stop timer insert error:', insertError.message);
    }

    // Delete active session
    await (admin as any)
      .from('active_task_sessions')
      .delete()
      .eq('id', session.id);

    const totalHours = hoursPerPerson * session.people_count;
    const reply = `⏹️ Timer gestopt: ${session.task_type_name}\n${hoursPerPerson}u × ${session.people_count} personen = ${totalHours}u totaal`;
    await sendTextMessage(metaPhone, reply);
    await logMessage({ phoneNumber, direction: 'outbound', messageText: reply });
  }
}

/**
 * Match activity name to task type (fuzzy)
 */
function matchTaskType(
  activity: string,
  taskTypes: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  const lower = activity.toLowerCase();

  // Exact match
  const exact = taskTypes.find(t => t.name.toLowerCase() === lower);
  if (exact) return exact;

  // Partial match
  const partial = taskTypes.find(t =>
    t.name.toLowerCase().includes(lower) || lower.includes(t.name.toLowerCase())
  );
  if (partial) return partial;

  return null;
}

/**
 * Match parcel names to sub_parcel_id
 */
function matchParcel(
  parcelNames: string[],
  parcels: Array<{ id: string; name: string }>
): string | null {
  if (!parcelNames.length || !parcels.length) return null;

  for (const name of parcelNames) {
    const lower = name.toLowerCase();

    // Exact match
    const exact = parcels.find(p => p.name.toLowerCase() === lower);
    if (exact) return exact.id;

    // Partial match
    const partial = parcels.find(p =>
      p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
    );
    if (partial) return partial.id;
  }

  return null;
}
