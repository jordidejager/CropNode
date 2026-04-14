'use client';

import { memo, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isToday, isSameMonth,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import { WeatherStrip } from './WeatherStrip';
import type { CalendarEvent, WeatherDay } from './types';

const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MAX_VISIBLE_EVENTS = 3;

interface MonthViewProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  weatherByDate: Map<string, WeatherDay>;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function MonthView({
  currentDate,
  eventsByDate,
  weatherByDate,
  onDayClick,
  onEventClick,
}: MonthViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentDate]);

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06]">
      {/* Day name headers */}
      <div className="grid grid-cols-7 bg-white/[0.02]">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid grid-cols-7 gap-px bg-white/[0.04]">
        {days.map((day) => (
          <MonthDayCell
            key={day.toISOString()}
            day={day}
            isCurrentMonth={isSameMonth(day, currentDate)}
            events={eventsByDate.get(format(day, 'yyyy-MM-dd')) || []}
            weather={weatherByDate.get(format(day, 'yyyy-MM-dd'))}
            onDayClick={onDayClick}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  );
}

interface MonthDayCellProps {
  day: Date;
  isCurrentMonth: boolean;
  events: CalendarEvent[];
  weather: WeatherDay | undefined;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const MonthDayCell = memo(function MonthDayCell({
  day,
  isCurrentMonth,
  events,
  weather,
  onDayClick,
  onEventClick,
}: MonthDayCellProps) {
  const today = isToday(day);
  const visibleEvents = events.slice(0, MAX_VISIBLE_EVENTS);
  const overflowCount = events.length - MAX_VISIBLE_EVENTS;

  return (
    <div
      onClick={() => onDayClick(day)}
      className={cn(
        'flex flex-col min-h-[110px] md:min-h-[120px] p-1.5 cursor-pointer transition-colors',
        'bg-[hsl(222,83%,5%)]',
        isCurrentMonth ? 'hover:bg-white/[0.03]' : 'opacity-40 hover:opacity-60',
        today && 'ring-1 ring-inset ring-emerald-500/30 bg-emerald-500/[0.03]',
      )}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            'text-xs font-medium leading-none',
            today
              ? 'text-emerald-400 font-bold'
              : isCurrentMonth
                ? 'text-slate-300'
                : 'text-slate-600',
          )}
        >
          {format(day, 'd')}
        </span>
        {today && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        )}
      </div>

      {/* Events */}
      <div className="flex flex-col gap-[2px] flex-1">
        {visibleEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            variant="compact"
            onClick={() => onEventClick(event)}
          />
        ))}
        {overflowCount > 0 && (
          <span className="text-[9px] text-slate-500 px-1 mt-0.5">
            +{overflowCount} meer
          </span>
        )}
      </div>

      {/* Weather */}
      <WeatherStrip weather={weather} variant="compact" />
    </div>
  );
});
