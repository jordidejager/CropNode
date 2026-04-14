'use client';

import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ALL_EVENT_TYPES,
  EVENT_COLORS,
  EVENT_LABELS,
  EVENT_ICONS,
  type CalendarView,
  type CalendarEventType,
  type CalendarFilters,
} from './types';

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarView;
  filters: CalendarFilters;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange: (view: CalendarView) => void;
  onToggleType: (type: CalendarEventType) => void;
}

const viewLabels: Record<CalendarView, string> = {
  month: 'Maand',
  week: 'Week',
  day: 'Dag',
};

function getPeriodLabel(date: Date, view: CalendarView): string {
  switch (view) {
    case 'month':
      return format(date, 'MMMM yyyy', { locale: nl });
    case 'week': {
      const weekStart = getMonday(date);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `${format(weekStart, 'd MMM', { locale: nl })} – ${format(weekEnd, 'd MMM yyyy', { locale: nl })}`;
    }
    case 'day':
      return format(date, 'EEEE d MMMM yyyy', { locale: nl });
  }
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

export function CalendarHeader({
  currentDate,
  view,
  filters,
  onNavigate,
  onViewChange,
  onToggleType,
}: CalendarHeaderProps) {
  return (
    <div className="space-y-3">
      {/* Navigation Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate('prev')}
            className="h-9 w-9 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate('next')}
            className="h-9 w-9 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('today')}
            className="h-9 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] text-xs"
          >
            Vandaag
          </Button>
        </div>

        <h2 className="text-lg md:text-xl font-bold text-white capitalize flex-1 text-center">
          {getPeriodLabel(currentDate, view)}
        </h2>

        {/* View Switcher */}
        <div className="flex items-center bg-white/[0.03] rounded-lg border border-white/[0.06] p-0.5">
          {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                view === v
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              )}
            >
              <span className="hidden sm:inline">{viewLabels[v]}</span>
              <span className="sm:hidden">
                {v === 'month' ? 'M' : v === 'week' ? 'W' : 'D'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter Row — Event Type Toggles */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {ALL_EVENT_TYPES.map((type) => {
          const Icon = EVENT_ICONS[type];
          const isActive = filters.types.has(type);
          const color = EVENT_COLORS[type];
          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all border',
                isActive
                  ? 'border-white/[0.12] bg-white/[0.06]'
                  : 'border-transparent bg-white/[0.02] opacity-40 hover:opacity-70'
              )}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-slate-300">{EVENT_LABELS[type]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
