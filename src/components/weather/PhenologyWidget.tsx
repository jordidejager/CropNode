'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Leaf, Check, ChevronRight, Thermometer } from 'lucide-react';
import type { PhenologyStatus } from '@/lib/weather/phenology';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhenologyData {
  events: PhenologyStatus[];
  gdd5: number;
  gdd10: number;
}

interface PhenologyWidgetProps {
  stationId: string;
}

type Crop = 'appel' | 'peer';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function usePhenology(stationId: string | null, crop: Crop) {
  return useQuery<PhenologyData>({
    queryKey: ['weather', 'phenology', stationId, crop],
    queryFn: async () => {
      const res = await fetch(
        `/api/weather/phenology?stationId=${stationId}&crop=${crop}`
      );
      if (!res.ok) throw new Error('Fenologie ophalen mislukt');
      const json = await res.json();
      return json.data;
    },
    enabled: !!stationId,
    staleTime: 30 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  bloei: 'Bloei',
  insect: 'Insecten',
  groei: 'Groei',
};

const CATEGORY_ORDER = ['bloei', 'insect', 'groei'];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

/**
 * Select the most relevant events to display:
 * - All reached events (past)
 * - The next upcoming event (current)
 * - A few future events after that
 * Max ~6 total
 */
function selectRelevantEvents(events: PhenologyStatus[]): PhenologyStatus[] {
  const reached = events.filter((e) => e.reached);
  const upcoming = events.filter((e) => !e.reached);

  // Show last 2 reached events + up to 4 upcoming
  const recentReached = reached.slice(-2);
  const nextUpcoming = upcoming.slice(0, Math.max(1, 6 - recentReached.length));

  return [...recentReached, ...nextUpcoming];
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function GDDProgressBar({ current, seasonMax }: { current: number; seasonMax: number }) {
  const pct = Math.min(100, (current / seasonMax) * 100);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <Thermometer className="h-4 w-4 text-emerald-400" />
        <span className="text-xs text-white/50 uppercase tracking-wider">GDD</span>
      </div>
      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-emerald-400 tabular-nums shrink-0">
        {Math.round(current)}
      </span>
    </div>
  );
}

function EventNode({ status, isLast }: { status: PhenologyStatus; isLast: boolean }) {
  const { event, progress, reached, estimatedDate } = status;
  const isCurrent = !reached && progress > 0;

  return (
    <div className="flex items-start gap-3 group">
      {/* Timeline track */}
      <div className="flex flex-col items-center">
        {/* Node */}
        <div className="relative">
          {reached ? (
            // Past: filled emerald with check
            <div className="w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
              <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} />
            </div>
          ) : isCurrent ? (
            // Current: pulsing ring
            <div className="w-7 h-7 rounded-full border-2 border-emerald-400 flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-30" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
          ) : (
            // Future: dimmed outline
            <div className="w-7 h-7 rounded-full border-2 border-white/15 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white/10" />
            </div>
          )}
        </div>
        {/* Connector line */}
        {!isLast && (
          <div
            className={`w-0.5 h-8 ${
              reached ? 'bg-emerald-500/30' : 'bg-white/5'
            }`}
          />
        )}
      </div>

      {/* Event content */}
      <div className={`flex-1 pb-3 -mt-0.5 ${!reached && !isCurrent ? 'opacity-40' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{event.icon}</span>
          <span
            className={`text-sm font-medium leading-tight ${
              reached ? 'text-white/70' : isCurrent ? 'text-white' : 'text-white/50'
            }`}
          >
            {event.nameNL}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1 ml-6">
          <span className="text-[10px] text-white/30 tabular-nums">
            {event.gddThreshold} GDD
          </span>
          {isCurrent && estimatedDate && (
            <>
              <ChevronRight className="h-2.5 w-2.5 text-white/20" />
              <span className="text-[10px] text-emerald-400 font-medium">
                ~{formatDate(estimatedDate)}
              </span>
            </>
          )}
          {isCurrent && (
            <span className="text-[10px] text-white/20 tabular-nums ml-auto">
              {Math.round(progress)}%
            </span>
          )}
          {reached && estimatedDate && (
            <span className="text-[10px] text-white/25">
              {formatDate(estimatedDate)}
            </span>
          )}
        </div>

        {/* Progress bar for current event */}
        {isCurrent && (
          <div className="ml-6 mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden max-w-[140px]">
            <div
              className="h-full rounded-full bg-emerald-500/60 transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Spray advice badge */}
        {event.sprayAdvice && isCurrent && (
          <div className="ml-6 mt-1.5 text-[10px] text-amber-400/70 bg-amber-400/5 rounded px-1.5 py-0.5 inline-block">
            {event.sprayAdvice.length > 60
              ? event.sprayAdvice.slice(0, 57) + '...'
              : event.sprayAdvice}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryGroup({
  category,
  events,
}: {
  category: string;
  events: PhenologyStatus[];
}) {
  if (events.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-widest text-white/25 font-medium">
          {CATEGORY_LABELS[category] ?? category}
        </span>
        <div className="flex-1 h-px bg-white/5" />
      </div>
      {events.map((status, i) => (
        <EventNode
          key={status.event.id}
          status={status}
          isLast={i === events.length - 1}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PhenologyWidget({ stationId }: PhenologyWidgetProps) {
  const [crop, setCrop] = useState<Crop>('appel');
  const { data, isLoading, isError } = usePhenology(stationId, crop);

  // Group events by category and select relevant ones
  const groupedEvents = useMemo(() => {
    if (!data?.events) return {};

    const relevant = selectRelevantEvents(data.events);
    const grouped: Record<string, PhenologyStatus[]> = {};

    for (const cat of CATEGORY_ORDER) {
      const catEvents = relevant.filter((e) => e.event.category === cat);
      if (catEvents.length > 0) {
        grouped[cat] = catEvents;
      }
    }

    return grouped;
  }, [data]);

  // Season progress: what fraction of the season's events have been reached
  const seasonProgress = useMemo(() => {
    if (!data?.events || data.events.length === 0) return 0;
    const reached = data.events.filter((e) => e.reached).length;
    return Math.round((reached / data.events.length) * 100);
  }, [data]);

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Leaf className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Fenologie</h3>
            <p className="text-[11px] text-white/35 leading-tight">
              Bloei & insecttiming op basis van graaddagen
            </p>
          </div>
        </div>

        {/* Crop toggle */}
        <div className="flex rounded-lg bg-white/5 p-0.5">
          {(['appel', 'peer'] as Crop[]).map((c) => (
            <button
              key={c}
              onClick={() => setCrop(c)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 ${
                crop === c
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {c === 'appel' ? '🍎 Appel' : '🍐 Peer'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-2 rounded-full bg-white/5 w-full" />
          <div className="space-y-4 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-white/5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 rounded bg-white/5 w-2/3" />
                  <div className="h-2 rounded bg-white/5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="text-center py-6">
          <p className="text-xs text-white/30">Fenologie kon niet geladen worden</p>
        </div>
      )}

      {/* Data */}
      {data && !isLoading && (
        <>
          {/* GDD KPI bar */}
          <div className="mb-4">
            <GDDProgressBar current={data.gdd5} seasonMax={700} />
            <div className="flex items-center justify-between mt-1.5 px-0.5">
              <span className="text-[10px] text-white/20">
                Base 5°C — seizoen {seasonProgress}% voltooid
              </span>
              <span className="text-[10px] text-white/20 tabular-nums">
                GDD₁₀: {Math.round(data.gdd10)}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/5 mb-4" />

          {/* Timeline */}
          <div className="space-y-3">
            {CATEGORY_ORDER.map((cat) =>
              groupedEvents[cat] ? (
                <CategoryGroup
                  key={cat}
                  category={cat}
                  events={groupedEvents[cat]}
                />
              ) : null
            )}
          </div>

          {/* Empty state */}
          {Object.keys(groupedEvents).length === 0 && (
            <div className="text-center py-6">
              <p className="text-xs text-white/30">
                Geen fenologische data beschikbaar
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
