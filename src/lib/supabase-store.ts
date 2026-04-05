// Use server-compatible supabase client (no 'use client' directive)
// supabaseAdmin bypasses RLS for server-side operations
import { supabase, getSupabaseAdmin } from './supabase-client';
import { withRetry } from './retry-utils';
// Cache invalidation - lazy import to avoid pulling server-only code into client bundle
async function invalidateParcelCacheSafe() {
  try {
    const { revalidateTag } = await import('next/cache');
    revalidateTag('parcels');
  } catch {
    // Silently skip in client context
  }
}
import type {
  LogbookEntry,
  Parcel,
  ParcelHistoryEntry,
  UserPreference,
  InventoryMovement,
  CtgbProduct,
  CtgbSyncStats,
  SpuitschriftEntry,
  FertilizerProduct,
  CtgbGebruiksvoorschrift,
  SubParcel,
  SoilSample,
  ProductionHistory,
  FieldSignal,
  FieldSignalReaction,
  ActiveTaskSession,
  ProductEntry,
  StorageComplex,
  StorageCell,
  StorageCellSummary,
  StoragePosition,
  StoragePositionInput,
  BlockedPosition,
  StorageCellStatus,
  DoorPosition,
  EvaporatorPosition,
  ComplexPosition,
  PositionHeightOverrides,
  CellSubParcel,
  CellSubParcelInput,
  PositionContent,
  PositionContentInput,
  PositionStack,
  PickNumber,
  QualityClass,
  HarvestRegistration,
  HarvestRegistrationInput,
  HarvestStorageStatus,
} from './types';

// ============================================
// Auth Helper - Get current user ID
// ============================================

let cachedUserId: string | null = null;

export async function getCurrentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    cachedUserId = user?.id || null;
    return cachedUserId;
  } catch {
    return null;
  }
}

// Clear cache on auth state change (only in browser)
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      cachedUserId = null;
    } else if (event === 'SIGNED_IN') {
      cachedUserId = null; // Will be refreshed on next call
    }
  });
}

// ============================================
// Helper functions for snake_case <-> camelCase conversion
// ============================================

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function recursiveToCamelCase(item: unknown): any {
  // console.log('Transforming item:', JSON.stringify(item, null, 2));
  if (Array.isArray(item)) {
    return item.map((el) => recursiveToCamelCase(el));
  } else if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(item as Record<string, any>)) {
      result[toCamelCase(key)] = recursiveToCamelCase(value);
    }
    return result;
  }
  return item;
}

function objectToSnakeCase<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      result[snakeKey] = obj[key];
    }
  }
  return result;
}

// Legacy helper wrappers to maintain signatures if needed, 
// strictly speaking recursiveToCamelCase replaces objectToCamelCase and arrayToCamelCase
function objectToCamelCase<T>(obj: Record<string, any>): T {
  return recursiveToCamelCase(obj) as T;
}

function arrayToCamelCase<T>(arr: Record<string, any>[]): T[] {
  return arr.map(item => objectToCamelCase<T>(item));
}

// ============================================
// Spuitschrift Functions
// ============================================

export async function getSpuitschriftEntry(id: string, userId?: string | null): Promise<SpuitschriftEntry | null> {
  // Use admin client to bypass RLS (server actions don't have cookie access)
  const adminClient = getSupabaseAdmin();
  const client = adminClient || supabase;

  let query = client
    .from('spuitschrift')
    .select('id, user_id, original_logbook_id, original_raw_input, date, created_at, plots, products, registration_type, validation_message, status, harvest_year, registration_source')
    .eq('id', id);

  // When using admin client, also filter by user_id for multi-user safety
  if (adminClient && userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    if (error) console.warn('[getSpuitschriftEntry] Query failed:', error.message);
    return null;
  }

  return {
    ...objectToCamelCase<SpuitschriftEntry>(data),
    date: new Date(data.date),
    createdAt: new Date(data.created_at),
  };
}

export async function getSpuitschriftEntries(options?: { limit?: number; harvestYear?: number }): Promise<SpuitschriftEntry[]> {
  // Use retry for network resilience
  return withRetry(async () => {
    const userId = await getCurrentUserId();
    let query = supabase
      .from('spuitschrift')
      .select('id, user_id, original_logbook_id, original_raw_input, date, created_at, plots, products, registration_type, validation_message, status, harvest_year, registration_source');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (options?.harvestYear) {
      query = query.eq('harvest_year', options.harvestYear);
    }

    const { data, error } = await query
      .order('date', { ascending: false })
      .limit(options?.limit ?? 500);

    if (error) {
      console.error("Supabase Error (getSpuitschriftEntries):", error.message || error);
      throw new Error(error.message);
    }
    console.log(`Supabase (getSpuitschriftEntries): Found ${data?.length || 0} items.`);

    if (!data) return [];

    return data.map(item => ({
      ...objectToCamelCase<SpuitschriftEntry>(item),
      date: new Date(item.date),
      createdAt: new Date(item.created_at),
    }));
  });
}

export async function addSpuitschriftEntry(
  entry: Omit<SpuitschriftEntry, 'id' | 'spuitschriftId'>,
  providedUserId?: string | null
): Promise<SpuitschriftEntry> {
  const id = crypto.randomUUID();
  // Use provided userId (from server action) or fall back to getCurrentUserId
  const userId = providedUserId ?? await getCurrentUserId();

  if (!userId) {
    throw new Error('Geen gebruiker ingelogd. Log opnieuw in en probeer het opnieuw.');
  }

  // Safely parse dates with fallback to current date
  const parseDate = (d: any): string => {
    if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
    if (typeof d === 'string' && d) {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  };

  const snakeCaseEntry: Record<string, any> = {
    id,
    user_id: userId,
    original_logbook_id: entry.originalLogbookId,
    original_raw_input: entry.originalRawInput,
    date: parseDate(entry.date),
    created_at: parseDate(entry.createdAt),
    plots: entry.plots,
    products: entry.products,
    registration_type: entry.registrationType || 'spraying',
    validation_message: entry.validationMessage,
    status: entry.status,
    harvest_year: (function() {
      const d = entry.date instanceof Date ? entry.date : (entry.date ? new Date(entry.date) : new Date());
      const month = d.getMonth() + 1;
      return month >= 11 ? d.getFullYear() + 1 : d.getFullYear();
    })(),
    // registration_source: 'web' (default) or 'whatsapp' — only set if present
    ...((entry as any).registrationSource && { registration_source: (entry as any).registrationSource }),
  };

  // Use supabaseAdmin to bypass RLS (server actions don't have cookie access)
  // The userId is validated above, so we're safe to bypass RLS
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    throw new Error('Database configuratie fout: SUPABASE_SERVICE_ROLE_KEY is niet ingesteld.');
  }

  return withRetry(async () => {
    let insertData = snakeCaseEntry;

    const { data, error } = await adminClient
      .from('spuitschrift')
      .insert(insertData as any)
      .select()
      .single() as { data: { id: string } | null; error: Error | null };

    // If registration_type column doesn't exist, retry without it
    if (error && error.message?.includes('registration_type')) {
      console.warn('[saveToSpuitschrift] registration_type column not found, retrying without it');
      const { registration_type, ...entryWithoutType } = insertData;
      const { data: retryData, error: retryError } = await adminClient
        .from('spuitschrift')
        .insert(entryWithoutType as any)
        .select()
        .single() as { data: { id: string } | null; error: Error | null };
      if (retryError) throw new Error(retryError.message);
      if (!retryData) throw new Error('Geen data ontvangen van database');
      return { id: retryData.id, ...entry } as SpuitschriftEntry;
    }

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Geen data ontvangen van database');

    return {
      id: data.id,
      ...entry,
    } as SpuitschriftEntry;
  });
}

export async function deleteSpuitschriftEntry(entryId: string, userId?: string | null): Promise<void> {
  // Use admin client to bypass RLS (server actions don't have cookie access)
  const adminClient = getSupabaseAdmin();
  const client = adminClient || supabase;

  // Delete related parcel history
  await client
    .from('parcel_history')
    .delete()
    .eq('spuitschrift_id', entryId);

  // Delete related inventory movements
  await client
    .from('inventory_movements')
    .delete()
    .eq('reference_id', entryId);

  // Delete the entry itself — filter by user_id for multi-user safety
  let query = client
    .from('spuitschrift')
    .delete()
    .eq('id', entryId);

  if (adminClient && userId) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;

  if (error) throw new Error(error.message);
}

/**
 * Update an existing spuitschrift entry
 * Also handles cascade updates to parcel_history and inventory_movements
 */
export async function updateSpuitschriftEntry(
  entryId: string,
  updates: {
    date?: Date;
    plots?: string[];
    products?: ProductEntry[];
    validationMessage?: string | null;
    status?: 'Akkoord' | 'Waarschuwing';
  },
  providedUserId?: string | null
): Promise<SpuitschriftEntry> {
  const userId = providedUserId ?? await getCurrentUserId();
  if (!userId) {
    throw new Error('Geen gebruiker ingelogd. Log opnieuw in en probeer het opnieuw.');
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {};
  if (updates.date !== undefined) {
    updatePayload.date = updates.date instanceof Date ? updates.date.toISOString() : updates.date;
  }
  if (updates.plots !== undefined) {
    updatePayload.plots = updates.plots;
  }
  if (updates.products !== undefined) {
    updatePayload.products = updates.products;
  }
  if (updates.validationMessage !== undefined) {
    updatePayload.validation_message = updates.validationMessage;
  }
  if (updates.status !== undefined) {
    updatePayload.status = updates.status;
  }

  // Use supabaseAdmin to bypass RLS (server actions don't have cookie access)
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    throw new Error('Database configuratie fout: SUPABASE_SERVICE_ROLE_KEY is niet ingesteld.');
  }

  return withRetry(async () => {
    // Update the spuitschrift entry
    const { data, error } = await adminClient
      .from('spuitschrift')
      .update(updatePayload as any)
      .eq('id', entryId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Geen data ontvangen van database');

    // If plots or products changed, we need to update parcel_history and inventory_movements
    if (updates.plots !== undefined || updates.products !== undefined) {
      // Delete old parcel_history and inventory_movements
      await adminClient
        .from('parcel_history')
        .delete()
        .eq('spuitschrift_id', entryId);

      await adminClient
        .from('inventory_movements')
        .delete()
        .eq('reference_id', entryId);

      // Re-create parcel_history and inventory_movements with new data
      const finalPlots = updates.plots ?? data.plots;
      const finalProducts = updates.products ?? data.products;
      const finalDate = updates.date ?? new Date(data.date);

      // Fetch sprayable parcels for the new plots
      const sprayableParcels = await getSprayableParcelsById(finalPlots);
      const sprayableParcelMap = new Map(sprayableParcels.map(p => [p.id, p]));

      const historyEntries: any[] = [];
      const inventoryEntries: any[] = [];
      const productUsage: Record<string, { totalAmount: number; unit: string; parcelIds: Set<string> }> = {};

      for (const subParcelId of finalPlots) {
        const sprayableParcel = sprayableParcelMap.get(subParcelId);
        if (!sprayableParcel) continue;

        for (const productEntry of finalProducts) {
          historyEntries.push({
            id: crypto.randomUUID(),
            user_id: userId,
            log_id: data.original_logbook_id || entryId,
            spuitschrift_id: entryId,
            parcel_id: sprayableParcel.id,
            parcel_name: sprayableParcel.name,
            crop: sprayableParcel.crop,
            variety: sprayableParcel.variety,
            product: productEntry.product,
            dosage: productEntry.dosage,
            unit: productEntry.unit,
            date: finalDate instanceof Date ? finalDate.toISOString() : finalDate,
          });

          if (!productUsage[productEntry.product]) {
            productUsage[productEntry.product] = { totalAmount: 0, unit: productEntry.unit, parcelIds: new Set() };
          }
          if (sprayableParcel.area) {
            productUsage[productEntry.product].totalAmount += productEntry.dosage * sprayableParcel.area;
          }
          productUsage[productEntry.product].parcelIds.add(subParcelId);
        }
      }

      // Create inventory movements
      for (const [productName, usage] of Object.entries(productUsage)) {
        if (usage.totalAmount > 0) {
          inventoryEntries.push({
            id: crypto.randomUUID(),
            user_id: userId,
            product_name: productName,
            quantity: -usage.totalAmount,
            unit: usage.unit,
            type: 'usage',
            date: finalDate instanceof Date ? finalDate.toISOString() : finalDate,
            description: `Gebruikt op ${usage.parcelIds.size} perce${usage.parcelIds.size > 1 ? 'len' : 'el'}`,
            reference_id: entryId,
          });
        }
      }

      // Insert new records
      if (historyEntries.length > 0) {
        const { error: historyError } = await adminClient.from('parcel_history').insert(historyEntries);
        if (historyError) console.error('Error inserting parcel history:', historyError);
      }

      if (inventoryEntries.length > 0) {
        const { error: invError } = await adminClient.from('inventory_movements').insert(inventoryEntries);
        if (invError) console.error('Error inserting inventory movements:', invError);
      }
    }

    return {
      id: data.id,
      spuitschriftId: data.spuitschrift_id,
      originalLogbookId: data.original_logbook_id,
      originalRawInput: data.original_raw_input,
      date: new Date(data.date),
      createdAt: new Date(data.created_at),
      plots: data.plots,
      products: data.products,
      validationMessage: data.validation_message,
      status: data.status,
    } as SpuitschriftEntry;
  });
}

// ============================================
// Inventory Movement Functions
// ============================================

export async function getInventoryMovements(): Promise<InventoryMovement[]> {
  return withRetry(async () => {
    const userId = await getCurrentUserId();
    let query = supabase
      .from('inventory_movements')
      .select('id, product_name, quantity, unit, type, date, description, reference_id, user_id, created_at');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      // Throw to trigger retry for network errors
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        throw new Error(error.message);
      }
      console.error("Supabase Error (getInventoryMovements):", error);
      return [];
    }

    console.log(`Supabase (getInventoryMovements): Found ${data?.length || 0} items.`);
    if (!data) return [];

    return data.map(item => ({
      ...recursiveToCamelCase(item) as any,
      date: new Date(item.date),
    })) as InventoryMovement[];
  });
}

export async function addInventoryMovement(movement: Omit<InventoryMovement, 'id'>): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('inventory_movements')
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      product_name: movement.productName,
      quantity: movement.quantity,
      unit: movement.unit,
      type: movement.type,
      date: new Date(movement.date).toISOString(),
      description: movement.description,
      reference_id: movement.referenceId,
    });

  if (error) throw new Error(error.message);
}

// ============================================
// User Preference Functions
// ============================================

export async function getUserPreferences(): Promise<UserPreference[]> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('id, alias, preferred');

  if (error || !data) return [];

  return data.map(item => ({
    id: item.id,
    alias: item.alias,
    preferred: item.preferred,
  }));
}

export async function setUserPreference(preference: Omit<UserPreference, 'id'>): Promise<void> {
  const docId = preference.alias.replace(/\s+/g, '-').toLowerCase();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('user_preferences')
    .upsert({
      id: docId,
      user_id: userId,
      alias: preference.alias,
      preferred: preference.preferred,
    });

  if (error) throw new Error(error.message);
}

// ============================================
// Sprayable Parcels (using v_sprayable_parcels view)
// ============================================

/**
 * SprayableParcel - Sub-parcels as the "unit of work" for spraying
 *
 * Key insight: sub_parcels already have all the data we need:
 * - Unique ID (sub_parcel.id)
 * - Specific area for accurate dosage calculations
 * - Crop and variety for CTGB validation
 *
 * The view generates a readable name like:
 * "Thuis Grote wei (Lucas)" or "Thuis (Conference)"
 */
export interface SprayableParcel {
  id: string;           // sub_parcel.id - the primary identifier
  name: string;         // Generated: "ParcelName SubParcelName (Variety)"
  area: number | null;  // sub_parcel.area - accurate for calculations
  crop: string;         // sub_parcel.crop
  variety: string | null;
  // Parent parcel info for reference
  parcelId: string;
  parcelName: string;
  location: string | null;
  geometry: any;
  source: string | null;
  rvoId: string | null;
  synonyms: string[];   // Alternative names for Smart Input matching
}

// Keep ActiveParcel as alias for backward compatibility
export type ActiveParcel = SprayableParcel;

/**
 * Fetch all sprayable parcels from v_sprayable_parcels view
 * This is the PREFERRED method - sub-parcels are the unit of work
 * Includes retry logic for transient network errors
 */
export async function getSprayableParcels(): Promise<SprayableParcel[]> {
  // Use supabaseAdmin on server (bypasses RLS), regular supabase on client (uses user session)
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  // Get current user ID for explicit filtering (defense-in-depth alongside RLS)
  const userId = await getCurrentUserId();

  // Use retry for transient network errors
  return withRetry(async () => {
    // First try the view
    let query = client
      .from('v_sprayable_parcels')
      .select('id, name, area, crop, variety, parcel_id, user_id');

    // Explicitly filter by user_id for data isolation
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('name');

    if (error) {
      // Throw on fetch errors so withRetry can handle them
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET')) {
        throw new Error(error.message);
      }
      console.error('[getSprayableParcels] View error:', error.message, error.code);
    }

    // If view works, return the data
    if (data && data.length > 0) {
      console.log(`[getSprayableParcels] Found ${data.length} sprayable parcels from view`);
      return data.map(item => mapToSprayableParcel(item));
    }

    // FALLBACK: View is empty, try querying sub_parcels directly
    // This happens when parcels table is empty (JOIN returns 0 rows)
    console.warn('[getSprayableParcels] View returned 0 rows, trying direct sub_parcels query...');

    let subQuery = client
      .from('sub_parcels')
      .select('id, name, area, crop, variety, parcel_id, user_id');

    if (userId) {
      subQuery = subQuery.eq('user_id', userId);
    }

    const { data: subData, error: subError } = await subQuery.order('crop');

    if (subError) {
      console.error('[getSprayableParcels] sub_parcels fallback error:', subError.message);
      return [];
    }

    if (!subData || subData.length === 0) {
      console.warn('[getSprayableParcels] No sub_parcels found either');
      return [];
    }

    console.log(`[getSprayableParcels] FALLBACK: Found ${subData.length} sub_parcels directly`);

    // Map sub_parcels to SprayableParcel format (without parent parcel info)
    // Name format matches the view: "SubParcelName (Variety)" or "Crop Variety - id"
    return subData.map(sp => ({
      id: sp.id,
      name: generateSubParcelName(sp),
      area: sp.area,
      crop: sp.crop || 'Onbekend',
      variety: sp.variety,
      parcelId: sp.parcel_id || sp.id,
      parcelName: sp.name || sp.crop || 'Onbekend',
      location: null,
      geometry: null,
      source: null,
      rvoId: null,
    })) as SprayableParcel[];
  });
}

/**
 * Generate a readable name for a sub_parcel (used in fallback when view is empty)
 * Matches the format of the v_sprayable_parcels view:
 * - "SubParcelName (Variety)" when name is set
 * - "Crop Variety - id" when no name
 */
function generateSubParcelName(sp: any): string {
  const variety = sp.variety || sp.crop || 'Onbekend';

  if (sp.name && sp.name.trim() !== '') {
    // Has a name: "Coleswei (Beurré Alexandre Lucas)"
    return `${sp.name} (${variety})`;
  } else {
    // No name: "Peer Conference - 8d123f2a"
    const crop = sp.crop || 'Perceel';
    const idPrefix = typeof sp.id === 'string' ? sp.id.substring(0, 8) : '';
    return `${crop} ${sp.variety || ''} - ${idPrefix}`.trim();
  }
}

/**
 * Helper to map view/table row to SprayableParcel
 */
function mapToSprayableParcel(item: any): SprayableParcel {
  // Parse geometry if it's a string
  let geometry = item.geometry;
  if (geometry && typeof geometry === 'string') {
    try {
      geometry = JSON.parse(geometry);
    } catch {
      // Keep as-is
    }
  }

  // Fix redundant names from view: "Steketee Tessa (Tessa)" → "Steketee (Tessa)"
  // This happens when sp.name == sp.variety in the SQL view
  let name = item.name;
  if (name && item.variety && item.parcel_name) {
    const redundant = `${item.parcel_name} ${item.variety} (${item.variety})`;
    if (name === redundant) {
      name = `${item.parcel_name} (${item.variety})`;
    }
    // Also handle case-insensitive: "Steketee tessa (Tessa)"
    const redundantLower = redundant.toLowerCase();
    if (name.toLowerCase() === redundantLower && name !== redundant) {
      name = `${item.parcel_name} (${item.variety})`;
    }
  }

  return {
    id: item.id,
    name,
    area: item.area,
    crop: item.crop || 'Onbekend',
    variety: item.variety,
    parcelId: item.parcel_id || item.id,
    parcelName: item.parcel_name || name,
    location: item.location,
    geometry,
    source: item.source,
    rvoId: item.rvo_id,
    synonyms: item.synonyms || [],
  };
}

/**
 * Fetch specific sprayable parcels by ID
 * IDs are sub_parcel IDs (the unit of work)
 * Includes retry logic for transient network errors
 * Falls back to direct sub_parcels query if view is empty
 */
export async function getSprayableParcelsById(ids: string[]): Promise<SprayableParcel[]> {
  if (!ids || ids.length === 0) {
    return [];
  }

  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  // Get current user ID for explicit filtering (defense-in-depth alongside RLS)
  const userId = await getCurrentUserId();

  return withRetry(async () => {
    // First try the view
    let query = client
      .from('v_sprayable_parcels')
      .select('id, name, area, crop, variety, parcel_id, parcel_name, location, geometry, source, rvo_id, synonyms, user_id')
      .in('id', ids);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET')) {
        throw new Error(error.message);
      }
      console.error('[getSprayableParcelsById] View error:', error.message);
    }

    // If view returned data, use it
    if (data && data.length > 0) {
      console.log(`[getSprayableParcelsById] Found ${data.length}/${ids.length} parcels from view`);
      return data.map(item => mapToSprayableParcel(item));
    }

    // FALLBACK: View is empty, try sub_parcels directly
    console.warn('[getSprayableParcelsById] View returned 0 rows, trying sub_parcels fallback...');

    let subQuery = client
      .from('sub_parcels')
      .select('id, name, area, crop, variety, parcel_id, user_id')
      .in('id', ids);

    if (userId) {
      subQuery = subQuery.eq('user_id', userId);
    }

    const { data: subData, error: subError } = await subQuery;

    if (subError) {
      console.error('[getSprayableParcelsById] sub_parcels fallback error:', subError.message);
      return [];
    }

    if (!subData || subData.length === 0) {
      console.warn(`[getSprayableParcelsById] No sub_parcels found for IDs: ${ids.slice(0, 3).join(', ')}...`);
      return [];
    }

    console.log(`[getSprayableParcelsById] FALLBACK: Found ${subData.length}/${ids.length} sub_parcels`);

    // Use same name format as view
    return subData.map(sp => ({
      id: sp.id,
      name: generateSubParcelName(sp),
      area: sp.area,
      crop: sp.crop || 'Onbekend',
      variety: sp.variety,
      parcelId: sp.parcel_id || sp.id,
      parcelName: sp.name || sp.crop || 'Onbekend',
      location: null,
      geometry: null as any,
      source: null,
      rvoId: null,
    })) as SprayableParcel[];
  });
}

// Backward compatibility aliases
export const getActiveParcels = getSprayableParcels;
export const getActiveParcelsById = getSprayableParcelsById;

// ============================================
// Legacy Parcel Functions (kept for backward compatibility)
// ============================================

export async function getParcels(): Promise<Parcel[]> {
  return withRetry(async () => {
    console.log('[getParcels] Fetching parcels from Supabase...');

    // Get current user ID for explicit filtering (defense-in-depth alongside RLS)
    const userId = await getCurrentUserId();

    // Step 1: Fetch parcels with nested sub_parcels
    // NOTE: Only select columns that exist in sub_parcels table
    let parcelsQuery = supabase
      .from('parcels')
      .select('*, sub_parcels(id, parcel_id, crop, variety, area)');

    if (userId) {
      parcelsQuery = parcelsQuery.eq('user_id', userId);
    }

    const { data: parcelsData, error: parcelsError } = await parcelsQuery.order('name');

    if (parcelsError) {
      // Throw to trigger retry for network errors
      if (parcelsError.message?.includes('fetch') || parcelsError.message?.includes('network') || parcelsError.message?.includes('Failed')) {
        throw new Error(parcelsError.message);
      }
      console.error('[getParcels] Supabase error:', parcelsError.message, parcelsError.code);
      return [];
    }

  if (!parcelsData || parcelsData.length === 0) {
    console.warn('[getParcels] No parcels found');
    return [];
  }

  console.log(`[getParcels] Fetched ${parcelsData.length} parcels`);

  // Step 2: Check if any parcels are missing sub_parcels, fetch separately if needed
  const parcelsMissingSubs = parcelsData.filter(p => !p.sub_parcels || p.sub_parcels.length === 0);
  let subParcelsMap = new Map<string, any[]>();

  if (parcelsMissingSubs.length > 0) {
    console.log(`[getParcels] ${parcelsMissingSubs.length} parcels missing sub_parcels, fetching separately...`);

    const missingParcelIds = parcelsMissingSubs.map(p => p.id);
    let subQuery = supabase
      .from('sub_parcels')
      .select('id, parcel_id, crop, variety, area, created_at, updated_at')
      .in('parcel_id', missingParcelIds);

    if (userId) {
      subQuery = subQuery.eq('user_id', userId);
    }

    const { data: allSubParcels, error: subError } = await subQuery;

    if (subError) {
      console.error('[getParcels] Error fetching sub_parcels:', subError.message);
    } else if (allSubParcels && allSubParcels.length > 0) {
      console.log(`[getParcels] Separately fetched ${allSubParcels.length} sub_parcels`);

      // Group by parcel_id
      for (const sp of allSubParcels) {
        const parcelId = sp.parcel_id;
        if (!subParcelsMap.has(parcelId)) {
          subParcelsMap.set(parcelId, []);
        }
        subParcelsMap.get(parcelId)!.push(sp);
      }
    }
  }

  return parcelsData.map(item => {
    let geometry = item.geometry;
    if (geometry && typeof geometry === 'string') {
      try {
        geometry = JSON.parse(geometry);
      } catch {
        // Ignore parse errors
      }
    }

    // Merge: prefer joined sub_parcels, fallback to separately fetched
    const joinedSubs = item.sub_parcels || [];
    const separateSubs = subParcelsMap.get(item.id) || [];
    const allSubParcels = joinedSubs.length > 0 ? joinedSubs : separateSubs;

    // CRITICAL: Get crop/variety from sub_parcels since parcels.crop is often NULL
    const firstSubParcel = allSubParcels[0];
    const crop = firstSubParcel?.crop || item.crop || undefined;
    const variety = firstSubParcel?.variety || item.variety || undefined;

    return {
      id: item.id,
      name: item.name,
      area: item.area,
      location: item.location,
      geometry,
      source: item.source,
      rvoId: item.rvo_id,
      crop,  // Sourced from sub_parcels first
      variety,  // Sourced from sub_parcels first
      subParcels: allSubParcels.map((sp: any) => ({
        id: sp.id,
        parcelId: sp.parcel_id,
        crop: sp.crop,
        variety: sp.variety,
        area: sp.area,
        createdAt: sp.created_at ? new Date(sp.created_at) : undefined,
        updatedAt: sp.updated_at ? new Date(sp.updated_at) : undefined,
      })) as SubParcel[],
    };
  });
  }); // withRetry
}

// === Sub Parcel Functions ===

export async function getSubParcel(id: string): Promise<SubParcel | null> {
  const { data, error } = await supabase
    .from('sub_parcels')
    .select('id, parcel_id, name, synonyms, crop, variety, variety_mutant, rootstock, planting_year, mutants, rootstocks, interstocks, planting_years, planting_distances, planting_distance_row, planting_distance_tree, area, irrigation_type, irrigation_percentage, frost_protection_type, frost_protection_percentage, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return {
    ...recursiveToCamelCase(data),
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  } as SubParcel;
}

export async function addSubParcel(subParcel: Omit<SubParcel, 'id' | 'createdAt' | 'updatedAt'>): Promise<SubParcel> {
  const { soilSamples, productionHistory, ...cleanSubParcel } = subParcel as any;
  const userId = await getCurrentUserId();
  const payload = { ...objectToSnakeCase(cleanSubParcel), user_id: userId };
  const { data, error } = await supabase
    .from('sub_parcels')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Supabase addSubParcel error:", error.message, "Payload:", payload);
    throw new Error(error.message);
  }
  return recursiveToCamelCase(data) as SubParcel;
}

export async function updateSubParcel(subParcel: Partial<SubParcel> & { id: string }): Promise<void> {
  const {
    id,
    soilSamples,
    productionHistory,
    createdAt,
    updatedAt,
    ...updates
  } = subParcel;

  const { error } = await supabase
    .from('sub_parcels')
    .update(objectToSnakeCase(updates))
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// === Soil Sample Functions ===

export async function getSoilSamples(subParcelId: string): Promise<SoilSample[]> {
  const { data, error } = await supabase
    .from('soil_samples')
    .select('id, sub_parcel_id, sample_date, n_total, p_available, k_value, organic_matter, ph, pdf_url, raw_data, created_at')
    .eq('sub_parcel_id', subParcelId)
    .order('sample_date', { ascending: false });

  if (error || !data) return [];
  return data.map(item => ({
    ...recursiveToCamelCase(item),
    sampleDate: new Date(item.sample_date),
    createdAt: new Date(item.created_at),
  })) as SoilSample[];
}

export async function addSoilSample(sample: Omit<SoilSample, 'id' | 'createdAt'>): Promise<SoilSample> {
  const userId = await getCurrentUserId();
  const snakeCase: Record<string, any> = { ...objectToSnakeCase(sample), user_id: userId };
  // Ensure dates are stringified for Supabase
  if (sample.sampleDate) snakeCase.sample_date = sample.sampleDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('soil_samples')
    .insert(snakeCase)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return recursiveToCamelCase(data) as SoilSample;
}

// === Production History Functions ===

export async function getProductionHistory(subParcelId: string): Promise<ProductionHistory[]> {
  const { data, error } = await supabase
    .from('production_history')
    .select('id, sub_parcel_id, year, tonnage, size_distribution, created_at')
    .eq('sub_parcel_id', subParcelId)
    .order('year', { ascending: false });

  if (error || !data) return [];
  return data.map(item => ({
    ...recursiveToCamelCase(item),
    createdAt: new Date(item.created_at),
  })) as ProductionHistory[];
}

export async function addProductionHistory(history: Omit<ProductionHistory, 'id' | 'createdAt'>): Promise<ProductionHistory> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('production_history')
    .insert({ ...objectToSnakeCase(history), user_id: userId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return recursiveToCamelCase(data) as ProductionHistory;
}

export async function addParcel(parcel: Omit<Parcel, 'id'>): Promise<Parcel> {
  const userId = await getCurrentUserId();
  let geometryToSave = parcel.geometry;
  if (geometryToSave && typeof geometryToSave === 'object') {
    geometryToSave = JSON.stringify(geometryToSave);
  }

  const { data, error } = await supabase
    .from('parcels')
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      name: parcel.name,
      area: parcel.area,
      location: parcel.location || null,
      geometry: geometryToSave || null,
      source: parcel.source || "MANUAL",
      rvo_id: parcel.rvoId || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  invalidateParcelCacheSafe();
  return recursiveToCamelCase(data) as Parcel;
}

export async function updateParcel(parcel: Parcel): Promise<void> {
  const { id, ...data } = parcel;
  if (!id) throw new Error("Parcel ID is missing for update");

  let geometryToSave = data.geometry;
  if (geometryToSave && typeof geometryToSave === 'object') {
    geometryToSave = JSON.stringify(geometryToSave);
  }

  const { error } = await supabase
    .from('parcels')
    .update({
      name: data.name,
      area: data.area,
      location: data.location,
      geometry: geometryToSave,
      source: data.source,
      rvo_id: data.rvoId,
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  invalidateParcelCacheSafe();
}

export async function deleteParcel(parcelId: string): Promise<void> {
  const { error } = await supabase
    .from('parcels')
    .delete()
    .eq('id', parcelId);

  if (error) throw new Error(error.message);
  invalidateParcelCacheSafe();
}

/**
 * Fetch specific parcels by their IDs with sub_parcels joined
 * Uses a two-step approach for robustness:
 * 1. Try nested select (Supabase join)
 * 2. Fallback: separate query for sub_parcels if join fails
 */
export async function getParcelsByIds(ids: string[]): Promise<Parcel[]> {
  if (!ids || ids.length === 0) {
    console.log('[getParcelsByIds] No IDs provided');
    return [];
  }

  console.log(`[getParcelsByIds] Fetching ${ids.length} parcels by ID:`, ids);

  // Step 1: Try to fetch parcels with nested sub_parcels
  // NOTE: Only select columns that exist in sub_parcels table
  const { data: parcelsData, error: parcelsError } = await supabase
    .from('parcels')
    .select('*, sub_parcels(id, parcel_id, crop, variety, area)')
    .in('id', ids);

  if (parcelsError) {
    console.error('[getParcelsByIds] Supabase error:', parcelsError.message, parcelsError.code);
    return [];
  }

  if (!parcelsData || parcelsData.length === 0) {
    console.warn(`[getParcelsByIds] No parcels found for IDs: ${ids.join(', ')}`);
    return [];
  }

  console.log(`[getParcelsByIds] Found ${parcelsData.length}/${ids.length} parcels`);

  // Step 2: Check if sub_parcels came through, if not fetch separately
  const needsSeparateFetch = parcelsData.some(p => !p.sub_parcels || p.sub_parcels.length === 0);
  let subParcelsMap = new Map<string, any[]>();

  if (needsSeparateFetch) {
    console.log('[getParcelsByIds] Sub_parcels join may have failed, fetching separately...');

    const { data: subParcelsData, error: subError } = await supabase
      .from('sub_parcels')
      .select('id, parcel_id, crop, variety, area, name, created_at, updated_at')
      .in('parcel_id', ids);

    if (subError) {
      console.error('[getParcelsByIds] Error fetching sub_parcels:', subError.message);
    } else if (subParcelsData && subParcelsData.length > 0) {
      console.log(`[getParcelsByIds] Separately fetched ${subParcelsData.length} sub_parcels`);

      // Group by parcel_id
      for (const sp of subParcelsData) {
        const parcelId = sp.parcel_id;
        if (!subParcelsMap.has(parcelId)) {
          subParcelsMap.set(parcelId, []);
        }
        subParcelsMap.get(parcelId)!.push(sp);
      }
    }
  }

  // === DETAILED DEBUG LOGGING ===
  for (const item of parcelsData) {
    const joinedSubs = item.sub_parcels || [];
    const separateSubs = subParcelsMap.get(item.id) || [];
    const allSubs = joinedSubs.length > 0 ? joinedSubs : separateSubs;

    console.log(`[getParcelsByIds] Parcel "${item.name}" (${item.id}):`);
    console.log(`  - parcels.crop: ${item.crop || 'NULL'}`);
    console.log(`  - parcels.variety: ${item.variety || 'NULL'}`);
    console.log(`  - Joined sub_parcels: ${joinedSubs.length}`);
    console.log(`  - Separate sub_parcels: ${separateSubs.length}`);

    if (allSubs.length > 0) {
      const sp = allSubs[0];
      console.log(`  - First sub_parcel: crop="${sp.crop || 'NULL'}", variety="${sp.variety || 'NULL'}"`);
    } else {
      console.warn(`  - ⚠️ NO sub_parcels found for this parcel!`);
    }
  }
  // === END DEBUG ===

  return parcelsData.map(item => {
    let geometry = item.geometry;
    if (geometry && typeof geometry === 'string') {
      try {
        geometry = JSON.parse(geometry);
      } catch {
        // Ignore parse errors
      }
    }

    // Merge: prefer joined sub_parcels, fallback to separately fetched
    const joinedSubs = item.sub_parcels || [];
    const separateSubs = subParcelsMap.get(item.id) || [];
    const allSubParcels = joinedSubs.length > 0 ? joinedSubs : separateSubs;

    // CRITICAL: Get crop/variety from sub_parcels since parcels.crop is NULL
    const firstSubParcel = allSubParcels[0];
    const crop = firstSubParcel?.crop || item.crop || undefined;
    const variety = firstSubParcel?.variety || item.variety || undefined;

    console.log(`[getParcelsByIds] Final mapping "${item.name}": crop="${crop || 'NONE'}", variety="${variety || 'NONE'}"`);

    return {
      id: item.id,
      name: item.name,
      area: item.area,
      location: item.location,
      geometry,
      source: item.source,
      rvoId: item.rvo_id,
      crop,  // Now correctly sourced from sub_parcels
      variety,  // Now correctly sourced from sub_parcels
      subParcels: allSubParcels.map((sp: any) => ({
        id: sp.id,
        parcelId: sp.parcel_id,
        crop: sp.crop,
        variety: sp.variety,
        area: sp.area,
        createdAt: sp.created_at ? new Date(sp.created_at) : undefined,
        updatedAt: sp.updated_at ? new Date(sp.updated_at) : undefined,
      })) as SubParcel[],
    };
  });
}

// ============================================
// Logbook Functions
// ============================================

export async function getLogbookEntry(id: string): Promise<LogbookEntry | null> {
  const { data, error } = await supabase
    .from('logbook')
    .select('id, raw_input, status, date, created_at, parsed_data, registration_type, validation_message, original_logbook_id')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  return {
    ...recursiveToCamelCase(data) as any,
    date: new Date(data.date),
    createdAt: new Date(data.created_at),
  } as LogbookEntry;
}

export async function getLogbookEntries(options?: { limit?: number }): Promise<LogbookEntry[]> {
  // Use retry for network resilience
  return withRetry(async () => {
    const userId = await getCurrentUserId();
    let query = supabase
      .from('logbook')
      .select('id, raw_input, status, date, created_at, parsed_data, registration_type, validation_message, original_logbook_id, user_id');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query
      .order('date', { ascending: false })
      .limit(options?.limit ?? 500);

    if (error) throw new Error(error.message);
    if (!data) return [];

    return data.map(item => ({
      ...recursiveToCamelCase(item) as any,
      date: new Date(item.date),
      createdAt: new Date(item.created_at),
    })) as LogbookEntry[];
  });
}

export async function addLogbookEntry(entry: Omit<LogbookEntry, 'id'>): Promise<LogbookEntry> {
  const id = crypto.randomUUID();
  const userId = await getCurrentUserId();

  console.log('[addLogbookEntry] Adding entry with ID:', id);

  // Safely parse dates with fallback to current date
  const parseDate = (d: any): string => {
    if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
    if (typeof d === 'string' && d) {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  };

  // Use retry for transient network errors
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('logbook')
      .insert({
        id,
        user_id: userId,
        raw_input: entry.rawInput,
        status: entry.status,
        date: parseDate(entry.date),
        created_at: parseDate(entry.createdAt),
        parsed_data: entry.parsedData,
        validation_message: entry.validationMessage,
        original_logbook_id: entry.originalLogbookId,
      })
      .select()
      .single();

    if (error) {
      // Throw on fetch errors so withRetry can handle them
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET')) {
        throw new Error(error.message);
      }
      console.error('[addLogbookEntry] Supabase error:', error.message, error.code);
      throw new Error(error.message);
    }

    console.log('[addLogbookEntry] Entry added successfully');
    return { id: data.id, ...entry };
  });
}

export async function updateLogbookEntry(entry: LogbookEntry): Promise<void> {
  const { id, ...data } = entry;
  if (!id) throw new Error("Logbook entry ID is missing");

  await withRetry(async () => {
    const { error } = await supabase
      .from('logbook')
      .update({
        raw_input: data.rawInput,
        status: data.status,
        date: new Date(data.date).toISOString(),
        created_at: new Date(data.createdAt).toISOString(),
        parsed_data: data.parsedData,
        validation_message: data.validationMessage,
        original_logbook_id: data.originalLogbookId,
      })
      .eq('id', id);

    if (error) throw new Error(error.message);
  });
}

export async function dbDeleteLogbookEntry(entryId: string): Promise<void> {
  // Delete related history entries
  await supabase
    .from('parcel_history')
    .delete()
    .eq('log_id', entryId);

  // Delete related inventory movements
  await supabase
    .from('inventory_movements')
    .delete()
    .eq('reference_id', entryId);

  // Delete the logbook entry
  const { error } = await supabase
    .from('logbook')
    .delete()
    .eq('id', entryId);

  if (error) throw new Error(error.message);
}

export async function dbDeleteLogbookEntries(entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;

  // Delete related history entries
  await supabase
    .from('parcel_history')
    .delete()
    .in('log_id', entryIds);

  // Delete logbook entries
  const { error } = await supabase
    .from('logbook')
    .delete()
    .in('id', entryIds);

  if (error) throw new Error(error.message);
}

// ============================================
// Parcel History Functions
// ============================================

export async function getParcelHistoryEntries(): Promise<ParcelHistoryEntry[]> {
  console.log('[getParcelHistoryEntries] Fetching parcel history...');

  // Use retry for transient network errors - higher retry count for critical data
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('parcel_history')
      .select('id, log_id, spuitschrift_id, parcel_id, parcel_name, crop, variety, product, dosage, unit, date, harvest_year, unit_price, user_id')
      .order('date', { ascending: false })
      .limit(1000);

    if (error) {
      // Throw on fetch errors so withRetry can handle them
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET') || error.message?.includes('aborted')) {
        throw new Error(error.message);
      }
      console.error('[getParcelHistoryEntries] Supabase error:', error.message);
      return [];
    }

    if (!data) return [];

    console.log(`[getParcelHistoryEntries] Found ${data.length} entries (limited to 1000)`);
    return data.map(item => ({
      ...recursiveToCamelCase(item) as any,
      date: new Date(item.date),
    })) as ParcelHistoryEntry[];
  }, { maxRetries: 5 });
}

/**
 * Get the last used dosage for a specific product from spray history
 * Used to suggest dosages when user doesn't specify one
 */
export async function getLastUsedDosage(productName: string): Promise<{ dosage: number; unit: string; date: Date } | null> {
  if (!productName) return null;

  const normalizedProduct = productName.toLowerCase().trim();

  const { data, error } = await supabase
    .from('parcel_history')
    .select('dosage, unit, date')
    .ilike('product', `%${normalizedProduct}%`)
    .gt('dosage', 0)
    .order('date', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return {
    dosage: data[0].dosage,
    unit: data[0].unit,
    date: new Date(data[0].date),
  };
}

/**
 * Get last used dosages for multiple products at once
 * More efficient than calling getLastUsedDosage multiple times
 */
export async function getLastUsedDosages(productNames: string[]): Promise<Map<string, { dosage: number; unit: string; date: Date }>> {
  const result = new Map<string, { dosage: number; unit: string; date: Date }>();
  if (!productNames || productNames.length === 0) return result;

  // Get recent history and filter locally (more efficient than multiple queries)
  const { data, error } = await supabase
    .from('parcel_history')
    .select('product, dosage, unit, date')
    .gt('dosage', 0)
    .order('date', { ascending: false })
    .limit(500);

  if (error || !data) return result;

  // Find the most recent entry for each product
  for (const productName of productNames) {
    const normalizedProduct = productName.toLowerCase().trim();
    const match = data.find(entry =>
      entry.product?.toLowerCase().includes(normalizedProduct) ||
      normalizedProduct.includes(entry.product?.toLowerCase() || '')
    );

    if (match) {
      result.set(productName, {
        dosage: match.dosage,
        unit: match.unit,
        date: new Date(match.date),
      });
    }
  }

  return result;
}

/**
 * Add parcel history entries for a spray application
 * Now works with SprayableParcel[] (sub-parcels as unit of work)
 * Also accepts legacy Parcel[] for backward compatibility
 */
export async function addParcelHistoryEntries({
  logbookEntry,
  parcels,
  sprayableParcels,
  isConfirmation = false,
  spuitschriftId,
  providedUserId
}: {
  logbookEntry: LogbookEntry,
  parcels?: Parcel[],
  sprayableParcels?: SprayableParcel[],
  isConfirmation?: boolean,
  spuitschriftId?: string,
  providedUserId?: string | null
}) {
  if (!logbookEntry.parsedData) return;

  const userId = providedUserId ?? await getCurrentUserId();
  const { id: logId, parsedData } = logbookEntry;
  const { plots, products } = parsedData;

  if (!isConfirmation) {
    // Delete existing history and inventory for this log entry
    await supabase
      .from('parcel_history')
      .delete()
      .eq('log_id', logId);

    await supabase
      .from('inventory_movements')
      .delete()
      .eq('reference_id', logId);
  }

  const productUsage: Record<string, { totalAmount: number; unit: string; parcelIds: Set<string> }> = {};
  const historyEntries: any[] = [];
  const inventoryEntries: any[] = [];

  // Prefer SprayableParcel[] (new system with sub-parcels)
  if (sprayableParcels && sprayableParcels.length > 0) {
    const sprayableMap = new Map(sprayableParcels.map(p => [p.id, p]));
    plots.forEach(subParcelId => {
      const sprayableParcel = sprayableMap.get(subParcelId);
      if (!sprayableParcel) {
        console.warn(`[addParcelHistoryEntries] Sub-parcel not found: ${subParcelId}`);
        return;
      }

      products.forEach(productEntry => {
        if (isConfirmation && spuitschriftId) {
          historyEntries.push({
            id: crypto.randomUUID(),
            user_id: userId,
            log_id: logbookEntry.originalLogbookId || logId,
            spuitschrift_id: spuitschriftId,
            parcel_id: sprayableParcel.id, // Store sub-parcel ID (unit of work)
            parcel_name: sprayableParcel.name,
            crop: sprayableParcel.crop,
            variety: sprayableParcel.variety,
            product: productEntry.product,
            dosage: productEntry.dosage,
            unit: productEntry.unit,
            date: new Date(logbookEntry.date).toISOString(),
            registration_type: logbookEntry.registrationType || 'spraying',
          });
        }

        if (!productUsage[productEntry.product]) {
          productUsage[productEntry.product] = { totalAmount: 0, unit: productEntry.unit, parcelIds: new Set() };
        }
        if (sprayableParcel.area) {
          productUsage[productEntry.product].totalAmount += productEntry.dosage * sprayableParcel.area;
        }
        productUsage[productEntry.product].parcelIds.add(subParcelId);
      });
    });
  }
  // Fallback to legacy Parcel[] (backward compatibility)
  else if (parcels && parcels.length > 0) {
    const parcelMap = new Map(parcels.map(p => [p.id, p]));
    plots.forEach(parcelId => {
      const parcel = parcelMap.get(parcelId);
      if (!parcel) return;

      // Use sub-parcels if available, otherwise fallback to parcel level (legacy or simple)
      const targets = parcel.subParcels && parcel.subParcels.length > 0
        ? parcel.subParcels
        : [{ crop: 'Onbekend', variety: 'Onbekend', area: parcel.area }];

      targets.forEach(target => {
        products.forEach(productEntry => {
          if (isConfirmation && spuitschriftId) {
            historyEntries.push({
              id: crypto.randomUUID(),
              user_id: userId,
              log_id: logbookEntry.originalLogbookId || logId,
              spuitschrift_id: spuitschriftId,
              parcel_id: parcel.id,
              parcel_name: parcel.name,
              crop: (target as any).crop,
              variety: (target as any).variety,
              product: productEntry.product,
              dosage: productEntry.dosage,
              unit: productEntry.unit,
              date: new Date(logbookEntry.date).toISOString(),
              registration_type: logbookEntry.registrationType || 'spraying',
            });
          }

          if (!productUsage[productEntry.product]) {
            productUsage[productEntry.product] = { totalAmount: 0, unit: productEntry.unit, parcelIds: new Set() };
          }
          if (target.area) {
            productUsage[productEntry.product].totalAmount += productEntry.dosage * target.area;
          }
          productUsage[productEntry.product].parcelIds.add(parcelId);
        });
      });
    });
  }

  Object.entries(productUsage).forEach(([productName, usage]) => {
    if (usage.totalAmount > 0) {
      inventoryEntries.push({
        id: crypto.randomUUID(),
        user_id: userId,
        product_name: productName,
        quantity: -usage.totalAmount,
        unit: usage.unit,
        type: 'usage',
        date: new Date(logbookEntry.date).toISOString(),
        description: `Gebruikt op ${usage.parcelIds.size} perce${usage.parcelIds.size > 1 ? 'len' : 'el'}`,
        reference_id: spuitschriftId,
      });
    }
  });

  // Insert in batches - use admin client on server to bypass RLS
  const isServer = typeof window === 'undefined';
  const dbClient = isServer ? (getSupabaseAdmin() || supabase) : supabase;

  if (historyEntries.length > 0) {
    const { error } = await dbClient.from('parcel_history').insert(historyEntries);
    if (error) {
      // Retry without columns that may not exist yet (before migrations are run)
      console.warn('[saveRelatedData] parcel_history insert failed, retrying with minimal columns:', error.message);
      const cleanedEntries = historyEntries.map(({ registration_type, log_id, spuitschrift_id, ...rest }: any) => rest);
      const { error: retryError } = await dbClient.from('parcel_history').insert(cleanedEntries);
      if (retryError) {
        console.error('[saveRelatedData] parcel_history insert failed even with minimal columns:', retryError.message);
      } else {
        console.log(`[saveRelatedData] Inserted ${cleanedEntries.length} parcel_history entries (without optional columns)`);
      }
    } else {
      console.log(`[saveRelatedData] Inserted ${historyEntries.length} parcel_history entries`);
    }
  }

  if (inventoryEntries.length > 0) {
    const { error } = await dbClient.from('inventory_movements').insert(inventoryEntries);
    if (error) console.error('Error inserting inventory movements:', error);
  }
}

// ============================================
// Product Functions
// ============================================

export async function getProducts(): Promise<string[]> {
  const products = await getAllCtgbProducts();
  return [...new Set(products.map(p => p.naam))].filter(Boolean) as string[];
}

// ============================================
// CTGB Products Functions
// ============================================

export async function searchCtgbProducts(searchTerm: string): Promise<CtgbProduct[]> {
  if (!searchTerm || searchTerm.length < 2) return [];

  // Use supabaseAdmin on server (bypasses RLS), regular supabase on client
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const normalizedSearch = searchTerm.toLowerCase().trim();
  const searchPattern = `%${normalizedSearch}%`;

  console.log(`[searchCtgbProducts] Searching for: "${normalizedSearch}"`);

  return withRetry(async () => {
    // First try exact/partial match on naam
    const { data: nameData, error: nameError } = await client
      .from('ctgb_products')
      .select('id, naam, toelatingsnummer, product_types, categorie, status, vervaldatum, toelatingshouder, werkzame_stoffen, samenstelling, gebruiksvoorschriften, etikettering, search_keywords, last_synced_at')
      .ilike('naam', searchPattern)
      .order('naam')
      .limit(20);

    if (nameError) {
      console.error('[searchCtgbProducts] Name search error:', nameError.message, nameError.code);
      throw new Error(`Name search failed: ${nameError.message}`);
    }

    if (nameData && nameData.length > 0) {
      console.log(`[searchCtgbProducts] Found ${nameData.length} results by name`);
      return nameData.map(item => recursiveToCamelCase(item) as CtgbProduct);
    }

    console.log('[searchCtgbProducts] No name matches, trying fallback search...');

    // Fallback: search in werkzame_stoffen or toelatingsnummer
    const { data, error } = await client
      .from('ctgb_products')
      .select('id, naam, toelatingsnummer, product_types, categorie, status, vervaldatum, toelatingshouder, werkzame_stoffen, samenstelling, gebruiksvoorschriften, etikettering, search_keywords, last_synced_at')
      .or(`werkzame_stoffen.cs.{${normalizedSearch}},toelatingsnummer.ilike.${searchPattern}`)
      .order('naam')
      .limit(20);

    if (error) {
      console.error('[searchCtgbProducts] Fallback search error:', error.message, error.code);
      throw new Error(`Fallback search failed: ${error.message}`);
    }

    console.log(`[searchCtgbProducts] Fallback found ${data?.length || 0} results`);
    return (data || []).map(item => recursiveToCamelCase(item) as CtgbProduct);
  }, { operationName: 'searchCtgbProducts', maxRetries: 5, initialDelayMs: 500, maxDelayMs: 5000 });
}

export async function getCtgbProductByNumber(toelatingsnummer: string): Promise<CtgbProduct | null> {
  if (!toelatingsnummer) return null;

  // Use supabaseAdmin on server (bypasses RLS)
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const { data, error } = await client
    .from('ctgb_products')
    .select('id, naam, toelatingsnummer, product_types, categorie, status, vervaldatum, toelatingshouder, werkzame_stoffen, samenstelling, gebruiksvoorschriften, etikettering, search_keywords, last_synced_at')
    .eq('toelatingsnummer', toelatingsnummer)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return recursiveToCamelCase(data[0]) as CtgbProduct;
}

export async function getCtgbProductByName(naam: string): Promise<CtgbProduct | null> {
  if (!naam) return null;

  // Use supabaseAdmin on server (bypasses RLS)
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const { data, error } = await client
    .from('ctgb_products')
    .select('id, naam, toelatingsnummer, product_types, categorie, status, vervaldatum, toelatingshouder, werkzame_stoffen, samenstelling, gebruiksvoorschriften, etikettering, search_keywords, last_synced_at')
    .eq('naam', naam)
    .single();

  if (error || !data) return null;

  return recursiveToCamelCase(data) as CtgbProduct;
}

export async function getAllCtgbProducts(): Promise<CtgbProduct[]> {
  // Use supabaseAdmin on server (bypasses RLS), regular supabase on client (uses user session)
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  return withRetry(async () => {
    // NOTE: Increased limit from 1000 to 2000 because we have 1047+ products
    // Products starting with W-Z were being cut off (including WOPRO Luisweg)
    // Using select('*') because CtgbProduct type needs all columns (including etikettering, search_keywords, etc.)
    const { data, error } = await client
      .from('ctgb_products')
      .select('*')
      .order('naam')
      .limit(2000);

    if (error) {
      // Throw to trigger retry for network errors
      if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('Failed')) {
        throw new Error(error.message);
      }
      console.error("Supabase Error (getAllCtgbProducts):", error.message || error);
      if ((error as any).cause) console.error("Cause:", (error as any).cause);
      return [];
    }
    if (!data) {
      console.log("Supabase (getAllCtgbProducts): No data found.");
      return [];
    }

    console.log(`Supabase (getAllCtgbProducts): Found ${data.length} items`);
    return data.map(item => recursiveToCamelCase(item) as CtgbProduct);
  });
}

export async function getTargetsForProduct(productName: string): Promise<string[]> {
  // Use supabaseAdmin on server (bypasses RLS), regular supabase on client
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const { data, error } = await client
    .from('ctgb_products')
    .select('gebruiksvoorschriften')
    .eq('naam', productName)
    .single();

  if (error || !data) return [];

  const voorschriften = data.gebruiksvoorschriften as CtgbGebruiksvoorschrift[];
  const targets = new Set<string>();

  voorschriften.forEach(v => {
    if (v.doelorganisme) {
      const splitTargets = v.doelorganisme.split(',').map(t => t.trim());
      splitTargets.forEach(t => targets.add(t));
    }
  });

  return Array.from(targets).sort();
}

/**
 * Doelorganisme met bijbehorende gebruiksvoorschriften
 * Gebruikt voor UI weergave in doelorganisme selector
 */
export interface DoelorganismeOption {
  naam: string;                    // e.g. "Schurft (Venturia inaequalis)"
  dosering?: string;               // e.g. "1,5 l/ha"
  interval?: string;               // e.g. "min. 7 dagen"
  maxToepassingen?: number;        // e.g. 6
  veiligheidstermijn?: string;     // e.g. "21 dagen"
  opmerkingen?: string[];          // Any wCodes or remarks
  gewas: string;                   // The crop this applies to
}

/**
 * Teelt hiërarchie voor fuzzy matching
 * Matches parcelCrop (e.g. 'Appel') with CTGB gewas (e.g. 'pitvruchten')
 */
const CROP_HIERARCHY_STORE: Record<string, string[]> = {
  'appel': ['appel', 'appels', 'pitvruchten', 'pitfruit', 'vruchtbomen', 'fruitgewassen', 'fruit'],
  'peer': ['peer', 'peren', 'pitvruchten', 'pitfruit', 'vruchtbomen', 'fruitgewassen', 'fruit'],
  'kers': ['kers', 'kersen', 'steenvruchten', 'steenfruit', 'vruchtbomen', 'fruitgewassen', 'fruit'],
  'pruim': ['pruim', 'pruimen', 'steenvruchten', 'steenfruit', 'vruchtbomen', 'fruitgewassen', 'fruit'],
};

/**
 * Get all doelorganismen for a product + gewas combination
 * Returns structured data with dosering, interval, etc.
 *
 * @param productName - Name of the CTGB product
 * @param gewas - Optional crop to filter by (e.g. 'Appel', 'Peer')
 * @returns Array of DoelorganismeOption with usage details
 */
export async function getDoelorganismenForProduct(
  productName: string,
  gewas?: string
): Promise<DoelorganismeOption[]> {
  // Use supabaseAdmin on server (bypasses RLS), regular supabase on client
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const { data, error } = await client
    .from('ctgb_products')
    .select('gebruiksvoorschriften')
    .eq('naam', productName)
    .single();

  if (error || !data) return [];

  const voorschriften = data.gebruiksvoorschriften as CtgbGebruiksvoorschrift[];
  const doelorganismenMap = new Map<string, DoelorganismeOption>();

  // Get crop hierarchy for matching
  const normalizedGewas = gewas?.toLowerCase().trim();
  let cropMatches: string[] = [];

  if (normalizedGewas) {
    // Find matching hierarchy
    for (const [key, hierarchy] of Object.entries(CROP_HIERARCHY_STORE)) {
      if (hierarchy.some(h => h.includes(normalizedGewas) || normalizedGewas.includes(h))) {
        cropMatches = hierarchy;
        break;
      }
    }
    // If no hierarchy found, just use the gewas itself
    if (cropMatches.length === 0) {
      cropMatches = [normalizedGewas];
    }
  }

  voorschriften.forEach(v => {
    // Filter by gewas if provided
    if (gewas && v.gewas) {
      const voorschriftGewas = v.gewas.toLowerCase();
      const matchesGewas = cropMatches.some(crop =>
        voorschriftGewas.includes(crop) || crop.includes(voorschriftGewas.split(',')[0].trim())
      );
      if (!matchesGewas) return;
    }

    if (v.doelorganisme) {
      // Split comma-separated doelorganismen but keep them as options
      // Some are long like "Echte meeldauw (Podosphaera leucotricha), Schurft (Venturia inaequalis)"
      const splitTargets = v.doelorganisme.split(',').map(t => t.trim()).filter(t => t.length > 0);

      splitTargets.forEach(targetName => {
        // Use first occurrence (most relevant) if already exists
        if (!doelorganismenMap.has(targetName)) {
          doelorganismenMap.set(targetName, {
            naam: targetName,
            dosering: v.dosering,
            interval: v.interval,
            maxToepassingen: v.maxToepassingen,
            veiligheidstermijn: v.veiligheidstermijn,
            opmerkingen: ((v.opmerkingen || v.wCodes) as string[] | undefined),
            gewas: v.gewas || gewas || 'Algemeen',
          });
        }
      });
    }
  });

  // Sort by name, but put common ones first
  const commonTargets = ['schurft', 'meeldauw', 'luis', 'mot', 'spint', 'roest', 'vruchtrot'];
  const results = Array.from(doelorganismenMap.values()).sort((a, b) => {
    const aLower = a.naam.toLowerCase();
    const bLower = b.naam.toLowerCase();
    const aCommon = commonTargets.some(t => aLower.includes(t));
    const bCommon = commonTargets.some(t => bLower.includes(t));

    if (aCommon && !bCommon) return -1;
    if (!aCommon && bCommon) return 1;
    return a.naam.localeCompare(b.naam, 'nl');
  });

  return results;
}

/**
 * Get previously used doelorganismen from user's spuitschrift history
 * Used for auto-selection of the most likely doelorganisme
 */
export async function getUserDoelorganismeHistory(
  productName: string
): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('spuitschrift')
    .select('products')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  // Extract doelorganismen from products where product name matches
  const usedTargets: string[] = [];
  const productLower = productName.toLowerCase();

  data.forEach(entry => {
    const products = entry.products as ProductEntry[];
    products?.forEach(p => {
      if (p.product?.toLowerCase() === productLower && p.doelorganisme) {
        usedTargets.push(p.doelorganisme);
      }
    });
  });

  // Return unique targets in order of most recent first
  return [...new Set(usedTargets)];
}

export async function getCtgbProductsBySubstance(substance: string): Promise<CtgbProduct[]> {
  if (!substance) return [];

  // Use supabaseAdmin on server (bypasses RLS), regular supabase on client
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const { data, error } = await client
    .from('ctgb_products')
    .select('id, naam, toelatingsnummer, product_types, categorie, status, vervaldatum, toelatingshouder, werkzame_stoffen, samenstelling, gebruiksvoorschriften, etikettering, search_keywords, last_synced_at')
    .contains('werkzame_stoffen', [substance]);

  if (error || !data) return [];

  return data.map(item => recursiveToCamelCase(item) as CtgbProduct);
}

/**
 * Strip special characters from product names for database matching
 * Removes: ®, ™, ©, etc.
 */
function stripSpecialChars(name: string): string {
  return name
    .replace(/[®™©]/g, '')  // Remove trademark symbols
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

/**
 * Fetch CTGB products by an array of names (case-insensitive)
 * Used for optimized validation - only fetches products mentioned in the draft
 * Includes retry logic for transient network errors
 *
 * Handles:
 * - Case-insensitive matching
 * - Special characters (®, ™) in product names
 * - Partial matching for multi-word names
 */
export async function getCtgbProductsByNames(names: string[]): Promise<CtgbProduct[]> {
  if (!names || names.length === 0) return [];

  // Normalize names: lowercase, trim, and strip special chars
  const normalizedNames = names
    .map(n => stripSpecialChars(n.toLowerCase().trim()))
    .filter(Boolean);
  if (normalizedNames.length === 0) return [];

  // Use supabaseAdmin on server, regular supabase on client
  // (CTGB products table doesn't have RLS, but keep consistent)
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  // Use retry for transient network errors
  return withRetry(async () => {
    // Build OR conditions for each name
    // Use ilike with wildcards stripped of special chars
    const orConditions = normalizedNames.map(n => {
      // For multi-word names, match the core product name (first significant word)
      const coreWord = n.split(/\s+/)[0];
      // Try both: exact partial match and core word match
      return `naam.ilike.%${n}%,naam.ilike.%${coreWord}%`;
    }).join(',');

    const { data, error } = await client
      .from('ctgb_products')
      .select('*')
      .or(orConditions);

    if (error) {
      // Throw on fetch errors so withRetry can handle them
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET')) {
        throw new Error(error.message);
      }
      console.error("[getCtgbProductsByNames] Supabase error:", error.message, error.code);
      return [];
    }

    if (!data || data.length === 0) {
      console.log(`[getCtgbProductsByNames] No products found for names: ${names.join(', ')}`);
      return [];
    }

    // Deduplicate results (core word match might return duplicates)
    const uniqueProducts = new Map<string, any>();
    for (const item of data) {
      if (!uniqueProducts.has(item.id)) {
        uniqueProducts.set(item.id, item);
      }
    }

    console.log(`[getCtgbProductsByNames] Found ${uniqueProducts.size} products for ${names.length} names`);
    return Array.from(uniqueProducts.values()).map(item => recursiveToCamelCase(item) as CtgbProduct);
  }, { maxRetries: 5 });
}

export async function getCtgbSyncStats(): Promise<CtgbSyncStats> {
  // Use supabaseAdmin on server (bypasses RLS), regular supabase on client
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const { count, error } = await client
    .from('ctgb_products')
    .select('*', { count: 'exact', head: true });

  if (error) return { count: 0 };

  // Get the most recent lastSyncedAt
  const { data: lastSyncedData } = await client
    .from('ctgb_products')
    .select('last_synced_at')
    .not('last_synced_at', 'is', null)
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .single();

  return {
    count: count || 0,
    lastSynced: lastSyncedData?.last_synced_at,
  };
}

// ============================================
// Fertilizers Functions
// ============================================

export async function getFertilizers(): Promise<FertilizerProduct[]> {
  const { data, error } = await supabase
    .from('fertilizers')
    .select('id, name, manufacturer, category, unit, composition, search_keywords, description, formulation, density, dosage_fruit, application_timing, composition_forms')
    .order('name');

  if (error || !data) return [];

  return data.map(item => ({
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    category: item.category,
    unit: item.unit,
    composition: item.composition,
    searchKeywords: item.search_keywords,
    description: item.description,
    formulation: item.formulation,
    density: item.density ? parseFloat(item.density) : undefined,
    dosageFruit: item.dosage_fruit,
    applicationTiming: item.application_timing,
    compositionForms: item.composition_forms || undefined,
  }));
}

export async function getAllFertilizers(): Promise<FertilizerProduct[]> {
  const isServer = typeof window === 'undefined';
  const dbClient = isServer ? (getSupabaseAdmin() || supabase) : supabase;

  const { data, error } = await dbClient
    .from('fertilizers')
    .select('id, name, manufacturer, category, unit, composition, search_keywords, description, formulation, density, dosage_fruit, application_timing, composition_forms')
    .order('name')
    .limit(2000);

  if (error || !data) return [];

  return data.map(item => ({
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    category: item.category,
    unit: item.unit,
    composition: item.composition,
    searchKeywords: item.search_keywords,
    description: item.description,
    formulation: item.formulation,
    density: item.density ? parseFloat(item.density) : undefined,
    dosageFruit: item.dosage_fruit,
    applicationTiming: item.application_timing,
    compositionForms: item.composition_forms || undefined,
  }));
}

// ============================================
// Unified Products Functions
// ============================================

export async function getAllProducts(): Promise<import('./types').UnifiedProduct[]> {
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const all: import('./types').UnifiedProduct[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await client
      .from('products')
      .select('id, name, product_type, source, source_id, status, search_keywords')
      .eq('status', 'active')
      .order('name')
      .range(from, from + batchSize - 1);

    if (error || !data || data.length === 0) break;

    all.push(...data.map((row: any) => ({
      id: row.id,
      name: row.name,
      productType: row.product_type,
      source: row.source,
      sourceId: row.source_id,
      status: row.status,
      searchKeywords: row.search_keywords || [],
    })));

    if (data.length < batchSize) break;
    from += batchSize;
  }

  return all;
}

export async function getProductAliasesUnified(): Promise<import('./types').ProductAlias[]> {
  const isServer = typeof window === 'undefined';
  const client = isServer ? getSupabaseAdmin() : supabase;

  const { data, error } = await client
    .from('product_aliases_unified')
    .select('id, product_id, alias, alias_type, source, confidence, usage_count')
    .order('alias');

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    productId: row.product_id,
    alias: row.alias,
    aliasType: row.alias_type,
    source: row.source,
    confidence: Number(row.confidence),
    usageCount: row.usage_count,
  }));
}

export async function logSync(entry: Partial<import('./types').SyncLogEntry>): Promise<string | null> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('sync_log')
    .insert({
      source: entry.source,
      started_at: entry.startedAt || new Date().toISOString(),
      status: entry.status || 'running',
      triggered_by: entry.triggeredBy || 'manual',
    })
    .select('id')
    .single();

  if (error) { console.error('Error creating sync log:', error); return null; }
  return data?.id || null;
}

export async function updateSyncLog(id: string, updates: Partial<import('./types').SyncLogEntry>): Promise<void> {
  const client = getSupabaseAdmin();
  await client
    .from('sync_log')
    .update({
      completed_at: updates.completedAt,
      status: updates.status,
      products_added: updates.productsAdded,
      products_updated: updates.productsUpdated,
      products_withdrawn: updates.productsWithdrawn,
      aliases_added: updates.aliasesAdded,
      errors: updates.errors,
      summary: updates.summary,
    })
    .eq('id', id);
}

// ============================================
// Field Signals Functions
// ============================================

import { SupabaseClient } from '@supabase/supabase-js';

export async function getFieldSignals(currentUserId?: string, client: SupabaseClient = supabase): Promise<FieldSignal[]> {
  let query = client
    .from('field_signals')
    .select('*, field_signal_reactions(type, user_id)')
    .order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error || !data) {
    console.error('Error fetching field signals:', error);
    return [];
  }

  return data.map((item: any) => {
    // Check if current user has liked
    const userReaction = currentUserId && item.field_signal_reactions?.find(
      (r: any) => r.user_id === currentUserId && r.type === 'like'
    );

    return {
      ...recursiveToCamelCase(item),
      createdAt: new Date(item.created_at),
      userReaction: userReaction ? 'like' : undefined,
      // We don't have author name joined yet, using ID for now or placeholder
      authorName: 'Adviseur',
    };
  }) as FieldSignal[];
}

export async function addFieldSignal(signal: Omit<FieldSignal, 'id' | 'createdAt' | 'likesCount' | 'userReaction' | 'authorName'>, client: SupabaseClient = supabase): Promise<FieldSignal> {
  const userId = await getCurrentUserId();
  const payload = { ...objectToSnakeCase(signal), user_id: userId };
  const { data, error } = await client
    .from('field_signals')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    ...recursiveToCamelCase(data),
    createdAt: new Date(data.created_at),
  } as FieldSignal;
}

export async function addFieldSignalReaction(reaction: Omit<FieldSignalReaction, 'id' | 'createdAt'>, client: SupabaseClient = supabase): Promise<void> {
  const userId = await getCurrentUserId();
  const payload = { ...objectToSnakeCase(reaction), user_id: userId };
  const { error } = await client
    .from('field_signal_reactions')
    .insert(payload);

  if (error) throw new Error(error.message);
}

export async function deleteFieldSignalReaction(signalId: string, userId: string, type: 'like' | 'comment', client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client
    .from('field_signal_reactions')
    .delete()
    .match({ signal_id: signalId, user_id: userId, type });

  if (error) throw new Error(error.message);
}

// ============================================
// Team & Tasks Functions (Urenregistratie)
// ============================================

import type { TaskType, TaskLog, TaskLogEnriched } from './types';

export async function getTaskTypes(): Promise<TaskType[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('task_types')
      .select('id, name, default_hourly_rate, created_at, updated_at')
      .order('name');

    if (error) {
      console.error('[getTaskTypes] Supabase error:', error.message);
      throw new Error(error.message);
    }

    if (!data) return [];

    return data.map(item => ({
      id: item.id,
      name: item.name,
      defaultHourlyRate: item.default_hourly_rate,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    }));
  });
}

export async function addTaskType(taskType: Omit<TaskType, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskType> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('task_types')
    .insert({
      user_id: userId,
      name: taskType.name,
      default_hourly_rate: taskType.defaultHourlyRate,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    name: data.name,
    defaultHourlyRate: data.default_hourly_rate,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

export async function getTaskLogs(): Promise<TaskLogEnriched[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('v_task_logs_enriched')
      .select('id, start_date, end_date, days, sub_parcel_id, sub_parcel_name, task_type_id, task_type_name, default_hourly_rate, people_count, hours_per_person, total_hours, estimated_cost, notes, created_at, updated_at')
      .order('start_date', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[getTaskLogs] Supabase error:', error.message);
      throw new Error(error.message);
    }

    if (!data) return [];

    return data.map(item => ({
      id: item.id,
      startDate: new Date(item.start_date),
      endDate: new Date(item.end_date),
      days: item.days,
      subParcelId: item.sub_parcel_id,
      subParcelName: item.sub_parcel_name,
      taskTypeId: item.task_type_id,
      taskTypeName: item.task_type_name,
      defaultHourlyRate: item.default_hourly_rate,
      peopleCount: item.people_count,
      hoursPerPerson: item.hours_per_person,
      totalHours: item.total_hours,
      estimatedCost: item.estimated_cost,
      notes: item.notes,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    }));
  });
}

export async function addTaskLog(taskLog: Omit<TaskLog, 'id' | 'totalHours' | 'createdAt' | 'updatedAt'>): Promise<TaskLog> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('task_logs')
    .insert({
      user_id: userId,
      start_date: taskLog.startDate instanceof Date ? taskLog.startDate.toISOString().split('T')[0] : taskLog.startDate,
      end_date: taskLog.endDate instanceof Date ? taskLog.endDate.toISOString().split('T')[0] : taskLog.endDate,
      days: taskLog.days,
      sub_parcel_id: taskLog.subParcelId,
      task_type_id: taskLog.taskTypeId,
      people_count: taskLog.peopleCount,
      hours_per_person: taskLog.hoursPerPerson,
      notes: taskLog.notes,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    startDate: new Date(data.start_date),
    endDate: new Date(data.end_date),
    days: data.days,
    subParcelId: data.sub_parcel_id,
    taskTypeId: data.task_type_id,
    peopleCount: data.people_count,
    hoursPerPerson: data.hours_per_person,
    totalHours: data.total_hours,
    notes: data.notes,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

export async function deleteTaskLog(id: string): Promise<void> {
  const { error } = await supabase
    .from('task_logs')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function getTaskStats(): Promise<{
  todayHours: number;
  weekCost: number;
  topActivity: string | null;
}> {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Today's hours (tasks that include today in their date range)
  const { data: todayData } = await supabase
    .from('task_logs')
    .select('total_hours')
    .lte('start_date', today)
    .gte('end_date', today);

  const todayHours = todayData?.reduce((sum, item) => sum + (item.total_hours || 0), 0) || 0;

  // Week's cost (using view)
  const { data: weekData } = await supabase
    .from('v_task_logs_enriched')
    .select('estimated_cost')
    .gte('start_date', weekAgo);

  const weekCost = weekData?.reduce((sum, item) => sum + (item.estimated_cost || 0), 0) || 0;

  // Top activity this month
  const { data: monthData } = await supabase
    .from('v_task_logs_enriched')
    .select('task_type_name, total_hours')
    .gte('start_date', monthAgo);

  const activityHours: Record<string, number> = {};
  monthData?.forEach(item => {
    if (item.task_type_name) {
      activityHours[item.task_type_name] = (activityHours[item.task_type_name] || 0) + (item.total_hours || 0);
    }
  });

  const topActivity = Object.entries(activityHours)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

  return { todayHours, weekCost, topActivity };
}

// ============================================
// Active Task Sessions (Live Timer)
// ============================================

export async function getActiveTaskSessions(): Promise<ActiveTaskSession[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('v_active_task_sessions_enriched')
      .select('id, task_type_id, task_type_name, default_hourly_rate, sub_parcel_id, sub_parcel_name, start_time, people_count, notes, created_at')
      .order('start_time', { ascending: false });

    if (error) {
      console.error('[getActiveTaskSessions] Supabase error:', error.message);
      throw new Error(error.message);
    }

    if (!data) return [];

    return data.map(item => ({
      id: item.id,
      taskTypeId: item.task_type_id,
      taskTypeName: item.task_type_name,
      defaultHourlyRate: item.default_hourly_rate,
      subParcelId: item.sub_parcel_id,
      subParcelName: item.sub_parcel_name,
      startTime: new Date(item.start_time),
      peopleCount: item.people_count,
      notes: item.notes,
      createdAt: new Date(item.created_at),
    }));
  });
}

export async function startTaskSession(session: {
  taskTypeId: string;
  subParcelId: string | null;
  startTime: Date;
  peopleCount: number;
  notes: string | null;
}): Promise<ActiveTaskSession> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('active_task_sessions')
    .insert({
      user_id: userId,
      task_type_id: session.taskTypeId,
      sub_parcel_id: session.subParcelId,
      start_time: session.startTime.toISOString(),
      people_count: session.peopleCount,
      notes: session.notes,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Fetch enriched data
  const { data: enriched } = await supabase
    .from('v_active_task_sessions_enriched')
    .select('id, task_type_id, task_type_name, default_hourly_rate, sub_parcel_id, sub_parcel_name, start_time, people_count, notes, created_at')
    .eq('id', data.id)
    .single();

  return {
    id: data.id,
    taskTypeId: data.task_type_id,
    taskTypeName: enriched?.task_type_name || '',
    defaultHourlyRate: enriched?.default_hourly_rate || 0,
    subParcelId: data.sub_parcel_id,
    subParcelName: enriched?.sub_parcel_name || null,
    startTime: new Date(data.start_time),
    peopleCount: data.people_count,
    notes: data.notes,
    createdAt: new Date(data.created_at),
  };
}

export async function updateActiveTaskSession(
  id: string,
  updates: { startTime?: Date; peopleCount?: number; notes?: string | null }
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.startTime) updateData.start_time = updates.startTime.toISOString();
  if (updates.peopleCount !== undefined) updateData.people_count = updates.peopleCount;
  if (updates.notes !== undefined) updateData.notes = updates.notes;

  const { error } = await supabase
    .from('active_task_sessions')
    .update(updateData)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Bereken werkdagen tussen twee datums
 * - Werkdag (ma-vr): 1 dag
 * - Zaterdag: 0.5 dag
 * - Zondag: 0 dagen
 */
function calculateWorkDays(startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;

  let days = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 0) {
      // Zondag - niet meetellen
      days += 0;
    } else if (dayOfWeek === 6) {
      // Zaterdag - halve dag
      days += 0.5;
    } else {
      // Maandag t/m vrijdag
      days += 1;
    }
    current.setDate(current.getDate() + 1);
  }

  return days || 1; // Minimaal 1 dag
}

export async function stopTaskSession(
  sessionId: string,
  endTime: Date,
  hoursPerPerson: number
): Promise<void> {
  // 1. Haal de actieve sessie op
  const { data: session, error: fetchError } = await supabase
    .from('v_active_task_sessions_enriched')
    .select('id, task_type_id, sub_parcel_id, start_time, people_count, notes')
    .eq('id', sessionId)
    .single();

  if (fetchError || !session) {
    throw new Error(fetchError?.message || 'Session not found');
  }

  const startTime = new Date(session.start_time);
  const startDate = startTime.toISOString().split('T')[0];
  const endDate = endTime.toISOString().split('T')[0];

  // 2. Bereken werkdagen met juiste weging (ma-vr=1, za=0.5, zo=0)
  const workDays = calculateWorkDays(startTime, endTime);

  // 3. Maak een TaskLog aan
  const { error: insertError } = await supabase
    .from('task_logs')
    .insert({
      start_date: startDate,
      end_date: endDate,
      days: workDays,
      sub_parcel_id: session.sub_parcel_id,
      task_type_id: session.task_type_id,
      people_count: session.people_count,
      hours_per_person: hoursPerPerson,
      notes: session.notes,
    });

  if (insertError) throw new Error(insertError.message);

  // 4. Verwijder de actieve sessie
  const { error: deleteError } = await supabase
    .from('active_task_sessions')
    .delete()
    .eq('id', sessionId);

  if (deleteError) throw new Error(deleteError.message);
}

export async function deleteActiveTaskSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('active_task_sessions')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ============================================
// Storage (Koelcelbeheer) Functions
// ============================================

/**
 * Get all storage cells with summary statistics (fill %, dominant variety)
 */
export async function getStorageCells(): Promise<StorageCellSummary[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('v_storage_cells_summary')
      .select('id, name, width, depth, blocked_positions, status, max_stack_height, door_positions, evaporator_positions, position_height_overrides, complex_id, complex_position, total_positions, filled_positions, fill_percentage, dominant_variety, total_crates, variety_counts, total_capacity, created_at, updated_at')
      .order('name');

    if (error) {
      console.error('[getStorageCells] Supabase error:', error.message);
      throw new Error(error.message);
    }

    if (!data) return [];

    return data.map(item => ({
      id: item.id,
      name: item.name,
      width: item.width,
      depth: item.depth,
      blockedPositions: (item.blocked_positions || []) as BlockedPosition[],
      status: item.status as StorageCellStatus,
      maxStackHeight: item.max_stack_height ?? 8,
      doorPositions: (item.door_positions || []) as DoorPosition[],
      evaporatorPositions: (item.evaporator_positions || []) as EvaporatorPosition[],
      positionHeightOverrides: (item.position_height_overrides || {}) as PositionHeightOverrides,
      complexId: item.complex_id || null,
      complexPosition: (item.complex_position || { x: 0, y: 0, rotation: 0 }) as ComplexPosition,
      totalPositions: item.total_positions || 0,
      filledPositions: item.filled_positions || 0,
      fillPercentage: item.fill_percentage || 0,
      dominantVariety: item.dominant_variety || null,
      totalCrates: item.total_crates || 0,
      varietyCounts: (item.variety_counts || []) as { variety: string; count: number }[],
      totalCapacity: item.total_capacity || 0,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    }));
  });
}

/**
 * Get a single storage cell by ID
 */
export async function getStorageCell(id: string): Promise<StorageCell | null> {
  const { data, error } = await supabase
    .from('storage_cells')
    .select('id, name, width, depth, blocked_positions, status, max_stack_height, door_positions, evaporator_positions, position_height_overrides, complex_id, complex_position, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(error.message);
  }
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    width: data.width,
    depth: data.depth,
    blockedPositions: (data.blocked_positions || []) as BlockedPosition[],
    status: data.status as StorageCellStatus,
    maxStackHeight: data.max_stack_height ?? 8,
    doorPositions: (data.door_positions || []) as DoorPosition[],
    evaporatorPositions: (data.evaporator_positions || []) as EvaporatorPosition[],
    positionHeightOverrides: (data.position_height_overrides || {}) as PositionHeightOverrides,
    complexId: data.complex_id || null,
    complexPosition: (data.complex_position || { x: 0, y: 0, rotation: 0 }) as ComplexPosition,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Create a new storage cell
 */
export async function addStorageCell(
  cell: Omit<StorageCell, 'id' | 'createdAt' | 'updatedAt'>
): Promise<StorageCell> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('storage_cells')
    .insert({
      user_id: userId,
      name: cell.name,
      width: cell.width,
      depth: cell.depth,
      blocked_positions: cell.blockedPositions,
      status: cell.status,
      max_stack_height: cell.maxStackHeight,
      door_positions: cell.doorPositions,
      evaporator_positions: cell.evaporatorPositions,
      position_height_overrides: cell.positionHeightOverrides,
      complex_id: cell.complexId,
      complex_position: cell.complexPosition,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    name: data.name,
    width: data.width,
    depth: data.depth,
    blockedPositions: (data.blocked_positions || []) as BlockedPosition[],
    status: data.status as StorageCellStatus,
    maxStackHeight: data.max_stack_height ?? 8,
    doorPositions: (data.door_positions || []) as DoorPosition[],
    evaporatorPositions: (data.evaporator_positions || []) as EvaporatorPosition[],
    positionHeightOverrides: (data.position_height_overrides || {}) as PositionHeightOverrides,
    complexId: data.complex_id || null,
    complexPosition: (data.complex_position || { x: 0, y: 0, rotation: 0 }) as ComplexPosition,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Update a storage cell
 */
export async function updateStorageCell(
  id: string,
  updates: Partial<Omit<StorageCell, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const updatePayload: Record<string, unknown> = {};
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.width !== undefined) updatePayload.width = updates.width;
  if (updates.depth !== undefined) updatePayload.depth = updates.depth;
  if (updates.blockedPositions !== undefined) updatePayload.blocked_positions = updates.blockedPositions;
  if (updates.status !== undefined) updatePayload.status = updates.status;
  if (updates.maxStackHeight !== undefined) updatePayload.max_stack_height = updates.maxStackHeight;
  if (updates.doorPositions !== undefined) updatePayload.door_positions = updates.doorPositions;
  if (updates.evaporatorPositions !== undefined) updatePayload.evaporator_positions = updates.evaporatorPositions;
  if (updates.positionHeightOverrides !== undefined) updatePayload.position_height_overrides = updates.positionHeightOverrides;
  if (updates.complexId !== undefined) updatePayload.complex_id = updates.complexId;
  if (updates.complexPosition !== undefined) updatePayload.complex_position = updates.complexPosition;

  const { error } = await supabase
    .from('storage_cells')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Delete a storage cell (and all its positions via CASCADE)
 */
export async function deleteStorageCell(id: string): Promise<void> {
  const { error } = await supabase
    .from('storage_cells')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Get all positions in a storage cell
 */
export async function getStoragePositions(cellId: string): Promise<StoragePosition[]> {
  const { data, error } = await supabase
    .from('storage_positions')
    .select('*, sub_parcels(name, variety)')
    .eq('cell_id', cellId);

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map(item => ({
    id: item.id,
    cellId: item.cell_id,
    rowIndex: item.row_index,
    colIndex: item.col_index,
    variety: item.variety,
    subParcelId: item.sub_parcel_id,
    subParcelName: item.sub_parcels?.name
      ? `${item.sub_parcels.name} (${item.sub_parcels.variety})`
      : null,
    dateStored: item.date_stored ? new Date(item.date_stored) : null,
    quantity: item.quantity,
    qualityClass: item.quality_class,
    notes: item.notes,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
  }));
}

/**
 * Upsert a storage position (create or update based on cell_id + row + col)
 */
export async function upsertStoragePosition(
  position: StoragePositionInput
): Promise<StoragePosition> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('storage_positions')
    .upsert(
      {
        cell_id: position.cellId,
        user_id: userId,
        row_index: position.rowIndex,
        col_index: position.colIndex,
        variety: position.variety,
        sub_parcel_id: position.subParcelId,
        date_stored: position.dateStored?.toISOString().split('T')[0],
        quantity: position.quantity,
        quality_class: position.qualityClass,
        notes: position.notes,
      },
      {
        onConflict: 'cell_id,row_index,col_index',
      }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    cellId: data.cell_id,
    rowIndex: data.row_index,
    colIndex: data.col_index,
    variety: data.variety,
    subParcelId: data.sub_parcel_id,
    subParcelName: null, // Not joined in upsert
    dateStored: data.date_stored ? new Date(data.date_stored) : null,
    quantity: data.quantity,
    qualityClass: data.quality_class,
    notes: data.notes,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Clear a storage position (remove crate data)
 */
export async function clearStoragePosition(
  cellId: string,
  rowIndex: number,
  colIndex: number
): Promise<void> {
  const { error } = await supabase
    .from('storage_positions')
    .delete()
    .match({ cell_id: cellId, row_index: rowIndex, col_index: colIndex });

  if (error) throw new Error(error.message);
}

// ============================================
// Storage Complex Functions
// ============================================

/**
 * Get all storage complexes for the current user
 */
export async function getStorageComplexes(): Promise<StorageComplex[]> {
  const { data, error } = await supabase
    .from('storage_complex')
    .select('id, name, grid_width, grid_height, created_at, updated_at')
    .order('name');

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map(item => ({
    id: item.id,
    name: item.name,
    gridWidth: item.grid_width,
    gridHeight: item.grid_height,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
  }));
}

/**
 * Get a single storage complex by ID
 */
export async function getStorageComplex(id: string): Promise<StorageComplex | null> {
  const { data, error } = await supabase
    .from('storage_complex')
    .select('id, name, grid_width, grid_height, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    gridWidth: data.grid_width,
    gridHeight: data.grid_height,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Get or create the default complex for the current user
 * Uses database function to ensure atomicity
 */
export async function getOrCreateDefaultComplex(): Promise<StorageComplex> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Niet ingelogd');

  // Call the database function to get or create default complex
  const { data: complexId, error: fnError } = await supabase
    .rpc('get_or_create_default_complex', { p_user_id: userId });

  if (fnError) throw new Error(fnError.message);

  // Fetch the complex data
  const complex = await getStorageComplex(complexId);
  if (!complex) throw new Error('Kon standaard complex niet ophalen');

  return complex;
}

/**
 * Create a new storage complex
 */
export async function addStorageComplex(
  complex: Omit<StorageComplex, 'id' | 'createdAt' | 'updatedAt'>
): Promise<StorageComplex> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('storage_complex')
    .insert({
      user_id: userId,
      name: complex.name,
      grid_width: complex.gridWidth,
      grid_height: complex.gridHeight,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    name: data.name,
    gridWidth: data.grid_width,
    gridHeight: data.grid_height,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Update a storage complex
 */
export async function updateStorageComplex(
  id: string,
  updates: Partial<Omit<StorageComplex, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const updatePayload: Record<string, unknown> = {};
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.gridWidth !== undefined) updatePayload.grid_width = updates.gridWidth;
  if (updates.gridHeight !== undefined) updatePayload.grid_height = updates.gridHeight;

  const { error } = await supabase
    .from('storage_complex')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Delete a storage complex (cells will have complex_id set to NULL via ON DELETE SET NULL)
 */
export async function deleteStorageComplex(id: string): Promise<void> {
  const { error } = await supabase
    .from('storage_complex')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Get all storage cells belonging to a specific complex
 */
export async function getStorageCellsByComplex(complexId: string): Promise<StorageCellSummary[]> {
  const { data, error } = await supabase
    .from('v_storage_cells_summary')
    .select('id, name, width, depth, blocked_positions, status, max_stack_height, door_positions, evaporator_positions, position_height_overrides, complex_id, complex_position, total_positions, filled_positions, fill_percentage, dominant_variety, total_crates, variety_counts, total_capacity, created_at, updated_at')
    .eq('complex_id', complexId)
    .order('name');

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map(item => ({
    id: item.id,
    name: item.name,
    width: item.width,
    depth: item.depth,
    blockedPositions: (item.blocked_positions || []) as BlockedPosition[],
    status: item.status as StorageCellStatus,
    maxStackHeight: item.max_stack_height ?? 8,
    doorPositions: (item.door_positions || []) as DoorPosition[],
    evaporatorPositions: (item.evaporator_positions || []) as EvaporatorPosition[],
    positionHeightOverrides: (item.position_height_overrides || {}) as PositionHeightOverrides,
    complexId: item.complex_id || null,
    complexPosition: (item.complex_position || { x: 0, y: 0, rotation: 0 }) as ComplexPosition,
    totalPositions: item.total_positions || 0,
    filledPositions: item.filled_positions || 0,
    fillPercentage: item.fill_percentage || 0,
    dominantVariety: item.dominant_variety || null,
    totalCrates: item.total_crates || 0,
    varietyCounts: (item.variety_counts || []) as { variety: string; count: number }[],
    totalCapacity: item.total_capacity || 0,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
  }));
}

// ============================================
// Cell Sub-Parcels CRUD (migration 008)
// ============================================

/**
 * Get all sub-parcels assigned to a cell with totals
 */
export async function getCellSubParcels(cellId: string): Promise<CellSubParcel[]> {
  const { data, error } = await supabase
    .from('v_cell_sub_parcel_totals')
    .select('id, cell_id, parcel_id, sub_parcel_id, variety, color, pick_date, pick_number, notes, harvest_registration_id, created_at, updated_at, total_crates, positions_used, parcel_name, sub_parcel_name')
    .eq('cell_id', cellId)
    .order('pick_date', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map(item => ({
    id: item.id,
    cellId: item.cell_id,
    parcelId: item.parcel_id,
    subParcelId: item.sub_parcel_id,
    variety: item.variety,
    color: item.color,
    pickDate: new Date(item.pick_date),
    pickNumber: item.pick_number as PickNumber,
    notes: item.notes,
    harvestRegistrationId: item.harvest_registration_id || null,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
    totalCrates: item.total_crates || 0,
    positionsUsed: item.positions_used || 0,
    parcelName: item.parcel_name || null,
    subParcelName: item.sub_parcel_name || null,
  }));
}

/**
 * Create a new cell sub-parcel assignment
 */
export async function createCellSubParcel(input: CellSubParcelInput): Promise<CellSubParcel> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('cell_sub_parcels')
    .insert({
      cell_id: input.cellId,
      user_id: userId,
      parcel_id: input.parcelId,
      sub_parcel_id: input.subParcelId,
      variety: input.variety,
      color: input.color,
      pick_date: input.pickDate.toISOString().split('T')[0],
      pick_number: input.pickNumber,
      notes: input.notes,
      harvest_registration_id: input.harvestRegistrationId && input.harvestRegistrationId !== '_none' ? input.harvestRegistrationId : null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    cellId: data.cell_id,
    parcelId: data.parcel_id,
    subParcelId: data.sub_parcel_id,
    variety: data.variety,
    color: data.color,
    pickDate: new Date(data.pick_date),
    pickNumber: data.pick_number as PickNumber,
    notes: data.notes,
    harvestRegistrationId: data.harvest_registration_id || null,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Update a cell sub-parcel assignment
 */
export async function updateCellSubParcel(
  id: string,
  updates: Partial<CellSubParcelInput>
): Promise<CellSubParcel> {
  const updateData: Record<string, unknown> = {};

  if (updates.variety !== undefined) updateData.variety = updates.variety;
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.pickDate !== undefined) updateData.pick_date = updates.pickDate.toISOString().split('T')[0];
  if (updates.pickNumber !== undefined) updateData.pick_number = updates.pickNumber;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.parcelId !== undefined) updateData.parcel_id = updates.parcelId;
  if (updates.subParcelId !== undefined) updateData.sub_parcel_id = updates.subParcelId;
  if (updates.harvestRegistrationId !== undefined) updateData.harvest_registration_id = updates.harvestRegistrationId && updates.harvestRegistrationId !== '_none' ? updates.harvestRegistrationId : null;

  const { data, error } = await supabase
    .from('cell_sub_parcels')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    cellId: data.cell_id,
    parcelId: data.parcel_id,
    subParcelId: data.sub_parcel_id,
    variety: data.variety,
    color: data.color,
    pickDate: new Date(data.pick_date),
    pickNumber: data.pick_number as PickNumber,
    notes: data.notes,
    harvestRegistrationId: data.harvest_registration_id || null,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Delete a cell sub-parcel assignment (also deletes all position contents)
 */
export async function deleteCellSubParcel(id: string): Promise<void> {
  const { error } = await supabase
    .from('cell_sub_parcels')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Get the next available color for a cell sub-parcel
 */
export async function getNextAvailableColor(cellId: string): Promise<string> {
  const SUB_PARCEL_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
  ];

  const { data } = await supabase
    .from('cell_sub_parcels')
    .select('color')
    .eq('cell_id', cellId);

  const usedColors = new Set(data?.map(d => d.color) || []);

  for (const color of SUB_PARCEL_COLORS) {
    if (!usedColors.has(color)) {
      return color;
    }
  }

  // If all colors are used, return a random one
  return SUB_PARCEL_COLORS[Math.floor(Math.random() * SUB_PARCEL_COLORS.length)];
}

// ============================================
// Position Contents CRUD (migration 008)
// ============================================

/**
 * Get all position contents for a cell
 */
export async function getPositionContents(cellId: string): Promise<PositionContent[]> {
  const { data, error } = await supabase
    .from('storage_position_contents')
    .select(`
      *,
      cell_sub_parcels!inner (
        variety,
        color
      )
    `)
    .eq('cell_id', cellId)
    .order('row_index')
    .order('col_index')
    .order('stack_order');

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map(item => ({
    id: item.id,
    cellId: item.cell_id,
    rowIndex: item.row_index,
    colIndex: item.col_index,
    cellSubParcelId: item.cell_sub_parcel_id,
    stackCount: item.stack_count,
    stackOrder: item.stack_order,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
    variety: item.cell_sub_parcels?.variety,
    color: item.cell_sub_parcels?.color,
  }));
}

/**
 * Get position contents as aggregated stacks for floor plan rendering
 */
export async function getPositionStacks(cellId: string, cell: StorageCell): Promise<Map<string, PositionStack>> {
  const contents = await getPositionContents(cellId);
  const stackMap = new Map<string, PositionStack>();

  // Group by position
  for (const content of contents) {
    const key = `${content.rowIndex}-${content.colIndex}`;

    if (!stackMap.has(key)) {
      // Calculate max height for this position
      let maxHeight = cell.maxStackHeight || 8;
      const overrideKey = `${content.rowIndex}-${content.colIndex}`;
      if (cell.positionHeightOverrides?.[overrideKey] !== undefined) {
        maxHeight = cell.positionHeightOverrides[overrideKey];
      }

      stackMap.set(key, {
        rowIndex: content.rowIndex,
        colIndex: content.colIndex,
        contents: [],
        totalHeight: 0,
        maxHeight,
        isMixed: false,
        dominantColor: '',
      });
    }

    const stack = stackMap.get(key)!;
    stack.contents.push(content);
    stack.totalHeight += content.stackCount;
  }

  // Calculate isMixed and dominantColor for each stack
  for (const stack of stackMap.values()) {
    const uniqueSubParcels = new Set(stack.contents.map(c => c.cellSubParcelId));
    stack.isMixed = uniqueSubParcels.size > 1;

    // Find dominant color (sub-parcel with most crates)
    const colorCounts = new Map<string, number>();
    for (const content of stack.contents) {
      const color = content.color || '#22c55e';
      colorCounts.set(color, (colorCounts.get(color) || 0) + content.stackCount);
    }

    let maxCount = 0;
    for (const [color, count] of colorCounts) {
      if (count > maxCount) {
        maxCount = count;
        stack.dominantColor = color;
      }
    }
  }

  return stackMap;
}

/**
 * Add content to a position (or append to existing stack)
 */
export async function addPositionContent(input: PositionContentInput): Promise<PositionContent> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  // Get the next stack order for this position
  const { data: existing } = await supabase
    .from('storage_position_contents')
    .select('stack_order')
    .eq('cell_id', input.cellId)
    .eq('row_index', input.rowIndex)
    .eq('col_index', input.colIndex)
    .order('stack_order', { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].stack_order + 1 : 1;

  const { data, error } = await supabase
    .from('storage_position_contents')
    .insert({
      cell_id: input.cellId,
      user_id: userId,
      row_index: input.rowIndex,
      col_index: input.colIndex,
      cell_sub_parcel_id: input.cellSubParcelId,
      stack_count: input.stackCount,
      stack_order: input.stackOrder || nextOrder,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    cellId: data.cell_id,
    rowIndex: data.row_index,
    colIndex: data.col_index,
    cellSubParcelId: data.cell_sub_parcel_id,
    stackCount: data.stack_count,
    stackOrder: data.stack_order,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Update a position content layer
 */
export async function updatePositionContent(
  id: string,
  updates: { stackCount?: number; stackOrder?: number }
): Promise<void> {
  const updateData: Record<string, unknown> = {};

  if (updates.stackCount !== undefined) updateData.stack_count = updates.stackCount;
  if (updates.stackOrder !== undefined) updateData.stack_order = updates.stackOrder;

  const { error } = await supabase
    .from('storage_position_contents')
    .update(updateData)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Delete a position content layer
 */
export async function deletePositionContent(id: string): Promise<void> {
  const { error } = await supabase
    .from('storage_position_contents')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Clear all contents from a position
 */
export async function clearPositionContents(
  cellId: string,
  rowIndex: number,
  colIndex: number
): Promise<void> {
  const { error } = await supabase
    .from('storage_position_contents')
    .delete()
    .eq('cell_id', cellId)
    .eq('row_index', rowIndex)
    .eq('col_index', colIndex);

  if (error) throw new Error(error.message);
}

/**
 * Assign a sub-parcel to multiple positions at once (batch operation)
 */
export async function assignSubParcelToPositions(
  cellId: string,
  cellSubParcelId: string,
  positions: { rowIndex: number; colIndex: number; stackCount: number }[]
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  // For each position, get the next stack order and insert
  for (const pos of positions) {
    const { data: existing } = await supabase
      .from('storage_position_contents')
      .select('stack_order')
      .eq('cell_id', cellId)
      .eq('row_index', pos.rowIndex)
      .eq('col_index', pos.colIndex)
      .order('stack_order', { ascending: false })
      .limit(1);

    const nextOrder = existing && existing.length > 0 ? existing[0].stack_order + 1 : 1;

    const { error } = await supabase
      .from('storage_position_contents')
      .insert({
        cell_id: cellId,
        user_id: userId,
        row_index: pos.rowIndex,
        col_index: pos.colIndex,
        cell_sub_parcel_id: cellSubParcelId,
        stack_count: pos.stackCount,
        stack_order: nextOrder,
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Fill an entire row with a sub-parcel
 */
export async function fillRowWithSubParcel(
  cellId: string,
  cell: StorageCell,
  rowIndex: number,
  cellSubParcelId: string
): Promise<void> {
  const positions: { rowIndex: number; colIndex: number; stackCount: number }[] = [];

  // Get existing contents to avoid filling already filled positions
  const existingStacks = await getPositionStacks(cellId, cell);

  for (let col = 0; col < cell.width; col++) {
    const key = `${rowIndex}-${col}`;
    const isBlocked = cell.blockedPositions.some(bp => bp.row === rowIndex && bp.col === col);

    if (isBlocked) continue;

    const existing = existingStacks.get(key);
    if (existing && existing.totalHeight > 0) continue;

    // Calculate max height for this position
    let maxHeight = cell.maxStackHeight || 8;
    if (cell.positionHeightOverrides?.[key] !== undefined) {
      maxHeight = cell.positionHeightOverrides[key];
    }

    positions.push({ rowIndex, colIndex: col, stackCount: maxHeight });
  }

  if (positions.length > 0) {
    await assignSubParcelToPositions(cellId, cellSubParcelId, positions);
  }
}

/**
 * Fill an entire column with a sub-parcel
 */
export async function fillColumnWithSubParcel(
  cellId: string,
  cell: StorageCell,
  colIndex: number,
  cellSubParcelId: string
): Promise<void> {
  const positions: { rowIndex: number; colIndex: number; stackCount: number }[] = [];

  const existingStacks = await getPositionStacks(cellId, cell);

  for (let row = 0; row < cell.depth; row++) {
    const key = `${row}-${colIndex}`;
    const isBlocked = cell.blockedPositions.some(bp => bp.row === row && bp.col === colIndex);

    if (isBlocked) continue;

    const existing = existingStacks.get(key);
    if (existing && existing.totalHeight > 0) continue;

    let maxHeight = cell.maxStackHeight || 8;
    if (cell.positionHeightOverrides?.[key] !== undefined) {
      maxHeight = cell.positionHeightOverrides[key];
    }

    positions.push({ rowIndex: row, colIndex, stackCount: maxHeight });
  }

  if (positions.length > 0) {
    await assignSubParcelToPositions(cellId, cellSubParcelId, positions);
  }
}

/**
 * Fill all empty positions with a sub-parcel
 */
export async function fillAllEmptyPositions(
  cellId: string,
  cell: StorageCell,
  cellSubParcelId: string
): Promise<void> {
  const positions: { rowIndex: number; colIndex: number; stackCount: number }[] = [];

  const existingStacks = await getPositionStacks(cellId, cell);

  for (let row = 0; row < cell.depth; row++) {
    for (let col = 0; col < cell.width; col++) {
      const key = `${row}-${col}`;
      const isBlocked = cell.blockedPositions.some(bp => bp.row === row && bp.col === col);

      if (isBlocked) continue;

      const existing = existingStacks.get(key);
      if (existing && existing.totalHeight > 0) continue;

      let maxHeight = cell.maxStackHeight || 8;
      if (cell.positionHeightOverrides?.[key] !== undefined) {
        maxHeight = cell.positionHeightOverrides[key];
      }

      positions.push({ rowIndex: row, colIndex: col, stackCount: maxHeight });
    }
  }

  if (positions.length > 0) {
    await assignSubParcelToPositions(cellId, cellSubParcelId, positions);
  }
}

// ============================================
// Harvest Registrations CRUD (migration 009)
// ============================================

/**
 * Calculate the season string from a date
 * Season runs July to June (e.g., "2025-2026")
 */
function calculateSeason(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed

  if (month >= 7) {
    // July onwards is the new season
    return `${year}-${year + 1}`;
  } else {
    // January-June is still the previous season
    return `${year - 1}-${year}`;
  }
}

/**
 * Get all harvest registrations with computed storage totals
 */
export async function getHarvestRegistrations(options?: {
  season?: string;
  subParcelId?: string;
  fromDate?: Date;
  toDate?: Date;
}): Promise<HarvestRegistration[]> {
  let query = supabase
    .from('v_harvest_registration_totals')
    .select('id, parcel_id, sub_parcel_id, variety, harvest_date, pick_number, total_crates, quality_class, weight_per_crate, season, notes, created_at, updated_at, parcel_name, sub_parcel_name, stored_crates, remaining_crates, storage_status, cell_names')
    .order('harvest_date', { ascending: false });

  if (options?.season) {
    query = query.eq('season', options.season);
  }
  if (options?.subParcelId) {
    query = query.eq('sub_parcel_id', options.subParcelId);
  }
  if (options?.fromDate) {
    query = query.gte('harvest_date', options.fromDate.toISOString().split('T')[0]);
  }
  if (options?.toDate) {
    query = query.lte('harvest_date', options.toDate.toISOString().split('T')[0]);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map(item => ({
    id: item.id,
    parcelId: item.parcel_id,
    subParcelId: item.sub_parcel_id,
    variety: item.variety,
    harvestDate: new Date(item.harvest_date),
    pickNumber: item.pick_number as PickNumber,
    totalCrates: item.total_crates,
    qualityClass: item.quality_class as QualityClass | null,
    weightPerCrate: item.weight_per_crate ? parseFloat(item.weight_per_crate) : null,
    season: item.season,
    notes: item.notes,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
    parcelName: item.parcel_name || undefined,
    subParcelName: item.sub_parcel_name || undefined,
    storedCrates: item.stored_crates || 0,
    remainingCrates: item.remaining_crates || item.total_crates,
    storageStatus: item.storage_status as HarvestStorageStatus,
    cellNames: item.cell_names || undefined,
  }));
}

/**
 * Get harvests for a specific date
 */
export async function getHarvestsForDate(date: Date): Promise<HarvestRegistration[]> {
  const dateStr = date.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('v_harvest_registration_totals')
    .select('id, parcel_id, sub_parcel_id, variety, harvest_date, pick_number, total_crates, quality_class, weight_per_crate, season, notes, created_at, updated_at, parcel_name, sub_parcel_name, stored_crates, remaining_crates, storage_status, cell_names')
    .eq('harvest_date', dateStr)
    .order('variety');

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map(item => ({
    id: item.id,
    parcelId: item.parcel_id,
    subParcelId: item.sub_parcel_id,
    variety: item.variety,
    harvestDate: new Date(item.harvest_date),
    pickNumber: item.pick_number as PickNumber,
    totalCrates: item.total_crates,
    qualityClass: item.quality_class as QualityClass | null,
    weightPerCrate: item.weight_per_crate ? parseFloat(item.weight_per_crate) : null,
    season: item.season,
    notes: item.notes,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
    parcelName: item.parcel_name || undefined,
    subParcelName: item.sub_parcel_name || undefined,
    storedCrates: item.stored_crates || 0,
    remainingCrates: item.remaining_crates || item.total_crates,
    storageStatus: item.storage_status as HarvestStorageStatus,
    cellNames: item.cell_names || undefined,
  }));
}

/**
 * Get available harvests for storage (with remaining crates)
 */
export async function getAvailableHarvestsForStorage(options?: {
  variety?: string;
  subParcelId?: string;
}): Promise<HarvestRegistration[]> {
  let query = supabase
    .from('v_harvest_registration_totals')
    .select('id, parcel_id, sub_parcel_id, variety, harvest_date, pick_number, total_crates, quality_class, weight_per_crate, season, notes, created_at, updated_at, parcel_name, sub_parcel_name, stored_crates, remaining_crates, storage_status, cell_names')
    .gt('remaining_crates', 0) // Only harvests with remaining crates
    .order('harvest_date', { ascending: false });

  if (options?.variety) {
    query = query.eq('variety', options.variety);
  }
  if (options?.subParcelId) {
    query = query.eq('sub_parcel_id', options.subParcelId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map(item => ({
    id: item.id,
    parcelId: item.parcel_id,
    subParcelId: item.sub_parcel_id,
    variety: item.variety,
    harvestDate: new Date(item.harvest_date),
    pickNumber: item.pick_number as PickNumber,
    totalCrates: item.total_crates,
    qualityClass: item.quality_class as QualityClass | null,
    weightPerCrate: item.weight_per_crate ? parseFloat(item.weight_per_crate) : null,
    season: item.season,
    notes: item.notes,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
    parcelName: item.parcel_name || undefined,
    subParcelName: item.sub_parcel_name || undefined,
    storedCrates: item.stored_crates || 0,
    remainingCrates: item.remaining_crates || item.total_crates,
    storageStatus: item.storage_status as HarvestStorageStatus,
    cellNames: item.cell_names || undefined,
  }));
}

/**
 * Create a new harvest registration
 */
export async function createHarvestRegistration(
  input: HarvestRegistrationInput
): Promise<HarvestRegistration> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  // Auto-calculate season if not provided
  const season = input.season || calculateSeason(input.harvestDate);

  const { data, error } = await supabase
    .from('harvest_registrations')
    .insert({
      user_id: userId,
      parcel_id: input.parcelId,
      sub_parcel_id: input.subParcelId,
      variety: input.variety,
      harvest_date: input.harvestDate.toISOString().split('T')[0],
      pick_number: input.pickNumber,
      total_crates: input.totalCrates,
      quality_class: input.qualityClass,
      weight_per_crate: input.weightPerCrate,
      season: season,
      notes: input.notes,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    parcelId: data.parcel_id,
    subParcelId: data.sub_parcel_id,
    variety: data.variety,
    harvestDate: new Date(data.harvest_date),
    pickNumber: data.pick_number as PickNumber,
    totalCrates: data.total_crates,
    qualityClass: data.quality_class as QualityClass | null,
    weightPerCrate: data.weight_per_crate ? parseFloat(data.weight_per_crate) : null,
    season: data.season,
    notes: data.notes,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
    storedCrates: 0,
    remainingCrates: data.total_crates,
    storageStatus: 'not_stored',
  };
}

/**
 * Update a harvest registration
 */
export async function updateHarvestRegistration(
  id: string,
  updates: Partial<HarvestRegistrationInput>
): Promise<HarvestRegistration> {
  const updateData: Record<string, unknown> = {};

  if (updates.parcelId !== undefined) updateData.parcel_id = updates.parcelId;
  if (updates.subParcelId !== undefined) updateData.sub_parcel_id = updates.subParcelId;
  if (updates.variety !== undefined) updateData.variety = updates.variety;
  if (updates.harvestDate !== undefined) {
    updateData.harvest_date = updates.harvestDate.toISOString().split('T')[0];
    // Recalculate season if date changes
    updateData.season = calculateSeason(updates.harvestDate);
  }
  if (updates.pickNumber !== undefined) updateData.pick_number = updates.pickNumber;
  if (updates.totalCrates !== undefined) updateData.total_crates = updates.totalCrates;
  if (updates.qualityClass !== undefined) updateData.quality_class = updates.qualityClass;
  if (updates.weightPerCrate !== undefined) updateData.weight_per_crate = updates.weightPerCrate;
  if (updates.notes !== undefined) updateData.notes = updates.notes;

  const { data, error } = await supabase
    .from('harvest_registrations')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Fetch the full data with computed fields from view
  const harvests = await getHarvestRegistrations();
  const updated = harvests.find(h => h.id === id);
  if (updated) return updated;

  // Fallback if view query fails
  return {
    id: data.id,
    parcelId: data.parcel_id,
    subParcelId: data.sub_parcel_id,
    variety: data.variety,
    harvestDate: new Date(data.harvest_date),
    pickNumber: data.pick_number as PickNumber,
    totalCrates: data.total_crates,
    qualityClass: data.quality_class as QualityClass | null,
    weightPerCrate: data.weight_per_crate ? parseFloat(data.weight_per_crate) : null,
    season: data.season,
    notes: data.notes,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Delete a harvest registration
 */
export async function deleteHarvestRegistration(id: string): Promise<void> {
  const { error } = await supabase
    .from('harvest_registrations')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Link a cell sub-parcel to a harvest registration
 */
export async function linkCellSubParcelToHarvest(
  cellSubParcelId: string,
  harvestRegistrationId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('cell_sub_parcels')
    .update({ harvest_registration_id: harvestRegistrationId })
    .eq('id', cellSubParcelId);

  if (error) throw new Error(error.message);
}

/**
 * Get distinct seasons for filtering
 */
export async function getHarvestSeasons(): Promise<string[]> {
  const { data, error } = await supabase
    .from('harvest_registrations')
    .select('season')
    .order('season', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data) return [];

  // Get unique seasons
  const seasons = [...new Set(data.map(d => d.season))];
  return seasons;
}

// ============================================================================
// PARCEL GROUPS
// ============================================================================

import type { ParcelGroup } from '@/lib/types';

/**
 * Fetch all parcel groups for the current user
 */
export async function getParcelGroups(): Promise<ParcelGroup[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('parcel_groups')
    .select('*, parcel_group_members(sub_parcel_id)')
    .eq('user_id', userId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data || []).map((g: any) => {
    const members = g.parcel_group_members || [];
    return {
      id: g.id,
      name: g.name,
      memberCount: members.length,
      subParcelIds: members.map((m: any) => m.sub_parcel_id),
      createdAt: new Date(g.created_at),
    };
  });
}

/**
 * Fetch all groups with their member sub_parcel IDs (for Smart Input resolution)
 */
export async function getParcelGroupsWithMemberIds(): Promise<
  Array<{ id: string; name: string; subParcelIds: string[] }>
> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('parcel_groups')
    .select('id, name, parcel_group_members(sub_parcel_id)')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return (data || []).map((g: any) => ({
    id: g.id,
    name: g.name,
    subParcelIds: (g.parcel_group_members || []).map((m: any) => m.sub_parcel_id),
  }));
}

/**
 * Create a new parcel group
 */
export async function addParcelGroup(name: string): Promise<ParcelGroup> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('parcel_groups')
    .insert({ name, user_id: userId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id, name: data.name, memberCount: 0, createdAt: new Date(data.created_at) };
}

/**
 * Delete a parcel group (members are cascade-deleted)
 */
export async function deleteParcelGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from('parcel_groups')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Set the members (sub_parcel IDs) for a group — replaces all existing members
 */
export async function setParcelGroupMembers(groupId: string, subParcelIds: string[]): Promise<void> {
  const userId = await getCurrentUserId();

  // Delete existing members
  await supabase
    .from('parcel_group_members')
    .delete()
    .eq('group_id', groupId);

  // Insert new members
  if (subParcelIds.length > 0) {
    const { error } = await supabase
      .from('parcel_group_members')
      .insert(subParcelIds.map(spId => ({
        group_id: groupId,
        sub_parcel_id: spId,
        user_id: userId,
      })));
    if (error) throw new Error(error.message);
  }
}

/**
 * Rename a parcel group
 */
export async function updateParcelGroupName(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('parcel_groups')
    .update({ name })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ============================================================================
// PARCEL SYNONYMS
// ============================================================================

/**
 * Update synonyms for a sub_parcel
 */
export async function updateParcelSynonyms(subParcelId: string, synonyms: string[]): Promise<void> {
  const { error } = await supabase
    .from('sub_parcels')
    .update({ synonyms })
    .eq('id', subParcelId);
  if (error) throw new Error(error.message);
}
