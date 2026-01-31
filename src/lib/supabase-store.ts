import { supabase, withRetry } from './supabase';
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
  ActiveTaskSession
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

// Clear cache on auth state change
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    cachedUserId = null;
  } else if (event === 'SIGNED_IN') {
    cachedUserId = null; // Will be refreshed on next call
  }
});

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

export async function getSpuitschriftEntry(id: string): Promise<SpuitschriftEntry | null> {
  const { data, error } = await supabase
    .from('spuitschrift')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  return {
    ...objectToCamelCase<SpuitschriftEntry>(data),
    date: new Date(data.date),
    createdAt: new Date(data.created_at),
  };
}

export async function getSpuitschriftEntries(): Promise<SpuitschriftEntry[]> {
  // Use retry for network resilience
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('spuitschrift')
      .select('*')
      .order('date', { ascending: false });

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

export async function addSpuitschriftEntry(entry: Omit<SpuitschriftEntry, 'id' | 'spuitschriftId'>): Promise<SpuitschriftEntry> {
  const id = crypto.randomUUID();
  const userId = await getCurrentUserId();

  // Safely parse dates with fallback to current date
  const parseDate = (d: any): string => {
    if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
    if (typeof d === 'string' && d) {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  };

  const snakeCaseEntry = {
    id,
    user_id: userId,
    original_logbook_id: entry.originalLogbookId,
    original_raw_input: entry.originalRawInput,
    date: parseDate(entry.date),
    created_at: parseDate(entry.createdAt),
    plots: entry.plots,
    products: entry.products,
    validation_message: entry.validationMessage,
    status: entry.status,
  };

  // Use retry for network resilience
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('spuitschrift')
      .insert(snakeCaseEntry)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      id: data.id,
      ...entry,
    } as SpuitschriftEntry;
  });
}

export async function deleteSpuitschriftEntry(entryId: string): Promise<void> {
  // Delete related parcel history
  await supabase
    .from('parcel_history')
    .delete()
    .eq('spuitschrift_id', entryId);

  // Delete related inventory movements
  await supabase
    .from('inventory_movements')
    .delete()
    .eq('reference_id', entryId);

  // Delete the entry itself
  const { error } = await supabase
    .from('spuitschrift')
    .delete()
    .eq('id', entryId);

  if (error) throw new Error(error.message);
}

// ============================================
// Inventory Movement Functions
// ============================================

export async function getInventoryMovements(): Promise<InventoryMovement[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .order('date', { ascending: false });

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
    .select('*');

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
}

// Keep ActiveParcel as alias for backward compatibility
export type ActiveParcel = SprayableParcel;

/**
 * Fetch all sprayable parcels from v_sprayable_parcels view
 * This is the PREFERRED method - sub-parcels are the unit of work
 * Includes retry logic for transient network errors
 */
export async function getSprayableParcels(): Promise<SprayableParcel[]> {
  console.log('[getSprayableParcels] Fetching from v_sprayable_parcels view...');

  // Use retry for transient network errors
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('v_sprayable_parcels')
      .select('*')
      .order('name');

    if (error) {
      // Throw on fetch errors so withRetry can handle them
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET')) {
        throw new Error(error.message);
      }
      console.error('[getSprayableParcels] Supabase error:', error.message, error.code);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn('[getSprayableParcels] No sprayable parcels found');
      return [];
    }

    console.log(`[getSprayableParcels] Found ${data.length} sprayable parcels`);

    return data.map(item => {
      // Parse geometry if it's a string (Supabase may return it as string)
      let geometry = item.geometry;
      if (geometry && typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch {
          // Keep as-is if parsing fails
        }
      }

      return {
        id: item.id,
        name: item.name,
        area: item.area,
        crop: item.crop || 'Onbekend',
        variety: item.variety,
        parcelId: item.parcel_id,
        parcelName: item.parcel_name,
        location: item.location,
        geometry,
        source: item.source,
        rvoId: item.rvo_id,
      };
    });
  });
}

/**
 * Fetch specific sprayable parcels by ID
 * IDs are sub_parcel IDs (the unit of work)
 * Includes retry logic for transient network errors
 */
export async function getSprayableParcelsById(ids: string[]): Promise<SprayableParcel[]> {
  if (!ids || ids.length === 0) {
    console.log('[getSprayableParcelsById] No IDs provided');
    return [];
  }

  console.log(`[getSprayableParcelsById] Fetching ${ids.length} parcels from view...`);

  // Use retry for transient network errors
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('v_sprayable_parcels')
      .select('*')
      .in('id', ids);

    if (error) {
      // Throw on fetch errors so withRetry can handle them
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET')) {
        throw new Error(error.message);
      }
      console.error('[getSprayableParcelsById] Supabase error:', error.message, error.code);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn(`[getSprayableParcelsById] No parcels found for IDs: ${ids.slice(0, 3).join(', ')}...`);
      return [];
    }

    console.log(`[getSprayableParcelsById] Found ${data.length}/${ids.length} parcels`);

    // Log any missing IDs for debugging
    const foundIds = new Set(data.map((p: any) => p.id));
    const missingIds = ids.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      console.warn(`[getSprayableParcelsById] Missing IDs: ${missingIds.slice(0, 3).join(', ')}${missingIds.length > 3 ? '...' : ''}`);
    }

    return data.map(item => {
      // Parse geometry if it's a string
      let geometry = item.geometry;
      if (geometry && typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch {
          // Keep as-is if parsing fails
        }
      }

      return {
        id: item.id,
        name: item.name,
        area: item.area,
        crop: item.crop || 'Onbekend',
        variety: item.variety,
        parcelId: item.parcel_id,
        parcelName: item.parcel_name,
        location: item.location,
        geometry,
        source: item.source,
        rvoId: item.rvo_id,
      };
    });
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

    // Step 1: Fetch parcels with nested sub_parcels
    // NOTE: Only select columns that exist in sub_parcels table
    const { data: parcelsData, error: parcelsError } = await supabase
      .from('parcels')
      .select('*, sub_parcels(id, parcel_id, crop, variety, area)')
      .order('name');

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

    const { data: allSubParcels, error: subError } = await supabase
      .from('sub_parcels')
      .select('*');

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
    .select('*')
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
    .select('*')
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
    .select('*')
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
}

export async function deleteParcel(parcelId: string): Promise<void> {
  const { error } = await supabase
    .from('parcels')
    .delete()
    .eq('id', parcelId);

  if (error) throw new Error(error.message);
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
      .select('*')
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
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  return {
    ...recursiveToCamelCase(data) as any,
    date: new Date(data.date),
    createdAt: new Date(data.created_at),
  } as LogbookEntry;
}

export async function getLogbookEntries(): Promise<LogbookEntry[]> {
  // Use retry for network resilience
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('logbook')
      .select('*')
      .order('date', { ascending: false });

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
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      // Throw on fetch errors so withRetry can handle them
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET') || error.message?.includes('aborted')) {
        throw new Error(error.message);
      }
      console.error('[getParcelHistoryEntries] Supabase error:', error.message);
      return [];
    }

    if (!data) return [];

    console.log(`[getParcelHistoryEntries] Found ${data.length} entries`);
    return data.map(item => ({
      ...recursiveToCamelCase(item) as any,
      date: new Date(item.date),
    })) as ParcelHistoryEntry[];
  }, 5);
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
  spuitschriftId
}: {
  logbookEntry: LogbookEntry,
  parcels?: Parcel[],
  sprayableParcels?: SprayableParcel[],
  isConfirmation?: boolean,
  spuitschriftId?: string
}) {
  if (!logbookEntry.parsedData) return;

  const userId = await getCurrentUserId();
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
    plots.forEach(subParcelId => {
      const sprayableParcel = sprayableParcels.find(p => p.id === subParcelId);
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
    plots.forEach(parcelId => {
      const parcel = parcels.find(p => p.id === parcelId);
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

  // Insert in batches
  if (historyEntries.length > 0) {
    const { error } = await supabase.from('parcel_history').insert(historyEntries);
    if (error) console.error('Error inserting parcel history:', error);
  }

  if (inventoryEntries.length > 0) {
    const { error } = await supabase.from('inventory_movements').insert(inventoryEntries);
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

  const normalizedSearch = searchTerm.toLowerCase().trim();
  const searchPattern = `%${normalizedSearch}%`;

  console.log(`[searchCtgbProducts] Searching for: "${normalizedSearch}"`);

  return withRetry(async () => {
    // First try exact/partial match on naam
    const { data: nameData, error: nameError } = await supabase
      .from('ctgb_products')
      .select('*')
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
    const { data, error } = await supabase
      .from('ctgb_products')
      .select('*')
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

  const { data, error } = await supabase
    .from('ctgb_products')
    .select('*')
    .eq('toelatingsnummer', toelatingsnummer)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return recursiveToCamelCase(data[0]) as CtgbProduct;
}

export async function getCtgbProductByName(naam: string): Promise<CtgbProduct | null> {
  if (!naam) return null;

  const { data, error } = await supabase
    .from('ctgb_products')
    .select('*')
    .eq('naam', naam)
    .single();

  if (error || !data) return null;

  return recursiveToCamelCase(data) as CtgbProduct;
}

export async function getAllCtgbProducts(): Promise<CtgbProduct[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('ctgb_products')
      .select('*')
      .order('naam')
      .limit(1000);

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
  const { data, error } = await supabase
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

export async function getCtgbProductsBySubstance(substance: string): Promise<CtgbProduct[]> {
  if (!substance) return [];

  const { data, error } = await supabase
    .from('ctgb_products')
    .select('*')
    .contains('werkzame_stoffen', [substance]);

  if (error || !data) return [];

  return data.map(item => recursiveToCamelCase(item) as CtgbProduct);
}

/**
 * Fetch CTGB products by an array of names (case-insensitive)
 * Used for optimized validation - only fetches products mentioned in the draft
 * Includes retry logic for transient network errors
 */
export async function getCtgbProductsByNames(names: string[]): Promise<CtgbProduct[]> {
  if (!names || names.length === 0) return [];

  // Normalize names for case-insensitive search
  const normalizedNames = names.map(n => n.toLowerCase().trim()).filter(Boolean);
  if (normalizedNames.length === 0) return [];

  console.log(`[getCtgbProductsByNames] Fetching ${names.length} products...`);

  // Use retry for transient network errors
  return withRetry(async () => {
    // Use ilike for case-insensitive matching
    const { data, error } = await supabase
      .from('ctgb_products')
      .select('*')
      .or(normalizedNames.map(n => `naam.ilike.%${n}%`).join(','));

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

    console.log(`[getCtgbProductsByNames] Found ${data.length} products for ${names.length} names`);
    return data.map(item => recursiveToCamelCase(item) as CtgbProduct);
  }, 5);
}

export async function getCtgbSyncStats(): Promise<CtgbSyncStats> {
  const { count, error } = await supabase
    .from('ctgb_products')
    .select('*', { count: 'exact', head: true });

  if (error) return { count: 0 };

  // Get the most recent lastSyncedAt
  const { data: lastSyncedData } = await supabase
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
    .select('*')
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
  }));
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
      .select('*')
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
      .select('*')
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
      .select('*')
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
    .select('*')
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
    .select('*')
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
