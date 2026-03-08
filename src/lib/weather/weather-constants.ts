// ============================================================================
// Weather Hub Constants & Configuration
// ============================================================================

// Open-Meteo API endpoints
export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

// Hourly parameters requested from Open-Meteo
export const HOURLY_PARAMS = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'et0_fao_evapotranspiration',
  'soil_temperature_6cm',
  'cloud_cover',
  'dew_point_2m',
  'direct_radiation',
  'diffuse_radiation',
] as const;

// Daily parameters requested from Open-Meteo
export const DAILY_PARAMS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'et0_fao_evapotranspiration',
  'wind_speed_10m_max',
] as const;

// Refresh intervals (ms)
export const FORECAST_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;     // 3 hours
export const MULTIMODEL_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;   // 6 hours
export const ENSEMBLE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;    // 12 hours
export const FORECAST_DAYS = 16;
export const PAST_DAYS = 7;

// Season definition for Dutch fruit growing
export const SEASON_START_MONTH = 3;  // March
export const SEASON_END_MONTH = 11;   // November

// Historical data: how many years back to fetch on initialization
export const HISTORICAL_YEARS_BACK = 2;

// Timezone
export const DEFAULT_TIMEZONE = 'Europe/Amsterdam';

// Buienradar - real-time precipitation nowcast (frontend only, no backend storage)
// Response is plain text: 24 lines with "intensiteit|tijdstip" per 5 minutes
export const BUIENRADAR_RAIN_TEXT_URL =
  'https://gpsgadget.buienradar.nl/data/raintext?lat={lat}&lon={lon}';

// Buienradar radar image (for potential embed)
export const BUIENRADAR_RADAR_URL =
  'https://image.buienradar.nl/2.0/image/single/RadarMapRainNL?height=512&width=500';

// Data cleanup thresholds
export const ENSEMBLE_MAX_AGE_DAYS = 3;
export const MULTIMODEL_FORECAST_MAX_AGE_DAYS = 7;

// Test coordinates (Dutch fruit-growing regions)
export const TEST_LOCATIONS = {
  betuwe: { lat: 51.89, lng: 5.35 },
  zeeland: { lat: 51.50, lng: 3.90 },
  zuidLimburg: { lat: 50.85, lng: 5.75 },
} as const;
