
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

export type ParcelGroup = {
  id: string;
  name: string;
  memberCount?: number;
  subParcelIds?: string[];
  createdAt?: Date;
};

export type SubParcel = {
  id: string;
  parcelId: string;
  name?: string; // e.g. "V-haag", "Nieuw"
  synonyms?: string[]; // Alternative names for Smart Input matching
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

/**
 * Doelorganisme met bijbehorende gebruiksvoorschriften
 * Gebruikt voor UI weergave in doelorganisme selector
 */
export type DoelorganismeOption = {
  naam: string;                    // e.g. "Schurft (Venturia inaequalis)"
  dosering?: string;               // e.g. "1,5 l/ha"
  interval?: string;               // e.g. "min. 7 dagen"
  maxToepassingen?: number;        // e.g. 6
  veiligheidstermijn?: string;     // e.g. "21 dagen"
  opmerkingen?: string[];          // Any wCodes or remarks
  gewas: string;                   // The crop this applies to
};

export type ProductSource = 'ctgb' | 'fertilizer';

export type RegistrationType = 'spraying' | 'spreading';

export type ProductSuggestion = {
  naam: string;
  toelatingsnummer?: string;
  score: number; // 0-100 match score
};

export type ProductEntry = {
  product: string;
  dosage: number;
  unit: string;
  source?: ProductSource; // 'ctgb' (gewasbeschermingsmiddel) of 'fertilizer' (meststof). Default: 'ctgb' voor backward compatibility
  targetReason?: string; // Doelorganisme uit gebruikersinvoer (bijv. "luis", "schurft")
  doelorganisme?: string; // Geselecteerd doelorganisme uit CTGB voorschriften
  availableDoelorganismen?: DoelorganismeOption[]; // Beschikbare opties uit CTGB (voor UI)
  resolved?: boolean; // false = niet gevonden in CTGB/meststoffen database
  suggestions?: ProductSuggestion[]; // "Bedoel je...?" alternatieven
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
  registrationType?: RegistrationType; // 'spraying' (default) of 'spreading'
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
  registrationType?: RegistrationType; // 'spraying' (default) of 'spreading'
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
  registrationType: RegistrationType; // 'spraying' (bespuiting) of 'spreading' (strooien)
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
  registrationType?: RegistrationType; // 'spraying' (default) of 'spreading'
  productSource?: ProductSource; // 'ctgb' of 'fertilizer'
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

// ============================================
// Storage (Koelcelbeheer) Types
// ============================================

export type BlockedPosition = {
  row: number;
  col: number;
};

export type StorageCellStatus = 'active' | 'cooling_down' | 'inactive';

// Cell side for door/evaporator placement
export type CellSide = 'north' | 'south' | 'east' | 'west';

// Door position along a cell wall
export type DoorPosition = {
  side: CellSide;
  startCol: number;  // Start position along that side (0-indexed)
  endCol: number;    // End position (can span multiple columns)
};

// Evaporator position along a cell wall
export type EvaporatorPosition = {
  side: CellSide;
  startCol: number;
  endCol: number;
};

// Position of cell in complex overview grid
export type ComplexPosition = {
  x: number;        // Grid column in complex
  y: number;        // Grid row in complex
  rotation: 0 | 90 | 180 | 270;
};

// Height overrides per position: "row-col" -> maxHeight
export type PositionHeightOverrides = Record<string, number>;

// Storage Complex - container for multiple cells in 2D layout
export type StorageComplex = {
  id: string;
  name: string;
  gridWidth: number;    // Complex grid width (cells can span multiple units)
  gridHeight: number;   // Complex grid height
  createdAt: Date;
  updatedAt: Date;
};

export type StorageCell = {
  id: string;
  name: string;
  width: number;          // columns (crate positions)
  depth: number;          // rows (crate positions)
  blockedPositions: BlockedPosition[];
  status: StorageCellStatus;
  // Enhanced fields for redesign
  maxStackHeight: number;                      // Default max crates stacked (default 8)
  doorPositions: DoorPosition[];               // Door placements
  evaporatorPositions: EvaporatorPosition[];   // Evaporator placements
  positionHeightOverrides: PositionHeightOverrides; // Per-position height limits
  complexId: string | null;                    // Link to complex for layout
  complexPosition: ComplexPosition;            // Position and rotation in complex
  createdAt: Date;
  updatedAt: Date;
};

// Variety count in a storage cell
export type VarietyCount = {
  variety: string;
  count: number;
};

export type StorageCellSummary = StorageCell & {
  totalPositions: number;
  filledPositions: number;
  fillPercentage: number;
  dominantVariety: string | null;
  totalCrates: number;        // Sum of all quantities (actual crates stored)
  varietyCounts: VarietyCount[];  // Breakdown by variety
  totalCapacity: number;      // Sum of all max heights (accounts for overrides)
};

export type QualityClass = 'Klasse I' | 'Klasse II' | 'Industrie';

export type StoragePosition = {
  id: string;
  cellId: string;
  rowIndex: number;
  colIndex: number;
  variety: string | null;
  subParcelId: string | null;
  subParcelName?: string | null;
  dateStored: Date | null;
  quantity: number;       // Stack height (how many crates stacked)
  qualityClass: QualityClass | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoragePositionInput = Omit<StoragePosition, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================================================
// Sub-parcel Storage System (new in migration 008)
// ============================================================================

// Color palette for sub-parcels (10 distinguishable colors on dark background)
export const SUB_PARCEL_COLORS = [
  { hex: '#ef4444', name: 'Rood' },      // red-500
  { hex: '#f97316', name: 'Oranje' },    // orange-500
  { hex: '#eab308', name: 'Geel' },      // yellow-500
  { hex: '#22c55e', name: 'Groen' },     // green-500
  { hex: '#06b6d4', name: 'Cyaan' },     // cyan-500
  { hex: '#3b82f6', name: 'Blauw' },     // blue-500
  { hex: '#8b5cf6', name: 'Paars' },     // violet-500
  { hex: '#ec4899', name: 'Roze' },      // pink-500
  { hex: '#14b8a6', name: 'Teal' },      // teal-500
  { hex: '#f59e0b', name: 'Amber' },     // amber-500
] as const;

// Pick number for harvest tracking (apples/pears are picked multiple times)
export type PickNumber = 1 | 2 | 3 | 4 | 5;

// Cell sub-parcel: links a sub-parcel to a storage cell with display properties
export type CellSubParcel = {
  id: string;
  cellId: string;
  parcelId: string | null;
  subParcelId: string | null;
  variety: string;
  color: string;           // Hex color (e.g., '#ef4444')
  pickDate: Date;          // Plukdatum
  pickNumber: PickNumber;  // 1e t/m 5e pluk
  notes: string | null;
  harvestRegistrationId: string | null;  // Link to harvest registration for tracking
  createdAt: Date;
  updatedAt: Date;
  // Computed from view (when using getCellSubParcels)
  totalCrates?: number;
  positionsUsed?: number;
  // Joined data for display
  parcelName?: string;
  subParcelName?: string;
};

export type CellSubParcelInput = Omit<CellSubParcel, 'id' | 'createdAt' | 'updatedAt' | 'totalCrates' | 'positionsUsed' | 'parcelName' | 'subParcelName'>;

// Position content: one layer in a stack (multiple layers = mixed stack)
export type PositionContent = {
  id: string;
  cellId: string;
  rowIndex: number;
  colIndex: number;
  cellSubParcelId: string;
  stackCount: number;      // Number of crates from this sub-parcel in this layer
  stackOrder: number;      // Order in stack (1 = bottom, 2 = second from bottom, etc.)
  createdAt: Date;
  updatedAt: Date;
  // Joined data for display
  variety?: string;
  color?: string;
};

export type PositionContentInput = Omit<PositionContent, 'id' | 'createdAt' | 'updatedAt' | 'variety' | 'color'>;

// Aggregated position stack for floor plan rendering
export type PositionStack = {
  rowIndex: number;
  colIndex: number;
  contents: PositionContent[];  // Ordered by stackOrder (1 = bottom)
  totalHeight: number;          // Sum of all stackCounts
  maxHeight: number;            // Allowed max for this position (from cell config)
  isMixed: boolean;             // true if more than one sub-parcel
  dominantColor: string;        // Color of the sub-parcel with most crates
};

// Layer in a position stack (for rendering split colors)
export type StackLayer = {
  cellSubParcelId: string;
  variety: string;
  color: string;
  stackCount: number;
  stackOrder: number;
  percentageOfTotal: number;   // For proportional rendering (0-100)
};

// ============================================================================
// Harvest Registration Types (Oogstregistratie)
// ============================================================================

export type HarvestStorageStatus = 'not_stored' | 'partially_stored' | 'fully_stored';

export type HarvestRegistration = {
  id: string;
  parcelId: string | null;
  subParcelId: string | null;
  variety: string;
  harvestDate: Date;
  pickNumber: PickNumber;
  totalCrates: number;
  qualityClass: QualityClass | null;
  weightPerCrate: number | null;
  season: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Computed from view (when using getHarvestRegistrations)
  parcelName?: string;
  subParcelName?: string;
  storedCrates?: number;
  remainingCrates?: number;
  storageStatus?: HarvestStorageStatus;
  cellNames?: string;
};

export type HarvestRegistrationInput = {
  parcelId?: string | null;
  subParcelId?: string | null;
  variety: string;
  harvestDate: Date;
  pickNumber: PickNumber;
  totalCrates: number;
  qualityClass?: QualityClass | null;
  weightPerCrate?: number | null;
  season: string;
  notes?: string | null;
};
