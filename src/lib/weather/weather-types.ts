// ============================================================================
// Weather Hub TypeScript Types
// ============================================================================

export type WeatherStation = {
  id: string;
  userId: string;
  name: string | null;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  timezone: string;
  knmiStationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type HourlyWeatherData = {
  id: number;
  stationId: string;
  timestamp: Date;
  modelName: string;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  windDirection: number | null;
  windGustsMs: number | null;
  leafWetnessPct: number | null;
  soilTemp6cm: number | null;
  solarRadiation: number | null;
  et0Mm: number | null;
  cloudCoverPct: number | null;
  dewPointC: number | null;
  isForecast: boolean;
  dataSource: string;
  createdAt: Date;
};

export type DailyWeatherData = {
  id: number;
  stationId: string;
  date: string; // YYYY-MM-DD
  tempMinC: number | null;
  tempMaxC: number | null;
  tempAvgC: number | null;
  precipitationSum: number | null;
  humidityAvgPct: number | null;
  windSpeedMaxMs: number | null;
  windSpeedAvgMs: number | null;
  leafWetnessHrs: number | null;
  et0SumMm: number | null;
  solarRadiationSum: number | null;
  gddBase5: number | null;
  gddBase10: number | null;
  frostHours: number | null;
  isForecast: boolean;
  dataSource: string;
  createdAt: Date;
};

export type WeatherFetchLog = {
  id: string;
  stationId: string;
  fetchType: 'forecast' | 'historical' | 'current' | 'forecast_multimodel' | 'forecast_ensemble';
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  status: 'success' | 'error' | 'partial';
  errorMessage: string | null;
  recordsFetched: number | null;
  fetchedAt: Date;
};

export type ParcelWeatherStation = {
  parcelId: string;
  stationId: string;
};

// Open-Meteo API response types
export type OpenMeteoHourlyResponse = {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  timezone_abbreviation: string;
  utc_offset_seconds: number;
  hourly: {
    time: string[];
    temperature_2m?: number[];
    relative_humidity_2m?: number[];
    precipitation?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wind_gusts_10m?: number[];
    et0_fao_evapotranspiration?: number[];
    soil_temperature_6cm?: number[];
    cloud_cover?: number[];
    dew_point_2m?: number[];
    direct_radiation?: number[];
    diffuse_radiation?: number[];
  };
  daily?: {
    time: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    et0_fao_evapotranspiration?: number[];
    wind_speed_10m_max?: number[];
  };
};

// Spray window assessment
export type SprayWindowScore = {
  score: number; // 0-100
  label: 'Groen' | 'Oranje' | 'Rood';
  factors: {
    wind: number;
    deltaT: number;
    precipitation: number;
    temperature: number;
  };
};

/**
 * Spray profile — different product types have different weather requirements.
 *
 * - contact:    Must dry on leaf (needs 1-2h dry after spray). Wind matters a lot (drift).
 * - systemisch: Absorbed quickly, rain after 30min OK. Less wind-sensitive.
 * - groeistof:  Temperature-sensitive (best 12-22°C). Wind matters for drift.
 * - meststof:   Foliar feed. Humidity matters (uptake). Temperature moderate.
 */
export type SprayProductType = 'contact' | 'systemisch' | 'groeistof' | 'meststof';

export type SprayProfile = {
  type: SprayProductType;
  label: string;
  weights: {
    wind: number;
    deltaT: number;
    precipitation: number;
    temperature: number;
  };
  /** Custom thresholds that override defaults */
  thresholds?: {
    maxWindMs?: number;       // hard cutoff
    minTempC?: number;        // hard cutoff
    maxTempC?: number;        // hard cutoff
    dryHoursAfter?: number;   // hours rain-free needed after application
  };
};

/**
 * Crop-specific spray adjustments.
 * Appel and peer have slightly different optimals (e.g. peer is more frost-sensitive).
 */
export type SprayCropType = 'appel' | 'peer';

// Delta-T interpretation
export type DeltaTCategory = 'too_wet' | 'ideal' | 'acceptable' | 'too_dry';

export type DeltaTResult = {
  value: number;
  category: DeltaTCategory;
  label: string;
};

// ---- Multi-Model & Ensemble Types ----

export type WeatherModelName =
  | 'best_match'
  | 'ecmwf_ifs'
  | 'icon_eu'
  | 'gfs'
  | 'meteofrance_arpege'
  | 'ecmwf_aifs';

export type EnsembleModelName = 'ecmwf_ifs' | 'gfs';

export type EnsembleVariable = 'temperature_c' | 'precipitation_mm' | 'wind_speed_ms' | 'humidity_pct';

export type EnsembleStats = {
  timestamp: string;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
};

export type MultiModelForecast = {
  models: Partial<Record<WeatherModelName, {
    time: string[];
    temperature_c: (number | null)[];
    precipitation_mm: (number | null)[];
    wind_speed_ms: (number | null)[];
    humidity_pct: (number | null)[];
  }>>;
  last_updated: string;
};

export type EnsembleResponse = {
  model: EnsembleModelName;
  members_count: number;
  variables: Record<EnsembleVariable, {
    time: string[];
    min: number[];
    p10: number[];
    p25: number[];
    median: number[];
    p75: number[];
    p90: number[];
    max: number[];
  }>;
  last_updated: string;
};
