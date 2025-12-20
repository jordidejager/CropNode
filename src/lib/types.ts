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
  products: ProductEntry[];
}

export type LogbookEntry = {
  id: string; // Firestore ID
  rawInput: string;
  status: LogStatus;
  date: Date;
  parsedData?: ParsedSprayData;
  validationMessage?: string;
};

export type ParcelHistoryEntry = {
  id: string; // Firestore ID
  logId: string;
  parcelId: string;
  parcelName: string;
  crop: string;
  variety: string;
  product: string;
  dosage: number;
  unit: string;
  date: Date;
};
