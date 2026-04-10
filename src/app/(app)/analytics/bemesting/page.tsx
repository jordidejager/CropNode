'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Sprout, Leaf, FlaskConical, Droplets, MapPin, FileText,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ArrowDownRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WAARDERING_KLEUREN } from '@/lib/parcel-profile-constants';
import {
  fetchSoilAnalyses,
  buildHoofdPerceelBemesting,
  calculateBemestingStats,
  type SoilAnalysisRow,
  type HoofdPerceelBemesting,
  type SubParcelSoilData,
} from '@/lib/analytics/bemesting-queries';

// Lazy-load charts
const SoilComparisonChart = dynamic(() => import('@/components/analytics/bemesting/SoilComparisonChart').then(m => ({ default: m.SoilComparisonChart })), { ssr: false });
const NutrientRadarChart = dynamic(() => import('@/components/analytics/bemesting/NutrientRadarChart').then(m => ({ default: m.NutrientRadarChart })), { ssr: false });

// ============================================================================
// WAARDERING BADGE
// ============================================================================

function WaarderingBadge({ waardering }: { waardering: string }) {
  const colors = WAARDERING_KLEUREN[waardering] || WAARDERING_KLEUREN['goed'];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
      {colors.label}
    </span>
  );
}

// ============================================================================
// KPI CARD
// ============================================================================

function BemestingKPI({ label, value, unit, icon: Icon, color = 'emerald' }: {
  label: string; value: string | number | null; unit?: string; icon: any; color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-4 min-w-[140px]">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`size-4 text-${color}-400`} />
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xl font-semibold text-slate-100">
        {value !== null && value !== undefined ? value : '—'}
        {unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
      </span>
    </div>
  );
}

// ============================================================================
// VALUE CELL (for soil data)
// ============================================================================

function ValueCell({ label, value, unit, waardering }: { label: string; value: number | null | undefined; unit: string; waardering?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-slate-600 mb-0.5">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-slate-200">
          {value != null ? (typeof value === 'number' ? value.toFixed(1) : value) : '—'}
        </span>
        {unit && value != null && <span className="text-[10px] text-slate-500">{unit}</span>}
        {waardering && <WaarderingBadge waardering={waardering} />}
      </div>
    </div>
  );
}

// ============================================================================
// SUB-PARCEL ROW (within a hoofdperceel)
// ============================================================================

function SubParcelRow({ sp }: { sp: SubParcelSoilData }) {
  const a = sp.analysis;

  return (
    <tr className="border-b border-white/[0.03] hover:bg-white/[0.02]">
      <td className="py-2.5 pl-8 pr-3">
        <div className="flex items-center gap-2">
          <ArrowDownRight className="size-3 text-slate-700 shrink-0" />
          <div>
            <span className="text-sm text-slate-200">{sp.subParcelName}</span>
            <span className="text-[10px] text-slate-600 ml-2">{sp.crop} · {sp.variety}</span>
          </div>
        </div>
      </td>
      <td className="py-2.5 text-right text-xs text-slate-500">{sp.hectares.toFixed(2)}</td>
      <td className="py-2.5 text-right text-slate-200 text-xs">{a?.organische_stof_pct?.toFixed(1) ?? '—'}</td>
      <td className="py-2.5 text-right text-slate-200 text-xs">{a?.n_leverend_vermogen_kg_ha?.toFixed(0) ?? '—'}</td>
      <td className="py-2.5 text-right text-slate-200 text-xs">{a?.p_plantbeschikbaar_kg_ha?.toFixed(0) ?? '—'}</td>
      <td className="py-2.5 text-right text-slate-200 text-xs">{a?.p_bodemvoorraad_p_al?.toFixed(0) ?? '—'}</td>
      <td className="py-2.5 text-right text-slate-400 text-xs">{a?.klei_percentage?.toFixed(0) ?? '—'}</td>
      <td className="py-2.5 text-center">
        {sp.analysisSource === 'inherited' ? (
          <span className="text-[9px] text-slate-600 italic">overgenomen</span>
        ) : sp.analysisSource === 'direct' ? (
          <span className="text-[9px] text-emerald-500">eigen</span>
        ) : (
          <span className="text-[9px] text-slate-700">—</span>
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// HOOFDPERCEEL SECTION
// ============================================================================

function HoofdPerceelSection({ hoofd, isExpanded, onToggle }: {
  hoofd: HoofdPerceelBemesting;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const a = hoofd.hoofdAnalysis;
  const date = a?.datum_monstername ? new Date(a.datum_monstername).toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }) : null;
  const isExpired = a?.geldig_tot ? a.geldig_tot < new Date().getFullYear() : false;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
      {/* Hoofdperceel Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors border-b border-white/5"
      >
        {isExpanded ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
        <MapPin className="size-4 text-emerald-400" />
        <div className="flex-1 text-left">
          <span className="text-sm font-semibold text-slate-200">{hoofd.parcelName}</span>
          <span className="text-xs text-slate-500 ml-2">{hoofd.totalHa.toFixed(2)} ha · {hoofd.subParcels.length} {hoofd.subParcels.length === 1 ? 'blok' : 'blokken'}</span>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2">
          {date && (
            <span className="text-[10px] text-slate-500">{a?.lab || 'Eurofins'} · {date}</span>
          )}
          {isExpired && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
              <AlertTriangle className="size-3" /> Verlopen
            </span>
          )}
          {!isExpired && a && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              <CheckCircle2 className="size-3" /> Geldig
            </span>
          )}
          {!a && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">
              Geen grondmonster
            </span>
          )}
        </div>
      </button>

      {/* Expanded: Soil data summary + sub-parcel table */}
      {isExpanded && (
        <div>
          {/* Hoofdperceel soil values */}
          {a && (
            <div className="px-4 py-3 border-b border-white/5 bg-white/[0.01]">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Bodemwaarden grondmonster</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <ValueCell label="Org. stof" value={a.organische_stof_pct} unit="%" waardering={a.waarderingen?.organische_stof_pct?.waardering || a.waarderingen?.['Organische stof']?.waardering} />
                <ValueCell label="N-leverend" value={a.n_leverend_vermogen_kg_ha} unit="kg/ha" waardering={a.waarderingen?.n_leverend_vermogen_kg_ha?.waardering || a.waarderingen?.['N-leverend vermogen']?.waardering} />
                <ValueCell label="P-beschikbaar" value={a.p_plantbeschikbaar_kg_ha} unit="kg/ha" waardering={a.waarderingen?.p_plantbeschikbaar_kg_ha?.waardering || a.waarderingen?.['P-plantbeschikbaar']?.waardering} />
                <ValueCell label="P-Al" value={a.p_bodemvoorraad_p_al} unit="mg P₂O₅/100g" waardering={a.waarderingen?.p_bodemvoorraad_p_al?.waardering || a.waarderingen?.['P-AL']?.waardering} />
                <ValueCell label="Klei" value={a.klei_percentage} unit="%" />
                <ValueCell label="C/N-ratio" value={a.cn_ratio} unit="" waardering={a.waarderingen?.cn_ratio?.waardering || a.waarderingen?.['C/N-ratio']?.waardering} />
              </div>

              {/* Bemestingsadvies */}
              {a.bemestingsadviezen && (
                <div className="mt-3 pt-2 border-t border-white/5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Bemestingsadvies</p>
                  <div className="text-xs text-slate-400 space-y-0.5">
                    {typeof a.bemestingsadviezen === 'object' && a.bemestingsadviezen.bodemgericht && (
                      <p>Bodemgericht: {typeof a.bemestingsadviezen.bodemgericht === 'string' ? a.bemestingsadviezen.bodemgericht : JSON.stringify(a.bemestingsadviezen.bodemgericht).slice(0, 150)}</p>
                    )}
                    {typeof a.bemestingsadviezen === 'object' && a.bemestingsadviezen.gewasgericht && (
                      <p>Gewasgericht: {typeof a.bemestingsadviezen.gewasgericht === 'string' ? a.bemestingsadviezen.gewasgericht : JSON.stringify(a.bemestingsadviezen.gewasgericht).slice(0, 150)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub-parcels table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 px-3 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Subperceel</th>
                  <th className="text-right py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Ha</th>
                  <th className="text-right py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Org. stof %</th>
                  <th className="text-right py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">N-lev.</th>
                  <th className="text-right py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">P-besch.</th>
                  <th className="text-right py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">P-Al</th>
                  <th className="text-right py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Klei %</th>
                  <th className="text-center py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Bron</th>
                </tr>
              </thead>
              <tbody>
                {hoofd.subParcels.map((sp) => (
                  <SubParcelRow key={sp.subParcelId} sp={sp} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function BemestingEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
        <Sprout className="size-8 text-emerald-500/60" />
      </div>
      <h3 className="text-base font-medium text-slate-100 mb-2">Nog geen grondmonsters</h3>
      <p className="text-sm text-slate-400 max-w-md mb-4">
        Upload grondmonsters bij je percelen om hier een overzicht van je bodemkwaliteit te zien.
        Ga naar een perceel en upload je Eurofins rapport als PDF.
      </p>
      <a href="/percelen" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
        Naar Percelen
      </a>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function BemestingPage() {
  const [analyses, setAnalyses] = useState<SoilAnalysisRow[]>([]);
  const [subParcels, setSubParcels] = useState<any[]>([]);
  const [parcels, setParcels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();

      const [analysesData, spRes, pRes] = await Promise.all([
        fetchSoilAnalyses(),
        supabase.from('sub_parcels').select('id, parcel_id, name, crop, variety, area').order('name'),
        supabase.from('parcels').select('id, name, area').order('name'),
      ]);

      setAnalyses(analysesData);
      setSubParcels(spRes.data || []);
      setParcels(pRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const groups = useMemo(
    () => buildHoofdPerceelBemesting(analyses, subParcels, parcels),
    [analyses, subParcels, parcels]
  );

  const stats = useMemo(() => calculateBemestingStats(groups), [groups]);

  // Auto-expand all on first load
  useEffect(() => {
    if (groups.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set(groups.map((g) => g.parcelId)));
    }
  }, [groups, expandedGroups.size]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build flat list for charts (one entry per sub-parcel with data)
  const chartSummaries = useMemo(() => {
    return groups.flatMap((g) =>
      g.subParcels
                .map((sp) => ({
          parcelId: sp.subParcelId,
          parcelName: sp.subParcelName,
          variety: sp.variety,
          crop: sp.crop,
          hectares: sp.hectares,
          latestAnalysis: sp.analysis,
          analysisCount: 1,
          ph: null,
          organischeStof: sp.analysis?.organische_stof_pct ?? null,
          nLeverendVermogen: sp.analysis?.n_leverend_vermogen_kg_ha ?? null,
          pPlantbeschikbaar: sp.analysis?.p_plantbeschikbaar_kg_ha ?? null,
          pAl: sp.analysis?.p_bodemvoorraad_p_al ?? null,
          kleiPercentage: sp.analysis?.klei_percentage ?? null,
          waarderingen: sp.analysis?.waarderingen ?? null,
        }))
    );
  }, [groups]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-white/5 rounded" />
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" />)}
        </div>
        <div className="h-80 bg-white/[0.02] rounded-xl border border-white/5" />
      </div>
    );
  }

  if (groups.length === 0) {
    return <BemestingEmptyState />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sprout className="size-5 text-emerald-400" />
            Bemesting & Bodemkwaliteit
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Overzicht van grondmonsters per perceel — bodemwaarden worden overgenomen naar subpercelen
          </p>
        </div>
        <div className="text-xs text-slate-600">
          {stats.totalHoofdPercelen} {stats.totalHoofdPercelen === 1 ? 'perceel' : 'percelen'} · {stats.totalSubParcels} blokken met data
        </div>
      </div>

      {/* KPI Cards */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        <BemestingKPI label="Percelen" value={stats.totalHoofdPercelen} icon={MapPin} />
        <BemestingKPI label="Gem. org. stof" value={stats.avgOrganischeStof?.toFixed(1) ?? null} unit="%" icon={Leaf} color="amber" />
        <BemestingKPI label="Gem. N-leverend" value={stats.avgNLV?.toFixed(0) ?? null} unit="kg/ha" icon={FlaskConical} color="blue" />
        <BemestingKPI label="Gem. P-beschikbaar" value={stats.avgPBeschikbaar?.toFixed(0) ?? null} unit="kg/ha" icon={Droplets} color="purple" />
        <BemestingKPI label="Gem. P-Al" value={stats.avgPAl?.toFixed(0) ?? null} unit="mg" icon={FileText} color="teal" />
      </div>

      {/* Charts + Overview table side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SoilComparisonChart summaries={chartSummaries} />

        {/* Overzichtstabel */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Overzicht alle percelen</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Perceel</th>
                  <th className="text-left py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Ras</th>
                  <th className="text-right py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Ha</th>
                  <th className="text-right py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Org. stof %</th>
                  <th className="text-right py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">N-lev.</th>
                  <th className="text-right py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">P-besch.</th>
                  <th className="text-right py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">P-Al</th>
                  <th className="text-right py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Klei %</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((hoofd) => (
                  <React.Fragment key={hoofd.parcelId}>
                    {/* Hoofdperceel header row */}
                    <tr className="bg-white/[0.02]">
                      <td colSpan={8} className="py-2 px-2 text-xs font-semibold text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="size-3 text-emerald-400" />
                          {hoofd.parcelName}
                          <span className="text-slate-600 font-normal ml-1">{hoofd.totalHa.toFixed(2)} ha</span>
                        </div>
                      </td>
                    </tr>
                    {/* Sub-parcel rows */}
                    {hoofd.subParcels.map((sp) => {
                      const a = sp.analysis;
                      return (
                        <tr key={sp.subParcelId} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="py-1.5 pl-6 text-slate-200 text-xs">{sp.subParcelName}</td>
                          <td className="py-1.5 text-slate-400 text-xs">{sp.variety}</td>
                          <td className="py-1.5 text-right text-slate-400 text-xs">{sp.hectares.toFixed(2)}</td>
                          <td className="py-1.5 text-right text-slate-200 text-xs">{a?.organische_stof_pct?.toFixed(1) ?? '—'}</td>
                          <td className="py-1.5 text-right text-slate-200 text-xs">{a?.n_leverend_vermogen_kg_ha?.toFixed(0) ?? '—'}</td>
                          <td className="py-1.5 text-right text-slate-200 text-xs">{a?.p_plantbeschikbaar_kg_ha?.toFixed(0) ?? '—'}</td>
                          <td className="py-1.5 text-right text-slate-200 text-xs">{a?.p_bodemvoorraad_p_al?.toFixed(0) ?? '—'}</td>
                          <td className="py-1.5 text-right text-slate-400 text-xs">{a?.klei_percentage?.toFixed(0) ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Radar chart full width */}
      <NutrientRadarChart summaries={chartSummaries} />

      {/* Hoofdperceel sections */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">Percelen & Subpercelen</h2>
        {groups.map((hoofd) => (
          <HoofdPerceelSection
            key={hoofd.parcelId}
            hoofd={hoofd}
            isExpanded={expandedGroups.has(hoofd.parcelId)}
            onToggle={() => toggleGroup(hoofd.parcelId)}
          />
        ))}
      </div>
    </div>
  );
}
