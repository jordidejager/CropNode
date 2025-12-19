import { collection, addDoc, getDocs, query, orderBy, writeBatch, doc, Firestore, setDoc } from 'firebase/firestore';
import type { LogbookEntry, ParcelHistoryEntry } from './types';
import { middelMatrix } from './data';

const LOGBOOK_COLLECTION = 'logbook';
const HISTORY_COLLECTION = 'parcelHistory';
const PRODUCTS_COLLECTION = 'products';


export async function getLogbookEntries(db: Firestore): Promise<LogbookEntry[]> {
  if (!db) return [];
  const q = query(collection(db, LOGBOOK_COLLECTION), orderBy('timestamp', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LogbookEntry));
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
    await setDoc(docRef, data);
}


export async function getParcelHistoryEntries(db: Firestore): Promise<ParcelHistoryEntry[]> {
  if (!db) return [];
  const q = query(collection(db, HISTORY_COLLECTION), orderBy('date', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ParcelHistoryEntry));
}

export async function addParcelHistoryEntries(db: Firestore, entries: Omit<ParcelHistoryEntry, 'id'>[]) {
  if (!db) throw new Error("Database not initialized");
  const batch = writeBatch(db);
  entries.forEach(entry => {
    const docRef = doc(collection(db, HISTORY_COLLECTION));
    batch.set(docRef, entry);
  });
  await batch.commit();
}

export async function getProducts(db: Firestore): Promise<string[]> {
    if (!db) {
        console.warn("Firestore db is not initialized, falling back to static data for products.");
        return [...new Set(middelMatrix.map(m => m.product))];
    }
    try {
        const querySnapshot = await getDocs(collection(db, PRODUCTS_COLLECTION));
        const products = querySnapshot.docs.map(doc => doc.data().name as string);
        const allProducts = [...new Set([...products, ...middelMatrix.map(m => m.product)])];
        return allProducts;
    } catch (error) {
        console.error("Error fetching products, falling back to static list:", error);
        return [...new Set(middelMatrix.map(m => m.product))];
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
