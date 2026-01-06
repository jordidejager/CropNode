export type Parcel = {
  id: string; // Firestore ID
  name: string;
  crop: string;
  variety: string;
  area: number; // in hectares
  location?: { lat: number; lng: number }; // Center point of the parcel
  geometry?: any; // Full GeoJSON geometry for drawing
};

export type Middel = {
  id: string; // Firestore ID
  [key: string]: any; // Flexible structure to match any Excel column
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

export type UploadLog = {
    id: string; // Firestore ID
    productName: string;
    uploadDate: Date;
    admissionNumber?: string;
    labelVersion?: string;
    prescriptionDate?: string;
    activeSubstances: string;
    fileName: string;
};

export type CtgbMiddel = {
    id?: string; // Firestore ID, optional here but present in DB
    toelatingsnummer: string;
    naam: string;
    status: string;
    werkzameStoffen: string;
};

export type UserPreference = {
  id: string; // Firestore ID, same as alias
  alias: string; // e.g., 'captan'
  preferred: string; // e.g., 'Captan 80 WDG'
}

export type InventoryMovement = {
    id: string;
    productName: string;
    quantity: number;
    unit: string;
    type: 'addition' | 'usage' | 'correction';
    date: Date;
    description: string;
    referenceId?: string; // e.g., logId or a manual entry ID
}
