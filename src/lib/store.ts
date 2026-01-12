
import { collection, addDoc, getDocs, query, orderBy, writeBatch, doc, Firestore, setDoc, Timestamp, getDoc, deleteDoc, where, collectionGroup, QueryConstraint } from 'firebase/firestore';
import type { LogbookEntry, Parcel, ParcelHistoryEntry, UserPreference, InventoryMovement, CtgbProduct, CtgbSyncStats, SpuitschriftEntry } from './types';

const LOGBOOK_COLLECTION = 'logbook';
const HISTORY_COLLECTION = 'parcelHistory';
const PARCELS_COLLECTION = 'parcels';
const USER_PREFERENCES_COLLECTION = 'userPreferences';
const INVENTORY_MOVEMENTS_COLLECTION = 'inventoryMovements';
const CTGB_PRODUCTS_COLLECTION = 'ctgb_products';
const SPUITSCHRIFT_COLLECTION = 'spuitschrift';


// Spuitschrift Functions
export async function getSpuitschriftEntry(db: Firestore, id: string): Promise<SpuitschriftEntry | null> {
  if (!db) return null;
  const docRef = doc(db, SPUITSCHRIFT_COLLECTION, id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    date: (data.date as Timestamp).toDate(),
    createdAt: (data.createdAt as Timestamp)?.toDate() || (data.date as Timestamp).toDate(),
  } as SpuitschriftEntry;
}


export async function getSpuitschriftEntries(db: Firestore): Promise<SpuitschriftEntry[]> {
  if (!db) return [];
  try {
    const q = query(collection(db, SPUITSCHRIFT_COLLECTION), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: (data.date as Timestamp).toDate(),
        createdAt: (data.createdAt as Timestamp)?.toDate() || (data.date as Timestamp).toDate(),
      } as SpuitschriftEntry;
    });
  } catch (e) {
    console.warn("Could not fetch spuitschrift entries, collection might not exist yet.", e);
    return [];
  }
}

export async function addSpuitschriftEntry(db: Firestore, entry: Omit<SpuitschriftEntry, 'id' | 'spuitschriftId'>): Promise<SpuitschriftEntry> {
  if (!db) throw new Error("Database not initialized");
  const docRef = await addDoc(collection(db, SPUITSCHRIFT_COLLECTION), {
    ...entry,
    date: Timestamp.fromDate(new Date(entry.date)),
    createdAt: Timestamp.fromDate(new Date(entry.createdAt)),
  });
  return { id: docRef.id, ...entry } as SpuitschriftEntry;
}

export async function deleteSpuitschriftEntry(db: Firestore, entryId: string): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  
  const batch = writeBatch(db);
  
  // Delete the entry itself
  const entryRef = doc(db, SPUITSCHRIFT_COLLECTION, entryId);
  batch.delete(entryRef);

  // Delete related parcel history
  const historyQuery = query(collection(db, HISTORY_COLLECTION), where("spuitschriftId", "==", entryId));
  const historySnapshot = await getDocs(historyQuery);
  historySnapshot.forEach(doc => batch.delete(doc.ref));
  
  // Delete related inventory movements
  const inventoryQuery = query(collection(db, INVENTORY_MOVEMENTS_COLLECTION), where("referenceId", "==", entryId));
  const inventorySnapshot = await getDocs(inventoryQuery);
  inventorySnapshot.forEach(doc => batch.delete(doc.ref));

  await batch.commit();
}


// Inventory Movement Functions
export async function getInventoryMovements(db: Firestore): Promise<InventoryMovement[]> {
  if (!db) return [];
  try {
    const q = query(collection(db, INVENTORY_MOVEMENTS_COLLECTION), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: (data.date as Timestamp).toDate(),
      } as InventoryMovement;
    });
  } catch (e) {
    console.warn("Could not fetch inventory movements, collection might not exist yet.", e);
    return [];
  }
}

export async function addInventoryMovement(db: Firestore, movement: Omit<InventoryMovement, 'id'>): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  await addDoc(collection(db, INVENTORY_MOVEMENTS_COLLECTION), {
    ...movement,
    date: Timestamp.fromDate(new Date(movement.date)),
  });
}


// User Preference Functions
export async function getUserPreferences(db: Firestore): Promise<UserPreference[]> {
    if (!db) return [];
    try {
        const querySnapshot = await getDocs(collection(db, USER_PREFERENCES_COLLECTION));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserPreference));
    } catch (e) {
        console.warn("Could not fetch user preferences, collection might not exist yet.", e);
        return [];
    }
}

export async function setUserPreference(db: Firestore, preference: Omit<UserPreference, 'id'>): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    // Use the alias as the document ID to easily update/overwrite it.
    const docId = preference.alias.replace(/\s+/g, '-').toLowerCase();
    const docRef = doc(db, USER_PREFERENCES_COLLECTION, docId);
    await setDoc(docRef, preference, { merge: true });
}

// Parcel Functions
export async function getParcels(db: Firestore): Promise<Parcel[]> {
  if (!db) return [];
  const querySnapshot = await getDocs(query(collection(db, PARCELS_COLLECTION), orderBy('name')));
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    // Parse geometry back from JSON string if stored as string
    if (data.geometry && typeof data.geometry === 'string') {
      try {
        data.geometry = JSON.parse(data.geometry);
      } catch (e) {
        console.warn('Failed to parse geometry for parcel', doc.id);
      }
    }
    return { id: doc.id, ...data } as Parcel;
  });
}

export async function addParcel(db: Firestore, parcel: Omit<Parcel, 'id'>): Promise<Parcel> {
  if (!db) throw new Error("Database not initialized");
  // Convert geometry to JSON string to avoid Firestore nested array limitation
  const dataToSave = { ...parcel };
  if (dataToSave.geometry && typeof dataToSave.geometry === 'object') {
    dataToSave.geometry = JSON.stringify(dataToSave.geometry);
  }
  const docRef = await addDoc(collection(db, PARCELS_COLLECTION), dataToSave);
  return { id: docRef.id, ...parcel };
}

export async function updateParcel(db: Firestore, parcel: Parcel): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  const { id, ...data } = parcel;
  if (!id) throw new Error("Parcel ID is missing for update");
  // Convert geometry to JSON string to avoid Firestore nested array limitation
  const dataToSave = { ...data };
  if (dataToSave.geometry && typeof dataToSave.geometry === 'object') {
    dataToSave.geometry = JSON.stringify(dataToSave.geometry);
  }
  const docRef = doc(db, PARCELS_COLLECTION, id);
  await setDoc(docRef, dataToSave, { merge: true });
}

export async function deleteParcel(db: Firestore, parcelId: string): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  await deleteDoc(doc(db, PARCELS_COLLECTION, parcelId));
}


// Logbook Functions
export async function getLogbookEntry(db: Firestore, id: string): Promise<LogbookEntry | null> {
  if (!db) return null;
  const docRef = doc(db, LOGBOOK_COLLECTION, id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }
  const data = docSnap.data();
  
  return {
    id: docSnap.id,
    ...data,
    date: (data.date as Timestamp).toDate(),
    createdAt: (data.createdAt as Timestamp)?.toDate() || (data.date as Timestamp).toDate(),
  } as LogbookEntry;
}

export async function getLogbookEntries(db: Firestore): Promise<LogbookEntry[]> {
  if (!db) return [];
  const q = query(collection(db, LOGBOOK_COLLECTION), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    
    return { 
      id: doc.id, 
      ...data,
      date: (data.date as Timestamp).toDate(),
      createdAt: (data.createdAt as Timestamp)?.toDate() || (data.date as Timestamp).toDate(),
    } as LogbookEntry;
  });
}

export async function addLogbookEntry(db: Firestore, entry: Omit<LogbookEntry, 'id'>): Promise<LogbookEntry> {
  if (!db) throw new Error("Database not initialized");
  const docRef = await addDoc(collection(db, LOGBOOK_COLLECTION), {
      ...entry,
      date: Timestamp.fromDate(entry.date),
      createdAt: Timestamp.fromDate(entry.createdAt),
  });
  return { id: docRef.id, ...entry };
}

export async function updateLogbookEntry(db: Firestore, entry: LogbookEntry): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    const { id, ...data } = entry;
    const dataToSave = { 
        ...data, 
        date: Timestamp.fromDate(new Date(data.date)),
        createdAt: Timestamp.fromDate(new Date(data.createdAt))
    };
    if (!id) {
        // This case should ideally not happen if types are correct
        console.error("updateLogbookEntry called without an ID", entry);
        throw new Error("Logbook entry ID is missing");
    }
    const docRef = doc(db, LOGBOOK_COLLECTION, id);
    await setDoc(docRef, dataToSave, { merge: true });
}

export async function dbDeleteLogbookEntry(db: Firestore, entryId: string): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  // Also delete related history entries
  const historyQuery = query(collection(db, HISTORY_COLLECTION), where("logId", "==", entryId));
  const inventoryQuery = query(collection(db, INVENTORY_MOVEMENTS_COLLECTION), where('referenceId', '==', entryId));
  
  const [existingHistoryDocs, existingInventoryDocs] = await Promise.all([
      getDocs(historyQuery),
      getDocs(inventoryQuery)
  ]);

  const batch = writeBatch(db);
  existingHistoryDocs.forEach(doc => batch.delete(doc.ref));
  existingInventoryDocs.forEach(doc => batch.delete(doc.ref));
  
  const logbookDocRef = doc(db, LOGBOOK_COLLECTION, entryId);
  batch.delete(logbookDocRef);
  
  await batch.commit();
}

export async function dbDeleteLogbookEntries(db: Firestore, entryIds: string[]): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    if (entryIds.length === 0) return;

    const batch = writeBatch(db);

    // Delete related history entries
    // Firestore 'in' query is limited to 30 values. We need to batch this.
    for (let i = 0; i < entryIds.length; i += 30) {
        const chunkIds = entryIds.slice(i, i + 30);
        const historyQuery = query(collection(db, HISTORY_COLLECTION), where("logId", "in", chunkIds));
        const historySnapshot = await getDocs(historyQuery);
        historySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
    }

    // Delete logbook entries
    entryIds.forEach(id => {
        const logbookDocRef = doc(db, LOGBOOK_COLLECTION, id);
        batch.delete(logbookDocRef);
    });

    await batch.commit();
}


// Parcel History Functions
export async function getParcelHistoryEntries(db: Firestore): Promise<ParcelHistoryEntry[]> {
  if (!db) return [];
  const q = query(collection(db, HISTORY_COLLECTION), orderBy('date', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    const dateValue = data.date;

    let date;
    if (dateValue instanceof Timestamp) {
      date = dateValue.toDate();
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (dateValue && typeof dateValue.toDate === 'function') {
      date = dateValue.toDate();
    } else {
      date = new Date(); // Fallback
    }

    return {
       id: doc.id,
       ...data,
       date,
    } as ParcelHistoryEntry
  });
}

/**
 * Get parcel history for a specific parcel within a season (date range)
 * Used by ValidationService for cumulative active substance tracking
 *
 * NOTE: Requires Firestore composite index on parcelHistory: (parcelId, date)
 */
export async function getParcelSeasonHistory(
  db: Firestore,
  parcelId: string,
  seasonStart: Date,
  seasonEnd: Date
): Promise<ParcelHistoryEntry[]> {
  if (!db) return [];

  try {
    const q = query(
      collection(db, HISTORY_COLLECTION),
      where('parcelId', '==', parcelId),
      where('date', '>=', Timestamp.fromDate(seasonStart)),
      where('date', '<=', Timestamp.fromDate(seasonEnd)),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const dateValue = data.date;

      let date;
      if (dateValue instanceof Timestamp) {
        date = dateValue.toDate();
      } else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (dateValue && typeof dateValue.toDate === 'function') {
        date = dateValue.toDate();
      } else {
        date = new Date();
      }

      return {
        id: doc.id,
        ...data,
        date,
      } as ParcelHistoryEntry;
    });
  } catch (error) {
    console.error(`[store] Error fetching parcel season history for ${parcelId}:`, error);
    return [];
  }
}

/**
 * Get season history for multiple parcels at once (batch query)
 * More efficient than calling getParcelSeasonHistory multiple times
 */
export async function getBatchParcelSeasonHistory(
  db: Firestore,
  parcelIds: string[],
  seasonStart: Date,
  seasonEnd: Date
): Promise<Map<string, ParcelHistoryEntry[]>> {
  if (!db || parcelIds.length === 0) return new Map();

  const resultMap = new Map<string, ParcelHistoryEntry[]>();

  // Initialize empty arrays for all parcel IDs
  for (const id of parcelIds) {
    resultMap.set(id, []);
  }

  try {
    // Firestore 'in' query is limited to 30 values, so we batch
    for (let i = 0; i < parcelIds.length; i += 30) {
      const chunk = parcelIds.slice(i, i + 30);

      const q = query(
        collection(db, HISTORY_COLLECTION),
        where('parcelId', 'in', chunk),
        where('date', '>=', Timestamp.fromDate(seasonStart)),
        where('date', '<=', Timestamp.fromDate(seasonEnd)),
        orderBy('date', 'desc')
      );

      const querySnapshot = await getDocs(q);

      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const parcelId = data.parcelId as string;
        const dateValue = data.date;

        let date;
        if (dateValue instanceof Timestamp) {
          date = dateValue.toDate();
        } else if (typeof dateValue === 'string') {
          date = new Date(dateValue);
        } else if (dateValue && typeof dateValue.toDate === 'function') {
          date = dateValue.toDate();
        } else {
          date = new Date();
        }

        const entry: ParcelHistoryEntry = {
          id: docSnap.id,
          ...data,
          date,
        } as ParcelHistoryEntry;

        resultMap.get(parcelId)?.push(entry);
      }
    }
  } catch (error) {
    console.error('[store] Error fetching batch parcel season history:', error);
  }

  return resultMap;
}

export async function addParcelHistoryEntries(db: Firestore, { logbookEntry, parcels, isConfirmation = false, spuitschriftId }: { logbookEntry: LogbookEntry, parcels: Parcel[], isConfirmation?: boolean, spuitschriftId?: string }) {
    if (!db) throw new Error("Database not initialized");
    if (!logbookEntry.parsedData) return;

    const batch = writeBatch(db);
    const { id: logId, parsedData } = logbookEntry;
    const { plots, products } = parsedData;

    if (!isConfirmation) {
        const historyQuery = query(collection(db, HISTORY_COLLECTION), where('logId', '==', logId));
        const inventoryQuery = query(collection(db, INVENTORY_MOVEMENTS_COLLECTION), where('referenceId', '==', logId));
        
        const [existingHistoryDocs, existingInventoryDocs] = await Promise.all([
            getDocs(historyQuery),
            getDocs(inventoryQuery)
        ]);

        existingHistoryDocs.forEach(doc => batch.delete(doc.ref));
        existingInventoryDocs.forEach(doc => batch.delete(doc.ref));
    }


    const productUsage: Record<string, { totalAmount: number; unit: string; parcelIds: Set<string> }> = {};

    plots.forEach(parcelId => {
        const parcel = parcels.find(p => p.id === parcelId);
        if (!parcel) return;

        products.forEach(productEntry => {
            if (isConfirmation && spuitschriftId) {
                 const historyDocRef = doc(collection(db, HISTORY_COLLECTION));
                const historyEntry: Omit<ParcelHistoryEntry, 'id'> = {
                    logId: logbookEntry.originalLogbookId || logId,
                    spuitschriftId: spuitschriftId,
                    parcelId: parcel.id,
                    parcelName: parcel.name,
                    crop: parcel.crop,
                    variety: parcel.variety,
                    product: productEntry.product,
                    dosage: productEntry.dosage,
                    unit: productEntry.unit,
                    date: new Date(logbookEntry.date),
                };
                batch.set(historyDocRef, historyEntry);
            }
            
            if (!productUsage[productEntry.product]) {
                productUsage[productEntry.product] = { totalAmount: 0, unit: productEntry.unit, parcelIds: new Set() };
            }
            if(parcel.area) {
                productUsage[productEntry.product].totalAmount += productEntry.dosage * parcel.area;
            }
            productUsage[productEntry.product].parcelIds.add(parcelId);
        });
    });

    Object.entries(productUsage).forEach(([productName, usage]) => {
        if (usage.totalAmount > 0) {
            const inventoryDocRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
            const inventoryMovement: Omit<InventoryMovement, 'id'> = {
                productName,
                quantity: -usage.totalAmount, // Negative for usage
                unit: usage.unit,
                type: 'usage',
                date: new Date(logbookEntry.date),
                description: `Gebruikt op ${usage.parcelIds.size} perce${usage.parcelIds.size > 1 ? 'len' : 'el'}`,
                referenceId: spuitschriftId, 
            };
            batch.set(inventoryDocRef, inventoryMovement);
        }
    });

    await batch.commit();
}


// Product Functions
export async function getProducts(db: Firestore): Promise<string[]> {
    if (!db) return [];
    try {
        const products = await getAllCtgbProducts(db);
        const productNames = [...new Set(products.map(p => p.naam))].filter(Boolean) as string[];
        return productNames;
    } catch (error) {
        console.error("Error fetching products from CTGB database:", error);
        return [];
    }
}


// ============================================
// CTGB Products Functions (synced from MST API)
// ============================================

/**
 * Search CTGB products by keyword using the searchKeywords array
 * This uses Firestore's array-contains for efficient partial text matching
 */
export async function searchCtgbProducts(db: Firestore, searchTerm: string): Promise<CtgbProduct[]> {
    if (!db) return [];
    if (!searchTerm || searchTerm.length < 2) return [];

    try {
        const normalizedSearch = searchTerm.toLowerCase().trim();
        const q = query(
            collection(db, CTGB_PRODUCTS_COLLECTION),
            where('searchKeywords', 'array-contains', normalizedSearch)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ ...doc.data() } as CtgbProduct));
    } catch (error) {
        console.error("Error searching CTGB products:", error);
        return [];
    }
}

/**
 * Get a single CTGB product by toelatingsnummer
 */
export async function getCtgbProductByNumber(db: Firestore, toelatingsnummer: string): Promise<CtgbProduct | null> {
    if (!db || !toelatingsnummer) return null;

    try {
        const docRef = doc(db, CTGB_PRODUCTS_COLLECTION, toelatingsnummer);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data() as CtgbProduct;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching CTGB product ${toelatingsnummer}:`, error);
        return null;
    }
}

/**
 * Get a CTGB product by exact name match
 */
export async function getCtgbProductByName(db: Firestore, naam: string): Promise<CtgbProduct | null> {
    if (!db || !naam) return null;

    try {
        const q = query(
            collection(db, CTGB_PRODUCTS_COLLECTION),
            where('naam', '==', naam)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            return snapshot.docs[0].data() as CtgbProduct;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching CTGB product by name ${naam}:`, error);
        return null;
    }
}

/**
 * Get all CTGB products (use with caution - can be large)
 */
export async function getAllCtgbProducts(db: Firestore): Promise<CtgbProduct[]> {
    if (!db) return [];

    try {
        const q = query(collection(db, CTGB_PRODUCTS_COLLECTION), orderBy('naam'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ ...doc.data() } as CtgbProduct));
    } catch (error) {
        console.error("Error fetching all CTGB products:", error);
        return [];
    }
}

/**
 * Get CTGB products by werkzame stof (active substance)
 */
export async function getCtgbProductsBySubstance(db: Firestore, substance: string): Promise<CtgbProduct[]> {
    if (!db || !substance) return [];

    try {
        const q = query(
            collection(db, CTGB_PRODUCTS_COLLECTION),
            where('werkzameStoffen', 'array-contains', substance)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ ...doc.data() } as CtgbProduct));
    } catch (error) {
        console.error(`Error fetching CTGB products by substance ${substance}:`, error);
        return [];
    }
}

/**
 * Get the count and last sync date of CTGB products
 */
export async function getCtgbSyncStats(db: Firestore): Promise<CtgbSyncStats> {
    if (!db) return { count: 0 };

    try {
        const snapshot = await getDocs(collection(db, CTGB_PRODUCTS_COLLECTION));
        if (snapshot.empty) return { count: 0 };

        // Get the most recent lastSyncedAt by querying for the last synced item
        const lastSyncedQuery = query(collection(db, CTGB_PRODUCTS_COLLECTION), orderBy('lastSyncedAt', 'desc'), where('lastSyncedAt', '!=', null));
        const lastSyncedSnapshot = await getDocs(lastSyncedQuery);
        
        let lastSynced: string | undefined;
        if (!lastSyncedSnapshot.empty) {
            lastSynced = lastSyncedSnapshot.docs[0].data().lastSyncedAt;
        }

        return { count: snapshot.size, lastSynced };
    } catch (error) {
        console.warn("Could not fetch CTGB sync stats. This might be because the collection is empty or the 'lastSyncedAt' field is missing on some documents.", error);
        // Fallback for when the query fails (e.g. no index)
        try {
            const snapshot = await getDocs(collection(db, CTGB_PRODUCTS_COLLECTION));
            return { count: snapshot.size };
        } catch {
            return { count: 0 };
        }
    }
}
