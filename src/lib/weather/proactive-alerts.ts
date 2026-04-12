/**
 * Proactive Weather Alerts.
 *
 * Checks forecast data for conditions that fruit growers need to act on:
 * - Nachtvorst (frost) — min temp < 0°C in coming 48h during bloom season (Mar-May)
 * - Spuitwindow — upcoming green window > 3h in coming 48h
 * - Infectierisico — reserved for future disease model integration
 *
 * Called from the weather-alerts cron job (2x daily: 06:00 + 18:00).
 * Sends WhatsApp messages to all users with linked phone numbers.
 *
 * Anti-spam:
 * - Each alert type has a cooldown (frost: 12h, spray window: 24h)
 * - Cooldown tracked via `weather_alert_log` table (upsert on user+type)
 * - Users can opt out via WhatsApp settings (future)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTextMessage } from '@/lib/whatsapp/client';
import { stripPlus } from '@/lib/whatsapp/phone-utils';

// ============================================================================
// Types
// ============================================================================

export type AlertType = 'frost' | 'spray_window' | 'extreme_rain';

interface FrostAlert {
  type: 'frost';
  stationName: string;
  date: string;       // YYYY-MM-DD
  minTemp: number;    // °C
  frostHours: number; // estimated
}

interface SprayWindowAlert {
  type: 'spray_window';
  stationName: string;
  windowStart: string; // "morgen 7:00"
  windowEnd: string;   // "morgen 11:00"
  durationH: number;
  avgScore: number;
}

interface ExtremeRainAlert {
  type: 'extreme_rain';
  stationName: string;
  date: string;
  precipMm: number;
}

type WeatherAlert = FrostAlert | SprayWindowAlert | ExtremeRainAlert;

// ============================================================================
// Constants
// ============================================================================

/** Frost alerts only during bloom season (week 9 through week 22 ≈ March-May) */
const FROST_SEASON_START_WEEK = 9;
const FROST_SEASON_END_WEEK = 22;

/** Cooldown between repeated alerts of the same type for the same user */
const ALERT_COOLDOWN_MS: Record<AlertType, number> = {
  frost: 12 * 60 * 60 * 1000,       // 12 hours
  spray_window: 24 * 60 * 60 * 1000, // 24 hours
  extreme_rain: 12 * 60 * 60 * 1000, // 12 hours
};

/** Extreme rain threshold (mm/day) */
const EXTREME_RAIN_THRESHOLD_MM = 25;

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Run all proactive alert checks for all users with linked WhatsApp numbers.
 * Called from the cron route.
 */
export async function runProactiveAlerts(db: SupabaseClient): Promise<{
  usersChecked: number;
  alertsSent: number;
}> {
  let alertsSent = 0;

  // 1. Get all users with active WhatsApp numbers + their weather stations
  const { data: linkedUsers } = await (db as any)
    .from('whatsapp_linked_numbers')
    .select('user_id, phone_number')
    .eq('is_active', true);

  if (!linkedUsers?.length) {
    return { usersChecked: 0, alertsSent: 0 };
  }

  // Dedupe by user_id (user may have multiple numbers)
  const userMap = new Map<string, string[]>();
  for (const lu of linkedUsers) {
    const phones = userMap.get(lu.user_id) || [];
    phones.push(lu.phone_number);
    userMap.set(lu.user_id, phones);
  }

  for (const [userId, phoneNumbers] of userMap) {
    try {
      // Get user's weather stations
      const { data: stations } = await (db as any)
        .from('weather_stations')
        .select('id, name')
        .eq('user_id', userId)
        .limit(1);

      if (!stations?.length) continue;
      const station = stations[0];

      // Fetch 48h forecast
      const now = new Date();
      const twoDaysLater = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const { data: hourlyData } = await (db as any)
        .from('weather_data_hourly')
        .select('timestamp, temperature_c, precipitation_mm, wind_speed_ms, humidity_pct, dew_point_c, wind_direction')
        .eq('station_id', station.id)
        .eq('model_name', 'best_match')
        .eq('is_forecast', true)
        .gte('timestamp', now.toISOString())
        .lte('timestamp', twoDaysLater.toISOString())
        .order('timestamp')
        .limit(100);

      if (!hourlyData?.length) continue;

      // Also get daily forecast for high-level checks
      const { data: dailyData } = await (db as any)
        .from('weather_data_daily')
        .select('date, temp_min_c, temp_max_c, precipitation_sum_mm, frost_hours')
        .eq('station_id', station.id)
        .gte('date', now.toISOString().split('T')[0])
        .order('date')
        .limit(3);

      // Check for alerts
      const alerts: WeatherAlert[] = [];

      // --- Frost check ---
      const currentWeek = getISOWeek(now);
      if (currentWeek >= FROST_SEASON_START_WEEK && currentWeek <= FROST_SEASON_END_WEEK) {
        const frostAlert = checkFrost(dailyData ?? [], station.name || 'jouw locatie');
        if (frostAlert) alerts.push(frostAlert);
      }

      // --- Extreme rain check ---
      const rainAlert = checkExtremeRain(dailyData ?? [], station.name || 'jouw locatie');
      if (rainAlert) alerts.push(rainAlert);

      // --- Send alerts (with cooldown) ---
      for (const alert of alerts) {
        const canSend = await checkCooldown(db, userId, alert.type);
        if (!canSend) continue;

        const message = formatAlert(alert);
        // Send to first linked number
        const phone = phoneNumbers[0];
        const metaPhone = stripPlus(phone);

        try {
          await sendTextMessage(metaPhone, message);
          await recordAlertSent(db, userId, alert.type, alert);
          alertsSent++;
          console.log(`[ProactiveAlerts] Sent ${alert.type} to ${userId}`);
        } catch (err) {
          console.error(`[ProactiveAlerts] Failed to send ${alert.type} to ${userId}:`, err);
        }
      }
    } catch (err) {
      console.error(`[ProactiveAlerts] Error for user ${userId}:`, err);
    }
  }

  return { usersChecked: userMap.size, alertsSent };
}

// ============================================================================
// Alert checks
// ============================================================================

function checkFrost(
  dailyData: Array<{ date: string; temp_min_c: number | null; frost_hours: number | null }>,
  stationName: string
): FrostAlert | null {
  for (const day of dailyData) {
    if (day.temp_min_c !== null && day.temp_min_c < 0) {
      return {
        type: 'frost',
        stationName,
        date: day.date,
        minTemp: day.temp_min_c,
        frostHours: day.frost_hours ?? 0,
      };
    }
  }
  return null;
}

function checkExtremeRain(
  dailyData: Array<{ date: string; precipitation_sum_mm: number | null }>,
  stationName: string
): ExtremeRainAlert | null {
  for (const day of dailyData) {
    if (day.precipitation_sum_mm !== null && day.precipitation_sum_mm >= EXTREME_RAIN_THRESHOLD_MM) {
      return {
        type: 'extreme_rain',
        stationName,
        date: day.date,
        precipMm: day.precipitation_sum_mm,
      };
    }
  }
  return null;
}

// ============================================================================
// Cooldown tracking
// ============================================================================

async function checkCooldown(
  db: SupabaseClient,
  userId: string,
  alertType: AlertType
): Promise<boolean> {
  const cooldownMs = ALERT_COOLDOWN_MS[alertType];
  const cutoff = new Date(Date.now() - cooldownMs).toISOString();

  const { data } = await (db as any)
    .from('weather_alert_log')
    .select('sent_at')
    .eq('user_id', userId)
    .eq('alert_type', alertType)
    .gte('sent_at', cutoff)
    .limit(1);

  return !data?.length; // Can send if no recent alert found
}

async function recordAlertSent(
  db: SupabaseClient,
  userId: string,
  alertType: AlertType,
  payload: WeatherAlert
): Promise<void> {
  await (db as any)
    .from('weather_alert_log')
    .insert({
      user_id: userId,
      alert_type: alertType,
      payload,
      sent_at: new Date().toISOString(),
    });
}

// ============================================================================
// Message formatting
// ============================================================================

function formatAlert(alert: WeatherAlert): string {
  switch (alert.type) {
    case 'frost': {
      const date = new Date(alert.date + 'T12:00:00');
      const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
      return [
        `❄️ *Nachtvorst-waarschuwing*`,
        ``,
        `Station *${alert.stationName}* verwacht nachtvorst op ${dayName}.`,
        `Minimumtemperatuur: *${alert.minTemp.toFixed(1)}°C*`,
        alert.frostHours > 0 ? `Geschatte vorstduur: ${alert.frostHours} uur` : '',
        ``,
        `⚠️ _Let op gevoelige gewassen in bloei. Overweeg vorstbescherming._`,
      ].filter(Boolean).join('\n');
    }

    case 'extreme_rain': {
      const date = new Date(alert.date + 'T12:00:00');
      const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
      return [
        `🌧️ *Extreme neerslag verwacht*`,
        ``,
        `Station *${alert.stationName}* verwacht ${alert.precipMm.toFixed(0)}mm regen op ${dayName}.`,
        ``,
        `⚠️ _Controleer drainage en stel eventuele bespuitingen uit._`,
      ].join('\n');
    }

    case 'spray_window':
      return [
        `🟢 *Goed spuitvenster*`,
        ``,
        `Station *${alert.stationName}*: gunstige omstandigheden van ${alert.windowStart} tot ${alert.windowEnd} (${alert.durationH}u).`,
        `Score: ${Math.round(alert.avgScore)}/100`,
      ].join('\n');
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getISOWeek(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
