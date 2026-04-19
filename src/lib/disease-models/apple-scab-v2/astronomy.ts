/**
 * Astronomical sunrise/sunset calculator
 *
 * Uses NOAA solar position algorithm. Accurate to ~1 minute.
 * No external API dependency — pure math from lat/lng/date.
 *
 * Reference: Meeus, J. "Astronomical Algorithms" (1991), ch. 15
 * and NOAA Solar Calculator spreadsheet formulas.
 */

/**
 * Calculate sunrise and sunset for a given date and location.
 *
 * @param date - Any Date within the target day (UTC or local, both work)
 * @param latitude - degrees, positive = North
 * @param longitude - degrees, positive = East
 * @returns Sunrise and sunset as Date objects in UTC.
 *          Returns null if sun doesn't rise/set (polar regions).
 */
export function calculateSunTimes(
  date: Date,
  latitude: number,
  longitude: number
): { sunrise: Date; sunset: Date } | null {
  // Day of year (1-based)
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear =
    Math.floor(
      (date.getTime() - start.getTime()) / 86400000
    ) + 1;

  // Fractional year (radians)
  const gamma =
    ((2 * Math.PI) / 365.0) * (dayOfYear - 1 + (12 - 12) / 24);

  // Equation of time (minutes)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = (latitude * Math.PI) / 180;

  // Zenith angle for sunrise/sunset (90.833° accounting for refraction)
  const zenith = (90.833 * Math.PI) / 180;

  // Hour angle (radians)
  const cosH =
    (Math.cos(zenith) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));

  // Sun doesn't rise/set (polar day or night)
  if (cosH > 1 || cosH < -1) return null;

  const hourAngleDeg = (Math.acos(cosH) * 180) / Math.PI;

  // Sunrise UTC time (minutes from midnight UTC)
  const sunriseMinutes = 720 - 4 * (longitude + hourAngleDeg) - eqTime;
  const sunsetMinutes = 720 - 4 * (longitude - hourAngleDeg) - eqTime;

  // Build Date objects for the day (UTC)
  const dayStart = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );

  const sunrise = new Date(
    dayStart.getTime() + sunriseMinutes * 60 * 1000
  );
  const sunset = new Date(
    dayStart.getTime() + sunsetMinutes * 60 * 1000
  );

  return { sunrise, sunset };
}

/**
 * Check if a given timestamp falls within daylight hours at a location.
 *
 * RIMpro extends "night" to 60 minutes after sunrise (discharge inhibition
 * doesn't lift immediately at first light).
 */
export function isDaytime(
  timestamp: Date,
  latitude: number,
  longitude: number,
  sunriseOffsetMinutes = 60 // RIMpro: inhibition ends 60 min after sunrise
): boolean {
  const times = calculateSunTimes(timestamp, latitude, longitude);
  if (!times) {
    // Polar region fallback: use noon check
    const hour = timestamp.getUTCHours();
    return hour >= 6 && hour < 18;
  }

  const effectiveSunrise = new Date(
    times.sunrise.getTime() + sunriseOffsetMinutes * 60 * 1000
  );

  return (
    timestamp.getTime() >= effectiveSunrise.getTime() &&
    timestamp.getTime() < times.sunset.getTime()
  );
}

/**
 * Cached lookup for sun times by date string and location.
 * Prevents recalculating for every 30-minute step.
 */
const sunTimesCache = new Map<string, { sunrise: Date; sunset: Date } | null>();

export function getSunTimes(
  date: Date,
  latitude: number,
  longitude: number
): { sunrise: Date; sunset: Date } | null {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${latitude.toFixed(2)}-${longitude.toFixed(2)}`;
  if (sunTimesCache.has(key)) {
    return sunTimesCache.get(key) ?? null;
  }
  const result = calculateSunTimes(date, latitude, longitude);
  sunTimesCache.set(key, result);
  return result;
}
