/**
 * TypeScript types for CropNode Disease Pressure Models
 *
 * Shared types used across all disease models (apple scab, pear scab, etc.)
 */

// === Severity levels ===
export type MillsSeverity = 'none' | 'light' | 'moderate' | 'severe';

export type InoculumPressure = 'low' | 'medium' | 'high';

export type DiseaseType = 'apple_scab' | 'black_rot';

// === Configuration ===
export interface DiseaseModelConfig {
  id: string;
  user_id: string;
  parcel_id: string;             // reference parcel (first one configured)
  weather_station_id: string | null;  // station this config belongs to
  harvest_year: number;
  disease_type: DiseaseType;
  biofix_date: string; // YYYY-MM-DD
  inoculum_pressure: InoculumPressure;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// === Season Progress ===
export interface SeasonProgressEntry {
  date: string; // YYYY-MM-DD
  dailyDD: number;
  cumulativeDD: number;
  pam: number; // 0.000 – 1.000
  isForecast: boolean;
}

// === Wet Periods (intermediate) ===
export interface WetPeriod {
  start: Date;
  end: Date;
  durationHours: number;
  avgTemperature: number;
  avgHumidity: number;
  totalPrecipitation: number;
  hasRain: boolean; // true if triggered by rain (spore discharge)
  isForecast: boolean;
}

// === Infection Periods ===
export interface InfectionPeriod {
  wetPeriodStart: string; // ISO timestamp
  wetPeriodEnd: string;
  durationHours: number;
  avgTemperature: number;
  severity: MillsSeverity;
  rimValue: number; // 0-1000
  pamAtEvent: number; // 0.000-1.000
  degreeDaysCumulative: number;
  expectedSymptomDate: string | null; // YYYY-MM-DD
  isForecast: boolean;
}

// === KPIs ===
export interface ZiektedrukKPIs {
  totalInfections: number;
  lightInfections: number;
  moderateInfections: number;
  severeInfections: number;
  currentPAM: number;
  currentDegreeDays: number;
  seasonPhase: 'dormant' | 'building' | 'peak' | 'declining' | 'ended';
  estimatedSeasonEnd: string | null; // YYYY-MM-DD
  nextForecastRisk: {
    date: string;
    severity: MillsSeverity;
  } | null;
}

// === Full API response ===
export interface ZiektedrukResult {
  configured: true;
  config: DiseaseModelConfig;
  seasonProgress: SeasonProgressEntry[];
  infectionPeriods: InfectionPeriod[];
  kpis: ZiektedrukKPIs;
  // Coverage data (Niveau 2)
  coverageTimeline: CoveragePointSerialized[];
  infectionCoverage: Record<string, InfectionCoverage>; // keyed by wetPeriodStart
  sprayEvents: { date: string; product: string }[];
}

export interface ZiektedrukNotConfigured {
  configured: false;
}

export type ZiektedrukResponse = ZiektedrukResult | ZiektedrukNotConfigured;

// === Fungicide Coverage (Niveau 2) ===

export type CoverageStatus = 'good' | 'moderate' | 'low' | 'none';

export interface FungicideProperties {
  active_substance: string;
  active_substance_nl: string | null;
  frac_group: string | null;
  mode_of_action: 'preventief' | 'curatief' | 'beide';
  rain_washoff_halflife_mm: number;
  min_residual_fraction: number;
  curative_max_degree_hours: number | null;
  min_drying_hours: number;
}

export interface SprayEvent {
  id: string;                    // spuitschrift id
  date: Date;                    // application datetime
  products: {
    name: string;
    fungicideProps: FungicideProperties | null;
  }[];
  parcelIds: string[];
}

export interface CoveragePoint {
  timestamp: Date;               // Used internally during calculation
  coveragePct: number;           // 0-100
  product: string;
}

/** Serialized version for API responses */
export interface CoveragePointSerialized {
  timestamp: string;             // ISO string
  coveragePct: number;
  product: string;
}

export interface CoverageTimeline {
  sprayId: string;
  sprayDate: Date;
  product: string;
  points: CoveragePoint[];
}

export interface InfectionCoverage {
  coverageAtInfection: number;   // 0-100
  coverageStatus: CoverageStatus;
  lastSprayProduct: string | null;
  lastSprayDate: string | null;  // ISO timestamp
  curativeWindowOpen: boolean;
  curativeRemainingDH: number | null;
}

// === Weather data input (subset of HourlyWeatherData from weather-types.ts) ===
export interface HourlyWeatherInput {
  timestamp: Date;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  leafWetnessPct: number | null;
  dewPointC: number | null;
  isForecast: boolean;
}
