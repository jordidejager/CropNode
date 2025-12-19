import { collection, addDoc, getDocs, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/firebase/client'; // Zorg ervoor dat dit pad correct is
import type { LogbookEntry, ParcelHistoryEntry } from './types';
import { middelMatrix } from './data';

const LOGBOOK_COLLECTION = 'logbook';
const HISTORY_COLLECTION = 'parcelHistory';
const PRODUCTS_COLLECTION = 'products';


export async function getLogbookEntries(): Promise<LogbookEntry[]> {
  if (!db) return [];
  const q = query(collection(db, LOGBOOK_COLLECTION), orderBy('timestamp', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LogbookEntry));
}

export async function addLogbookEntry(entry: Omit<LogbookEntry, 'id'>): Promise<LogbookEntry> {
  if (!db) throw new Error("Database not initialized");
  const docRef = await addDoc(collection(db, LOGBOOK_COLLECTION), entry);
  return { id: docRef.id, ...entry };
}

export async function updateLogbookEntry(entry: LogbookEntry): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    const { id, ...data } = entry;
    const docRef = doc(db, LOGBOOK_COLLECTION, id);
    await writeBatch(db).set(docRef, data).commit();
}


export async function getParcelHistoryEntries(): Promise<ParcelHistoryEntry[]> {
  if (!db) return [];
  const q = query(collection(db, HISTORY_COLLECTION), orderBy('date', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ParcelHistoryEntry));
}

export async function addParcelHistoryEntries(entries: Omit<ParcelHistoryEntry, 'id'>[]) {
  if (!db) throw new Error("Database not initialized");
  const batch = writeBatch(db);
  entries.forEach(entry => {
    const docRef = doc(collection(db, HISTORY_COLLECTION));
    batch.set(docRef, entry);
  });
  await batch.commit();
}

export async function getProducts(): Promise<string[]> {
    // For now, we get them from the middelMatrix, but this could be a separate collection
    return [...new Set(middelMatrix.map(m => m.product))];
}

export async function addProduct(product: string) {
    // This is a placeholder. In a real app, you might want to add new products to a 'products' collection.
    // For now, we check if it's in the middelMatrix. If not, it's "new" but not persisted anywhere separately.
    if (!middelMatrix.find(p => p.product.toLowerCase() === product.toLowerCase())) {
        console.log(`New product "${product}" used. Consider adding it to the middelMatrix.`);
    }
}
