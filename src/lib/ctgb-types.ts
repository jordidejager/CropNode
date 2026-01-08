/**
 * CTGB MST API Types
 * Gebaseerd op de officiële MST Public API (JSON:API standaard)
 * Documentatie: https://mstpublicapi.docs.apiary.io/
 */

// === Base Types ===

export type CategoryType = {
  type: 'PPP' | 'Biocide' | 'Adjuvant';
  description: string;
};

export type ProductStatus = 'Valid' | 'Expired';

// === Authorisation Summary (List Response) ===

export type CtgbAuthorisationSummary = {
  id: string;
  name: string;
  categoryType: CategoryType;
  registrationNumber: string;
  expirationDate: string; // ISO 8601
  lastRenewalDate: string; // ISO 8601
  productStatus?: ProductStatus;
};

export type CtgbAuthorisationListMeta = {
  total: number;
  offset: number;
  limit: number;
};

export type CtgbAuthorisationListResponse = {
  meta: CtgbAuthorisationListMeta;
  data: CtgbAuthorisationSummary[];
};

// === Authorisation Detail Types ===

export type AuthorisationHolder = {
  id: string;
  name: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
};

export type Substance = {
  id: number;
  name: string;
  casNumber?: string;
  ecNumber?: string;
  concentration?: number;
  concentrationUnit?: string;
  function?: 'ActiveSubstance' | 'Safener';
};

export type Composition = {
  formulationType?: string;
  formulationTypeDescription?: string;
  substances: Substance[];
};

// === PPP Specific Types ===

export type PPPTargetCrop = {
  id: string;
  name: string;
  eppoCode?: string;
  group?: string;
  subgroup?: string;
};

export type PPPTargetOrganism = {
  id: string;
  name: string;
  scientificName?: string;
  eppoCode?: string;
  group?: string;
  subgroup?: string;
};

export type PPPTargetLocation = {
  id: string;
  description: string; // e.g., "Bedekt", "Onbedekt"
};

export type PPPApplicationMethod = {
  id: string;
  descriptionNL: string;
  descriptionEN?: string;
};

export type PPPOutcomeType = {
  id: string;
  description: string; // e.g., "acaricide", "fungicide"
};

// === Usage / Gebruiksvoorschrift Types ===

export type PPPDosage = {
  value?: number;
  unit?: string;
  minValue?: number;
  maxValue?: number;
  perHectare?: boolean;
  perApplication?: boolean;
  remark?: string;
};

export type PPPWaitingPeriod = {
  days?: number;
  description?: string;
  remark?: string;
};

export type PPPUsage = {
  id: string;
  targetCrop?: PPPTargetCrop;
  targetCrops?: PPPTargetCrop[];
  targetOrganism?: PPPTargetOrganism;
  targetOrganisms?: PPPTargetOrganism[];
  targetLocation?: PPPTargetLocation;
  applicationMethod?: PPPApplicationMethod;
  outcomeTypes?: PPPOutcomeType[];
  dosage?: PPPDosage;
  maxApplications?: number;
  waitingPeriod?: PPPWaitingPeriod;
  interval?: {
    minDays?: number;
    maxDays?: number;
    description?: string;
  };
  applicationTiming?: string;
  restrictions?: string[];
  remarks?: string[];
  wCodes?: string[]; // W-codes voor water
};

// === Biocide Specific Types ===

export type BiocideProductType = {
  id: string;
  code: string; // PT01-PT99
  description: string;
  echaCode?: string;
};

export type BiocideTargetOrganism = {
  id: string;
  commonName: string;
  scientificName?: string;
};

export type BiocideUse = {
  id: string;
  productType?: BiocideProductType;
  targetOrganisms?: BiocideTargetOrganism[];
  userCategory?: string;
  applicationArea?: string;
  applicationMethod?: string;
  dosage?: string;
  remarks?: string[];
};

// === Labelling & GHS ===

export type GHSSymbol = {
  code: string;
  description: string;
};

export type HazardStatement = {
  code: string; // H-code
  statement: string;
};

export type PrecautionaryStatement = {
  code: string; // P-code
  statement: string;
};

export type Labelling = {
  ghsSymbols?: GHSSymbol[];
  hazardStatements?: HazardStatement[];
  precautionaryStatements?: PrecautionaryStatement[];
  signalWord?: string;
};

// === Documents & Decisions ===

export type Document = {
  id: string;
  type: string;
  title?: string;
  language?: string;
  url?: string;
  date?: string;
};

export type Decision = {
  id: string;
  type: string;
  date: string;
  description?: string;
  documents?: Document[];
};

// === Component ===

export type Component = {
  id: string;
  name: string;
  registrationNumber?: string;
  labelling?: Labelling;
};

// === Full Authorisation Detail ===

export type CtgbAuthorisationDetail = {
  id: string;
  name: string;
  categoryType: CategoryType;
  registrationNumber: string;
  expirationDate: string;
  lastRenewalDate: string;
  lastModifiedDate?: string;
  productStatus?: ProductStatus;
  lowRisk?: boolean; // PPP specific

  // Relationships
  authorisationHolder?: AuthorisationHolder;
  compositions?: Composition[];

  // Uses - depending on category type
  pppUsages?: PPPUsage[]; // For PPP products
  biocideUses?: BiocideUse[]; // For Biocide products

  // Labelling & Safety
  components?: Component[];
  decisions?: Decision[];

  // Mother product relationship (for parallel trade)
  motherProduct?: {
    id: string;
    name: string;
    registrationNumber: string;
  };
};

// === Our API Response Types ===

export type CtgbSearchResult = {
  id: string;
  toelatingsnummer: string;
  naam: string;
  status: ProductStatus | string;
  vervaldatum: string;
  categorie: string;
  toelatingshouder?: string;
  werkzameStoffen: string[];

  // Full details (when deep fetch is enabled)
  samenstelling?: {
    formuleringstype?: string;
    stoffen: {
      naam: string;
      concentratie?: string;
      casNummer?: string;
    }[];
  };

  gebruiksvoorschriften?: {
    gewas: string;
    doelorganisme?: string;
    locatie?: string;
    toepassingsmethode?: string;
    dosering?: string;
    maxToepassingen?: number;
    veiligheidstermijn?: string;
    interval?: string;
    werking?: string[];
    opmerkingen?: string[];
    wCodes?: string[];
  }[];

  etikettering?: {
    ghsSymbolen?: string[];
    hZinnen?: { code: string; tekst: string }[];
    pZinnen?: { code: string; tekst: string }[];
    signaalwoord?: string;
  };

  besluiten?: {
    type: string;
    datum: string;
    omschrijving?: string;
  }[];
};

export type CtgbSearchResponse = {
  success: boolean;
  query: string;
  total: number;
  results: CtgbSearchResult[];
  error?: string;
};

// === API Filter Options ===

export type CtgbSearchFilters = {
  productName?: string;
  registrationNumber?: string;
  productStatus?: ProductStatus;
  categoryType?: 'PPP' | 'Biocide' | 'Adjuvant';
  activeSubstances?: string[]; // Substance IDs
  authorisationHolders?: string[]; // Company IDs
  expirationDateFrom?: string;
  expirationDateTo?: string;
  locale?: 'nl' | 'en';
  offset?: number;
  limit?: number;
  sort?: string;
};
