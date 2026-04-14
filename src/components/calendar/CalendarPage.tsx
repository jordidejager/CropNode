'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, addWeeks, addDays, format,
} from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { useCalendarEvents, groupEventsByDate, groupWeatherByDate } from '@/hooks/use-calendar-events';
import { CalendarHeader } from './CalendarHeader';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { EventDetail } from './EventDetail';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ALL_EVENT_TYPES,
  type CalendarView,
  type CalendarEventType,
  type CalendarEvent,
  type CalendarFilters,
} from './types';

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [filters, setFilters] = useState<CalendarFilters>({
    types: new Set(ALL_EVENT_TYPES),
    parcelId: null,
  });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Compute query date range based on view
  const { queryStart, queryEnd } = useMemo(() => {
    switch (view) {
      case 'month': {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          queryStart: startOfWeek(monthStart, { weekStartsOn: 1 }),
          queryEnd: endOfWeek(monthEnd, { weekStartsOn: 1 }),
        };
      }
      case 'week': {
        return {
          queryStart: startOfWeek(currentDate, { weekStartsOn: 1 }),
          queryEnd: endOfWeek(currentDate, { weekStartsOn: 1 }),
        };
      }
      case 'day': {
        return {
          queryStart: currentDate,
          queryEnd: currentDate,
        };
      }
    }
  }, [currentDate, view]);

  // Fetch data
  const { data, isLoading } = useCalendarEvents({
    start: queryStart,
    end: queryEnd,
    types: Array.from(filters.types),
    includeWeather: true,
  });

  // Group events and weather by date
  const eventsByDate = useMemo(
    () => groupEventsByDate(data?.events || []),
    [data?.events]
  );
  const weatherByDate = useMemo(
    () => groupWeatherByDate(data?.weather || []),
    [data?.weather]
  );

  // Navigation
  const navigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    setCurrentDate((prev) => {
      const delta = direction === 'next' ? 1 : -1;
      switch (view) {
        case 'month': return addMonths(prev, delta);
        case 'week': return addWeeks(prev, delta);
        case 'day': return addDays(prev, delta);
      }
    });
  }, [view]);

  const handleViewChange = useCallback((newView: CalendarView) => {
    setView(newView);
  }, []);

  const handleToggleType = useCallback((type: CalendarEventType) => {
    setFilters((prev) => {
      const next = new Set(prev.types);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return { ...prev, types: next };
    });
  }, []);

  const handleDayClick = useCallback((date: Date) => {
    setCurrentDate(date);
    setView('day');
  }, []);

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <CalendarDays className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Kalender</h1>
          <p className="text-xs text-slate-500">Al je activiteiten op één plek</p>
        </div>
      </div>

      {/* Header with nav + filters */}
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        filters={filters}
        onNavigate={navigate}
        onViewChange={handleViewChange}
        onToggleType={handleToggleType}
      />

      {/* Calendar Views */}
      {isLoading ? (
        <CalendarSkeleton view={view} />
      ) : (
        <>
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              eventsByDate={eventsByDate}
              weatherByDate={weatherByDate}
              onDayClick={handleDayClick}
              onEventClick={setSelectedEvent}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              eventsByDate={eventsByDate}
              weatherByDate={weatherByDate}
              onDayClick={handleDayClick}
              onEventClick={setSelectedEvent}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              eventsByDate={eventsByDate}
              weatherByDate={weatherByDate}
              onEventClick={setSelectedEvent}
            />
          )}
        </>
      )}

      {/* Event Detail Slide-Over */}
      <EventDetail
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}

function CalendarSkeleton({ view }: { view: CalendarView }) {
  if (view === 'month') {
    return (
      <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-none" />
        ))}
      </div>
    );
  }
  if (view === 'week') {
    return (
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-80 rounded-xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}
