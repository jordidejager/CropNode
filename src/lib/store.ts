import { collection, addDoc, getDocs, query, orderBy, writeBatch, doc, Firestore, setDoc, Timestamp, getDoc, deleteDoc, where } from 'firebase/firestore';
import type { LogbookEntry, Parcel, ParcelHistoryEntry, Middel, UploadLog } from './types';
import { staticProductsData } from './data';

const LOGBOOK_COLLECTION = 'logbook';
const HISTORY_COLLECTION = 'parcelHistory';
const PRODUCTS_COLLECTION = 'products';
const PARCELS_COLLECTION = 'parcels';
const MIDDELEN_COLLECTION = 'middelen';
const UPLOAD_LOG_COLLECTION = 'uploadLog';


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
      const querySnapshot = await getDocs(query(collection(db, MIDDELEN_COLLECTION), orderBy('product')));
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Middel));
  } catch (e) {
      console.warn("Could not fetch middelen, collection might not exist yet.", e);
      return [];
  }
}

export async function addMiddelen(db: Firestore, middelen: Omit<Middel, 'id'>[]): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    if (middelen.length === 0) return;

    const batch = writeBatch(db);
    const productsToUpdate = [...new Set(middelen.map(m => m.product))];

    // Find and delete all existing entries for the products being updated to avoid duplicates
    if (productsToUpdate.length > 0) {
        const q = query(collection(db, MIDDELEN_COLLECTION), where("product", "in", productsToUpdate));
        const existingDocsSnapshot = await getDocs(q);
        existingDocsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
    }
    
    // Add the new entries
    middelen.forEach(newMiddel => {
        const docRef = doc(collection(db, MIDDELEN_COLLECTION));
        batch.set(docRef, newMiddel);
    });
    
    await batch.commit();
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
    await setDoc(docRef, data, { merge: true });
}

export async function deleteLogbookEntry(db: Firestore, entryId: string): Promise<void> {
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
  entries.forEach(entry => {
    const parcel = parcels.find(p => p.id === entry.parcelId);
    if (parcel) {
        const docRef = doc(collection(db, HISTORY_COLLECTION));
        const historyEntry: Omit<ParcelHistoryEntry, 'id'> = {
            ...entry,
            parcelName: parcel.name,
            crop: parcel.crop,
            variety: parcel.variety,
        };
        batch.set(docRef, historyEntry);
    }
  });
  await batch.commit();
}


// Product Functions
export async function getProducts(db: Firestore): Promise<string[]> {
    const middelen = await getMiddelen(db);
    const staticProducts = [...new Set(middelen.map(m => m.product))];
    if (!db) {
        return staticProducts;
    }
    try {
        const querySnapshot = await getDocs(collection(db, PRODUCTS_COLLECTION));
        const dbProducts = querySnapshot.docs.map(doc => doc.data().name as string);
        const allProducts = [...new Set([...dbProducts, ...staticProducts, ...staticProductsData])];
        return allProducts;
    } catch (error) {
        console.error("Error fetching products, falling back to static list:", error);
        return staticProducts;
    }
}

export async function addProduct(db: Firestore, product: string) {
    if (!db) return;
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    const q = query(productsRef);
    const querySnapshot = await getDocs(q);
    const existingProducts = querySnapshot.docs.map(d => d.data().name.toLowerCase());
    
    if (!existingProducts.includes(product.toLowerCase())) {
        console.log(`Adding new product "${product}" to the database.`);
        await addDoc(productsRef, { name: product });
    }
}
