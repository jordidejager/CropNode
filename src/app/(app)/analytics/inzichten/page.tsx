'use client';

import { useState, useCallback } from 'react';
import {
  Sparkles, RefreshCw, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, BarChart3, Droplets, Shield,
  CloudRain, Wrench, Leaf, Eye, Target, CheckCircle2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';

const InsightMiniChart = dynamic(() => import('@/components/analytics/inzichten/InsightMiniChart').then(m => ({ default: m.InsightMiniChart })), { ssr: false });

// ============================================================================
// TYPES
// ============================================================================

interface Insight {
  titel: string;
  beschrijving: string;
  type: 'vergelijking' | 'correlatie' | 'trend' | 'uitschieter' | 'risico';
  categorie: 'productie' | 'bodem' | 'gewasbescherming' | 'weer' | 'infrastructuur';
  sterkte: 'sterk' | 'matig' | 'zwak';
  betrokken_percelen: string[];
  datapunten: Record<string, number>;
  visualisatie_type: 'bar_vergelijking' | 'lijn_trend' | 'scatter' | 'waarde_highlight';
}

interface DataCheck {
  percelen: number;
  perceelprofielen: number;
  grondmonsters: number;
  productiejaren: number;
  spuitregistraties: number;
  weerjaren: number;
}

interface InzichtenResponse {
  insights: Insight[];
  cached: boolean;
  generated_at?: string;
  data_check: DataCheck;
  error?: string;
}

// ============================================================================
// CATEGORY CONFIG
// ============================================================================

const CATEGORY_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  productie: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Productie' },
  bodem: { icon: Leaf, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Bodem' },
  gewasbescherming: { icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Gewasbescherming' },
  weer: { icon: CloudRain, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Weer' },
  infrastructuur: { icon: Wrench, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Infrastructuur' },
};

const TYPE_ICONS: Record<string, any> = {
  vergelijking: BarChart3,
  correlatie: Target,
  trend: TrendingUp,
  uitschieter: AlertTriangle,
  risico: AlertTriangle,
};

// ============================================================================
// STERKTE INDICATOR (3 dots)
// ============================================================================

function SterkteIndicator({ sterkte }: { sterkte: string }) {
  const filled = sterkte === 'sterk' ? 3 : sterkte === 'matig' ? 2 : 1;
  return (
    <div className="flex items-center gap-1" title={`Sterkte: ${sterkte}`}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`size-1.5 rounded-full ${i <= filled ? 'bg-emerald-400' : 'bg-white/10'}`}
        />
      ))}
    </div>
  );
}

// ============================================================================
// INSIGHT CARD
// ============================================================================

function InsightCard({ insight }: { insight: Insight }) {
  const cat = CATEGORY_CONFIG[insight.categorie] || CATEGORY_CONFIG.productie;
  const CatIcon = cat.icon;
  const TypeIcon = TYPE_ICONS[insight.type] || Eye;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 hover:border-white/10 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`flex size-7 items-center justify-center rounded-lg ${cat.bg}`}>
            <CatIcon className={`size-3.5 ${cat.color}`} />
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
          <TypeIcon className="size-3 text-slate-600" />
        </div>
        <SterkteIndicator sterkte={insight.sterkte} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-slate-100 mb-2">{insight.titel}</h3>

      {/* Description */}
      <p className="text-xs text-slate-400 leading-relaxed mb-4">{insight.beschrijving}</p>

      {/* Mini Chart */}
      {insight.datapunten && Object.keys(insight.datapunten).length > 0 && (
        <div className="mb-3">
          <InsightMiniChart
            data={insight.datapunten}
            type={insight.visualisatie_type}
            categorie={insight.categorie}
          />
        </div>
      )}

      {/* Betrokken percelen */}
      {insight.betrokken_percelen?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {insight.betrokken_percelen.map((p) => (
            <span key={p} className="text-[10px] text-slate-500 bg-white/5 rounded px-1.5 py-0.5">{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DATA CHECKLIST
// ============================================================================

function DataChecklist({ check }: { check: DataCheck }) {
  const items = [
    { label: 'Percelen', value: check.percelen, ok: check.percelen > 0 },
    { label: 'Perceelprofielen', value: check.perceelprofielen, ok: check.perceelprofielen > 0 },
    { label: 'Grondmonsters', value: check.grondmonsters, ok: check.grondmonsters > 0 },
    { label: 'Productiejaren', value: check.productiejaren, ok: check.productiejaren >= 2 },
    { label: 'Spuitregistraties', value: check.spuitregistraties, ok: check.spuitregistraties > 0 },
    { label: 'Weerjaren', value: check.weerjaren, ok: check.weerjaren > 0 },
  ];

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">Beschikbare data</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            {item.ok ? (
              <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="size-3.5 text-slate-600 shrink-0" />
            )}
            <span className={item.ok ? 'text-slate-300' : 'text-slate-600'}>
              {item.label}: {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function InzichtenPage() {
  const [response, setResponse] = useState<InzichtenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/inzichten/generate', { method: 'POST' });
      const data: InzichtenResponse = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Er ging iets mis.');
        if (data.data_check) setResponse({ ...data, insights: data.insights || [] });
      } else {
        setResponse(data);
      }
    } catch (err: any) {
      setError(err.message || 'Verbindingsfout.');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="size-5 text-emerald-400" />
            Inzichten
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-lg">
            CropNode analyseert automatisch verbanden in je data. Hoe meer data je invoert, hoe scherper de inzichten worden.
          </p>
        </div>
        <Button
          onClick={generate}
          disabled={loading}
          className="bg-emerald-600 text-white hover:bg-emerald-500 shrink-0"
        >
          {loading ? (
            <><Loader2 className="size-4 animate-spin mr-1.5" /> Analyseren...</>
          ) : response ? (
            <><RefreshCw className="size-4 mr-1.5" /> Opnieuw analyseren</>
          ) : (
            <><Sparkles className="size-4 mr-1.5" /> Analyseer mijn data</>
          )}
        </Button>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" /> Data wordt geanalyseerd...
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-white/[0.02] rounded-xl border border-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-200">{error}</p>
            <p className="text-xs text-slate-400 mt-1">Probeer het later opnieuw of vul meer data aan.</p>
          </div>
        </div>
      )}

      {/* Results */}
      {response && !loading && (
        <>
          {/* Data checklist */}
          <DataChecklist check={response.data_check} />

          {/* Meta info */}
          {response.generated_at && (
            <p className="text-[10px] text-slate-600">
              Laatste analyse: {new Date(response.generated_at).toLocaleString('nl-NL')}
              {response.cached && ' (gecacht)'}
            </p>
          )}

          {/* Insight cards */}
          {response.insights.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {response.insights.map((insight, i) => (
                <InsightCard key={i} insight={insight} />
              ))}
            </div>
          ) : !error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Sparkles className="size-10 text-emerald-500/30 mb-4" />
              <h3 className="text-base font-medium text-slate-100 mb-2">Niet genoeg data voor inzichten</h3>
              <p className="text-sm text-slate-400 max-w-md">
                Voeg productiegegevens toe voor meer oogstjaren en vul je perceelprofielen aan om patronen te ontdekken.
              </p>
            </div>
          ) : null}
        </>
      )}

      {/* Initial state — no analysis yet */}
      {!response && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
            <Sparkles className="size-8 text-emerald-500/60" />
          </div>
          <h3 className="text-base font-medium text-slate-100 mb-2">Ontdek patronen in je data</h3>
          <p className="text-sm text-slate-400 max-w-md mb-6">
            CropNode vergelijkt je percelen, productiecijfers, bodemanalyses en weerdata om verbanden te vinden die je zelf misschien over het hoofd ziet.
          </p>
          <Button onClick={generate} className="bg-emerald-600 text-white hover:bg-emerald-500">
            <Sparkles className="size-4 mr-1.5" /> Analyseer mijn data
          </Button>
        </div>
      )}
    </div>
  );
}
