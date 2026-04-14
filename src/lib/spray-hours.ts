/**
 * Automatische spuituren berekening.
 * Na elke bespuiting (spuitschrift) worden per perceel task_logs aangemaakt
 * op basis van vuistregel: X minuten per hectare (standaard 30 min/ha).
 *
 * Uren worden per perceel bijgehouden zodat je in de analyse kan zien
 * hoeveel spuituren elk perceel kost.
 */

import type { ProductEntry, SprayableParcel } from '@/lib/types';

const DEFAULT_SPRAY_MINUTES_PER_HA = 30;

interface CreateSprayTaskLogsParams {
  userId: string;
  plotIds: string[];
  date: Date;
  products: ProductEntry[];
  sprayableParcels: SprayableParcel[];
}

/**
 * Haal de gebruikersinstelling "minuten per hectare spuiten" op.
 * Zoekt in user_settings tabel; als die niet bestaat, gebruik default.
 */
async function getSprayMinutesPerHa(userId: string, supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'spray_minutes_per_ha')
      .maybeSingle();

    if (data?.value) {
      const parsed = parseFloat(data.value);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Table might not exist yet — use default
  }
  return DEFAULT_SPRAY_MINUTES_PER_HA;
}

/**
 * Vind het "Spuiten" task type voor deze user.
 */
async function getSpuitenTaskTypeId(userId: string, supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('task_types')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', 'spuiten')
    .limit(1)
    .maybeSingle();

  return data?.id || null;
}

/**
 * Maak per perceel een task_log "Spuiten" aan na een bespuiting.
 * Uren = hectares × minuten_per_ha / 60
 */
export async function createSprayTaskLogs(params: CreateSprayTaskLogsParams): Promise<void> {
  const { userId, plotIds, date, products, sprayableParcels } = params;

  // We need the supabase client — import dynamically to support both server and client contexts
  const { getSupabaseAdmin } = await import('@/lib/supabase-client');
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[spray-hours] No admin client available');
    return;
  }

  // 1. Find "Spuiten" task type
  const taskTypeId = await getSpuitenTaskTypeId(userId, supabase);
  if (!taskTypeId) {
    console.warn('[spray-hours] No "Spuiten" task type found for user', userId);
    return;
  }

  // 2. Get minutes per hectare setting
  const minutesPerHa = await getSprayMinutesPerHa(userId, supabase);

  // 3. Build parcel area map
  const parcelMap = new Map<string, { area: number; name: string }>();
  for (const p of sprayableParcels) {
    if (plotIds.includes(p.id)) {
      parcelMap.set(p.id, { area: p.area || 0, name: p.name });
    }
  }

  // 4. If we don't have parcel data, fetch it
  if (parcelMap.size === 0 && plotIds.length > 0) {
    const { data: parcels } = await supabase
      .from('v_sprayable_parcels')
      .select('id, name, area')
      .in('id', plotIds);

    for (const p of (parcels || [])) {
      parcelMap.set(p.id, { area: p.area || 0, name: p.name });
    }
  }

  if (parcelMap.size === 0) {
    console.warn('[spray-hours] No parcel data found for plots:', plotIds);
    return;
  }

  // 5. Format date
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : String(date).split('T')[0];

  // 6. Build product summary for notes
  const productSummary = products
    .map(p => `${p.product}${p.dosage ? ` ${p.dosage} ${p.unit || 'L'}/ha` : ''}`)
    .join(', ');

  // 7. Create task_logs per parcel
  const taskLogs = [];
  for (const plotId of plotIds) {
    const parcel = parcelMap.get(plotId);
    if (!parcel) continue;

    const hoursPerPerson = Math.round((parcel.area * minutesPerHa / 60) * 2) / 2; // round to 0.5h
    if (hoursPerPerson <= 0) continue;

    taskLogs.push({
      user_id: userId,
      start_date: dateStr,
      end_date: dateStr,
      days: 1,
      sub_parcel_id: plotId,
      task_type_id: taskTypeId,
      people_count: 1,
      hours_per_person: Math.max(0.5, hoursPerPerson), // minimum 0.5h
      notes: `Bespuiting: ${productSummary} (${parcel.area.toFixed(2)} ha × ${minutesPerHa} min/ha)`,
    });
  }

  if (taskLogs.length === 0) {
    console.log('[spray-hours] No task logs to create (all parcels 0 ha)');
    return;
  }

  // 8. Batch insert
  const { error } = await supabase
    .from('task_logs')
    .insert(taskLogs);

  if (error) {
    console.error('[spray-hours] Failed to insert task logs:', error.message);
    throw error;
  }

  const totalHours = taskLogs.reduce((sum, t) => sum + t.hours_per_person, 0);
  console.log(`[spray-hours] Created ${taskLogs.length} task logs for ${plotIds.length} parcels (${totalHours.toFixed(1)}u total, ${minutesPerHa} min/ha)`);
}
