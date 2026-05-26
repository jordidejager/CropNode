/**
 * TTN uplink payload decoder + derived-value calculators.
 *
 * The Dragino decoder on TTN-side already turns the hex frm_payload into
 * the decoded_payload object we see here. This module validates that object
 * and computes every derived field we want to store alongside it.
 */

// ---- TTN payload shape ----

export interface TTNUplinkPayload {
  end_device_ids?: {
    device_id?: string;
    application_ids?: { application_id?: string };
    dev_eui?: string;
  };
  received_at?: string;
  uplink_message?: {
    f_port?: number;
    f_cnt?: number;
    frm_payload?: string;
    decoded_payload?: {
      BatV?: number;
      Bat?: number;                    // LMS01 uses 'Bat' instead of 'BatV'
      Payload_Ver?: number;
      // WSC2-Compact-LS (weather station)
      Temperature?: number;
      Humidity?: number;
      Pressure?: string | number;      // TTN decoder returns string for Dragino
      illumination?: number;
      rain?: number;
      i_flag?: number;
      // SE01-LS (soil) — Dragino's formatter emits these as STRINGS like "25.83"
      water_SOIL?: string | number;    // volumetric water content, %
      temp_SOIL?: string | number;     // soil temperature, °C
      conduct_SOIL?: number;           // soil conductivity, µS/cm
      s_flag?: number;                 // sensor present flag (1 = probe connected)
      // Older / alternate firmware uppercase variants — kept for resilience
      VWC_SOIL?: number;
      TEMP_SOIL?: number;
      // LMS01-LS (leaf) — also strings on some firmware
      Leaf_Moisture?: string | number; // measured leaf wetness, %
      Leaf_Temperature?: string | number; // leaf surface temperature, °C
      [k: string]: unknown;
    };
    rx_metadata?: Array<{
      gateway_ids?: { gateway_id?: string };
      rssi?: number;
      snr?: number;
      location?: { latitude?: number; longitude?: number; altitude?: number };
    }>;
    settings?: Record<string, unknown>;
    /** Device-level location set in the TTN console (or via gateway triangulation). */
    locations?: {
      user?: { latitude?: number; longitude?: number; altitude?: number; source?: string };
      [k: string]: unknown;
    };
  };
}

export interface DecodedUplink {
  // Keys for lookup / dedup
  deviceId: string;
  applicationId: string;
  devEui: string;
  measuredAt: string;          // ISO
  frameCounter: number;
  fPort: number;

  // WSC2-Compact-LS (weather)
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  illuminanceLux: number | null;
  rainCounter: number | null;

  // SE01-LS (soil)
  soilMoisturePct: number | null;
  soilTempC: number | null;
  soilConductivityUsCm: number | null;

  // LMS01-LS (leaf)
  leafWetnessPctMeasured: number | null;
  leafTempC: number | null;

  // Shared across all sensors
  batteryV: number | null;

  // Derived values (computed here)
  dewPointC: number | null;
  wetBulbC: number | null;
  batteryStatus: 'good' | 'low' | 'critical' | 'unknown';

  // Signal quality
  rssiDbm: number | null;
  snrDb: number | null;
  gatewayCount: number;
}

// ---- Validation ----

export class InvalidTTNPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTTNPayloadError';
  }
}

/** Decode a TTN webhook body into a normalized uplink object. */
export function decodeTTNUplink(body: TTNUplinkPayload): DecodedUplink {
  const deviceId = body.end_device_ids?.device_id;
  const applicationId = body.end_device_ids?.application_ids?.application_id;
  const devEui = body.end_device_ids?.dev_eui;
  const measuredAt = body.received_at;
  // TTN's protobuf-JSON encoder omits zero-valued numeric fields, so on the
  // first uplink after a (re)join f_cnt and f_port can simply be missing.
  // Treat them as 0 rather than rejecting the payload.
  const frameCounter = body.uplink_message?.f_cnt ?? 0;
  const fPort = body.uplink_message?.f_port ?? 0;
  const decoded = body.uplink_message?.decoded_payload;

  if (!deviceId) throw new InvalidTTNPayloadError('Missing end_device_ids.device_id');
  if (!applicationId) throw new InvalidTTNPayloadError('Missing application_id');
  if (!devEui) throw new InvalidTTNPayloadError('Missing dev_eui');
  if (!measuredAt) throw new InvalidTTNPayloadError('Missing received_at');

  // If there's no uplink_message block at all, this isn't a sensor uplink
  // (e.g. a stray event that slipped past the TTN webhook filter). Signal
  // the caller so it can 200-skip rather than 400-retry.
  if (!body.uplink_message) {
    throw new InvalidTTNPayloadError('Missing uplink_message block');
  }

  // Pressure comes as a string from the Dragino decoder — parse to float
  const pressureRaw = decoded?.Pressure;
  const pressureHpa =
    typeof pressureRaw === 'string'
      ? parseFloat(pressureRaw)
      : typeof pressureRaw === 'number'
        ? pressureRaw
        : null;

  const temperatureC = numOrNull(decoded?.Temperature);
  const humidityPct = numOrNull(decoded?.Humidity);
  const illuminanceLux = decoded?.illumination != null ? Math.round(decoded.illumination) : null;
  const rainCounter = decoded?.rain != null ? Math.round(decoded.rain) : null;
  // BatV on WSC2/SE01, Bat on LMS01 — same thing, different name
  const batteryV = numOrNull(decoded?.BatV) ?? numOrNull(decoded?.Bat);

  // SE01-LS (soil) — only present on soil-sensor uplinks.
  // Dragino's repository formatter emits these as strings ("25.83") on
  // firmware 1.2.x; older builds use the uppercase variant. Read both.
  const soilMoisturePct = parseNumLoose(decoded?.water_SOIL ?? decoded?.VWC_SOIL);
  const soilTempC = parseNumLoose(decoded?.temp_SOIL ?? decoded?.TEMP_SOIL);
  const soilConductivityUsCm =
    decoded?.conduct_SOIL != null ? Math.round(decoded.conduct_SOIL as number) : null;

  // LMS01-LS (leaf) — only present on leaf-sensor uplinks.
  const leafWetnessPctMeasured = parseNumLoose(decoded?.Leaf_Moisture);
  const leafTempC = parseNumLoose(decoded?.Leaf_Temperature);

  // Signal metadata — take the best gateway reception
  const rxMeta = body.uplink_message?.rx_metadata ?? [];
  const rssiValues = rxMeta.map(g => g.rssi).filter((v): v is number => typeof v === 'number');
  const snrValues = rxMeta.map(g => g.snr).filter((v): v is number => typeof v === 'number');
  const rssiDbm = rssiValues.length > 0 ? Math.max(...rssiValues) : null; // best = least negative
  const snrDb = snrValues.length > 0 ? Math.max(...snrValues) : null;
  const gatewayCount = rxMeta.length;

  return {
    deviceId,
    applicationId,
    devEui,
    measuredAt,
    frameCounter,
    fPort,
    temperatureC,
    humidityPct,
    pressureHpa: Number.isFinite(pressureHpa as number) ? pressureHpa : null,
    illuminanceLux,
    rainCounter,
    soilMoisturePct,
    soilTempC,
    soilConductivityUsCm,
    leafWetnessPctMeasured,
    leafTempC,
    batteryV,
    dewPointC: calcDewPoint(temperatureC, humidityPct),
    wetBulbC: calcWetBulb(temperatureC, humidityPct),
    batteryStatus: classifyBattery(batteryV),
    rssiDbm,
    snrDb,
    gatewayCount,
  };
}

// ---- Derived-value calculators ----

/**
 * Magnus-Tetens formula for dew point.
 * Accurate within ±0.35°C over -45°C to +60°C.
 */
export function calcDewPoint(tempC: number | null, humidityPct: number | null): number | null {
  if (tempC === null || humidityPct === null) return null;
  if (humidityPct <= 0 || humidityPct > 100) return null;
  const a = 17.625;
  const b = 243.04;
  const alpha = Math.log(humidityPct / 100) + (a * tempC) / (b + tempC);
  const dewPoint = (b * alpha) / (a - alpha);
  return Number.isFinite(dewPoint) ? Math.round(dewPoint * 10) / 10 : null;
}

/**
 * Stull's approximation of wet-bulb temperature (no iteration needed).
 * Valid for humidity 5-99% and temps -20 to +50°C.
 */
export function calcWetBulb(tempC: number | null, humidityPct: number | null): number | null {
  if (tempC === null || humidityPct === null) return null;
  if (humidityPct < 5 || humidityPct > 99) return null;
  const rh = humidityPct;
  const tw =
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;
  return Number.isFinite(tw) ? Math.round(tw * 10) / 10 : null;
}

/** WSC2 thresholds — adjusted for LiSOCl2 pack voltage curve. */
export function classifyBattery(voltage: number | null): 'good' | 'low' | 'critical' | 'unknown' {
  if (voltage === null || !Number.isFinite(voltage)) return 'unknown';
  if (voltage >= 3.7) return 'good';
  if (voltage >= 3.5) return 'low';
  return 'critical';
}

/**
 * Compute rainfall for this uplink from the cumulative counter diff.
 *
 * The WSC2 tipping bucket reports a monotonically increasing counter that
 * only resets at firmware-level power cycle (rare). Each tip equals a fixed
 * `mmPerTip` (the bucket's calibration constant — typically 0.2 mm for the
 * Dragino factory bucket, but adjustable per station after calibration).
 *
 * Returns null if we have no previous value, or if the counter went
 * backwards (treat as a reset — don't subtract, just log the reading).
 */
export function calcRainfallMm(
  currentCounter: number | null,
  previousCounter: number | null,
  mmPerTip: number = 0.2
): number | null {
  if (currentCounter === null) return null;
  if (previousCounter === null) return 0; // first measurement — no delta yet
  const diff = currentCounter - previousCounter;
  if (diff < 0) return 0;                  // counter reset
  if (diff > 10_000) return null;          // implausibly large — skip
  return Math.round(diff * mmPerTip * 100) / 100;
}

/** Dutch harvest-year rule: Nov/Dec → next year. */
export function getHarvestYear(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-12
  return month >= 11 ? year + 1 : year;
}

// ---- helpers ----

function numOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

/** Parse a value that might be a number or a numeric string (Dragino style). */
function parseNumLoose(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ---- Type mapping for DB insert ----

export interface WeatherMeasurementInsert {
  station_id: string;
  measured_at: string;
  frame_counter: number;
  f_port: number | null;
  // WSC2 (weather)
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  illuminance_lux: number | null;
  rain_counter: number | null;
  rainfall_mm: number | null;
  dew_point_c: number | null;
  wet_bulb_c: number | null;
  // SE01-LS (soil) — added in migration 080
  soil_moisture_pct: number | null;
  soil_temp_c: number | null;
  soil_conductivity_us_cm: number | null;
  // LMS01-LS (leaf) — added in migration 080
  leaf_wetness_pct_measured: number | null;
  leaf_temp_c: number | null;
  // Shared
  battery_v: number | null;
  battery_status: string | null;
  rssi_dbm: number | null;
  snr_db: number | null;
  gateway_count: number | null;
  raw_payload: TTNUplinkPayload;
  harvest_year: number;
}
