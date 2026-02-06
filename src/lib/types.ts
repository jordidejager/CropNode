
export type ParcelSource = "MANUAL" | "RVO_IMPORT";

export type Parcel = {
  id: string;
  name: string;
  area: number; // Total area in hectares
  location?: { lat: number; lng: number };
  geometry?: any;
  source?: ParcelSource;
  rvoId?: string;
  subParcels?: SubParcel[]; // Added for nested structure
  // Commonly used fields (may come from primary subParcel)
  variety?: string;
  crop?: string;
};

export type WeightedValue<T> = {
  value: T;
  percentage: number; // 0-100
};

export type SubParcel = {
  id: string;
  parcelId: string;
  name?: string; // e.g. "V-haag", "Nieuw"
  crop: string;
  variety: string;
  varietyMutant?: string; // Legacy/Fallback
  rootstock?: string;      // Legacy/Fallback
  plantingYear?: number;   // Legacy/Fallback

  // New Weighted Structures
  mutants?: WeightedValue<string>[];
  rootstocks?: WeightedValue<string>[];
  interstocks?: WeightedValue<string>[];
  plantingYears?: WeightedValue<number>[];
  plantingDistances?: WeightedValue<{ row: number; tree: number }>[];

  plantingDistanceRow?: number; // legacy
  plantingDistanceTree?: number; // legacy
  area: number; // hectare
  irrigationType: string; // Ja met fertigatie, Ja, Nee, Deels
  irrigationPercentage?: number;
  frostProtectionType?: string; // Ja, Nee, Deels
  frostProtectionPercentage?: number;
  soilSamples?: SoilSample[];
  productionHistory?: ProductionHistory[];
  createdAt?: Date;
  updatedAt?: Date;
};

export type SoilValueTrend = {
  date: Date;
  value: number;
};

export type SoilSample = {
  id: string;
  subParcelId: string;
  sampleDate: Date;
  nTotal?: number;
  pAvailable?: number;
  kValue?: number;
  organicMatter?: number;
  ph?: number;
  pdfUrl?: string;
  rawData?: any;
  createdAt: Date;
};

export type ProductionHistory = {
  id: string;
  subParcelId: string;
  year: number;
  tonnage: number;
  sizeDistribution?: Record<string, number>; // e.g. {"70-75": 20, "75-80": 50}
  createdAt: Date;
};

// === RVO/PDOK Types ===

export type RvoParcelProperties = {
  id: string;
  gewas: string;
  gewascode: number;
  jaar: number;
  status: string;
  category: string;
};

export type RvoParcel = {
  type: "Feature";
  id: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: RvoParcelProperties;
};

export type RvoApiResponse = {
  type: "FeatureCollection";
  features: RvoParcel[];
  numberMatched?: number;
  numberReturned?: number;
};

export type AddressSuggestion = {
  id: string;
  weergavenaam: string;
  centroide_ll: string; // "POINT(lng lat)"
};

export type LogStatus = 'Nieuw' | 'Analyseren...' | 'Te Controleren' | 'Akkoord' | 'Fout' | 'Waarschuwing' | 'Afgekeurd';

export type ProductEntry = {
  product: string;
  dosage: number;
  unit: string;
  targetReason?: string; // Doelorganisme uit gebruikersinvoer (bijv. "luis", "schurft")
  doelorganisme?: string; // Geselecteerd doelorganisme uit CTGB voorschriften
};

export type ParsedSprayData = {
  plots: string[];
  products: ProductEntry[];
  assumedTargets?: Record<string, string>;
}

// ============================================
// Grouped Registration Types (for complex inputs with variations)
// ============================================

/**
 * Individuele registratie unit binnen een groep.
 * Elke unit representeert een specifieke combinatie van percelen en producten.
 * Bijv. "Alle appels (zonder Kanzi)" of "Kanzi met extra Score"
 */
export type SprayRegistrationUnit = {
  id: string;
  plots: string[];           // Specifieke percelen voor deze unit
  products: ProductEntry[];  // Specifieke producten/doseringen
  label?: string;            // UI label, bijv. "Appels (zonder Kanzi)"
  status: 'pending' | 'confirmed';  // Individuele status per unit
  date?: Date;               // Optionele datum per unit (overschrijft group.date voor date-split scenarios)
};

/**
 * Punt 4: Confidence breakdown voor transparantie naar gebruiker
 */
export type ConfidenceBreakdown = {
  intentClassification: number;    // 0-1: Hoe zeker zijn we van het intent type
  productResolution: number;       // 0-1: Laagste confidence van alle product aliassen
  parcelResolution: number;        // 0-1: Exacte match of fuzzy guess?
  overall: number;                 // 0-1: Minimum van bovenstaande (zwakste schakel)
  uncertainFields?: string[];      // Velden met lage confidence (voor UI highlighting)
};

/**
 * Groep van gerelateerde registraties uit één invoer.
 * Gebruikt voor UI-weergave en batch-operaties.
 * Database: elke unit wordt als losse spuitschrift entry opgeslagen.
 */
export type SprayRegistrationGroup = {
  groupId: string;
  date: Date;
  rawInput: string;          // Originele invoer van gebruiker
  units: SprayRegistrationUnit[];
  // Punt 4: Confidence informatie
  confidence?: ConfidenceBreakdown;
};

/**
 * Uitgebreide ParsedSprayData met ondersteuning voor gegroepeerde registraties.
 * Backwards compatible: als isGrouped=false, gebruik plots/products als fallback.
 */
export type ParsedSprayDataV2 = {
  isGrouped: boolean;
  group?: SprayRegistrationGroup;
  // Backwards compatible fallback voor simpele invoer
  plots?: string[];
  products?: ProductEntry[];
  assumedTargets?: Record<string, string>;
}

export type LogbookEntry = {
  id: string; // Firestore ID
  rawInput: string;
  status: LogStatus;
  date: Date; // Spraying date
  createdAt: Date; // Creation date
  parsedData?: ParsedSprayData;
  validationMessage?: string;
  originalLogbookId?: string; // Used when moving back from spuitschrift
};

export type SpuitschriftEntry = {
  id: string; // Firestore ID
  spuitschriftId?: string; // Self-reference for consistency, can be same as id
  originalLogbookId?: string | null; // ID of the original logbook entry (null/undefined for direct confirmations)
  originalRawInput: string;
  date: Date; // Spraying date
  createdAt: Date; // Creation date
  plots: string[];
  products: ProductEntry[];
  validationMessage?: string;
  status: 'Akkoord' | 'Waarschuwing';
}

export type ParcelHistoryEntry = {
  id: string; // Firestore ID
  logId: string; // Original logbook ID
  spuitschriftId: string; // Spuitschrift entry ID
  parcelId: string;
  parcelName: string;
  crop: string;
  variety: string;
  product: string;
  dosage: number;
  unit: string;
  date: Date;
};

export type UserPreference = {
  id: string; // Firestore ID, same as alias
  alias: string; // e.g., 'captan'
  preferred: string; // e.g., 'Captan 80 WDG'
}

// 3.1.5 Learning from Feedback - User Feedback Preferences
export type UserFeedback = {
  id: string;
  type: 'dosage' | 'parcel_group' | 'product_combo' | 'correction';
  key: string;           // e.g., product name, or "product1+product2"
  value: string;         // e.g., "1.5 kg/ha" or "appels"
  frequency: number;     // How often this was used
  lastUsed: Date;
  metadata?: Record<string, unknown>;
}

export type InventoryMovement = {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  type: 'addition' | 'usage' | 'correction';
  date: Date;
  description: string;
  referenceId?: string; // e.g., spuitschriftId or a manual entry ID
}

// ============================================
// CTGB Product Types (synced from MST API)
// ============================================

export type CtgbStof = {
  naam: string;
  concentratie?: string;
  casNummer?: string;
};

export type CtgbGebruiksvoorschrift = {
  gewas: string;
  doelorganisme?: string;
  locatie?: string;
  toepassingsmethode?: string;
  dosering?: string;
  maxToepassingen?: number;
  maxToepassingenPerTeeltcyclus?: number;
  maxDoseringPerTeeltcyclus?: string;
  veiligheidstermijn?: string;
  interval?: string;
  opmerkingen?: string[];
  wCodes?: string[];
};

export type CtgbEtikettering = {
  ghsSymbolen?: string[];
  hZinnen?: { code: string; tekst: string }[];
  pZinnen?: { code: string; tekst: string }[];
  signaalwoord?: string;
};

// Product type / "Aard van het middel" - from CTGB outcomeTypes
export type CtgbProductType =
  | 'Fungicide'           // Schimmelbestrijdingsmiddel
  | 'Insecticide'         // Insectenbestrijdingsmiddel
  | 'Herbicide'           // Onkruidbestrijdingsmiddel
  | 'Groeiregulator'      // Groeiregulator
  | 'Kiemremmingsmiddel'  // Kiemremmingsmiddel
  | 'Acaricide'           // Mijtenbestrijdingsmiddel
  | 'Molluscicide'        // Slakkenbestrijdingsmiddel
  | 'Rodenticide'         // Knaagdierbestrijdingsmiddel
  | 'Overig';             // Other/Unknown

export type CtgbProduct = {
  id: string;
  toelatingsnummer: string;
  naam: string;
  status: string;
  vervaldatum: string;
  categorie: string;
  toelatingshouder?: string;
  werkzameStoffen: string[];
  // "Aard van het middel" - from CTGB outcomeTypes field
  productTypes: CtgbProductType[];  // Array omdat een product meerdere types kan hebben
  samenstelling?: {
    formuleringstype?: string;
    stoffen: CtgbStof[];
  };
  gebruiksvoorschriften: CtgbGebruiksvoorschrift[];
  etikettering?: CtgbEtikettering;
  searchKeywords: string[];
  lastSyncedAt: string;
};

export type CtgbSyncStats = {
  count: number;
  lastSynced?: string;
}

// ============================================
// Fertilizer Types
// ============================================
export interface FertilizerProduct {
  id: string;
  name: string;
  manufacturer: string;
  category: 'Leaf' | 'Fertigation' | 'Soil';
  unit: 'L' | 'kg';
  composition: {
    N?: number;
    P?: number;
    K?: number;
    MgO?: number;
    SO3?: number;
    CaO?: number;
    S?: number;
    Fe?: number;
    Mn?: number;
    Zn?: number;
    Cu?: number;
    B?: number;
    Mo?: number;
  };
  searchKeywords: string[];
}
// ============================================
// Research Hub Types
// ============================================

export type ResearchCategory = 'disease' | 'storage' | 'cultivation' | 'general';
export type ResearchVerdict = 'practical' | 'experimental' | 'theoretical';

export type ResearchPaper = {
  id: string;
  createdAt: Date;
  title: string;
  summaryAi?: string;
  contentUrl?: string;
  category: ResearchCategory;
  verdict: ResearchVerdict;
  tags: string[];
  embedding?: number[];
};

export type FieldSignal = {
  id: string;
  authorId: string;
  content: string;
  mediaUrl?: string;
  visibility: 'public' | 'private';
  tags: string[];
  embedding?: number[];
  likesCount: number;
  createdAt: Date;
  userReaction?: FieldSignalReaction['type']; // Joined field to see if current user liked
  authorName?: string; // Metadata for UI
};

export type FieldSignalReaction = {
  id: string;
  signalId: string;
  userId: string;
  type: 'like' | 'comment';
  content?: string;
  createdAt: Date;
};

// ============================================
// Team & Tasks Types (Urenregistratie)
// ============================================

export type TaskType = {
  id: string;
  name: string;
  defaultHourlyRate: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskLog = {
  id: string;
  startDate: Date;
  endDate: Date;
  days: number;
  subParcelId: string | null;
  taskTypeId: string;
  peopleCount: number;
  hoursPerPerson: number;
  totalHours: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskLogEnriched = TaskLog & {
  subParcelName: string | null;
  taskTypeName: string;
  defaultHourlyRate: number;
  estimatedCost: number;
};

// Active Task Session (lopende taken met live timer)
export type ActiveTaskSession = {
  id: string;
  taskTypeId: string;
  taskTypeName: string;
  defaultHourlyRate: number;
  subParcelId: string | null;
  subParcelName: string | null;
  startTime: Date;
  peopleCount: number;
  notes: string | null;
  createdAt: Date;
};

// ============================================
// Pest & Disease Library Types
// ============================================

export type PestType = 'fungus' | 'insect' | 'bacteria' | 'virus' | 'mite' | 'other';
export type CropType = 'apple' | 'pear' | 'both';
export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export type LifecycleEntry = {
  month: number;        // 1-12
  activity: string;     // What's happening
  intensity: number;    // 0-100 for visual representation
};

export type GalleryImage = {
  url: string;
  caption: string;
  stage?: 'early' | 'leaf' | 'fruit' | 'other';
};

export type Symptom = {
  stage: 'early' | 'developing' | 'advanced';
  description: string;
  imageUrl?: string;
};

export type ExternalLink = {
  title: string;
  url: string;
  source?: string;
};

export type PestDisease = {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  // Identity
  name: string;
  latinName?: string;
  type: PestType;
  crop: CropType;

  // Severity
  impactLevel: ImpactLevel;
  subtitle?: string;

  // Visual
  heroImageUrl?: string;
  galleryImages: GalleryImage[];

  // Biology
  overwintering?: string;
  infectionConditions?: string;
  damageThreshold?: string;

  // Lifecycle (12-month timeline)
  lifecycleTimeline: LifecycleEntry[];

  // Recognition
  symptoms: Symptom[];

  // Control
  biologicalControl?: string;
  culturalControl?: string;
  chemicalControl?: string;

  // Search & Tags
  tags: string[];
  searchKeywords: string[];

  // Relations
  relatedProducts: string[];   // CTGB product IDs
  externalLinks: ExternalLink[];
};
