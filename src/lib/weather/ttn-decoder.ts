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
      Payload_Ver?: number;
      Temperature?: number;
      Humidity?: number;
      Pressure?: string | number;      // TTN decoder returns string for Dragino
      illumination?: number;
      rain?: number;
      i_flag?: number;
      [k: string]: unknown;
    };
    rx_metadata?: Array<{
      gateway_ids?: { gateway_id?: string };
      rssi?: number;
      snr?: number;
      location?: { latitude?: number; longitude?: number; altitude?: number };
    }>;
    settings?: Record<string, unknown>;
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

  // Raw sensor values
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  illuminanceLux: number | null;
  rainCounter: number | null;
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
  const frameCounter = body.uplink_message?.f_cnt;
  const fPort = body.uplink_message?.f_port;
  const decoded = body.uplink_message?.decoded_payload;

  if (!deviceId) throw new InvalidTTNPayloadError('Missing end_device_ids.device_id');
  if (!applicationId) throw new InvalidTTNPayloadError('Missing application_id');
  if (!devEui) throw new InvalidTTNPayloadError('Missing dev_eui');
  if (!measuredAt) throw new InvalidTTNPayloadError('Missing received_at');
  if (frameCounter === undefined || frameCounter === null) {
    throw new InvalidTTNPayloadError('Missing uplink_message.f_cnt');
  }
  if (fPort === undefined || fPort === null) {
    throw new InvalidTTNPayloadError('Missing uplink_message.f_port');
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
  const batteryV = numOrNull(decoded?.BatV);

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
 * only resets at firmware-level power cycle (rare). Each tip = 0.1 mm.
 * Returns null if we have no previous value, or if the counter went
 * backwards (treat as a reset — don't subtract, just log the reading).
 */
export function calcRainfallMm(
  currentCounter: number | null,
  previousCounter: number | null
): number | null {
  if (currentCounter === null) return null;
  if (previousCounter === null) return 0; // first measurement — no delta yet
  const diff = currentCounter - previousCounter;
  if (diff < 0) return 0;                  // counter reset
  if (diff > 10_000) return null;          // implausibly large — skip
  return Math.round(diff * 0.1 * 100) / 100;
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

// ---- Type mapping for DB insert ----

export interface WeatherMeasurementInsert {
  station_id: string;
  measured_at: string;
  frame_counter: number;
  f_port: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  illuminance_lux: number | null;
  rain_counter: number | null;
  battery_v: number | null;
  rainfall_mm: number | null;
  dew_point_c: number | null;
  wet_bulb_c: number | null;
  battery_status: string | null;
  rssi_dbm: number | null;
  snr_db: number | null;
  gateway_count: number | null;
  raw_payload: TTNUplinkPayload;
  harvest_year: number;
}
