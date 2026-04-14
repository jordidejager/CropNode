'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { CalendarEvent, CalendarEventType, WeatherDay } from '@/components/calendar/types';

interface CalendarEventsResponse {
  events: CalendarEvent[];
  weather: WeatherDay[];
}

interface UseCalendarEventsOptions {
  start: Date;
  end: Date;
  types?: CalendarEventType[];
  includeWeather?: boolean;
}

async function fetchCalendarEvents(opts: UseCalendarEventsOptions): Promise<CalendarEventsResponse> {
  const params = new URLSearchParams({
    start: format(opts.start, 'yyyy-MM-dd'),
    end: format(opts.end, 'yyyy-MM-dd'),
  });
  if (opts.types && opts.types.length > 0) {
    params.set('types', opts.types.join(','));
  }
  if (opts.includeWeather) {
    params.set('weather', '1');
  }

  const res = await fetch(`/api/calendar/events?${params.toString()}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Fout bij ophalen kalenderdata');
  return json.data;
}

export function useCalendarEvents(opts: UseCalendarEventsOptions) {
  return useQuery({
    queryKey: [
      'calendar-events',
      format(opts.start, 'yyyy-MM-dd'),
      format(opts.end, 'yyyy-MM-dd'),
      opts.types?.join(',') ?? 'all',
      opts.includeWeather ? '1' : '0',
    ],
    queryFn: () => fetchCalendarEvents(opts),
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Group events by date string (yyyy-MM-dd) for O(1) lookup per day cell
 */
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = event.date;
    const existing = map.get(key);
    if (existing) {
      existing.push(event);
    } else {
      map.set(key, [event]);
    }
  }
  return map;
}

/**
 * Group weather data by date for O(1) lookup
 */
export function groupWeatherByDate(weather: WeatherDay[]): Map<string, WeatherDay> {
  const map = new Map<string, WeatherDay>();
  for (const day of weather) {
    map.set(day.date, day);
  }
  return map;
}
