import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, CalendarEventType, WeatherDay } from '@/components/calendar/types';
import { EVENT_COLORS } from '@/components/calendar/types';

async function getAuthUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;
  if (error) console.warn('[calendar] getUser() failed:', error.message, '— trying getSession() fallback');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

// ============================================================================
// Normalizers — map DB rows to CalendarEvent[]
// ============================================================================

function normalizeSpray(rows: any[]): CalendarEvent[] {
  return rows.map((row) => {
    const products = (row.products || []) as any[];
    const productNames = products.map((p: any) => p.product || p.name || '').filter(Boolean);
    const plotNames = (row.plot_names || []) as string[];
    return {
      id: `spray-${row.id}`,
      type: 'spray' as const,
      title: productNames.slice(0, 2).join(', ') || 'Bespuiting',
      subtitle: productNames.length > 2 ? `+${productNames.length - 2} middelen` : undefined,
      date: row.date,
      parcelIds: row.plots || [],
      parcelNames: plotNames,
      color: EVENT_COLORS.spray,
      status: 'completed',
      metadata: {
        products,
        registrationType: row.registration_type,
        rawInput: row.original_raw_input,
        harvestYear: row.harvest_year,
      },
    };
  });
}

function normalizeFieldNotes(rows: any[]): CalendarEvent[] {
  return rows.map((row) => ({
    id: `note-${row.id}`,
    type: 'field_note' as const,
    title: row.content?.slice(0, 60) || 'Veldnotitie',
    subtitle: row.auto_tag ? tagLabels[row.auto_tag] : undefined,
    date: row.due_date || row.created_at?.split('T')[0],
    parcelIds: row.parcel_ids || [],
    parcelNames: [],
    color: EVENT_COLORS.field_note,
    status: row.status,
    metadata: {
      content: row.content,
      autoTag: row.auto_tag,
      observationCategory: row.observation_category,
      observationSubject: row.observation_subject,
      source: row.source,
      photoUrl: row.photo_url,
      dueDate: row.due_date,
      isPinned: row.is_pinned,
    },
  }));
}

const tagLabels: Record<string, string> = {
  bespuiting: 'Bespuiting',
  bemesting: 'Bemesting',
  taak: 'Taak',
  waarneming: 'Waarneming',
  overig: 'Overig',
};

function normalizeHarvest(rows: any[]): CalendarEvent[] {
  return rows.map((row) => ({
    id: `harvest-${row.id}`,
    type: 'harvest' as const,
    title: `${row.variety || 'Oogst'} — ${row.total_crates} kisten`,
    subtitle: row.pick_number ? `Pluk ${row.pick_number}` : undefined,
    date: row.harvest_date,
    parcelIds: row.sub_parcel_id ? [row.sub_parcel_id] : [],
    parcelNames: row.sub_parcel_name ? [row.sub_parcel_name] : [],
    color: EVENT_COLORS.harvest,
    status: 'completed',
    metadata: {
      variety: row.variety,
      pickNumber: row.pick_number,
      totalCrates: row.total_crates,
      qualityClass: row.quality_class,
      weightPerCrate: row.weight_per_crate,
      season: row.season,
    },
  }));
}

function normalizeActiveSessions(rows: any[]): CalendarEvent[] {
  return rows.map((row) => ({
    id: `active-task-${row.id}`,
    type: 'task' as const,
    title: `${row.task_type_name || 'Taak'} (actief)`,
    subtitle: `${row.people_count} pers. — lopend`,
    date: row.start_time?.split('T')[0] || new Date().toISOString().split('T')[0],
    parcelIds: row.sub_parcel_id ? [row.sub_parcel_id] : [],
    parcelNames: row.sub_parcel_name ? [row.sub_parcel_name] : [],
    color: EVENT_COLORS.task,
    status: 'active',
    metadata: {
      taskTypeName: row.task_type_name,
      peopleCount: row.people_count,
      startTime: row.start_time,
      notes: row.notes,
      isActive: true,
    },
  }));
}

function normalizeTasks(rows: any[]): CalendarEvent[] {
  return rows.map((row) => ({
    id: `task-${row.id}`,
    type: 'task' as const,
    title: row.task_type_name || 'Taak',
    subtitle: `${row.people_count} pers. — ${row.total_hours}u`,
    date: row.start_date,
    endDate: row.end_date,
    parcelIds: row.sub_parcel_id ? [row.sub_parcel_id] : [],
    parcelNames: row.sub_parcel_name ? [row.sub_parcel_name] : [],
    color: EVENT_COLORS.task,
    status: 'completed',
    metadata: {
      taskTypeName: row.task_type_name,
      days: row.days,
      peopleCount: row.people_count,
      hoursPerPerson: row.hours_per_person,
      totalHours: row.total_hours,
      notes: row.notes,
      estimatedCost: row.estimated_cost,
    },
  }));
}

function normalizeDisease(rows: any[]): CalendarEvent[] {
  return rows.map((row) => {
    const severity = row.severity as string;
    return {
      id: `disease-${row.id}`,
      type: 'disease' as const,
      title: `Schurftinfectie — ${severity}`,
      subtitle: row.expected_symptom_date ? `Symptomen ~${row.expected_symptom_date}` : undefined,
      date: row.wet_period_start?.split('T')[0],
      endDate: row.wet_period_end?.split('T')[0],
      parcelIds: [],
      parcelNames: [],
      color: EVENT_COLORS.disease,
      severity: severity === 'severe' ? 'high' : severity === 'moderate' ? 'medium' : 'low',
      metadata: {
        wetPeriodStart: row.wet_period_start,
        wetPeriodEnd: row.wet_period_end,
        durationHours: row.wet_duration_hours,
        avgTemperature: row.avg_temperature,
        severity,
        rimValue: row.rim_value,
        pamAtEvent: row.pam_at_event,
        expectedSymptomDate: row.expected_symptom_date,
        isForecast: row.is_forecast,
      },
    };
  });
}

function normalizePhenology(rows: any[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const row of rows) {
    if (row.bloom_date_start) {
      events.push({
        id: `pheno-start-${row.id}`,
        type: 'phenology',
        title: `Start bloei — ${cropLabel(row.reference_crop)}`,
        date: row.bloom_date_start,
        parcelIds: [],
        parcelNames: [],
        color: EVENT_COLORS.phenology,
        metadata: { stage: 'F1', referenceCrop: row.reference_crop, year: row.year },
      });
    }
    if (row.bloom_date_f2) {
      events.push({
        id: `pheno-f2-${row.id}`,
        type: 'phenology',
        title: `Volle bloei — ${cropLabel(row.reference_crop)}`,
        date: row.bloom_date_f2,
        parcelIds: [],
        parcelNames: [],
        color: EVENT_COLORS.phenology,
        metadata: { stage: 'F2', referenceCrop: row.reference_crop, year: row.year },
      });
    }
    if (row.bloom_date_end) {
      events.push({
        id: `pheno-end-${row.id}`,
        type: 'phenology',
        title: `Einde bloei — ${cropLabel(row.reference_crop)}`,
        date: row.bloom_date_end,
        parcelIds: [],
        parcelNames: [],
        color: EVENT_COLORS.phenology,
        metadata: { stage: 'G', referenceCrop: row.reference_crop, year: row.year },
      });
    }
  }
  return events;
}

function cropLabel(ref: string): string {
  const labels: Record<string, string> = {
    conference_peer: 'Conference',
    jonagold_apple: 'Jonagold',
    elstar_apple: 'Elstar',
  };
  return labels[ref] || ref;
}

function normalizeWeatherAlerts(rows: any[]): CalendarEvent[] {
  const alertLabels: Record<string, string> = {
    frost: 'Vorstwaarschuwing',
    spray_window: 'Spuitvenster',
    extreme_rain: 'Extreme neerslag',
  };
  return rows.map((row) => ({
    id: `alert-${row.id}`,
    type: 'weather_alert' as const,
    title: alertLabels[row.alert_type] || row.alert_type,
    date: row.sent_at?.split('T')[0],
    parcelIds: [],
    parcelNames: [],
    color: EVENT_COLORS.weather_alert,
    severity: row.alert_type === 'frost' ? 'high' : row.alert_type === 'extreme_rain' ? 'high' : 'medium',
    metadata: {
      alertType: row.alert_type,
      payload: row.payload,
      sentAt: row.sent_at,
    },
  }));
}

// ============================================================================
// Main GET handler
// ============================================================================

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const typesParam = searchParams.get('types');
    const includeWeather = searchParams.get('weather') === '1';

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end query params required' }, { status: 400 });
    }

    const requestedTypes = new Set<CalendarEventType>(
      typesParam
        ? (typesParam.split(',') as CalendarEventType[])
        : ['spray', 'harvest', 'task', 'disease', 'phenology', 'weather_alert', 'field_note']
    );

    // Year for phenology lookup
    const startYear = new Date(start).getFullYear();
    const endYear = new Date(end).getFullYear();

    // Build parallel queries using async functions to ensure proper Promise types
    const queries: Promise<CalendarEvent[]>[] = [];

    // 1. Spray registrations
    if (requestedTypes.has('spray')) {
      queries.push((async () => {
        const { data, error } = await supabase
          .from('spuitschrift')
          .select('id, date, plots, products, registration_type, harvest_year, original_raw_input')
          .eq('user_id', user.id)
          .gte('date', start)
          .lte('date', end)
          .order('date', { ascending: true });
        if (error) { console.error('[calendar] spuitschrift error:', error.message); return []; }
        return normalizeSpray(data || []);
      })());
    }

    // 2. Field notes
    if (requestedTypes.has('field_note')) {
      queries.push((async () => {
        const { data, error } = await supabase
          .from('field_notes')
          .select('id, content, status, auto_tag, parcel_ids, observation_subject, observation_category, source, photo_url, due_date, is_pinned, created_at')
          .eq('user_id', user.id)
          .gte('created_at', `${start}T00:00:00`)
          .lte('created_at', `${end}T23:59:59`)
          .order('created_at', { ascending: true });
        if (error) { console.error('[calendar] field_notes error:', error.message); return []; }
        return normalizeFieldNotes(data || []);
      })());
    }

    // 3. Harvest registrations
    if (requestedTypes.has('harvest')) {
      queries.push((async () => {
        const { data, error } = await supabase
          .from('harvest_registrations')
          .select('id, harvest_date, variety, pick_number, total_crates, quality_class, weight_per_crate, season, sub_parcel_id')
          .eq('user_id', user.id)
          .gte('harvest_date', start)
          .lte('harvest_date', end)
          .order('harvest_date', { ascending: true });
        if (error) { console.error('[calendar] harvest error:', error.message); return []; }
        return normalizeHarvest(data || []);
      })());
    }

    // 4a. Task logs (completed tasks with task type name via join)
    if (requestedTypes.has('task')) {
      queries.push((async () => {
        const { data, error } = await supabase
          .from('task_logs')
          .select('id, start_date, end_date, days, sub_parcel_id, people_count, hours_per_person, total_hours, notes, task_types(name, default_hourly_rate)')
          .eq('user_id', user.id)
          .gte('start_date', start)
          .lte('start_date', end)
          .order('start_date', { ascending: true });
        if (error) { console.error('[calendar] task_logs error:', error.message); return []; }
        const enriched = (data || []).map((row: any) => ({
          ...row,
          task_type_name: row.task_types?.name || 'Taak',
          estimated_cost: (row.total_hours || 0) * (row.task_types?.default_hourly_rate || 0),
        }));
        return normalizeTasks(enriched);
      })());
    }

    // 4b. Active task sessions (currently running tasks)
    // Query underlying table (has user_id for RLS) with task_types join
    if (requestedTypes.has('task')) {
      queries.push((async () => {
        const { data, error } = await supabase
          .from('active_task_sessions')
          .select('id, task_type_id, sub_parcel_id, start_time, people_count, notes, task_types(name, default_hourly_rate), sub_parcels(id, variety, parcels(name))')
          .eq('user_id', user.id);
        if (error) { console.error('[calendar] active_sessions error:', error.message); return []; }
        const enriched = (data || []).map((row: any) => ({
          ...row,
          task_type_name: row.task_types?.name || 'Taak',
          sub_parcel_name: row.sub_parcels
            ? (row.sub_parcels.variety
                ? `${row.sub_parcels.parcels?.name} (${row.sub_parcels.variety})`
                : row.sub_parcels.parcels?.name)
            : null,
        }));
        return normalizeActiveSessions(enriched);
      })());
    }

    // 5. Disease infection periods
    if (requestedTypes.has('disease')) {
      queries.push((async () => {
        const { data, error } = await supabase
          .from('disease_infection_periods')
          .select('id, wet_period_start, wet_period_end, wet_duration_hours, avg_temperature, severity, rim_value, pam_at_event, degree_days_cumulative, expected_symptom_date, is_forecast, config_id')
          .gte('wet_period_start', `${start}T00:00:00`)
          .lte('wet_period_start', `${end}T23:59:59`)
          .neq('severity', 'none')
          .order('wet_period_start', { ascending: true });
        if (error) { console.error('[calendar] disease error:', error.message); return []; }
        return normalizeDisease(data || []);
      })());
    }

    // 6. Phenology reference
    if (requestedTypes.has('phenology')) {
      queries.push((async () => {
        const { data, error } = await supabase
          .from('phenology_reference')
          .select('id, reference_crop, year, bloom_date_f2, bloom_date_start, bloom_date_end')
          .gte('year', startYear)
          .lte('year', endYear);
        if (error) { console.error('[calendar] phenology error:', error.message); return []; }
        return normalizePhenology(data || []);
      })());
    }

    // 7. Weather alerts
    if (requestedTypes.has('weather_alert')) {
      queries.push((async () => {
        const { data, error } = await supabase
          .from('weather_alert_log')
          .select('id, alert_type, payload, sent_at')
          .eq('user_id', user.id)
          .gte('sent_at', `${start}T00:00:00`)
          .lte('sent_at', `${end}T23:59:59`)
          .order('sent_at', { ascending: true });
        if (error) { console.error('[calendar] weather_alert error:', error.message); return []; }
        return normalizeWeatherAlerts(data || []);
      })());
    }

    // Execute all queries in parallel
    const results = await Promise.all(queries);
    const events = results.flat().sort((a, b) => a.date.localeCompare(b.date));

    // Optional: weather daily data for WeatherStrip
    let weather: WeatherDay[] = [];
    if (includeWeather) {
      // Find user's first weather station via parcels → parcel_weather_stations
      const { data: parcels } = await supabase
        .from('parcels')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      let stationId: string | null = null;
      if (parcels && parcels.length > 0) {
        const { data: link } = await supabase
          .from('parcel_weather_stations')
          .select('station_id')
          .eq('parcel_id', parcels[0].id)
          .limit(1)
          .maybeSingle();
        stationId = link?.station_id ?? null;
      }

      // If no station found via first parcel, try all parcels
      if (!stationId && parcels && parcels.length > 0) {
        const { data: allParcels } = await supabase
          .from('parcels')
          .select('id')
          .eq('user_id', user.id);

        if (allParcels) {
          for (const p of allParcels) {
            const { data: link2 } = await supabase
              .from('parcel_weather_stations')
              .select('station_id')
              .eq('parcel_id', p.id)
              .limit(1)
              .maybeSingle();
            if (link2?.station_id) {
              stationId = link2.station_id;
              break;
            }
          }
        }
      }

      // Fallback: try weather_stations table directly
      if (!stationId) {
        const { data: directStations } = await supabase
          .from('weather_stations')
          .select('id')
          .limit(1);
        if (directStations && directStations.length > 0) {
          stationId = directStations[0].id;
        }
      }

      if (stationId) {
        const today = new Date().toISOString().split('T')[0]!;

        // Two parallel queries:
        // 1. Historical actuals for past dates (is_forecast=false) — accurate observed data
        // 2. Forecast for today + future dates (is_forecast=true) — 14-day forecast
        const [historicalResult, forecastResult] = await Promise.all([
          supabase
            .from('weather_data_daily')
            .select('date, temp_min_c, temp_max_c, precipitation_sum, leaf_wetness_hrs, is_forecast')
            .eq('station_id', stationId)
            .eq('is_forecast', false)
            .gte('date', start)
            .lt('date', today)
            .order('date', { ascending: true }),
          supabase
            .from('weather_data_daily')
            .select('date, temp_min_c, temp_max_c, precipitation_sum, leaf_wetness_hrs, is_forecast')
            .eq('station_id', stationId)
            .eq('is_forecast', true)
            .gte('date', today)
            .lte('date', end)
            .order('date', { ascending: true }),
        ]);

        // Merge: historical actuals for past, forecast for future
        // Use a Map to deduplicate (actuals take priority)
        const weatherMap = new Map<string, any>();

        // First add forecast (lower priority)
        for (const row of (forecastResult.data || [])) {
          weatherMap.set(row.date, row);
        }
        // Then add historical actuals (overwrite forecast for same date)
        for (const row of (historicalResult.data || [])) {
          weatherMap.set(row.date, row);
        }

        // Also try to get today's actual if it exists (might have partial data)
        const { data: todayActual } = await supabase
          .from('weather_data_daily')
          .select('date, temp_min_c, temp_max_c, precipitation_sum, leaf_wetness_hrs, is_forecast')
          .eq('station_id', stationId)
          .eq('date', today)
          .eq('is_forecast', false)
          .maybeSingle();

        if (todayActual) {
          weatherMap.set(today, todayActual);
        } else {
          // Fall back to forecast for today if no actual exists yet
          const { data: todayForecast } = await supabase
            .from('weather_data_daily')
            .select('date, temp_min_c, temp_max_c, precipitation_sum, leaf_wetness_hrs, is_forecast')
            .eq('station_id', stationId)
            .eq('date', today)
            .eq('is_forecast', true)
            .maybeSingle();
          if (todayForecast) {
            weatherMap.set(today, todayForecast);
          }
        }

        // Convert to sorted array
        weather = Array.from(weatherMap.values())
          .sort((a: any, b: any) => a.date.localeCompare(b.date))
          .map((row: any) => ({
            date: row.date,
            tempMin: row.temp_min_c,
            tempMax: row.temp_max_c,
            precipitationSum: row.precipitation_sum,
            leafWetnessHours: row.leaf_wetness_hrs,
            isForecast: row.is_forecast ?? false,
          }));
      }
    }

    return NextResponse.json({
      success: true,
      data: { events, weather },
    });
  } catch (err: any) {
    console.error('[calendar] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
