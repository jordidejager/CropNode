'use client';

import { useEffect, useState, useCallback } from 'react';
import { Wrench, Droplets, Sprout, Shield, AlertTriangle, CheckCircle2, Loader2, Info } from 'lucide-react';

interface OperationsData {
  harvestYear: number;
  summary: {
    totalSprays: number;
    totalFertilizations: number;
    totalCost: number;
    uniqueProducts: number;
    uniqueSubstances: number;
    parcelsWithSoilData: number;
    diseaseModelsActive: number;
  };
  productList: Array<{
    product: string;
    applications: number;
    totalCost: number;
    totalDosage: number;
    unit: string;
    avgCostPerApp: number;
    activeSubstances: string[];
    category: string;
    parcelCount: number;
  }>;
  balansRows: Array<{
    subParcelId: string;
    fullName: string;
    variety: string;
    hectares: number;
    nSupplyFromSoil: number | null;
    nFromFertilizer: number;
    nBehoefte: number;
    nBalance: number;
    nStatus: 'tekort' | 'op niveau' | 'overschot';
  }>;
  substanceList: Array<{
    substance: string;
    totalApplications: number;
    products: string[];
  }>;
  highRiskSubstances: Array<{ substance: string; totalApplications: number; products: string[] }>;
  diversityByCategory: Array<{ category: string; uniqueSubstances: number; substances: string[] }>;
  generatedAt: string;
  error?: string;
}

function StatusBadge({ status }: { status: 'tekort' | 'op niveau' | 'overschot' }) {
  const config = {
    tekort: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
    'op niveau': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    overschot: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${c.bg} ${c.text} ${c.border}`}>
      {status}
    </span>
  );
}

export default function OperationsPage() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/operations', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Fout');
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Wrench className="size-5 text-emerald-400" />
          Operationele intelligentie
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-lg">
          Middelenmix, bemestingsbalans en resistentie-management voor oogstjaar {data?.harvestYear || '…'}.
        </p>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="size-5 animate-spin mr-2" />
          <span className="text-sm">Data laden…</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-slate-200">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Droplets className="size-3.5 text-blue-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Bespuitingen</span>
              </div>
              <div className="text-xl font-semibold text-slate-100">{data.summary.totalSprays}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Sprout className="size-3.5 text-teal-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Bemestingen</span>
              </div>
              <div className="text-xl font-semibold text-slate-100">{data.summary.totalFertilizations}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="size-3.5 text-purple-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actieve stoffen</span>
              </div>
              <div className="text-xl font-semibold text-slate-100">{data.summary.uniqueSubstances}</div>
              <div className="text-[10px] text-slate-500">{data.summary.uniqueProducts} unieke producten</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Inputkosten</span>
              </div>
              <div className="text-xl font-semibold text-slate-100">€{data.summary.totalCost.toLocaleString('nl-NL')}</div>
              <div className="text-[10px] text-slate-500">totaal dit oogstjaar</div>
            </div>
          </div>

          {/* Spuit-rendement-matrix */}
          <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Middelenoverzicht</h3>
            {data.productList.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Nog geen middelengebruik geregistreerd dit oogstjaar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Product</th>
                      <th className="text-left px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider hidden md:table-cell">Categorie</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Toepassingen</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider hidden sm:table-cell">Dosis</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Totale kosten</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider hidden md:table-cell">Gem./behandeling</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.productList.map((p) => (
                      <tr key={p.product} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-2 py-2">
                          <div className="text-slate-200">{p.product}</div>
                          {p.activeSubstances && p.activeSubstances.length > 0 && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                              {p.activeSubstances.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-400 hidden md:table-cell capitalize">{p.category}</td>
                        <td className="px-2 py-2 text-right text-slate-200">{p.applications}×</td>
                        <td className="px-2 py-2 text-right text-slate-400 hidden sm:table-cell">{p.totalDosage.toFixed(1)} {p.unit}</td>
                        <td className="px-2 py-2 text-right text-slate-200 font-medium">
                          {p.totalCost > 0 ? `€${p.totalCost.toLocaleString('nl-NL')}` : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-400 hidden md:table-cell">
                          {p.avgCostPerApp > 0 ? `€${p.avgCostPerApp}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Resistentie risico */}
          {data.highRiskSubstances.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-100 mb-2 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-400" />
                Resistentie-aandacht
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">
                Werkzame stoffen met 6+ toepassingen dit seizoen — let op resistentie-opbouw en rotatie-strategie.
              </p>
              <div className="space-y-2">
                {data.highRiskSubstances.map((s) => (
                  <div key={s.substance} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                    <div>
                      <div className="text-sm text-slate-200 capitalize">{s.substance}</div>
                      <div className="text-[10px] text-slate-500">via {s.products.join(', ')}</div>
                    </div>
                    <span className="text-sm font-semibold text-amber-400">{s.totalApplications}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mode-of-action diversity */}
          {data.diversityByCategory.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-100 mb-3">Middeldiversiteit per categorie</h3>
              <p className="text-[11px] text-slate-500 mb-3">
                Meer unieke werkzame stoffen = betere rotatie, lager resistentierisico.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.diversityByCategory.map((d) => (
                  <div key={d.category} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider capitalize">
                      {d.category}
                    </div>
                    <div className="text-xl font-semibold text-slate-100 mt-1">{d.uniqueSubstances}</div>
                    <div className="text-[10px] text-slate-500">unieke stoffen</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bemestingsbalans */}
          <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-2">Stikstofbalans per subperceel</h3>
            <p className="text-[11px] text-slate-500 mb-3 flex items-start gap-1.5">
              <Info className="size-3 shrink-0 mt-0.5" />
              <span>
                Ruwe schatting op basis van bodem-N-leverend vermogen + bemestingsregistraties vs. gewasbehoefte.
                Bedoeld als signalering, niet als exact bemestingsadvies.
              </span>
            </p>
            {data.balansRows.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nog geen subpercelen beschikbaar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Perceel</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider hidden md:table-cell">Bodem N-lev</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider hidden md:table-cell">Bemesting (schat)</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider hidden md:table-cell">Behoefte</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Balans</th>
                      <th className="text-right px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.balansRows.map((r) => (
                      <tr key={r.subParcelId} className="border-b border-white/[0.03]">
                        <td className="px-2 py-2">
                          <div className="text-slate-200 text-xs">{r.fullName}</div>
                          <div className="text-[10px] text-slate-500">{r.variety}</div>
                        </td>
                        <td className="px-2 py-2 text-right text-xs text-slate-300 hidden md:table-cell">
                          {r.nSupplyFromSoil != null ? `${r.nSupplyFromSoil.toFixed(0)} kg/ha` : <span className="text-slate-600">geen monster</span>}
                        </td>
                        <td className="px-2 py-2 text-right text-xs text-slate-300 hidden md:table-cell">
                          {r.nFromFertilizer > 0 ? `+${r.nFromFertilizer} kg/ha` : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right text-xs text-slate-400 hidden md:table-cell">{r.nBehoefte} kg/ha</td>
                        <td className={`px-2 py-2 text-right text-xs font-semibold ${
                          r.nBalance < -20 ? 'text-red-400' : r.nBalance > 30 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {r.nBalance >= 0 ? '+' : ''}{r.nBalance.toFixed(0)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <StatusBadge status={r.nStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Substances breakdown */}
          {data.substanceList.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-100 mb-3">Werkzame stoffen</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.substanceList.map((s) => (
                  <div key={s.substance} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 border border-white/5">
                    <div>
                      <div className="text-sm text-slate-200 capitalize">{s.substance}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[260px]">{s.products.join(', ')}</div>
                    </div>
                    <span className={`text-sm font-semibold ${s.totalApplications >= 6 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {s.totalApplications}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All clear */}
          {data.highRiskSubstances.length === 0 && data.balansRows.every((r) => r.nStatus === 'op niveau') && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-slate-200 font-medium">Operationele status ziet er goed uit</p>
                <p className="text-xs text-slate-400 mt-0.5">Geen resistentierisico's of N-balans afwijkingen gedetecteerd.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
