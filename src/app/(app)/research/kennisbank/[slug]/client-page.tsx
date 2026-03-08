'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Apple, Clock, Shield, Beaker, Leaf, BookOpen,
  ChevronRight, AlertTriangle, FileText, Link2, CheckCircle2, XCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Custom pear icon
function PearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2v3" />
      <path d="M12 5C8 8 6.5 11 6.5 14.5 6.5 18.5 9 21 12 21s5.5-2.5 5.5-6.5C17.5 11 16 8 12 5z" />
    </svg>
  );
}

// ============================================
// TYPES
// ============================================

interface Topic {
  id: string;
  slug: string;
  title: string;
  category: string;
  subcategory: string;
  applies_to: string[];
  summary: string | null;
  content: Record<string, any>;
  phenological_phases: string[];
  search_keywords: string[];
  article_count: number;
  coverage_period: string | null;
  coverage_quality: string | null;
}

interface Product {
  id: string;
  product_name: string;
  active_substance: string | null;
  product_type: string | null;
  application_type: string | null;
  applies_to: string[];
  dosage: string | null;
  timing: string | null;
  remarks: string | null;
  ctgb_status: string | null;
  ctgb_product_id: string | null;
  ctgb_max_dosage: string | null;
  ctgb_max_applications: number | null;
  dosage_exceeds_ctgb: boolean | null;
  ctgb_crop_valid: boolean | null;
}

interface StrategyStep {
  id: string;
  phase: string;
  sort_order: number;
  action: string;
  applies_to: string[];
  urgency: string;
  products: string[];
  dosages: string[];
  conditions: string | null;
  sub_timing: string | null;
  needs_review?: boolean | null;
}

interface Variety {
  id: string;
  variety_name: string;
  fruit_type: string;
  susceptibility: string;
  notes: string | null;
}

interface ResearchNote {
  id: string;
  title: string;
  summary: string | null;
  key_insights: any;
  conflicts: string | null;
  source_type: string;
  source_description: string | null;
}

interface RelatedTopic {
  id: string;
  slug: string;
  title: string;
  category: string;
  subcategory: string;
  phenological_phases: string[];
  applies_to: string[];
}

interface Props {
  topic: Topic;
  products: Product[];
  steps: StrategyStep[];
  varieties: Variety[];
  researchNotes: ResearchNote[];
  allTopics: RelatedTopic[];
}

// ============================================
// CONSTANTS
// ============================================

const PHASE_LABELS: Record<string, string> = {
  'winterrust': 'Winterrust',
  'knopzwelling': 'Knopzwelling',
  'groen-puntje': 'Groen puntje',
  'muizenoor': 'Muizenoor',
  'volle-bloei': 'Volle bloei',
  'bloembladval': 'Bloembladval',
  'vruchtzetting': 'Vruchtzetting',
  'junirui': 'Junirui',
  'celstrekking': 'Celstrekking',
  'oogst': 'Oogst',
  'bladval': 'Bladval',
  'na-oogst': 'Na-oogst',
};

const URGENCY_STYLES: Record<string, { border: string; bg: string; label: string }> = {
  'time_critical': { border: 'border-l-red-500', bg: 'bg-red-500/5', label: 'Tijdkritisch' },
  'seasonal': { border: 'border-l-amber-500', bg: 'bg-amber-500/5', label: 'Seizoensgebonden' },
  'background': { border: 'border-l-slate-500', bg: 'bg-slate-500/5', label: 'Achtergrond' },
};

const SUSCEPTIBILITY_BADGES: Record<string, { className: string; label: string }> = {
  'bevestigd_gevoelig': { className: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Gevoelig' },
  'waarschijnlijk_gevoelig': { className: 'bg-orange-500/10 text-orange-400 border-orange-500/20', label: 'Waarschijnlijk gevoelig' },
  'genoemd': { className: 'bg-slate-500/10 text-slate-400 border-slate-500/20', label: 'Genoemd' },
  'weinig_gevoelig': { className: 'bg-lime-500/10 text-lime-400 border-lime-500/20', label: 'Weinig gevoelig' },
  'resistent': { className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Resistent' },
};

// ============================================
// SECTIONS
// ============================================

const SECTIONS = [
  { id: 'strategie', label: 'Strategie', icon: Clock },
  { id: 'middelen', label: 'Middelen', icon: Beaker },
  { id: 'rasgevoeligheid', label: 'Rasgevoeligheid', icon: Leaf },
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'onderzoek', label: 'Onderzoek', icon: BookOpen },
  { id: 'gerelateerd', label: 'Gerelateerd', icon: Link2 },
];

// ============================================
// STRATEGY TIMELINE
// ============================================

function StrategyTimeline({ steps }: { steps: StrategyStep[] }) {
  const [cropTab, setCropTab] = React.useState<'appel' | 'peer'>('appel');

  const hasAppel = steps.some(s => s.applies_to.includes('appel'));
  const hasPeer = steps.some(s => s.applies_to.includes('peer'));
  const showTabs = hasAppel && hasPeer;

  const filtered = steps.filter(s =>
    showTabs ? s.applies_to.includes(cropTab) : true
  );

  // Group by phase
  const grouped = new Map<string, StrategyStep[]>();
  for (const step of filtered) {
    if (!grouped.has(step.phase)) grouped.set(step.phase, []);
    grouped.get(step.phase)!.push(step);
  }

  return (
    <div>
      {showTabs && (
        <div className="flex rounded-lg border border-emerald-500/20 overflow-hidden mb-4 w-fit">
          {(['appel', 'peer'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setCropTab(opt)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                cropTab === opt ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-white/5'
              )}
            >
              {opt === 'appel' ? <Apple className="h-3 w-3 text-red-300" /> : <PearIcon className="h-3 w-3 text-emerald-300" />}
              {opt === 'appel' ? 'Appel' : 'Peer'}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-emerald-500/20" />

        <div className="space-y-1">
          {Array.from(grouped.entries()).map(([phase, phaseSteps]) => {
            const urgencyStyle = URGENCY_STYLES[phaseSteps[0]?.urgency] || URGENCY_STYLES.seasonal;

            return (
              <div key={phase} className="relative pl-8">
                {/* Timeline dot */}
                <div className={cn(
                  'absolute left-0 top-3 w-[15px] h-[15px] rounded-full border-2 bg-background z-10',
                  phaseSteps[0]?.urgency === 'time_critical' ? 'border-red-500' :
                  phaseSteps[0]?.urgency === 'background' ? 'border-slate-500' :
                  'border-amber-500'
                )} />

                <Card className={cn('border-l-4', urgencyStyle.border, urgencyStyle.bg, 'border-emerald-500/10')}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                        {PHASE_LABELS[phase] || phase}
                      </span>
                      <Badge variant="outline" className={cn(
                        'text-[10px] px-1.5 py-0',
                        phaseSteps[0]?.urgency === 'time_critical' ? 'border-red-500/30 text-red-400' :
                        phaseSteps[0]?.urgency === 'background' ? 'border-slate-500/30 text-slate-400' :
                        'border-amber-500/30 text-amber-400'
                      )}>
                        {urgencyStyle.label}
                      </Badge>
                    </div>

                    {phaseSteps.map((step, i) => (
                      <div key={step.id} className={cn(i > 0 && 'mt-3 pt-3 border-t border-white/5')}>
                        <p className="text-sm text-foreground leading-relaxed">{step.action}</p>

                        {step.products.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {step.products.map((p, j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}

                        {step.needs_review && (
                          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 w-fit">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Controleer beschikbaarheid middelen
                          </div>
                        )}

                        {step.conditions && (
                          <p className="text-xs text-muted-foreground mt-1.5 italic">{step.conditions}</p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// PRODUCTS TABLE
// ============================================

// CTGB status sort priority: toegelaten first, niet_gevonden middle, vervallen last
const CTGB_STATUS_ORDER: Record<string, number> = {
  'toegelaten': 0,
  'niet_gevonden': 1,
  'niet_gevalideerd': 1,
  'vervallen': 2,
};

function ProductsTable({ products }: { products: Product[] }) {
  const [cropFilter, setCropFilter] = React.useState<'alle' | 'appel' | 'peer'>('alle');
  const [typeFilter, setTypeFilter] = React.useState<'alle' | 'preventief' | 'curatief'>('alle');
  const [sortCol, setSortCol] = React.useState<string>('ctgb_status');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const hasAppel = products.some(p => p.applies_to.includes('appel'));
  const hasPeer = products.some(p => p.applies_to.includes('peer'));
  const hasTypes = products.some(p => p.product_type === 'preventief' || p.product_type === 'curatief');
  const hasCtgb = products.some(p => p.ctgb_status && p.ctgb_status !== 'niet_gevalideerd');

  const filtered = React.useMemo(() => {
    let result = [...products];
    if (cropFilter !== 'alle') {
      result = result.filter(p => p.applies_to.includes(cropFilter));
    }
    if (typeFilter !== 'alle') {
      result = result.filter(p => p.product_type === typeFilter);
    }
    result.sort((a, b) => {
      if (sortCol === 'ctgb_status') {
        const aOrd = CTGB_STATUS_ORDER[a.ctgb_status || 'niet_gevalideerd'] ?? 1;
        const bOrd = CTGB_STATUS_ORDER[b.ctgb_status || 'niet_gevalideerd'] ?? 1;
        if (aOrd !== bOrd) return sortDir === 'asc' ? aOrd - bOrd : bOrd - aOrd;
        return (a.product_name || '').localeCompare(b.product_name || '');
      }
      const aVal = (a as any)[sortCol] || '';
      const bVal = (b as any)[sortCol] || '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [products, cropFilter, typeFilter, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  // Stats
  const expiredCount = products.filter(p => p.ctgb_status === 'vervallen').length;
  const dosageWarnings = products.filter(p => p.dosage_exceeds_ctgb).length;
  const cropWarnings = products.filter(p => p.ctgb_crop_valid === false).length;

  return (
    <div>
      {/* CTGB validation summary */}
      {hasCtgb && (expiredCount > 0 || dosageWarnings > 0 || cropWarnings > 0) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {expiredCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              <XCircle className="h-3 w-3" />
              {expiredCount} niet meer toegelaten
            </div>
          )}
          {dosageWarnings > 0 && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="h-3 w-3" />
              {dosageWarnings} dosering boven CTGB max
            </div>
          )}
          {cropWarnings > 0 && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertTriangle className="h-3 w-3" />
              {cropWarnings} niet voor dit gewas
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        {hasAppel && hasPeer && (
          <div className="flex rounded-lg border border-emerald-500/20 overflow-hidden">
            {(['alle', 'appel', 'peer'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setCropFilter(opt)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium transition-colors',
                  cropFilter === opt ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-white/5'
                )}
              >
                {opt === 'alle' ? 'Alle' : opt === 'appel' ? 'Appel' : 'Peer'}
              </button>
            ))}
          </div>
        )}

        {hasTypes && (
          <div className="flex rounded-lg border border-emerald-500/20 overflow-hidden">
            {(['alle', 'preventief', 'curatief'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setTypeFilter(opt)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium transition-colors',
                  typeFilter === opt ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-white/5'
                )}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <div className="min-w-[720px] md:min-w-0 px-4 md:px-0">
          <Table>
            <TableHeader className="bg-emerald-900/10">
              <TableRow>
                {[
                  { key: 'product_name', label: 'Middel' },
                  { key: 'active_substance', label: 'Werkzame stof' },
                  { key: 'product_type', label: 'Type' },
                  { key: 'dosage', label: 'Dosering' },
                  { key: 'ctgb_max_applications', label: 'Max toep.' },
                  { key: 'timing', label: 'Timing' },
                  { key: 'ctgb_status', label: 'Status' },
                ].map(col => (
                  <TableHead
                    key={col.key}
                    className="text-emerald-400/80 cursor-pointer hover:text-emerald-400 select-none"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortCol === col.key && (
                        <span className="text-[10px]">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const isExpired = p.ctgb_status === 'vervallen';
                const isNotFound = p.ctgb_status === 'niet_gevonden' || p.ctgb_status === 'niet_gevalideerd';
                const isApproved = p.ctgb_status === 'toegelaten';

                return (
                  <TableRow key={p.id} className={cn(
                    'hover:bg-emerald-500/5',
                    isExpired && 'opacity-60'
                  )}>
                    {/* Middel */}
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn(isExpired && 'line-through text-red-400/70')}>
                          {p.product_name}
                        </span>
                        {p.ctgb_crop_valid === false && (
                          <span className="shrink-0" title="Niet toegelaten voor dit gewas">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                          </span>
                        )}
                      </div>
                      {p.ctgb_crop_valid === false && (
                        <p className="text-[10px] text-red-400 mt-0.5">Niet toegelaten voor dit gewas</p>
                      )}
                    </TableCell>
                    {/* Werkzame stof */}
                    <TableCell className={cn('text-sm text-muted-foreground', isExpired && 'line-through')}>
                      {p.active_substance || '-'}
                    </TableCell>
                    {/* Type */}
                    <TableCell>
                      {p.product_type ? (
                        <Badge variant="outline" className={cn(
                          'text-[10px] px-1.5 py-0',
                          p.product_type === 'preventief' ? 'border-blue-500/30 text-blue-400' :
                          p.product_type === 'curatief' ? 'border-orange-500/30 text-orange-400' :
                          'border-slate-500/30 text-slate-400'
                        )}>
                          {p.product_type}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    {/* Dosering */}
                    <TableCell className="text-sm max-w-[180px]" title={p.dosage || undefined}>
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'truncate',
                          isExpired ? 'line-through text-muted-foreground' : 'text-muted-foreground',
                          p.dosage_exceeds_ctgb && 'text-amber-400'
                        )}>
                          {p.dosage || '-'}
                        </span>
                        {p.dosage_exceeds_ctgb && (
                          <span className="shrink-0" title={`Boven CTGB max: ${p.ctgb_max_dosage || '?'}`}>
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          </span>
                        )}
                      </div>
                      {p.dosage_exceeds_ctgb && p.ctgb_max_dosage && (
                        <p className="text-[10px] text-amber-400/80 mt-0.5">Max: {p.ctgb_max_dosage}</p>
                      )}
                    </TableCell>
                    {/* Max toep. */}
                    <TableCell className="text-sm text-muted-foreground text-center">
                      {p.ctgb_max_applications != null ? p.ctgb_max_applications : '-'}
                    </TableCell>
                    {/* Timing */}
                    <TableCell className={cn('text-sm text-muted-foreground max-w-[180px] truncate', isExpired && 'line-through')} title={p.timing || undefined}>
                      {p.timing || '-'}
                    </TableCell>
                    {/* Status */}
                    <TableCell>
                      {isApproved && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 whitespace-nowrap">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Toegelaten
                        </Badge>
                      )}
                      {isExpired && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/30 text-red-400 whitespace-nowrap">
                          <XCircle className="h-3 w-3 mr-1" />
                          Niet meer toegelaten
                        </Badge>
                      )}
                      {isNotFound && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-500/30 text-slate-400 whitespace-nowrap">
                          Niet geverifieerd
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-2">{filtered.length} middelen</p>
    </div>
  );
}

// ============================================
// VARIETY SUSCEPTIBILITY
// ============================================

function VarietySusceptibility({ varieties }: { varieties: Variety[] }) {
  const appelVarieties = varieties.filter(v => v.fruit_type === 'appel');
  const peerVarieties = varieties.filter(v => v.fruit_type === 'peer');

  const renderList = (items: Variety[]) => (
    <div className="space-y-2">
      {items.map(v => {
        const badge = SUSCEPTIBILITY_BADGES[v.susceptibility] || SUSCEPTIBILITY_BADGES.genoemd;
        return (
          <div key={v.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-card/50 border border-white/5">
            <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5 shrink-0 mt-0.5', badge.className)}>
              {badge.label}
            </Badge>
            <div className="min-w-0">
              <span className="text-sm font-medium">{v.variety_name}</span>
              {v.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{v.notes}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {appelVarieties.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Apple className="h-4 w-4 text-red-400" />
            <h4 className="text-sm font-semibold">Appelrassen</h4>
            <span className="text-xs text-muted-foreground">({appelVarieties.length})</span>
          </div>
          {renderList(appelVarieties)}
        </div>
      )}
      {peerVarieties.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <PearIcon className="h-4 w-4 text-emerald-400" />
            <h4 className="text-sm font-semibold">Perenrassen</h4>
            <span className="text-xs text-muted-foreground">({peerVarieties.length})</span>
          </div>
          {renderList(peerVarieties)}
        </div>
      )}
    </div>
  );
}

// ============================================
// PHENOLOGICAL DETAILS
// ============================================

function PhenologicalDetails({ content }: { content: Record<string, any> }) {
  const phenoData = content['Fenologische relevantie'] || content['Fenologische timing'];
  if (!phenoData) return null;

  const text = typeof phenoData === 'string' ? phenoData : JSON.stringify(phenoData);
  const lines = text.split('\n').filter((l: string) => l.trim().length > 0);

  return (
    <div className="space-y-3">
      {lines.map((line: string, i: number) => {
        const boldMatch = line.match(/\*\*([^*]+?)\*\*[:\s]*(.*)/);
        if (boldMatch) {
          return (
            <div key={i} className="flex gap-3 p-2.5 rounded-lg bg-card/50 border border-white/5">
              <span className="text-sm font-semibold text-emerald-400 shrink-0">{boldMatch[1]}</span>
              <span className="text-sm text-muted-foreground">{boldMatch[2]}</span>
            </div>
          );
        }
        const cleaned = line.replace(/^[\s*-]+/, '').trim();
        if (!cleaned) return null;
        return (
          <p key={i} className="text-sm text-muted-foreground leading-relaxed">{cleaned}</p>
        );
      })}
    </div>
  );
}

// ============================================
// RESEARCH NOTES
// ============================================

function ResearchNotes({ notes }: { notes: ResearchNote[] }) {
  return (
    <div className="space-y-4">
      {notes.map(note => (
        <Card key={note.id} className="bg-card/50 border-emerald-500/10">
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">{note.title}</h4>
            {note.summary && (
              <p className="text-sm text-muted-foreground mb-3">{note.summary}</p>
            )}
            {note.key_insights && Array.isArray(note.key_insights) && (
              <ul className="list-disc list-inside space-y-1">
                {note.key_insights.map((insight: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground">{insight}</li>
                ))}
              </ul>
            )}
            {note.conflicts && (
              <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-400">Afwijking van praktijkadvies</span>
                </div>
                <p className="text-sm text-muted-foreground">{note.conflicts}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================
// RELATED TOPICS
// ============================================

function RelatedTopics({ topic, allTopics, products }: { topic: Topic; allTopics: RelatedTopic[]; products: Product[] }) {
  const related = React.useMemo(() => {
    const scored = allTopics.map(t => {
      let score = 0;
      // Shared phenological phases
      const sharedPhases = t.phenological_phases.filter(p => topic.phenological_phases.includes(p));
      score += sharedPhases.length * 2;
      // Same category
      if (t.category === topic.category) score += 3;
      if (t.subcategory === topic.subcategory) score += 2;
      // Same crops
      const sharedCrops = t.applies_to.filter(c => topic.applies_to.includes(c));
      score += sharedCrops.length;
      return { ...t, score };
    });

    return scored
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [topic, allTopics]);

  if (related.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {related.map(t => (
        <Link key={t.slug} href={`/research/kennisbank/${t.slug}`}>
          <Card className="bg-card/50 border-emerald-500/10 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all cursor-pointer group h-full">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold group-hover:text-emerald-400 transition-colors truncate">{t.title}</h4>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-1 bg-emerald-500/5 text-emerald-400/70 border-emerald-500/20">
                  {t.subcategory}
                </Badge>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-emerald-400" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function KennisbankDetailClient({ topic, products, steps, varieties, researchNotes, allTopics }: Props) {
  const [activeSection, setActiveSection] = React.useState('strategie');

  // Determine which sections to show
  const visibleSections = SECTIONS.filter(s => {
    if (s.id === 'strategie' && steps.length === 0) return false;
    if (s.id === 'middelen' && products.length === 0) return false;
    if (s.id === 'rasgevoeligheid' && varieties.length === 0) return false;
    if (s.id === 'onderzoek' && researchNotes.length === 0) return false;
    return true;
  });

  // Scroll spy
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' }
    );

    visibleSections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleSections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-emerald-500/10 bg-card/30 backdrop-blur-sm">
        <div className="p-4 md:p-6 max-w-7xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Link href="/research/kennisbank" className="hover:text-emerald-400 transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />
              Kennisbank
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>{topic.category}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{topic.title}</span>
          </div>

          {/* Title + badges */}
          <div className="flex items-start gap-3 mb-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{topic.title}</h1>
            <div className="flex gap-1.5 shrink-0 mt-1.5">
              {topic.applies_to.includes('appel') && (
                <div className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  <Apple className="h-3 w-3" /> Appel
                </div>
              )}
              {topic.applies_to.includes('peer') && (
                <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <PearIcon className="h-3 w-3" /> Peer
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          {topic.summary && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mb-3">{topic.summary}</p>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Gebaseerd op <strong className="text-foreground">{topic.article_count}</strong> vakadviezen</span>
            {topic.coverage_period && <span>Periode: {topic.coverage_period}</span>}
            {topic.coverage_quality && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-full',
                topic.coverage_quality === 'Goed' && 'bg-emerald-500/10 text-emerald-400',
                topic.coverage_quality === 'Redelijk' && 'bg-yellow-500/10 text-yellow-400',
              )}>
                Dekking: {topic.coverage_quality}
              </span>
            )}
          </div>

          {/* Phase tags */}
          {topic.phenological_phases.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {topic.phenological_phases.map(phase => (
                <span
                  key={phase}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                >
                  {PHASE_LABELS[phase] || phase}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mobile: horizontal scrollable nav */}
        <div className="lg:hidden overflow-x-auto border-t border-white/5">
          <div className="flex min-w-max px-4">
            {visibleSections.map(s => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={cn(
                  'px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors',
                  activeSection === s.id
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl p-4 md:p-6">
        <div className="flex gap-8">
          {/* Desktop: sticky sidebar nav */}
          <nav className="hidden lg:block w-48 shrink-0">
            <div className="sticky top-20 space-y-1">
              {visibleSections.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                      activeSection === s.id
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-10">
            {/* Strategy */}
            {steps.length > 0 && (
              <section id="strategie" className="scroll-mt-32">
                <SectionHeader icon={Clock} title="Bestrijdings-/Teeltstrategie" />
                <StrategyTimeline steps={steps} />
              </section>
            )}

            {/* Products */}
            {products.length > 0 && (
              <section id="middelen" className="scroll-mt-32">
                <SectionHeader icon={Beaker} title="Middelen & Doseringen" />
                <ProductsTable products={products} />
              </section>
            )}

            {/* Varieties */}
            {varieties.length > 0 && (
              <section id="rasgevoeligheid" className="scroll-mt-32">
                <SectionHeader icon={Leaf} title="Rasgevoeligheid" />
                <VarietySusceptibility varieties={varieties} />
              </section>
            )}

            {/* Details */}
            <section id="details" className="scroll-mt-32">
              <SectionHeader icon={FileText} title="Fenologische details" />
              <PhenologicalDetails content={topic.content} />
            </section>

            {/* Research */}
            {researchNotes.length > 0 && (
              <section id="onderzoek" className="scroll-mt-32">
                <SectionHeader icon={BookOpen} title="Wetenschappelijke achtergrond" />
                <ResearchNotes notes={researchNotes} />
              </section>
            )}

            {/* Related */}
            <section id="gerelateerd" className="scroll-mt-32">
              <SectionHeader icon={Link2} title="Gerelateerde onderwerpen" />
              <RelatedTopics topic={topic} allTopics={allTopics} products={products} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SHARED
// ============================================

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="h-6 w-1 bg-emerald-500 rounded-full" />
      <Icon className="h-5 w-5 text-emerald-400" />
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}
