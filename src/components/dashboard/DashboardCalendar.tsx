'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isToday, isSameMonth, isSameDay, addMonths,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  CalendarDays, ArrowRight, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalendarEvents, groupEventsByDate } from '@/hooks/use-calendar-events';
import {
  EVENT_COLORS, EVENT_ICONS,
  ALL_EVENT_TYPES,
  type CalendarEvent,
} from '@/components/calendar/types';
import { Skeleton } from '@/components/ui/skeleton';

const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

export function DashboardCalendar() {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentDate]);

  const start = useMemo(() => gridDays[0], [gridDays]);
  const end = useMemo(() => gridDays[gridDays.length - 1], [gridDays]);

  const { data, isLoading } = useCalendarEvents({
    start,
    end,
    types: ALL_EVENT_TYPES,
    includeWeather: false,
  });

  const eventsByDate = useMemo(
    () => groupEventsByDate(data?.events || []),
    [data?.events]
  );

  const goBack = () => setCurrentDate(d => addMonths(d, -1));
  const goForward = () => setCurrentDate(d => addMonths(d, 1));

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5" />
          Kalender
        </h2>
        <Link
          href="/kalender"
          className="text-xs text-white/25 hover:text-emerald-400 transition-colors flex items-center gap-1.5 group"
        >
          Volledig openen
          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="dashboard-card dashboard-shimmer rounded-2xl overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
          <button
            onClick={goBack}
            className="p-1 rounded-md hover:bg-white/[0.05] text-white/40 hover:text-white/70 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-white/70 capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: nl })}
          </span>
          <button
            onClick={goForward}
            className="p-1 rounded-md hover:bg-white/[0.05] text-white/40 hover:text-white/70 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-3">
            <Skeleton className="h-[240px] w-full rounded-lg" />
          </div>
        ) : (
          <>
            {/* Day name headers */}
            <div className="grid grid-cols-7">
              {DAY_NAMES.map((name) => (
                <div
                  key={name}
                  className="py-1.5 text-center text-[9px] font-semibold text-white/20 uppercase tracking-wider"
                >
                  {name}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px bg-white/[0.02] px-px pb-px">
              {gridDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayEvents = eventsByDate.get(dateKey) || [];
                return (
                  <MiniDayCell
                    key={dateKey}
                    day={day}
                    isCurrentMonth={isSameMonth(day, currentDate)}
                    events={dayEvents}
                  />
                );
              })}
            </div>

            {/* Legend */}
            <div className="px-4 py-2.5 border-t border-white/[0.04] flex flex-wrap gap-x-3 gap-y-1">
              <LegendItem color={EVENT_COLORS.spray} label="Bespuiting" />
              <LegendItem color={EVENT_COLORS.task} label="Taak" />
              <LegendItem color={EVENT_COLORS.disease} label="Infectie" />
              <LegendItem color={EVENT_COLORS.phenology} label="Groeifase" />
              <LegendItem color={EVENT_COLORS.field_note} label="Notitie" />
              <LegendItem color={EVENT_COLORS.harvest} label="Oogst" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniDayCell({
  day,
  isCurrentMonth,
  events,
}: {
  day: Date;
  isCurrentMonth: boolean;
  events: CalendarEvent[];
}) {
  const today = isToday(day);

  // Group events by type, take unique types for dot display
  const eventTypes = useMemo(() => {
    const seen = new Set<string>();
    return events.filter(e => {
      if (seen.has(e.type)) return false;
      seen.add(e.type);
      return true;
    });
  }, [events]);

  return (
    <Link
      href="/kalender"
      className={cn(
        'flex flex-col items-center py-1.5 min-h-[42px] transition-colors relative group',
        'bg-[hsl(222,83%,5%)]',
        isCurrentMonth ? 'hover:bg-white/[0.04]' : 'opacity-30',
        today && 'ring-1 ring-inset ring-emerald-500/30 bg-emerald-500/[0.04]',
      )}
    >
      {/* Day number */}
      <span
        className={cn(
          'text-[11px] leading-none font-medium',
          today
            ? 'text-emerald-400 font-bold'
            : isCurrentMonth
              ? 'text-white/50'
              : 'text-white/15',
        )}
      >
        {format(day, 'd')}
      </span>

      {/* Event dots */}
      {eventTypes.length > 0 && (
        <div className="flex items-center gap-[2px] mt-1">
          {eventTypes.slice(0, 4).map((event) => (
            <span
              key={event.type}
              className="w-[5px] h-[5px] rounded-full flex-shrink-0"
              style={{ backgroundColor: EVENT_COLORS[event.type] }}
            />
          ))}
        </div>
      )}

      {/* Tooltip on hover */}
      {events.length > 0 && isCurrentMonth && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
          <div className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl min-w-[140px] max-w-[200px]">
            <p className="text-[10px] font-medium text-white/60 mb-1">
              {format(day, 'd MMMM', { locale: nl })}
            </p>
            {events.slice(0, 4).map((event) => {
              const Icon = EVENT_ICONS[event.type];
              return (
                <div key={event.id} className="flex items-center gap-1.5 py-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: EVENT_COLORS[event.type] }}
                  />
                  <Icon className="h-2.5 w-2.5 flex-shrink-0 opacity-50" style={{ color: EVENT_COLORS[event.type] }} />
                  <span className="text-[10px] text-white/70 truncate">{event.title}</span>
                </div>
              );
            })}
            {events.length > 4 && (
              <p className="text-[9px] text-white/30 mt-0.5">+{events.length - 4} meer</p>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[9px] text-white/25">{label}</span>
    </div>
  );
}
