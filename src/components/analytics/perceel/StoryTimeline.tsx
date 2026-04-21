'use client';

import { useMemo, useState } from 'react';
import {
  Droplets, Sprout, Package, ShieldAlert, Snowflake, Sun, CloudRain, TestTube, X,
} from 'lucide-react';
import type { TimelineEvent, TimelineEventType } from '@/lib/analytics/perceel/types';

const EVENT_CONFIG: Record<TimelineEventType, {
  icon: any; color: string; bg: string; border: string; label: string;
}> = {
  'spray':             { icon: Droplets,    color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    label: 'Bespuiting' },
  'fertilize-leaf':    { icon: Sprout,      color: 'text-teal-400',    bg: 'bg-teal-500/15',    border: 'border-teal-500/30',    label: 'Bladvoeding' },
  'fertilize-spread':  { icon: Sprout,      color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   label: 'Strooibemesting' },
  'harvest':           { icon: Package,     color: 'text-orange-400',  bg: 'bg-orange-500/15',  border: 'border-orange-500/30',  label: 'Pluk' },
  'infection':         { icon: ShieldAlert, color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/30',     label: 'Infectierisico' },
  'frost':             { icon: Snowflake,   color: 'text-cyan-300',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/30',    label: 'Nachtvorst' },
  'heatwave':          { icon: Sun,         color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-400/20',     label: 'Hittedag' },
  'heavy-rain':        { icon: CloudRain,   color: 'text-sky-400',     bg: 'bg-sky-500/15',     border: 'border-sky-500/30',     label: 'Zware regen' },
  'soil-sample':       { icon: TestTube,    color: 'text-purple-400',  bg: 'bg-purple-500/15',  border: 'border-purple-500/30',  label: 'Grondmonster' },
};

interface StoryTimelineProps {
  events: TimelineEvent[];
}

const MONTH_NAMES_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]}`;
}

function EventDetail({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const cfg = EVENT_CONFIG[event.type];
  const Icon = cfg.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-lg ${cfg.bg} flex items-center justify-center ${cfg.border} border`}>
              <Icon className={`size-5 ${cfg.color}`} />
            </div>
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</div>
              <div className="text-sm font-semibold text-slate-100">{formatDate(event.date)}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="size-4" />
          </button>
        </div>

        <p className="text-sm text-slate-100 font-medium mb-1">{event.title}</p>
        {event.subtitle && <p className="text-xs text-slate-400 mb-3">{event.subtitle}</p>}

        {/* Products breakdown voor spuit */}
        {(event.type === 'spray' || event.type === 'fertilize-leaf' || event.type === 'fertilize-spread') && event.meta?.products && (
          <div className="space-y-1 mt-3 pt-3 border-t border-white/10">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Producten</p>
            {event.meta.products.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs text-slate-300">
                <span>{p.product}</span>
                <span className="text-slate-500">{p.dosage} {p.unit}</span>
              </div>
            ))}
          </div>
        )}

        {/* Harvest details */}
        {event.type === 'harvest' && event.meta && (
          <div className="space-y-1 mt-3 pt-3 border-t border-white/10 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Pluknummer</span><span className="text-slate-200">{event.meta.pickNumber || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Kisten</span><span className="text-slate-200">{event.meta.crates}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Geschat gewicht</span><span className="text-slate-200">{event.meta.kg?.toLocaleString('nl-NL')} kg</span></div>
            {event.meta.qualityClass && (
              <div className="flex justify-between"><span className="text-slate-500">Kwaliteit</span><span className="text-slate-200">{event.meta.qualityClass}</span></div>
            )}
          </div>
        )}

        {/* Soil details */}
        {event.type === 'soil-sample' && event.meta && (
          <div className="space-y-1 mt-3 pt-3 border-t border-white/10 text-xs">
            {event.meta.organische_stof_pct != null && (
              <div className="flex justify-between"><span className="text-slate-500">Organische stof</span><span className="text-slate-200">{event.meta.organische_stof_pct.toFixed(1)}%</span></div>
            )}
            {event.meta.n_leverend_vermogen_kg_ha != null && (
              <div className="flex justify-between"><span className="text-slate-500">N-leverend</span><span className="text-slate-200">{event.meta.n_leverend_vermogen_kg_ha.toFixed(0)} kg/ha</span></div>
            )}
            {event.meta.p_plantbeschikbaar_kg_ha != null && (
              <div className="flex justify-between"><span className="text-slate-500">P-beschikbaar</span><span className="text-slate-200">{event.meta.p_plantbeschikbaar_kg_ha.toFixed(0)} kg/ha</span></div>
            )}
            {event.meta.klei_percentage != null && (
              <div className="flex justify-between"><span className="text-slate-500">Klei</span><span className="text-slate-200">{event.meta.klei_percentage.toFixed(0)}%</span></div>
            )}
            {event.meta.source && (
              <div className="flex justify-between pt-2 border-t border-white/5 mt-2"><span className="text-slate-500">Bron</span><span className="text-slate-400">{event.meta.source === 'own' ? 'Eigen subperceel' : 'Hoofdperceel'}</span></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function StoryTimeline({ events }: StoryTimelineProps) {
  const [selected, setSelected] = useState<TimelineEvent | null>(null);

  // Bereken range
  const { months, eventsByMonth } = useMemo(() => {
    if (events.length === 0) return { months: [], eventsByMonth: new Map<string, TimelineEvent[]>() };

    const dates = events.map((e) => new Date(e.date));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    // Snap naar maandbegin/eind
    const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

    const months: Array<{ label: string; key: string; year: number; month: number }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      months.push({
        label: `${MONTH_NAMES_SHORT[cursor.getMonth()]} '${String(cursor.getFullYear()).slice(2)}`,
        key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        year: cursor.getFullYear(),
        month: cursor.getMonth(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const byMonth = new Map<string, TimelineEvent[]>();
    events.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(e);
    });
    byMonth.forEach((list) => list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

    return { months, eventsByMonth: byMonth };
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-8 text-center text-sm text-slate-500">
        Geen events in de geschiedenis van dit perceel.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-100">Tijdlijn</h3>
        <div className="flex flex-wrap gap-2">
          {(['spray', 'fertilize-leaf', 'harvest', 'infection', 'frost', 'soil-sample'] as TimelineEventType[]).map((t) => {
            const c = EVENT_CONFIG[t];
            const Icon = c.icon;
            return (
              <div key={t} className="flex items-center gap-1 text-[10px] text-slate-500">
                <Icon className={`size-2.5 ${c.color}`} />
                <span>{c.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-0.5 min-w-max">
          {months.map((m) => {
            const monthEvents = eventsByMonth.get(m.key) || [];
            return (
              <div key={m.key} className="flex flex-col items-stretch w-[88px] md:w-[120px]">
                <div className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider pb-2 border-b border-white/5">
                  {m.label}
                </div>
                <div className="pt-2 min-h-[220px] flex flex-col gap-1">
                  {monthEvents.length === 0 && (
                    <div className="h-full flex items-center justify-center text-slate-800 text-[10px]">·</div>
                  )}
                  {monthEvents.map((e) => {
                    const c = EVENT_CONFIG[e.type];
                    const Icon = c.icon;
                    const sevBorder = e.severity === 'high' ? 'ring-2 ring-red-500/50' : '';
                    return (
                      <button
                        key={e.id}
                        onClick={() => setSelected(e)}
                        className={`w-full text-left rounded-md border ${c.border} ${c.bg} p-1.5 hover:scale-[1.02] transition-transform ${sevBorder}`}
                        title={e.title}
                      >
                        <div className="flex items-center gap-1 mb-0.5">
                          <Icon className={`size-3 shrink-0 ${c.color}`} />
                          <span className="text-[9px] text-slate-500 font-mono">{formatDate(e.date)}</span>
                        </div>
                        <div className="text-[10px] text-slate-200 leading-tight line-clamp-2">{e.title}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && <EventDetail event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
