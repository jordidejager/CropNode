'use client';

import { useMemo } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isToday,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import { WeatherStrip } from './WeatherStrip';
import type { CalendarEvent, WeatherDay } from './types';

interface WeekViewProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  weatherByDate: Map<string, WeatherDay>;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function WeekView({
  currentDate,
  eventsByDate,
  weatherByDate,
  onDayClick,
  onEventClick,
}: WeekViewProps) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {weekDays.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const events = eventsByDate.get(dateKey) || [];
        const weather = weatherByDate.get(dateKey);
        const today = isToday(day);

        return (
          <div
            key={dateKey}
            className={cn(
              'flex flex-col rounded-xl border transition-colors',
              'bg-white/[0.02] border-white/[0.06]',
              today && 'ring-1 ring-emerald-500/30 border-emerald-500/20',
              'hover:bg-white/[0.03]',
            )}
          >
            {/* Day Header */}
            <button
              onClick={() => onDayClick(day)}
              className="flex flex-col items-center gap-0.5 px-2 pt-3 pb-2 cursor-pointer"
            >
              <span className="text-[10px] font-medium text-slate-500 uppercase">
                {format(day, 'EEE', { locale: nl })}
              </span>
              <span
                className={cn(
                  'text-xl font-bold',
                  today ? 'text-emerald-400' : 'text-white',
                )}
              >
                {format(day, 'd')}
              </span>
            </button>

            {/* Weather */}
            {weather && (
              <div className="px-2 pb-1">
                <WeatherStrip weather={weather} variant="compact" />
              </div>
            )}

            {/* Divider */}
            <div className="mx-2 border-t border-white/[0.06]" />

            {/* Events */}
            <div className="flex flex-col gap-1.5 p-2 min-h-[200px]">
              {events.length === 0 ? (
                <p className="text-[10px] text-slate-600 text-center mt-4">Geen activiteiten</p>
              ) : (
                events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant="expanded"
                    onClick={() => onEventClick(event)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
