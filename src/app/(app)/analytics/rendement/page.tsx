'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Euro, TrendingUp, TrendingDown, Loader2, Info, AlertTriangle, Award, ArrowRight,
} from 'lucide-react';
import { DataSourceHint } from '@/components/analytics/shared/DataSourceHint';

const MarginHeatmap = dynamic(
  () => import('@/components/analytics/rendement/MarginHeatmap').then((m) => ({ default: m.MarginHeatmap })),
  { ssr: false }
);

interface MarginCell {
  subParcelId: string;
  fullName: string;
  variety: string;
  hectares: number;
  harvestYear: number;
  inputCost: number;
  totalKg: number;
  estimatedMargin: number;
  marginPerHa: number;
  hasYieldData: boolean;
  hasCostData: boolean;
  estimatedRevenue: number;
}

interface RendementData {
  cells: MarginCell[];
  years: number[];
  totalsByYear: Record<string, {
    totalCost: number; totalRevenue: number; totalMargin: number;
    totalHa: number; marginPerHa: number; parcelsWithData: number;
  }>;
  costLeaks: Array<{ cell: MarginCell; reason: string }>;
  rankings: Record<string, { top: MarginCell[]; bottom: MarginCell[] }>;
  note: string;
  generatedAt: string;
  error?: string;
}

export default function RendementPage() {
  const [data, setData] = useState<RendementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/rendement', { cache: 'no-store' });
      const json: RendementData = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Fout');
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const latestYear = data?.years?.[0];
  const latestTotals = latestYear ? data?.totalsByYear[String(latestYear)] : null;
  const prevYear = data?.years?.[1];
  const prevTotals = prevYear ? data?.totalsByYear[String(prevYear)] : null;
  const yoyMarginPct = latestTotals && prevTotals && prevTotals.marginPerHa !== 0
    ? ((latestTotals.marginPerHa - prevTotals.marginPerHa) / Math.abs(prevTotals.marginPerHa)) * 100
    : null;

  const latestRanking = latestYear ? data?.rankings[String(latestYear)] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Euro className="size-5 text-emerald-400" />
            Bedrijfsrendement
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-lg">
            Marge per perceel per jaar — waar verdien je geld, waar lek je geld.
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="size-5 animate-spin mr-2" />
          <span className="text-sm">Marges berekenen…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-slate-200">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Disclaimer */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
            <Info className="size-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300">
              {data.note} De getoonde marge is <strong>input-kosten vs. geschatte omzet</strong> —
              zonder arbeidskosten, verpakking, transport of overhead.
            </p>
          </div>

          {/* KPI row */}
          {latestTotals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Bedrijfsmarge {latestYear}
                </div>
                <div className={`text-xl font-semibold ${latestTotals.marginPerHa >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  €{latestTotals.marginPerHa.toLocaleString('nl-NL')}
                </div>
                <div className="text-[10px] text-slate-500">per ha (gem.)</div>
                {yoyMarginPct != null && (
                  <div className={`mt-1 flex items-center gap-1 text-[10px] ${yoyMarginPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {yoyMarginPct >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {yoyMarginPct >= 0 ? '+' : ''}{yoyMarginPct.toFixed(0)}% t.o.v. {prevYear}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Totale omzet
                </div>
                <div className="text-xl font-semibold text-slate-100">
                  €{latestTotals.totalRevenue.toLocaleString('nl-NL')}
                </div>
                <div className="text-[10px] text-slate-500">geschat ({latestYear})</div>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Totale inputkosten
                </div>
                <div className="text-xl font-semibold text-slate-100">
                  €{latestTotals.totalCost.toLocaleString('nl-NL')}
                </div>
                <div className="text-[10px] text-slate-500">middelen + bemesting</div>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Percelen met data
                </div>
                <div className="text-xl font-semibold text-slate-100">
                  {latestTotals.parcelsWithData}
                </div>
                <div className="text-[10px] text-slate-500">{latestTotals.totalHa.toFixed(1)} ha totaal</div>
              </div>
            </div>
          )}

          {/* Heatmap */}
          <div>
            <MarginHeatmap cells={data.cells} years={data.years} />
            <DataSourceHint
              variant="inline"
              label="Marge = omzet − inputkosten. Data uit bespuitings-prijzen + productiegeschiedenis."
              links={[
                { href: '/oogst/geschiedenis', text: 'Oogstkgs invoeren' },
                { href: '/slimme-invoer', text: 'Bespuiting met prijs registreren' },
              ]}
            />
          </div>

          {/* Ranking: beste + slechtste percelen */}
          {latestRanking && (latestRanking.top.length > 0 || latestRanking.bottom.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
                  <Award className="size-4 text-emerald-400" />
                  Rendabelst {latestYear}
                </h3>
                <div className="space-y-1.5">
                  {latestRanking.top.map((c) => (
                    <Link
                      key={c.subParcelId}
                      href={`/analytics/perceel?id=${c.subParcelId}`}
                      className="flex items-center justify-between hover:bg-white/5 rounded px-2 py-1.5 transition-colors"
                    >
                      <div>
                        <div className="text-xs text-slate-200">{c.fullName}</div>
                        <div className="text-[10px] text-slate-500">{c.variety}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-emerald-400">€{c.marginPerHa.toLocaleString('nl-NL')}</div>
                        <div className="text-[10px] text-slate-500">per ha</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-red-400" />
                  Aandacht nodig {latestYear}
                </h3>
                <div className="space-y-1.5">
                  {latestRanking.bottom.map((c) => (
                    <Link
                      key={c.subParcelId}
                      href={`/analytics/perceel?id=${c.subParcelId}`}
                      className="flex items-center justify-between hover:bg-white/5 rounded px-2 py-1.5 transition-colors"
                    >
                      <div>
                        <div className="text-xs text-slate-200">{c.fullName}</div>
                        <div className="text-[10px] text-slate-500">{c.variety}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${c.marginPerHa >= 0 ? 'text-amber-400' : 'text-red-400'}`}>€{c.marginPerHa.toLocaleString('nl-NL')}</div>
                        <div className="text-[10px] text-slate-500">per ha</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cost leaks */}
          {data.costLeaks.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-400" />
                Kostenlek-detector
              </h3>
              <p className="text-[11px] text-slate-500 mb-3">
                Percelen waar kosten buiten verhouding zijn t.o.v. opbrengst of bedrijfsgemiddelde.
              </p>
              <div className="space-y-2">
                {data.costLeaks.map((leak, i) => (
                  <Link
                    key={i}
                    href={`/analytics/perceel?id=${leak.cell.subParcelId}`}
                    className="flex items-center justify-between hover:bg-white/5 rounded-lg px-3 py-2 border border-white/5 transition-colors"
                  >
                    <div>
                      <div className="text-sm text-slate-200">
                        {leak.cell.fullName}
                        <span className="text-slate-600 mx-1.5">·</span>
                        <span className="text-slate-500">{leak.cell.harvestYear}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{leak.reason}</div>
                    </div>
                    <ArrowRight className="size-4 text-slate-600" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {data.cells.length === 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-8 text-center">
              <p className="text-sm text-slate-200 mb-1">Nog geen rendementsdata</p>
              <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
                Voor marge-berekening heeft CropNode twee dingen nodig: (1) bespuitingsregistraties
                mét productprijzen en (2) productiegeschiedenis.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/slimme-invoer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-medium">
                  Bespuiting registreren <ArrowRight className="size-3" />
                </Link>
                <Link href="/oogst/geschiedenis" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-1.5 text-xs font-medium">
                  Oogstkgs invoeren <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-600 text-center pt-2">
            Laatst bijgewerkt: {new Date(data.generatedAt).toLocaleString('nl-NL')}
          </p>
        </>
      )}
    </div>
  );
}
