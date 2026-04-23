'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Radio, Plus, Settings, Zap } from 'lucide-react';
import { usePhysicalStations } from '@/hooks/use-physical-stations';
import { StationOverviewCard } from './StationOverviewCard';
import { StationDetailView } from './StationDetailView';
import { RegisterStationDialog } from './RegisterStationDialog';
import { EmptyHero } from './EmptyHero';

/**
 * Main Weerstations page. If the user has no registered station it shows an
 * empty hero with a big "Eerste station toevoegen" action. Otherwise it lists
 * all stations as rich overview cards; clicking a card drills into the detail
 * view.
 */
export function WeerstationsHub() {
  const { data: stations, isLoading } = usePhysicalStations();
  const [showRegister, setShowRegister] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedStation = stations?.find(s => s.id === selectedId) ?? null;

  // ---- Detail view ----
  if (selectedStation) {
    return (
      <StationDetailView
        station={selectedStation}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  // ---- Loading skeleton ----
  if (isLoading) {
    return (
      <div className="space-y-4 pb-12">
        <Header onAdd={() => setShowRegister(true)} hasStations={false} />
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-32 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ---- Empty state ----
  if (!stations || stations.length === 0) {
    return (
      <div className="pb-12">
        <Header onAdd={() => setShowRegister(true)} hasStations={false} />
        <EmptyHero onAdd={() => setShowRegister(true)} />
        {showRegister && (
          <RegisterStationDialog onClose={() => setShowRegister(false)} />
        )}
      </div>
    );
  }

  // ---- Overview list ----
  return (
    <div className="pb-12 space-y-5">
      <Header onAdd={() => setShowRegister(true)} hasStations count={stations.length} />

      <div className="space-y-3">
        {stations.map(station => (
          <StationOverviewCard
            key={station.id}
            station={station}
            onClick={() => setSelectedId(station.id)}
          />
        ))}
      </div>

      {showRegister && <RegisterStationDialog onClose={() => setShowRegister(false)} />}
    </div>
  );
}

// ---- Header ----

function Header({
  onAdd,
  hasStations,
  count,
}: {
  onAdd: () => void;
  hasStations: boolean;
  count?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center">
          <Radio className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Weerstations</h1>
          <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-emerald-400" />
            Eigen LoRaWAN-sensoren, live binnenkomende metingen
            {hasStations && count ? (
              <span className="ml-1 text-white/40">· {count} actief</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {hasStations && (
          <Link
            href="/instellingen/weerstations"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors px-2.5 py-2 text-xs font-semibold"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Beheer</span>
          </Link>
        )}
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-colors px-3 py-2 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          Station toevoegen
        </button>
      </div>
    </div>
  );
}
