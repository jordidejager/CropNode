"use client";

import React, { useMemo } from "react";
import { useParcelTimeline, type TimelineEvent } from "@/hooks/use-parcel-timeline";
import { Loader2, Droplets, FileText, Clock, FlaskConical, Apple, Bug, Image } from "lucide-react";
import { format, isToday, isYesterday, isThisWeek, isThisYear } from "date-fns";
import { nl } from "date-fns/locale";

const EVENT_CONFIG: Record<TimelineEvent['type'], { icon: React.ElementType; color: string; bg: string }> = {
  spray: { icon: Droplets, color: 'text-blue-400', bg: 'bg-blue-500/15' },
  note: { icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/15' },
  task: { icon: Clock, color: 'text-purple-400', bg: 'bg-purple-500/15' },
  soil: { icon: FlaskConical, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  harvest: { icon: Apple, color: 'text-rose-400', bg: 'bg-rose-500/15' },
  infection: { icon: Bug, color: 'text-red-400', bg: 'bg-red-500/15' },
};

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Vandaag';
  if (isYesterday(d)) return 'Gisteren';
  if (isThisWeek(d)) return format(d, 'EEEE', { locale: nl });
  if (isThisYear(d)) return format(d, 'd MMMM', { locale: nl });
  return format(d, 'd MMMM yyyy', { locale: nl });
}

function groupByDate(events: TimelineEvent[]): { date: string; label: string; events: TimelineEvent[] }[] {
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const key = e.date.split('T')[0]; // YYYY-MM-DD
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries()).map(([date, events]) => ({
    date,
    label: formatDateHeader(date),
    events,
  }));
}

interface ParcelTimelineProps {
  parcelId: string;
}

export function ParcelTimeline({ parcelId }: ParcelTimelineProps) {
  const { data: events = [], isLoading } = useParcelTimeline(parcelId);

  const grouped = useMemo(() => groupByDate(events), [events]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mx-auto">
          <Clock className="h-6 w-6 text-white/20" />
        </div>
        <p className="text-sm font-bold text-white/30">Geen activiteiten gevonden</p>
        <p className="text-xs text-white/15">Bespuitingen, veldnotities, uren en oogst verschijnen hier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-[11px] font-bold text-white/30 uppercase tracking-wider">
        {Object.entries(
          events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {} as Record<string, number>)
        ).map(([type, count]) => {
          const config = EVENT_CONFIG[type as TimelineEvent['type']];
          const Icon = config?.icon || FileText;
          return (
            <span key={type} className="flex items-center gap-1.5">
              <Icon className={`h-3 w-3 ${config?.color || 'text-white/30'}`} />
              {count}
            </span>
          );
        })}
        <span className="ml-auto">{events.length} events</span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/[0.06]" />

        {grouped.map((group) => (
          <div key={group.date} className="mb-6">
            {/* Date header */}
            <div className="relative flex items-center gap-3 mb-3">
              <div className="h-2.5 w-2.5 rounded-full bg-white/20 relative z-10 ring-4 ring-[#0A0A0A]" style={{ marginLeft: '14px' }} />
              <span className="text-xs font-black text-white/50 uppercase tracking-wider">{group.label}</span>
            </div>

            {/* Events */}
            <div className="space-y-1.5">
              {group.events.map((event) => {
                const config = EVENT_CONFIG[event.type];
                const Icon = config.icon;
                return (
                  <div key={event.id} className="relative flex items-start gap-3 pl-3 group/event">
                    {/* Connector dot */}
                    <div className={`relative z-10 h-[38px] w-[38px] rounded-xl ${config.bg} flex items-center justify-center shrink-0 transition-all group-hover/event:scale-110`}>
                      <Icon className={`h-4 w-4 ${config.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-white/80 group-hover/event:text-white transition-colors truncate">
                          {event.title}
                        </span>
                        <span className="text-[10px] text-white/20 shrink-0">
                          {format(new Date(event.date), 'HH:mm', { locale: nl }) !== '00:00'
                            ? format(new Date(event.date), 'HH:mm')
                            : ''}
                        </span>
                      </div>
                      {event.description && (
                        <p className="text-[12px] text-white/35 mt-0.5 truncate group-hover/event:text-white/50 transition-colors">
                          {event.description}
                        </p>
                      )}
                      {!!event.meta?.photo && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-white/20">
                          <Image className="h-3 w-3" /> Foto
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
