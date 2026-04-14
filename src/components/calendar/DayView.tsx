'use client';

import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarX } from 'lucide-react';
import { EventCard } from './EventCard';
import { WeatherStrip } from './WeatherStrip';
import { EVENT_LABELS, type CalendarEvent, type CalendarEventType, type WeatherDay } from './types';

interface DayViewProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  weatherByDate: Map<string, WeatherDay>;
  onEventClick: (event: CalendarEvent) => void;
}

export function DayView({
  currentDate,
  eventsByDate,
  weatherByDate,
  onEventClick,
}: DayViewProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const events = eventsByDate.get(dateKey) || [];
  const weather = weatherByDate.get(dateKey);

  // Group events by type for a cleaner layout
  const groupedEvents = groupByType(events);

  return (
    <div className="space-y-4">
      {/* Weather Summary */}
      {weather && (
        <WeatherStrip weather={weather} variant="expanded" />
      )}

      {/* Events */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <CalendarX className="h-6 w-6 text-slate-500" />
          </div>
          <p className="text-sm text-slate-400 font-medium">Geen activiteiten</p>
          <p className="text-xs text-slate-600 mt-1">
            {format(currentDate, 'EEEE d MMMM yyyy', { locale: nl })}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEvents.map(([type, typeEvents]) => (
            <div key={type}>
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                {EVENT_LABELS[type]}
                <span className="ml-1.5 text-slate-600">({typeEvents.length})</span>
              </h3>
              <div className="space-y-2">
                {typeEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant="expanded"
                    onClick={() => onEventClick(event)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByType(events: CalendarEvent[]): [CalendarEventType, CalendarEvent[]][] {
  const map = new Map<CalendarEventType, CalendarEvent[]>();
  for (const event of events) {
    const existing = map.get(event.type);
    if (existing) {
      existing.push(event);
    } else {
      map.set(event.type, [event]);
    }
  }
  return Array.from(map.entries());
}
