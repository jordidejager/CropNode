'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search, Microscope, Sprout, PackageOpen, Apple, ChevronRight, ChevronDown,
  Bug, Leaf, FlaskConical, X, Zap, CalendarDays, LayoutGrid, AlertTriangle,
  Clock, CheckCircle2, ArrowRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

// Custom pear icon (Lucide doesn't have one)
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
  phenological_phases: string[];
  article_count: number;
  coverage_quality: string | null;
}

interface StepData {
  id: string;
  topic_id: string;
  phase: string;
  sort_order: number;
  action: string;
  applies_to: string[];
  urgency: string;
  products: string[] | null;
  dosages: string[] | null;
  conditions: string | null;
}

interface SearchResult {
  slug: string;
  title: string;
  category: string;
  subcategory: string;
  matchType: 'topic' | 'product' | 'variety';
  matchContext?: string;
}

interface KennisbankOverviewClientProps {
  topics: Topic[];
  urgencyMap: Record<string, Record<string, string>>;
  steps: StepData[];
}

// ============================================
// CONSTANTS
// ============================================

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Ziekten & Plagen': Microscope,
  'Teelt': Sprout,
  'Oogst & Bewaring': PackageOpen,
};

const SUBCATEGORY_ICONS: Record<string, React.ElementType> = {
  'Schimmelziekten': FlaskConical,
  'Insecten': Bug,
  'Bacteriën': FlaskConical,
  'Mijten': Bug,
  'Vruchtzetting & Groei': Leaf,
  'Snoei & Vorming': Sprout,
  'Rassenkeuze': Apple,
  'Aanplant': Sprout,
  'Bewaring': PackageOpen,
};

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

const ALL_PHASES_ORDER = [
  'winterrust', 'knopzwelling', 'groen-puntje', 'muizenoor',
  'volle-bloei', 'bloembladval', 'vruchtzetting', 'junirui',
  'celstrekking', 'oogst', 'bladval', 'na-oogst',
];

// Approximate month each phase falls in
const PHASE_MONTH_LABELS = ['1', '2', '3', '4', '5', '5', '6', '7', '8', '9', '10', '11'];

// ============================================
// CURRENT PHASE DETECTION
// ============================================

function getCurrentPhase(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();

  if (m <= 1 || m === 12) return 'winterrust';
  if (m === 2) return 'knopzwelling';
  if (m === 3 && d <= 15) return 'groen-puntje';
  if (m === 3 || (m === 4 && d <= 15)) return 'muizenoor';
  if ((m === 4 && d > 15) || (m === 5 && d <= 10)) return 'volle-bloei';
  if (m === 5) return 'bloembladval';
  if (m === 6 && d <= 20) return 'vruchtzetting';
  if (m === 6 || (m === 7 && d <= 15)) return 'junirui';
  if ((m === 7 && d > 15) || m === 8) return 'celstrekking';
  if (m === 9 || (m === 10 && d <= 15)) return 'oogst';
  if ((m === 10 && d > 15) || (m === 11 && d <= 15)) return 'bladval';
  return 'na-oogst';
}

// ============================================
// PHASE SPARKLINE (with urgency colors)
// ============================================

function PhaseSparkline({
  activePhases,
  phaseUrgency,
}: {
  activePhases: string[];
  phaseUrgency?: Record<string, string>;
}) {
  const activeSet = new Set(activePhases);

  return (
    <div title={activePhases.map(p => PHASE_LABELS[p] || p).join(' \u2192 ')}>
      <div className="flex items-end gap-[2px] h-5 w-full">
        {ALL_PHASES_ORDER.map((phase, i) => {
          const isActive = activeSet.has(phase);
          let heightPct = 12;
          if (isActive) {
            const prevActive = i > 0 && activeSet.has(ALL_PHASES_ORDER[i - 1]);
            const nextActive = i < 11 && activeSet.has(ALL_PHASES_ORDER[i + 1]);
            if (prevActive && nextActive) heightPct = 100;
            else if (prevActive || nextActive) heightPct = 70;
            else heightPct = 50;
          }

          const urgency = phaseUrgency?.[phase];
          let barColor = 'bg-emerald-500/50';
          if (urgency === 'time_critical') barColor = 'bg-red-500/60';
          else if (urgency === 'seasonal') barColor = 'bg-amber-500/50';

          return (
            <div
              key={phase}
              className={cn(
                'flex-1 rounded-t-sm min-w-[4px]',
                isActive ? barColor : 'bg-white/[0.04]',
              )}
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>
      <div className="flex gap-[2px] mt-[2px]">
        {ALL_PHASES_ORDER.map((phase, i) => (
          <span
            key={phase}
            className={cn(
              'flex-1 text-center text-[7px] leading-none',
              activeSet.has(phase) ? 'text-emerald-500/40' : 'text-white/[0.06]',
            )}
          >
            {PHASE_MONTH_LABELS[i]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================
// SEASON FILTER BAR
// ============================================

function SeasonFilter({
  selectedPhase,
  onSelect,
  currentPhase,
  topics,
}: {
  selectedPhase: string | null;
  onSelect: (phase: string | null) => void;
  currentPhase: string;
  topics: Topic[];
}) {
  // Count topics per phase
  const phaseCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    ALL_PHASES_ORDER.forEach(p => { counts[p] = 0; });
    topics.forEach(t => {
      t.phenological_phases.forEach(p => {
        if (counts[p] !== undefined) counts[p]++;
      });
    });
    return counts;
  }, [topics]);

  return (
    <div className="bg-card/30 border border-emerald-500/10 rounded-xl p-3 md:p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">Seizoensfilter</span>
        {selectedPhase && (
          <button
            onClick={() => onSelect(null)}
            className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Wis filter
          </button>
        )}
      </div>

      <div className="flex gap-[3px] h-10">
        {ALL_PHASES_ORDER.map((phase, i) => {
          const count = phaseCounts[phase];
          const isCurrent = phase === currentPhase;
          const isSelected = phase === selectedPhase;
          const maxCount = Math.max(...Object.values(phaseCounts), 1);
          const barH = Math.max(4, Math.round((count / maxCount) * 40));

          return (
            <button
              key={phase}
              onClick={() => onSelect(isSelected ? null : phase)}
              className="flex-1 h-full flex flex-col justify-end items-stretch group relative"
              title={`${PHASE_LABELS[phase]}: ${count} onderwerpen`}
            >
              {/* Current phase indicator */}
              {isCurrent && (
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              )}

              {/* Bar */}
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all cursor-pointer',
                  isSelected
                    ? 'bg-emerald-400'
                    : isCurrent
                      ? 'bg-emerald-500/60 group-hover:bg-emerald-400/70'
                      : count > 0
                        ? 'bg-white/10 group-hover:bg-white/20'
                        : 'bg-white/[0.03]',
                )}
                style={{ height: `${barH}px` }}
              />
            </button>
          );
        })}
      </div>

      {/* Month labels */}
      <div className="flex gap-[3px] mt-1">
        {ALL_PHASES_ORDER.map((phase, i) => {
          const isCurrent = phase === currentPhase;
          const isSelected = phase === selectedPhase;
          return (
            <span
              key={phase}
              className={cn(
                'flex-1 text-center text-[7px] leading-none',
                isSelected ? 'text-emerald-400 font-bold'
                  : isCurrent ? 'text-emerald-500/60'
                    : 'text-white/[0.12]',
              )}
            >
              {PHASE_MONTH_LABELS[i]}
            </span>
          );
        })}
      </div>

      {/* Active filter info */}
      {selectedPhase && (
        <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
          <Zap className="h-3 w-3" />
          <span>
            {PHASE_LABELS[selectedPhase]} &mdash; {phaseCounts[selectedPhase]} onderwerpen actief
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================
// SEARCH COMPONENT
// ============================================

function KennisbankSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search
  React.useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const searchTerm = `%${query.toLowerCase()}%`;

        // Search topics
        const { data: topicResults } = await supabase
          .from('kb_topics')
          .select('slug, title, category, subcategory, search_keywords')
          .or(`title.ilike.${searchTerm},search_keywords.cs.{${query.toLowerCase()}}`)
          .limit(10);

        // Search products
        const { data: productResults } = await supabase
          .from('kb_products')
          .select('product_name, topic_id, kb_topics(slug, title, category, subcategory)')
          .ilike('product_name', searchTerm)
          .limit(10);

        // Search varieties
        const { data: varietyResults } = await supabase
          .from('kb_variety_susceptibility')
          .select('variety_name, topic_id, kb_topics(slug, title, category, subcategory)')
          .ilike('variety_name', searchTerm)
          .limit(10);

        const combined: SearchResult[] = [];
        const seen = new Set<string>();

        topicResults?.forEach(t => {
          if (!seen.has(t.slug)) {
            seen.add(t.slug);
            combined.push({ slug: t.slug, title: t.title, category: t.category, subcategory: t.subcategory, matchType: 'topic' });
          }
        });

        const productByTopic = new Map<string, string[]>();
        productResults?.forEach(p => {
          const topic = p.kb_topics as any;
          if (!topic) return;
          if (!productByTopic.has(topic.slug)) productByTopic.set(topic.slug, []);
          productByTopic.get(topic.slug)!.push(p.product_name);
        });
        productByTopic.forEach((products, slug) => {
          const topic = productResults?.find(p => (p.kb_topics as any)?.slug === slug)?.kb_topics as any;
          if (topic && !seen.has(slug)) {
            seen.add(slug);
            combined.push({ slug, title: topic.title, category: topic.category, subcategory: topic.subcategory, matchType: 'product', matchContext: products.slice(0, 3).join(', ') });
          }
        });

        const varietyByTopic = new Map<string, string[]>();
        varietyResults?.forEach(v => {
          const topic = v.kb_topics as any;
          if (!topic) return;
          if (!varietyByTopic.has(topic.slug)) varietyByTopic.set(topic.slug, []);
          varietyByTopic.get(topic.slug)!.push(v.variety_name);
        });
        varietyByTopic.forEach((varieties, slug) => {
          const topic = varietyResults?.find(v => (v.kb_topics as any)?.slug === slug)?.kb_topics as any;
          if (topic && !seen.has(slug)) {
            seen.add(slug);
            combined.push({ slug, title: topic.title, category: topic.category, subcategory: topic.subcategory, matchType: 'variety', matchContext: varieties.slice(0, 3).join(', ') });
          }
        });

        setResults(combined);
        setIsOpen(combined.length > 0);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Zoek op ziekte, middel, ras..."
          className="pl-10 pr-10 bg-background/50 border-emerald-500/20 focus:border-emerald-500/40 h-11"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full mt-2 w-full bg-card border border-emerald-500/20 rounded-xl shadow-2xl z-50 overflow-hidden">
          {results.map((r) => (
            <button
              key={`${r.slug}-${r.matchType}`}
              className="w-full text-left px-4 py-3 hover:bg-emerald-500/5 transition-colors border-b border-white/5 last:border-0 flex items-center gap-3"
              onClick={() => { router.push(`/research/kennisbank/${r.slug}`); setIsOpen(false); setQuery(''); }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{r.title}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/5 text-emerald-400 border-emerald-500/20 shrink-0">
                    {r.subcategory}
                  </Badge>
                </div>
                {r.matchContext && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.matchType === 'product' ? 'Middel' : 'Ras'}: {r.matchContext}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
          {isLoading && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Zoeken...</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// TOPIC CARD
// ============================================

function TopicCard({
  topic,
  phaseUrgency,
  currentPhase,
}: {
  topic: Topic;
  phaseUrgency?: Record<string, string>;
  currentPhase: string;
}) {
  const summaryText = topic.summary
    ? topic.summary.length > 120 ? topic.summary.slice(0, 120) + '...' : topic.summary
    : null;

  const isNowActive = topic.phenological_phases.includes(currentPhase);

  return (
    <Link href={`/research/kennisbank/${topic.slug}`}>
      <Card className={cn(
        'bg-card/50 border-emerald-500/10 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all cursor-pointer group h-full',
        isNowActive && 'ring-1 ring-emerald-500/20',
      )}>
        <CardContent className="p-4 md:p-5 flex flex-col gap-3 h-full">
          {/* Title + crop badges + nu actief */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-sm group-hover:text-emerald-400 transition-colors truncate">
                {topic.title}
              </h3>
              {isNowActive && (
                <span className="shrink-0 flex items-center gap-1 text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  Nu
                </span>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {topic.applies_to.includes('appel') && (
                <span className="text-xs" title="Appel">
                  <Apple className="h-3.5 w-3.5 text-red-400/70" />
                </span>
              )}
              {topic.applies_to.includes('peer') && (
                <span className="text-xs" title="Peer">
                  <PearIcon className="h-3.5 w-3.5 text-emerald-400/70" />
                </span>
              )}
            </div>
          </div>

          {/* Summary */}
          {summaryText && (
            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
              {summaryText}
            </p>
          )}

          {/* Phase sparkline */}
          {topic.phenological_phases.length > 0 && (
            <PhaseSparkline
              activePhases={topic.phenological_phases}
              phaseUrgency={phaseUrgency}
            />
          )}

          {/* Metadata footer */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-white/5">
            <span>{topic.article_count} bronartikelen</span>
            {topic.coverage_quality && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-full',
                topic.coverage_quality === 'Goed' && 'bg-emerald-500/10 text-emerald-400',
                topic.coverage_quality === 'Redelijk' && 'bg-yellow-500/10 text-yellow-400',
                topic.coverage_quality === 'Beperkt' && 'bg-orange-500/10 text-orange-400',
              )}>
                {topic.coverage_quality}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ============================================
// CURRENT PHASE ACTION PANEL
// ============================================

function CurrentPhasePanel({
  steps,
  topics,
  currentPhase,
}: {
  steps: StepData[];
  topics: Topic[];
  currentPhase: string;
}) {
  const topicMap = React.useMemo(() => {
    const m = new Map<string, Topic>();
    topics.forEach(t => m.set(t.id, t));
    return m;
  }, [topics]);

  // Filter steps for the current phase and group by urgency
  const grouped = React.useMemo(() => {
    const phaseSteps = steps.filter(s => s.phase === currentPhase);

    const groups: Record<string, (StepData & { topicTitle: string; topicSlug: string })[]> = {
      time_critical: [],
      seasonal: [],
      background: [],
    };

    phaseSteps.forEach(step => {
      const topic = topicMap.get(step.topic_id);
      if (!topic) return;
      const key = step.urgency || 'background';
      if (!groups[key]) groups[key] = [];
      groups[key].push({ ...step, topicTitle: topic.title, topicSlug: topic.slug });
    });

    // Sort each group by sort_order
    Object.values(groups).forEach(g => g.sort((a, b) => a.sort_order - b.sort_order));

    return groups;
  }, [steps, currentPhase, topicMap]);

  const totalActions = Object.values(grouped).reduce((sum, g) => sum + g.length, 0);

  if (totalActions === 0) return null;

  const urgencyConfig = {
    time_critical: {
      label: 'Tijdkritisch',
      icon: AlertTriangle,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      dot: 'bg-red-400',
    },
    seasonal: {
      label: 'Seizoensgebonden',
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      dot: 'bg-amber-400',
    },
    background: {
      label: 'Achtergrond',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      dot: 'bg-emerald-400',
    },
  };

  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="bg-card/50 border border-emerald-500/15 rounded-xl overflow-hidden">
      {/* Header — clickable to toggle */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full px-4 md:px-5 py-3 md:py-4 bg-emerald-500/5 flex items-center justify-between cursor-pointer hover:bg-emerald-500/8 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-400" />
          <h2 className="font-bold text-sm md:text-base">Wat moet ik nu doen?</h2>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            {PHASE_LABELS[currentPhase]}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{totalActions} acties</span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Action groups — collapsible */}
      {isOpen && <div className="divide-y divide-white/5 border-t border-emerald-500/10">
        {(['time_critical', 'seasonal', 'background'] as const).map(urgency => {
          const items = grouped[urgency];
          if (!items || items.length === 0) return null;
          const config = urgencyConfig[urgency];
          const Icon = config.icon;

          return (
            <div key={urgency} className="px-4 md:px-5 py-3">
              {/* Urgency group header */}
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-3.5 w-3.5', config.color)} />
                <span className={cn('text-xs font-semibold', config.color)}>{config.label}</span>
                <span className="text-[10px] text-muted-foreground">({items.length})</span>
              </div>

              {/* Steps */}
              <div className="space-y-2 ml-5">
                {items.map(step => (
                  <Link
                    key={step.id}
                    href={`/research/kennisbank/${step.topicSlug}`}
                    className="block group"
                  >
                    <div className={cn(
                      'rounded-lg p-2.5 md:p-3 border transition-all',
                      config.bg,
                      config.border,
                      'hover:border-emerald-500/30 hover:bg-emerald-500/5',
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground">{step.topicTitle}</span>
                          </div>
                          <p className="text-xs md:text-sm font-medium">{step.action}</p>
                          {step.products && step.products.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {step.products.map((product, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground"
                                >
                                  {product}
                                  {step.dosages?.[i] && (
                                    <span className="text-emerald-400/60 ml-1">{step.dosages[i]}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                          {step.conditions && (
                            <p className="text-[10px] text-muted-foreground/60 mt-1 italic">
                              {step.conditions}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-emerald-400 transition-colors shrink-0 mt-1" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}

// ============================================
// SEASON CALENDAR (GANTT VIEW)
// ============================================

function SeasonCalendar({
  topics,
  urgencyMap,
  steps,
  currentPhase,
  cropFilter,
}: {
  topics: Topic[];
  urgencyMap: Record<string, Record<string, string>>;
  steps: StepData[];
  currentPhase: string;
  cropFilter: 'alle' | 'appel' | 'peer';
}) {
  const filteredTopics = React.useMemo(() => {
    let result = topics;
    if (cropFilter !== 'alle') {
      result = result.filter(t => t.applies_to.includes(cropFilter));
    }
    return result;
  }, [topics, cropFilter]);

  // Group by category
  const grouped = React.useMemo(() => {
    const map = new Map<string, Topic[]>();
    for (const topic of filteredTopics) {
      if (!map.has(topic.category)) map.set(topic.category, []);
      map.get(topic.category)!.push(topic);
    }
    return map;
  }, [filteredTopics]);

  const categoryOrder = ['Ziekten & Plagen', 'Teelt', 'Oogst & Bewaring'];
  const currentPhaseIdx = ALL_PHASES_ORDER.indexOf(currentPhase);

  return (
    <div className="bg-card/30 border border-emerald-500/10 rounded-xl overflow-hidden">
      {/* Sticky header with phases */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Phase header */}
          <div className="flex border-b border-white/5 bg-card/50 sticky top-0 z-10">
            <div className="w-40 md:w-52 shrink-0 px-3 py-2 border-r border-white/5">
              <span className="text-xs font-semibold text-muted-foreground">Onderwerp</span>
            </div>
            <div className="flex-1 flex">
              {ALL_PHASES_ORDER.map((phase, i) => {
                const isCurrent = phase === currentPhase;
                return (
                  <div
                    key={phase}
                    className={cn(
                      'flex-1 px-1 py-2 text-center border-r border-white/5 last:border-0',
                      isCurrent && 'bg-emerald-500/10',
                    )}
                  >
                    <div className={cn(
                      'text-[8px] md:text-[10px] font-medium leading-tight truncate',
                      isCurrent ? 'text-emerald-400' : 'text-muted-foreground/60',
                    )}>
                      {PHASE_LABELS[phase]?.slice(0, 5)}
                    </div>
                    <div className={cn(
                      'text-[7px] md:text-[9px] mt-0.5',
                      isCurrent ? 'text-emerald-400/60' : 'text-muted-foreground/30',
                    )}>
                      M{PHASE_MONTH_LABELS[i]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Categories & topics */}
          {categoryOrder.map(category => {
            const catTopics = grouped.get(category);
            if (!catTopics || catTopics.length === 0) return null;
            const CategoryIcon = CATEGORY_ICONS[category] || Microscope;

            return (
              <div key={category}>
                {/* Category header row */}
                <div className="flex border-b border-white/5 bg-white/[0.02]">
                  <div className="w-40 md:w-52 shrink-0 px-3 py-1.5 flex items-center gap-1.5">
                    <CategoryIcon className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[10px] md:text-xs font-bold text-muted-foreground">{category}</span>
                  </div>
                  <div className="flex-1 flex">
                    {ALL_PHASES_ORDER.map((phase) => (
                      <div
                        key={phase}
                        className={cn(
                          'flex-1 border-r border-white/5 last:border-0',
                          phase === currentPhase && 'bg-emerald-500/5',
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Topic rows */}
                {catTopics.map(topic => {
                  const activeSet = new Set(topic.phenological_phases);
                  const topicUrgency = urgencyMap[topic.id] || {};

                  return (
                    <Link
                      key={topic.slug}
                      href={`/research/kennisbank/${topic.slug}`}
                      className="flex border-b border-white/[0.03] hover:bg-emerald-500/[0.03] transition-colors group"
                    >
                      {/* Topic name */}
                      <div className="w-40 md:w-52 shrink-0 px-3 py-1.5 flex items-center gap-2 border-r border-white/5">
                        <span className="text-[11px] md:text-xs truncate group-hover:text-emerald-400 transition-colors">
                          {topic.title}
                        </span>
                        <div className="flex gap-0.5 shrink-0">
                          {topic.applies_to.includes('appel') && (
                            <Apple className="h-2.5 w-2.5 text-red-400/50" />
                          )}
                          {topic.applies_to.includes('peer') && (
                            <PearIcon className="h-2.5 w-2.5 text-emerald-400/50" />
                          )}
                        </div>
                      </div>

                      {/* Phase cells */}
                      <div className="flex-1 flex">
                        {ALL_PHASES_ORDER.map((phase) => {
                          const isActive = activeSet.has(phase);
                          const isCurrent = phase === currentPhase;
                          const urgency = topicUrgency[phase];

                          let cellColor = '';
                          if (isActive) {
                            if (urgency === 'time_critical') cellColor = 'bg-red-500/40';
                            else if (urgency === 'seasonal') cellColor = 'bg-amber-500/30';
                            else cellColor = 'bg-emerald-500/25';
                          }

                          return (
                            <div
                              key={phase}
                              className={cn(
                                'flex-1 border-r border-white/5 last:border-0 relative',
                                isCurrent && 'bg-emerald-500/5',
                              )}
                            >
                              {isActive && (
                                <div
                                  className={cn(
                                    'absolute inset-x-0.5 inset-y-0.5 rounded-sm',
                                    cellColor,
                                  )}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-white/5 flex flex-wrap gap-4 items-center">
        <span className="text-[10px] text-muted-foreground">Urgentie:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500/40" />
          <span className="text-[10px] text-muted-foreground">Tijdkritisch</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-amber-500/30" />
          <span className="text-[10px] text-muted-foreground">Seizoensgebonden</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/25" />
          <span className="text-[10px] text-muted-foreground">Achtergrond</span>
        </div>
        <div className="flex items-center gap-1.5 ml-4">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/10 border border-emerald-500/20" />
          <span className="text-[10px] text-emerald-400">Huidige fase</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function KennisbankOverviewClient({ topics, urgencyMap, steps }: KennisbankOverviewClientProps) {
  const [cropFilter, setCropFilter] = React.useState<'alle' | 'appel' | 'peer'>('alle');
  const [phaseFilter, setPhaseFilter] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('list');
  const currentPhase = React.useMemo(() => getCurrentPhase(), []);

  const filteredTopics = React.useMemo(() => {
    let result = topics;
    if (cropFilter !== 'alle') {
      result = result.filter(t => t.applies_to.includes(cropFilter));
    }
    if (phaseFilter) {
      result = result.filter(t => t.phenological_phases.includes(phaseFilter));
    }
    return result;
  }, [topics, cropFilter, phaseFilter]);

  // Group by category then subcategory
  const grouped = React.useMemo(() => {
    const map = new Map<string, Map<string, Topic[]>>();
    for (const topic of filteredTopics) {
      if (!map.has(topic.category)) map.set(topic.category, new Map());
      const sub = map.get(topic.category)!;
      if (!sub.has(topic.subcategory)) sub.set(topic.subcategory, []);
      sub.get(topic.subcategory)!.push(topic);
    }
    return map;
  }, [filteredTopics]);

  const categoryOrder = ['Ziekten & Plagen', 'Teelt', 'Oogst & Bewaring'];

  // Count active-now topics
  const activeNowCount = React.useMemo(
    () => topics.filter(t => t.phenological_phases.includes(currentPhase)).length,
    [topics, currentPhase]
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Microscope className="h-7 w-7 text-emerald-500" />
            Kennisbank
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {topics.length} onderwerpen op basis van vakadviezen
            {activeNowCount > 0 && (
              <span className="ml-2 text-emerald-400">
                &middot; {activeNowCount} nu actief
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Search + Crop Filter + View Toggle */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <KennisbankSearch />

        <div className="flex gap-2 shrink-0">
          <div className="flex rounded-lg border border-emerald-500/20 overflow-hidden">
            {(['alle', 'appel', 'peer'] as const).map(option => (
              <button
                key={option}
                onClick={() => setCropFilter(option)}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  cropFilter === option
                    ? 'bg-emerald-600 text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                {option === 'alle' ? 'Alle' : option === 'appel' ? 'Appel' : 'Peer'}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-emerald-500/20 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-2.5 py-2 transition-colors',
                viewMode === 'list'
                  ? 'bg-emerald-600 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
              title="Lijstweergave"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                'px-2.5 py-2 transition-colors',
                viewMode === 'calendar'
                  ? 'bg-emerald-600 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
              title="Seizoenskalender"
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Current Phase Action Panel */}
      <CurrentPhasePanel
        steps={steps}
        topics={topics}
        currentPhase={currentPhase}
      />

      {/* Season Filter Bar */}
      <SeasonFilter
        selectedPhase={phaseFilter}
        onSelect={setPhaseFilter}
        currentPhase={currentPhase}
        topics={cropFilter === 'alle' ? topics : topics.filter(t => t.applies_to.includes(cropFilter))}
      />

      {/* View: Calendar or List */}
      {viewMode === 'calendar' ? (
        <SeasonCalendar
          topics={phaseFilter
            ? topics.filter(t => t.phenological_phases.includes(phaseFilter))
            : topics}
          urgencyMap={urgencyMap}
          steps={steps}
          currentPhase={currentPhase}
          cropFilter={cropFilter}
        />
      ) : (
        <>
          {/* Category groups */}
          <div className="space-y-10">
            {categoryOrder.map(category => {
              const subcategories = grouped.get(category);
              if (!subcategories) return null;

              const CategoryIcon = CATEGORY_ICONS[category] || Microscope;

              return (
                <section key={category}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-6">
                    <CategoryIcon className="h-5 w-5 text-emerald-500" />
                    <h2 className="text-lg font-bold text-foreground">{category}</h2>
                    <div className="flex-1 h-px bg-emerald-500/10 ml-2" />
                  </div>

                  {/* Subcategories */}
                  <div className="space-y-8">
                    {Array.from(subcategories.entries()).map(([subcategory, subTopics]) => {
                      const SubIcon = SUBCATEGORY_ICONS[subcategory] || Leaf;

                      return (
                        <div key={subcategory}>
                          <div className="flex items-center gap-2 mb-3">
                            <SubIcon className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-sm font-semibold text-muted-foreground">{subcategory}</h3>
                            <span className="text-xs text-muted-foreground/50">({subTopics.length})</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                            {subTopics.map(topic => (
                              <TopicCard
                                key={topic.slug}
                                topic={topic}
                                phaseUrgency={urgencyMap[topic.id]}
                                currentPhase={currentPhase}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Empty state for filters */}
          {filteredTopics.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Geen onderwerpen gevonden voor deze filters.</p>
              <button
                onClick={() => { setCropFilter('alle'); setPhaseFilter(null); }}
                className="mt-2 text-sm text-emerald-400 hover:text-emerald-300"
              >
                Filters wissen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
