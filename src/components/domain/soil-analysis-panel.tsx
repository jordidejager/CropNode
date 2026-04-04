"use client";

import React, { useCallback, useRef, useState } from "react";
import { useSoilAnalyses, useUploadSoilAnalysis, useApplyAnalysisToProfile } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Loader2, FileText, Calendar, FlaskConical, CheckCircle2,
  AlertTriangle, XCircle, ChevronRight, Copy, ArrowRight, Info,
} from "lucide-react";
import { WAARDERING_KLEUREN } from "@/lib/parcel-profile-constants";

interface SoilAnalysisPanelProps {
  parcelId?: string;
  subParcelId?: string;
}

function WaarderingBadge({ waardering }: { waardering: string }) {
  const colors = WAARDERING_KLEUREN[waardering] || WAARDERING_KLEUREN.goed;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text}`}>
      {colors.label}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'processing': return <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />;
    case 'failed': return <XCircle className="h-4 w-4 text-red-400" />;
    default: return <Loader2 className="h-4 w-4 text-white/30 animate-spin" />;
  }
}

export function SoilAnalysisPanel({ parcelId, subParcelId }: SoilAnalysisPanelProps) {
  const id = subParcelId || parcelId || '';
  const type = (subParcelId ? 'sub_parcel' : 'parcel') as 'parcel' | 'sub_parcel';
  const { data: analyses = [], isLoading } = useSoilAnalyses(id || undefined, type);
  const uploadMutation = useUploadSoilAnalysis(id, type);
  const applyMutation = useApplyAnalysisToProfile(id, type);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ variant: 'destructive', title: 'Fout', description: 'Alleen PDF bestanden worden geaccepteerd' });
      return;
    }
    try {
      await uploadMutation.mutateAsync(file);
      toast({ title: 'Upload gestart', description: 'Het rapport wordt geanalyseerd...' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload mislukt', description: err.message });
    }
  }, [uploadMutation, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleApply = useCallback(async (analysisId: string) => {
    try {
      await applyMutation.mutateAsync(analysisId);
      toast({ title: 'Toegepast', description: 'Bodemdata is overgenomen in het perceelprofiel.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fout', description: err.message });
    }
  }, [applyMutation, toast]);

  const selectedAnalysis = analyses.find((a: any) => a.id === selectedId);

  // RVO banner check (grondmonster dit jaar, voor 15 mei)
  const now = new Date();
  const rvoAnalysis = analyses.find((a: any) => {
    if (!a.datum_monstername) return false;
    const d = new Date(a.datum_monstername);
    return d.getFullYear() === now.getFullYear() && now.getMonth() < 4; // voor mei
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Detail view
  if (selectedAnalysis) {
    const a = selectedAnalysis;
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedId(null)} className="text-xs text-white/30 hover:text-white/60">&larr; Terug naar overzicht</button>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white">{a.rapport_identificatie || 'Grondmonster'}</h3>
              <p className="text-xs text-white/30">{a.lab} &middot; {a.datum_monstername} &middot; Laag: {a.bemonsterde_laag_cm || '?'}</p>
            </div>
            <StatusIcon status={a.extractie_status} />
          </div>

          {a.extractie_status === 'completed' && (
            <>
              {/* Stikstof blok */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-white/30 uppercase tracking-wider">Stikstof (N)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ResultCard label="N-totaal bodemvoorraad" value={a.n_totaal_bodemvoorraad_kg_ha} unit="kg N/ha" waardering={a.waarderingen?.n_totaal_bodemvoorraad} />
                  <ResultCard label="C/N-ratio" value={a.cn_ratio} waardering={a.waarderingen?.cn_ratio} />
                  <ResultCard label="N-leverend vermogen" value={a.n_leverend_vermogen_kg_ha} unit="kg N/ha" waardering={a.waarderingen?.n_leverend_vermogen} />
                </div>
              </div>

              {/* Fosfaat blok */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-white/30 uppercase tracking-wider">Fosfaat (P)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ResultCard label="P-plantbeschikbaar" value={a.p_plantbeschikbaar_kg_ha} unit="kg P/ha" waardering={a.waarderingen?.p_plantbeschikbaar} />
                  <ResultCard label="P-bodemvoorraad" value={a.p_bodemvoorraad_kg_ha} unit="kg P/ha" waardering={a.waarderingen?.p_bodemvoorraad} />
                  <ResultCard label="P-Al" value={a.p_bodemvoorraad_p_al} unit="mg P\u2082O\u2085/100g" />
                  <ResultCard label="Pw-getal" value={a.pw_getal} unit="mg P\u2082O\u2085/l" />
                </div>
              </div>

              {/* Organische stof & klei */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-white/30 uppercase tracking-wider">Bodem</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ResultCard label="Organische stof" value={a.organische_stof_pct} unit="%" />
                  <ResultCard label="Klei" value={a.klei_percentage} unit="%" />
                  <ResultCard label="Grondsoort" value={a.grondsoort_rapport} />
                </div>
              </div>

              {/* RVO waarden */}
              {(a.rvo_p_al_mg_p2o5 || a.rvo_p_cacl2_mg_kg) && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-bold text-amber-300">RVO Doorgave</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/40">P-Al:</span>{' '}
                      <span className="font-mono font-bold text-white">{a.rvo_p_al_mg_p2o5}</span>
                      <span className="text-white/30 text-xs ml-1">mg P\u2082O\u2085/100g</span>
                    </div>
                    <div>
                      <span className="text-white/40">P-CaCl\u2082:</span>{' '}
                      <span className="font-mono font-bold text-white">{a.rvo_p_cacl2_mg_kg}</span>
                      <span className="text-white/30 text-xs ml-1">mg P/kg</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bemestingsadviezen */}
              {a.bemestingsadviezen?.gewasgericht && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-white/30 uppercase tracking-wider">Bemestingsadvies (gewasgericht)</h4>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-white/30 uppercase tracking-wider">
                          <th className="text-left py-1">Nutrient</th>
                          <th className="text-left py-1">Gewas</th>
                          <th className="text-right py-1">Gift (kg/ha)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.bemestingsadviezen.gewasgericht.map((adv: any, i: number) => (
                          <tr key={i} className="border-t border-white/[0.04]">
                            <td className="py-1.5 text-white/70">{adv.nutrient}</td>
                            <td className="py-1.5 text-white/50">{adv.gewas}</td>
                            <td className="py-1.5 text-right font-mono font-bold text-white">{adv.gift_kg_ha}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Apply to profile */}
              <Button
                onClick={() => handleApply(a.id)}
                disabled={applyMutation.isPending}
                className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 font-bold"
              >
                {applyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                Toepassen op perceelprofiel
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* RVO Banner */}
      {rvoAnalysis && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-300">RVO Doorgave v\u00f3\u00f3r 15 mei</p>
            <p className="text-xs text-amber-200/60">Vergeet niet de grondmonsterresultaten door te geven aan RVO.</p>
          </div>
          <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/20" onClick={() => setSelectedId(rvoAnalysis.id)}>
            Bekijk waarden
          </Button>
        </div>
      )}

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 ${
          dragOver
            ? 'border-primary bg-primary/[0.08] shadow-lg shadow-primary/10'
            : 'border-white/[0.08] hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.04]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-white/50">Uploaden & analyseren...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-white/70">Sleep een Eurofins rapport hierheen</p>
              <p className="text-xs text-white/30 mt-1">of klik om te uploaden &middot; PDF &middot; Max 10 MB</p>
            </div>
          </div>
        )}
      </div>

      {/* Analyses Tijdlijn */}
      {analyses.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-wider px-1">Grondmonsters ({analyses.length})</h3>
          {analyses.map((a: any) => (
            <div
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-all group"
            >
              <StatusIcon status={a.extractie_status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{a.rapport_identificatie || a.pdf_filename || 'Grondmonster'}</p>
                <p className="text-[11px] text-white/30">{a.datum_monstername} &middot; {a.lab}</p>
              </div>

              {/* Quick summary badges */}
              {a.extractie_status === 'completed' && (
                <div className="hidden md:flex items-center gap-2">
                  {a.n_leverend_vermogen_kg_ha != null && (
                    <span className="text-[10px] text-white/30">NLV: <span className="font-mono text-white/50">{a.n_leverend_vermogen_kg_ha}</span></span>
                  )}
                  {a.organische_stof_pct != null && (
                    <span className="text-[10px] text-white/30">OS: <span className="font-mono text-white/50">{a.organische_stof_pct}%</span></span>
                  )}
                  {a.waarderingen?.n_leverend_vermogen && (
                    <WaarderingBadge waardering={a.waarderingen.n_leverend_vermogen.waardering} />
                  )}
                </div>
              )}

              <ChevronRight className="h-4 w-4 text-white/0 group-hover:text-white/30 transition-all shrink-0" />
            </div>
          ))}
        </div>
      )}

      {analyses.length === 0 && (
        <div className="text-center py-8">
          <FlaskConical className="h-8 w-8 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">Nog geen grondmonsters</p>
          <p className="text-xs text-white/15 mt-1">Upload een Eurofins rapport om te beginnen</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Result Card voor detail view
// ============================================

function ResultCard({
  label,
  value,
  unit,
  waardering,
}: {
  label: string;
  value: any;
  unit?: string;
  waardering?: { waardering: string; streeftraject?: string };
}) {
  if (value == null) return null;

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
      <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-lg font-black text-white tabular-nums">{typeof value === 'number' ? value : value}</span>
        {unit && <span className="text-[10px] text-white/25">{unit}</span>}
      </div>
      {waardering && (
        <div className="mt-1.5 flex items-center gap-2">
          <WaarderingBadge waardering={waardering.waardering} />
          {waardering.streeftraject && (
            <span className="text-[9px] text-white/20">streef: {waardering.streeftraject}</span>
          )}
        </div>
      )}
    </div>
  );
}
