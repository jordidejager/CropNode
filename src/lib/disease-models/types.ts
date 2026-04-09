/**
 * TypeScript types for CropNode Disease Pressure Models
 *
 * Shared types used across all disease models (apple scab, pear scab, etc.)
 */

// === Severity levels ===
export type MillsSeverity = 'none' | 'light' | 'moderate' | 'severe';

export type InoculumPressure = 'low' | 'medium' | 'high';

export type DiseaseType = 'apple_scab';

// === Configuration ===
export interface DiseaseModelConfig {
  id: string;
  user_id: string;
  parcel_id: string;
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
}

export interface ZiektedrukNotConfigured {
  configured: false;
}

export type ZiektedrukResponse = ZiektedrukResult | ZiektedrukNotConfigured;

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
