

export type Parcel = {
  id: string; // Firestore ID
  name: string;
  crop: string;
  variety: string;
  area: number; // in hectares
  location?: { lat: number; lng: number }[]; // Array of coordinates for polygon
};

export type Middel = {
  id: string; // Firestore ID
  product: string;
  crop: string;
  disease?: string;
  maxDosage: number;
  unit: string;
  safetyPeriodDays?: number;
  maxApplicationsPerYear?: number;
  maxDosePerYear?: number;
  minIntervalDays?: number;
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
    activeSubstances?: string;
    pdfUrl?: string; // Made optional
    fileName: string;
};
    