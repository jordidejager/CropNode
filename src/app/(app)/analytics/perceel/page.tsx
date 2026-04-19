'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  MapPin, Loader2, Apple, TrendingUp, TrendingDown, Minus,
  Sprout, Droplets, Shield, Gauge, ChevronDown,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { ParcelDiagnosticsData } from '@/lib/analytics/perceel/types';

const StoryTimeline = dynamic(
  () => import('@/components/analytics/perceel/StoryTimeline').then((m) => ({ default: m.StoryTimeline })),
  { ssr: false }
);
const YieldHistoryChart = dynamic(
  () => import('@/components/analytics/perceel/YieldHistoryChart').then((m) => ({ default: m.YieldHistoryChart })),
  { ssr: false }
);

interface SubParcelOption {
  id: string;
  name: string;
  variety: string;
  parcel_id: string;
  parcel_name: string;
  area: number;
}

// ============================================================================
// PARCEL PICKER
// ============================================================================

function ParcelPicker({
  options,
  selectedId,
  onSelect,
}: {
  options: SubParcelOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === selectedId);

  // Groepeer op hoofdperceel
  const grouped = useMemo(() => {
    const map = new Map<string, { parcelName: string; subs: SubParcelOption[] }>();
    options.forEach((o) => {
      if (!map.has(o.parcel_id)) {
        map.set(o.parcel_id, { parcelName: o.parcel_name, subs: [] });
      }
      map.get(o.parcel_id)!.subs.push(o);
    });
    return [...map.values()].sort((a, b) => a.parcelName.localeCompare(b.parcelName));
  }, [options]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] px-4 py-2 text-sm text-slate-200 transition-colors w-full sm:w-auto"
      >
        <MapPin className="size-4 text-emerald-400" />
        {selected ? (
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-semibold">{selected.parcel_name}</span>
            <span className="text-slate-600">—</span>
            <span>{selected.name}</span>
            <span className="text-slate-500 text-xs">· {selected.variety}</span>
          </span>
        ) : (
          <span className="text-slate-500">Selecteer perceel</span>
        )}
        <ChevronDown className={`size-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-20 w-full sm:w-[420px] max-h-[400px] overflow-y-auto rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
          {grouped.map((group) => (
            <div key={group.parcelName} className="py-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider bg-white/[0.02] flex items-center gap-1.5">
                <MapPin className="size-3" />
                {group.parcelName}
              </div>
              {group.subs.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => {
                    onSelect(sub.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-white/5 transition-colors ${
                    sub.id === selectedId ? 'bg-emerald-500/10' : ''
                  }`}
                >
                  <div className="text-sm text-slate-200">{sub.name}</div>
                  <div className="text-[10px] text-slate-500">{sub.variety} · {sub.area.toFixed(2)} ha</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AUTOPSY (rendement-uitleg op basis van data)
// ============================================================================

function AutopsySection({ data }: { data: ParcelDiagnosticsData }) {
  const { summary, yields, subParcel, profile, latestSoil } = data;

  // Bouw factoren-lijst op data
  const factors: Array<{
    label: string;
    detail: string;
    severity: 'positive' | 'neutral' | 'negative';
  }> = [];

  // Factor 1: opbrengsttrend
  if (summary.yieldChangePct != null && summary.avgKgPerHa5yr != null && summary.thisYearKgPerHa != null) {
    const vs5yr = ((summary.thisYearKgPerHa - summary.avgKgPerHa5yr) / summary.avgKgPerHa5yr) * 100;
    if (vs5yr < -10) {
      factors.push({
        label: `Opbrengst ${Math.round(vs5yr)}% onder 5-jaar gemiddelde`,
        detail: `Dit jaar ${Math.round(summary.thisYearKgPerHa).toLocaleString('nl-NL')} kg/ha vs. gemiddeld ${Math.round(summary.avgKgPerHa5yr).toLocaleString('nl-NL')} kg/ha over de laatste 5 jaar.`,
        severity: 'negative',
      });
    } else if (vs5yr > 10) {
      factors.push({
        label: `Opbrengst ${Math.round(vs5yr)}% boven 5-jaar gemiddelde`,
        detail: `Dit jaar ${Math.round(summary.thisYearKgPerHa).toLocaleString('nl-NL')} kg/ha vs. gemiddeld ${Math.round(summary.avgKgPerHa5yr).toLocaleString('nl-NL')} kg/ha.`,
        severity: 'positive',
      });
    }
  }

  // Factor 2: infecties
  if (summary.infectionEventsThisYear >= 10) {
    factors.push({
      label: `${summary.infectionEventsThisYear} schurft-infectie-events gemeten`,
      detail: `Bekijk in de tijdlijn of behandelingen tijdig op de infectieperiodes volgden.`,
      severity: summary.infectionEventsThisYear >= 20 ? 'negative' : 'neutral',
    });
  }

  // Factor 3: bodem
  if (latestSoil?.organische_stof_pct != null) {
    const os = latestSoil.organische_stof_pct;
    if (os < 2.5) {
      factors.push({
        label: `Organische stof laag (${os.toFixed(1)}%)`,
        detail: 'Onder streefwaarde 3.0% — overweeg compost/groenbemester voor structurele bodemopbouw.',
        severity: 'negative',
      });
    } else if (os > 4.0) {
      factors.push({
        label: `Organische stof goed op peil (${os.toFixed(1)}%)`,
        detail: 'Boven streefwaarde 4.0% — gezonde bodem.',
        severity: 'positive',
      });
    }
  }

  // Factor 4: leeftijd
  if (profile?.plantjaar) {
    const age = new Date().getFullYear() - profile.plantjaar;
    if (age > 18) {
      factors.push({
        label: `Boomgaard ${age} jaar oud`,
        detail: 'Oudere aanplant — productie kan natuurlijk afnemen. Overweeg vernieuwingsplanning.',
        severity: 'neutral',
      });
    } else if (age < 4) {
      factors.push({
        label: `Jonge aanplant (${age} jaar)`,
        detail: 'Bomen nog in opbouwfase — opbrengst bouwt nog op tot volproductie (~jaar 6-8).',
        severity: 'neutral',
      });
    }
  }

  // Factor 5: intensiteit behandelingen
  if (summary.thisYearTreatments > 25) {
    factors.push({
      label: `${summary.thisYearTreatments} bespuitingen dit seizoen`,
      detail: 'Hoog aantal — check of dit gerechtvaardigd is door ziektedruk of dat er ruimte is voor preventieve rationalisatie.',
      severity: 'neutral',
    });
  }

  if (factors.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-5 text-sm text-slate-500">
        Geen opvallende factoren gedetecteerd. Vul meer data in (bodemanalyse, productiegeschiedenis) voor scherpere uitleg.
      </div>
    );
  }

  const sevColors = {
    positive: { dot: 'bg-emerald-400', text: 'text-emerald-400', ring: 'border-emerald-500/20' },
    neutral: { dot: 'bg-amber-400', text: 'text-amber-400', ring: 'border-amber-500/20' },
    negative: { dot: 'bg-red-400', text: 'text-red-400', ring: 'border-red-500/20' },
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
      <h3 className="text-sm font-semibold text-slate-100 mb-3">Rendement-factoren</h3>
      <div className="space-y-2">
        {factors.map((f, i) => {
          const c = sevColors[f.severity];
          return (
            <div key={i} className={`rounded-lg border ${c.ring} bg-white/[0.02] p-3`}>
              <div className="flex items-start gap-2">
                <div className={`mt-1.5 size-1.5 rounded-full ${c.dot} shrink-0`} />
                <div>
                  <p className="text-sm font-medium text-slate-100">{f.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{f.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function PerceelDiagnosticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id');

  const [options, setOptions] = useState<SubParcelOption[]>([]);
  const [data, setData] = useState<ParcelDiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load sub-parcel options
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('sub_parcels').select('id, name, variety, parcel_id, area').order('name'),
      supabase.from('parcels').select('id, name').order('name'),
    ]).then(([subRes, parcRes]) => {
      const parcelMap = new Map<string, string>();
      (parcRes.data || []).forEach((p: any) => parcelMap.set(p.id, p.name));
      const opts = (subRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        variety: s.variety,
        parcel_id: s.parcel_id,
        parcel_name: parcelMap.get(s.parcel_id) || 'Onbekend',
        area: s.area || 0,
      }));
      setOptions(opts);

      // Als geen id in URL, pak eerste optie
      if (!selectedId && opts.length > 0) {
        router.replace(`/analytics/perceel?id=${opts[0].id}`);
      } else {
        setLoading(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data for selected parcel
  const loadData = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/perceel/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fout');
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadData(selectedId);
  }, [selectedId, loadData]);

  const handleSelect = (id: string) => {
    router.push(`/analytics/perceel?id=${id}`);
  };

  const peerAvg = useMemo(() => {
    if (!data?.comparisonPeers?.length) return 0;
    const sum = data.comparisonPeers.reduce((s, p) => s + p.avgKgPerHa, 0);
    return sum / data.comparisonPeers.length;
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <MapPin className="size-5 text-emerald-400" />
            Perceeldiagnose
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-lg">
            Eén perceel, alle data samen — bespuitingen, weer, infecties, oogst en bodem in één verhaal.
          </p>
        </div>
        <ParcelPicker options={options} selectedId={selectedId} onSelect={handleSelect} />
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="size-5 animate-spin mr-2" />
          <span className="text-sm">Gegevens laden…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-slate-200">
          {error}
        </div>
      )}

      {/* Data */}
      {data && !loading && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Apple className="size-3.5 text-orange-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Oogst dit jaar</span>
              </div>
              <div className="text-xl font-semibold text-slate-100">
                {data.summary.thisYearKgPerHa
                  ? `${Math.round(data.summary.thisYearKgPerHa).toLocaleString('nl-NL')}`
                  : '—'}
              </div>
              <div className="text-[10px] text-slate-500">kg/ha</div>
              {data.summary.yieldChangePct != null && (
                <div className={`mt-1 flex items-center gap-1 text-[10px] ${
                  data.summary.yieldChangePct > 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {data.summary.yieldChangePct > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {data.summary.yieldChangePct > 0 ? '+' : ''}{data.summary.yieldChangePct.toFixed(0)}% t.o.v. vorig jaar
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Droplets className="size-3.5 text-blue-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Bespuitingen</span>
              </div>
              <div className="text-xl font-semibold text-slate-100">{data.summary.thisYearTreatments}</div>
              <div className="text-[10px] text-slate-500">deze oogstcyclus</div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Sprout className="size-3.5 text-teal-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Bemestingen</span>
              </div>
              <div className="text-xl font-semibold text-slate-100">{data.summary.thisYearFertilizations}</div>
              <div className="text-[10px] text-slate-500">blad + strooi</div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="size-3.5 text-red-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Infectie-events</span>
              </div>
              <div className="text-xl font-semibold text-slate-100">{data.summary.infectionEventsThisYear}</div>
              <div className="text-[10px] text-slate-500">schurft-model</div>
            </div>
          </div>

          {/* Perceel info */}
          <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Perceel</div>
                <div className="text-slate-200 font-medium">
                  <span className="text-emerald-400">{data.subParcel.parcelName}</span>
                  <span className="text-slate-600 mx-1">—</span>
                  {data.subParcel.name}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Gewas · Ras</div>
                <div className="text-slate-200">{data.subParcel.crop} · {data.subParcel.variety}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Hectares</div>
                <div className="text-slate-200">{data.subParcel.hectares.toFixed(2)} ha</div>
              </div>
              {data.profile?.plantjaar && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Plantjaar</div>
                  <div className="text-slate-200">{data.profile.plantjaar} <span className="text-slate-500">({new Date().getFullYear() - data.profile.plantjaar} jr)</span></div>
                </div>
              )}
              {data.profile?.onderstam && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Onderstam</div>
                  <div className="text-slate-200">{data.profile.onderstam}</div>
                </div>
              )}
              {data.profile?.teeltsysteem && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Teeltsysteem</div>
                  <div className="text-slate-200">{data.profile.teeltsysteem}</div>
                </div>
              )}
              {data.profile?.hagelnet && data.profile.hagelnet !== 'Geen' && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Hagelnet</div>
                  <div className="text-slate-200">{data.profile.hagelnet}</div>
                </div>
              )}
              {data.profile?.irrigatie && data.profile.irrigatie !== 'Geen' && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Irrigatie</div>
                  <div className="text-slate-200">{data.profile.irrigatie}</div>
                </div>
              )}
            </div>

            {data.latestSoil && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Gauge className="size-3" />
                  Laatste grondmonster {data.latestSoil.source === 'inherited' ? '(overgenomen van hoofdperceel)' : '(eigen)'}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                  <div><div className="text-slate-500 text-[10px]">Org. stof</div><div className="text-slate-200 font-medium">{data.latestSoil.organische_stof_pct?.toFixed(1) || '—'}%</div></div>
                  <div><div className="text-slate-500 text-[10px]">N-leverend</div><div className="text-slate-200 font-medium">{data.latestSoil.n_leverend_vermogen_kg_ha?.toFixed(0) || '—'} kg/ha</div></div>
                  <div><div className="text-slate-500 text-[10px]">P-beschikbaar</div><div className="text-slate-200 font-medium">{data.latestSoil.p_plantbeschikbaar_kg_ha?.toFixed(0) || '—'} kg/ha</div></div>
                  <div><div className="text-slate-500 text-[10px]">P-Al</div><div className="text-slate-200 font-medium">{data.latestSoil.p_bodemvoorraad_p_al?.toFixed(0) || '—'}</div></div>
                  <div><div className="text-slate-500 text-[10px]">Klei</div><div className="text-slate-200 font-medium">{data.latestSoil.klei_percentage?.toFixed(0) || '—'}%</div></div>
                </div>
              </div>
            )}
          </div>

          {/* Story Timeline */}
          <StoryTimeline events={data.timeline} />

          {/* Yield chart */}
          <YieldHistoryChart yields={data.yields} peerAvg={peerAvg} />

          {/* Autopsy */}
          <AutopsySection data={data} />

          {/* Peer comparison */}
          {data.comparisonPeers.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-100 mb-3">
                Andere percelen met {data.subParcel.variety}
              </h3>
              <div className="space-y-1.5">
                {data.comparisonPeers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className="w-full flex items-center justify-between text-xs hover:bg-white/5 rounded px-2 py-1.5 transition-colors"
                  >
                    <span className="text-slate-300">{p.name}</span>
                    <span className="text-slate-500">{p.hectares.toFixed(2)} ha · {Math.round(p.avgKgPerHa).toLocaleString('nl-NL')} kg/ha gem.</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
