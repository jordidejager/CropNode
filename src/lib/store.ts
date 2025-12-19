import type { LogbookEntry, ParcelHistoryEntry } from './types';

// Simple in-memory store
let logbookEntries: LogbookEntry[] = [];
let parcelHistoryEntries: ParcelHistoryEntry[] = [];
let products: string[] = ['Captan', 'Regalis Plus', 'Zwavel', 'Koper'];
let historyIdCounter = 0;

// Initialize with some demo data
const initialLog: LogbookEntry = {
    id: 1,
    rawInput: "Gisteren alle Elstar gespoten met 1.8kg Captan.",
    status: 'Akkoord',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    parsedData: {
        plots: ["P-1002", "P-2001"],
        product: "Captan",
        dosage: 1.8,
        unit: "kg",
    }
};

const initialHistory: ParcelHistoryEntry[] = [
    { id: 1, logId: 1, parcelId: 'P-1002', parcelName: 'Achter huis', crop: 'Appel', variety: 'Elstar', product: 'Captan', dosage: 1.8, unit: 'kg', date: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    { id: 2, logId: 1, parcelId: 'P-2001', parcelName: 'Elstar jong', crop: 'Appel', variety: 'Elstar', product: 'Captan', dosage: 1.8, unit: 'kg', date: new Date(Date.now() - 24 * 60 * 60 * 1000) }
];

if (process.env.NODE_ENV !== 'production') {
    if (logbookEntries.length === 0) {
        logbookEntries.push(initialLog);
    }
    if (parcelHistoryEntries.length === 0) {
        parcelHistoryEntries.push(...initialHistory);
        historyIdCounter = initialHistory.length;
    }
}


export function getLogbookEntries(): LogbookEntry[] {
  return [...logbookEntries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function addLogbookEntry(entry: LogbookEntry) {
  logbookEntries.unshift(entry);
}

export function getParcelHistoryEntries(): ParcelHistoryEntry[] {
  return [...parcelHistoryEntries].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function addParcelHistoryEntries(entries: Omit<ParcelHistoryEntry, 'id'>[]) {
  const newEntries = entries.map(e => ({ ...e, id: ++historyIdCounter, ...e }));
  parcelHistoryEntries.unshift(...newEntries);
}

export function getProducts(): string[] {
    return [...products];
}

export function addProduct(product: string) {
    products.push(product);
}
