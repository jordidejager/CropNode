export type Parcel = {
  id: string;
  name: string;
  crop: string;
  variety: string;
  area: number; // in hectares
};

export type Middel = {
  product: string;
  crop: string;
  disease?: string;
  maxDosage: number;
  unit: string;
};

export type LogStatus = 'Nieuw' | 'Analyseren...' | 'Te Controleren' | 'Akkoord' | 'Fout';

export type ProductEntry = {
    product: string;
    dosage: number;
    unit: string;
};

export type ParsedSprayData = {
  plots: string[];
  product: string; // Keep for initial parsing structure
  dosage: number; // Keep for initial parsing structure
  unit: string; // Keep for initial parsing structure
  products?: ProductEntry[]; // For multi-product editing
}

export type LogbookEntry = {
  id: number;
  rawInput: string;
  status: LogStatus;
  timestamp: Date;
  parsedData?: ParsedSprayData | (Omit<ParsedSprayData, 'product'|'dosage'|'unit'> & { products: ProductEntry[] });
  validationMessage?: string;
};

export type ParcelHistoryEntry = {
  id: number;
  logId: number;
  parcelId: string;
  parcelName: string;
  crop: string;
  variety: string;
  product: string;
  dosage: number;
  unit: string;
  date: Date;
};
