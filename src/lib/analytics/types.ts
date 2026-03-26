/**
 * TypeScript types for CropNode Analytics
 */

// === Filter State ===
export interface AnalyticsFilters {
  harvestYear: number;
  parcelIds: string[]; // empty = all parcels
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// === Raw Data from Supabase ===
export interface AnalyticsParcel {
  id: string;
  name: string;
  area: number; // hectares
  crop?: string;
  variety?: string;
}

export interface AnalyticsSubParcel {
  id: string;
  parcel_id: string;
  name: string;
  crop: string;
  variety: string;
  area: number;
}

export interface AnalyticsRegistration {
  id: string;
  date: string;
  plots: string[];
  products: AnalyticsProduct[];
  registration_type: 'spraying' | 'spreading';
  harvest_year: number;
}

export interface AnalyticsProduct {
  product: string;
  dosage: number;
  unit: string;
  source?: 'ctgb' | 'fertilizer';
  unit_price?: number;
  targetReason?: string;
}

export interface AnalyticsHarvest {
  id: string;
  parcel_id: string;
  sub_parcel_id: string;
  variety: string;
  harvest_date: string;
  pick_number: number;
  total_crates: number;
  quality_class: 'Klasse I' | 'Klasse II' | 'Industrie' | null;
  weight_per_crate: number | null;
  season: string;
  harvest_year: number;
}

// === Calculated Analytics ===
export interface KPIData {
  totalInputCosts: number;
  costsPerHectare: number;
  totalTreatments: number;
  totalHarvestTons: number;
  costsPerTon: number;
  totalHectares: number;
}

export interface KPIComparison {
  current: KPIData;
  previous: KPIData | null;
}

export interface CostBreakdown {
  category: string;
  value: number;
  color: string;
}

export interface MonthlyCost {
  month: string;
  monthIndex: number;
  year: number;
  gewasbescherming: number;
  bladmeststoffen: number;
  strooimeststoffen: number;
}

export interface ProductUsage {
  product: string;
  totalVolume: number;
  unit: string;
  totalCost: number;
  registrationCount: number;
}

export interface ParcelCostRow {
  parcelId: string;
  parcelName: string;
  hectares: number;
  treatmentCount: number;
  totalCost: number;
  costPerHa: number;
}

export interface TreatmentTimelineEntry {
  date: string;
  parcelName: string;
  product: string;
  category: 'gewasbescherming' | 'bladmeststof' | 'strooimeststof';
}

export interface HarvestPerParcel {
  parcelId: string;
  parcelName: string;
  variety: string;
  hectares: number;
  totalKg: number;
  kgPerHa: number;
  totalCrates: number;
  qualityBreakdown?: {
    klasseI: number;
    klasseII: number;
    industrie: number;
  };
}

export interface ParcelComparisonData {
  parcelId: string;
  parcelName: string;
  variety: string;
  hectares: number;
  treatmentCount: number;
  inputCostsPerHa: number;
  harvestKgPerHa: number;
  costsPerTon: number;
  qualityKlasseIPercent: number;
}

export interface WeatherStats {
  rainDays: number;
  frostDays: number;
  longestDryPeriod: number;
  warmestWeekAvgTemp: number;
}

// === Full Analytics Data ===
export interface AnalyticsData {
  registrations: AnalyticsRegistration[];
  harvests: AnalyticsHarvest[];
  parcels: AnalyticsParcel[];
  subParcels: AnalyticsSubParcel[];
  prevRegistrations: AnalyticsRegistration[];
  prevHarvests: AnalyticsHarvest[];
}
