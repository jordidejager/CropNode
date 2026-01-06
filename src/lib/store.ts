import { collection, addDoc, getDocs, query, orderBy, writeBatch, doc, Firestore, setDoc, Timestamp, getDoc, deleteDoc, where } from 'firebase/firestore';
import type { LogbookEntry, Parcel, ParcelHistoryEntry, Middel, UploadLog, UserPreference, InventoryMovement } from './types';

const LOGBOOK_COLLECTION = 'logbook';
const HISTORY_COLLECTION = 'parcelHistory';
const PRODUCTS_COLLECTION = 'products';
const PARCELS_COLLECTION = 'parcels';
const MIDDELEN_COLLECTION = 'middelen';
const UPLOAD_LOG_COLLECTION = 'uploadLog';
const USER_PREFERENCES_COLLECTION = 'userPreferences';
const INVENTORY_MOVEMENTS_COLLECTION = 'inventoryMovements';

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


// Upload Log Functions
export async function getUploadLogs(db: Firestore): Promise<UploadLog[]> {
    if (!db) return [];
    try {
        const q = query(collection(db, UPLOAD_LOG_COLLECTION), orderBy('uploadDate', 'desc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                uploadDate: (data.uploadDate as Timestamp).toDate(),
            } as UploadLog;
        });
    } catch (e) {
        console.warn("Could not fetch upload logs, collection might not exist yet.", e);
        return [];
    }
}

export async function addUploadLog(db: Firestore, log: Omit<UploadLog, 'id'>): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    await addDoc(collection(db, UPLOAD_LOG_COLLECTION), log);
}


// Middel Functions
export async function getMiddelen(db: Firestore): Promise<Middel[]> {
  if (!db) return [];
  try {
      const q = query(collection(db, MIDDELEN_COLLECTION));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Middel));
  } catch (e) {
      console.warn("Could not fetch middelen, collection might not exist yet.", e);
      return [];
  }
}

export async function getMiddel(db: Firestore, id: string): Promise<Middel | null> {
    if (!db) return null;
    try {
        const docRef = doc(db, MIDDELEN_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Middel;
        }
        return null;
    } catch (e) {
        console.error(`Error fetching middel with id ${id}:`, e);
        return null;
    }
}

export async function addMiddelen(db: Firestore, middelen: Omit<Middel, 'id'>[]): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    if (middelen.length === 0) return;

    const middelenCollection = collection(db, MIDDELEN_COLLECTION);
    
    // First, delete all existing documents in the collection
    await deleteAllMiddelen(db);

    // Now, add the new documents in batches
    const batchSize = 500; // Firestore batch limit
    for (let i = 0; i < middelen.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = middelen.slice(i, i + batchSize);
        chunk.forEach(newMiddel => {
            const docRef = doc(middelenCollection);
            batch.set(docRef, newMiddel);
        });
        await batch.commit();
    }
}


export async function deleteAllMiddelen(db: Firestore): Promise<void> {
    if (!db) throw new Error("Database not initialized");

    const middelenCollection = collection(db, MIDDELEN_COLLECTION);
    const snapshot = await getDocs(middelenCollection);

    if (snapshot.empty) {
        return; // Nothing to delete
    }

    // Firestore allows a maximum of 500 writes per batch
    const batchSize = 500;
    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = snapshot.docs.slice(i, i + batchSize);
        chunk.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }
}


// Parcel Functions
export async function getParcels(db: Firestore): Promise<Parcel[]> {
  if (!db) return [];
  const querySnapshot = await getDocs(query(collection(db, PARCELS_COLLECTION), orderBy('name')));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parcel));
}

export async function addParcel(db: Firestore, parcel: Omit<Parcel, 'id'>): Promise<Parcel> {
  if (!db) throw new Error("Database not initialized");
  const docRef = await addDoc(collection(db, PARCELS_COLLECTION), parcel);
  return { id: docRef.id, ...parcel };
}

export async function updateParcel(db: Firestore, parcel: Parcel): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  const { id, ...data } = parcel;
  if (!id) throw new Error("Parcel ID is missing for update");
  const docRef = doc(db, PARCELS_COLLECTION, id);
  await setDoc(docRef, data, { merge: true });
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
  const dateValue = data.date;
  
  let date;
  if (dateValue instanceof Timestamp) {
    date = dateValue.toDate();
  } else if (typeof dateValue === 'string') {
    date = new Date(dateValue);
  } else {
    date = new Date(); // Fallback
  }

  return {
    id: docSnap.id,
    ...data,
    date,
  } as LogbookEntry;
}

export async function getLogbookEntries(db: Firestore): Promise<LogbookEntry[]> {
  if (!db) return [];
  const q = query(collection(db, LOGBOOK_COLLECTION), orderBy('date', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => {
    const data = doc.data();
    const dateValue = data.date;
    
    let date;
    if (dateValue instanceof Timestamp) {
      date = dateValue.toDate();
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (dateValue && typeof dateValue.toDate === 'function') { // Fallback for different Timestamp-like objects
      date = dateValue.toDate();
    } else {
      date = new Date(); // Fallback
    }

    return { 
      id: doc.id, 
      ...data,
      date,
    } as LogbookEntry;
  });
}

export async function addLogbookEntry(db: Firestore, entry: Omit<LogbookEntry, 'id'>): Promise<LogbookEntry> {
  if (!db) throw new Error("Database not initialized");
  const docRef = await addDoc(collection(db, LOGBOOK_COLLECTION), entry);
  return { id: docRef.id, ...entry };
}

export async function updateLogbookEntry(db: Firestore, entry: LogbookEntry): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    const { id, ...data } = entry;
    const docRef = doc(db, LOGBOOK_COLLECTION, id);
    const dataToSave = { ...data, date: Timestamp.fromDate(new Date(data.date)) };
    await setDoc(docRef, dataToSave, { merge: true });
}

export async function dbDeleteLogbookEntry(db: Firestore, entryId: string): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  // Also delete related history entries
  const historyQuery = query(collection(db, HISTORY_COLLECTION), where("logId", "==", entryId));
  const historySnapshot = await getDocs(historyQuery);
  const batch = writeBatch(db);
  historySnapshot.forEach(doc => {
      batch.delete(doc.ref);
  });
  
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

export async function addParcelHistoryEntries(db: Firestore, entries: Omit<ParcelHistoryEntry, 'id'>[], parcels: Parcel[]) {
  if (!db) throw new Error("Database not initialized");
  const batch = writeBatch(db);

  const logIds = [...new Set(entries.map(e => e.logId))];
  if (logIds.length === 0) return;
  
  // Clear existing history and inventory movements for this log entry to prevent duplication.
  const historyQuery = query(collection(db, HISTORY_COLLECTION), where('logId', 'in', logIds));
  const existingHistoryDocs = await getDocs(historyQuery);
  const existingHistoryIds = existingHistoryDocs.docs.map(d => d.id);
  
  existingHistoryDocs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  if (existingHistoryIds.length > 0) {
      const inventoryQuery = query(collection(db, INVENTORY_MOVEMENTS_COLLECTION), where('referenceId', 'in', existingHistoryIds));
      const existingInventoryDocs = await getDocs(inventoryQuery);
      existingInventoryDocs.forEach(doc => {
          batch.delete(doc.ref);
      });
  }

  // --- Create Parcel History Entries ---
  entries.forEach(entry => {
      const parcel = parcels.find(p => p.id === entry.parcelId);
      if (parcel) {
          const historyDocRef = doc(collection(db, HISTORY_COLLECTION));
          const historyEntry: Omit<ParcelHistoryEntry, 'id'> = {
              ...entry,
              parcelName: parcel.name,
              crop: parcel.crop,
              variety: parcel.variety,
          };
          batch.set(historyDocRef, historyEntry);
      }
  });

  // --- Create Consolidated Inventory Movements ---
  // Group entries by product to create one movement per product.
  const productUsage = entries.reduce((acc, entry) => {
      const parcel = parcels.find(p => p.id === entry.parcelId);
      if (!parcel) return acc;

      if (!acc[entry.product]) {
          acc[entry.product] = {
              totalAmount: 0,
              unit: entry.unit,
              date: entry.date,
              parcelCount: 0,
              parcelIds: new Set<string>()
          };
      }
      acc[entry.product].totalAmount += entry.dosage * parcel.area;
      acc[entry.product].parcelIds.add(parcel.id);
      
      return acc;
  }, {} as Record<string, { totalAmount: number; unit: string; date: Date, parcelCount: number, parcelIds: Set<string> }>);

  Object.entries(productUsage).forEach(([productName, usage]) => {
      if (usage.totalAmount > 0) {
          const inventoryDocRef = doc(collection(db, INVENTORY_MOVEMENTS_COLLECTION));
          const inventoryMovement: Omit<InventoryMovement, 'id'> = {
              productName: productName,
              quantity: -usage.totalAmount,
              unit: usage.unit,
              type: 'usage',
              date: new Date(usage.date),
              description: `Gebruikt op ${usage.parcelIds.size} perce${usage.parcelIds.size > 1 ? 'len' : 'el'}`,
              referenceId: logIds.length === 1 ? logIds[0] : undefined, // Link to log entry if it's a single one
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
        const middelen = await getMiddelen(db);
        const productNames = [...new Set(middelen.map(m => m['Middelnaam']))].filter(Boolean) as string[];
        return productNames;
    } catch (error) {
        console.error("Error fetching products from MiddelMatrix:", error);
        return [];
    }
}
