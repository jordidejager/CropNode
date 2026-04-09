'use client';

/**
 * Article Dossier — cinematic takeover for a single article
 *
 * Full-screen overlay with:
 *   - Hero gradient header with title + meta chips
 *   - Main content pane (rich text formatting)
 *   - Right sidebar: timeline, products (with CTGB status), fusion info
 *   - Related articles footer (via vector similarity)
 */

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, X, Calendar, Apple, TreeDeciduous, Sparkles, FlaskConical,
  AlertTriangle, Check, CircleDashed,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  useArticle, useArticles,
} from '@/hooks/use-knowledge';
import {
  CATEGORY_CONFIG, MONTH_LABELS, URGENCY_CONFIG, estimateUrgency, CROP_CONFIG, PHENOLOGICAL_PHASES,
} from '@/lib/knowledge/ui-tokens';
import type { KnowledgeArticleListItem } from '@/lib/knowledge/client-api';
import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface ArticleDossierProps {
  articleId: string | null;
  onClose: () => void;
  onRelatedClick?: (article: KnowledgeArticleListItem) => void;
}

export function ArticleDossier({ articleId, onClose, onRelatedClick }: ArticleDossierProps) {
  const { data: article, isLoading } = useArticle(articleId);

  // Block body scroll when open
  useEffect(() => {
    if (articleId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [articleId]);

  return (
    <AnimatePresence>
      {articleId && (
        <motion.div
          key="dossier"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/95 backdrop-blur-xl"
        >
          {/* Close button */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-6 py-4 backdrop-blur-xl">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Terug naar atlas
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/70 transition-colors hover:border-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isLoading || !article ? (
            <DossierSkeleton />
          ) : (
            <DossierContent article={article} onRelatedClick={onRelatedClick} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Content body
// ============================================

function DossierContent({
  article,
  onRelatedClick,
}: {
  article: KnowledgeArticleListItem;
  onRelatedClick?: (article: KnowledgeArticleListItem) => void;
}) {
  const category = CATEGORY_CONFIG[article.category];
  const urgency = estimateUrgency(article);
  const urgencyCfg = URGENCY_CONFIG[urgency];

  // Find related articles via same category+subcategory (simple; vector search would be better)
  const { data: relatedArticles = [] } = useArticles({
    categories: [article.category],
    limit: 5,
  });
  const related = relatedArticles
    .filter((a) => a.id !== article.id)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-white/10 p-10"
        style={{
          background: `linear-gradient(135deg, ${category.hex}30 0%, ${category.hex}08 60%, transparent 100%)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            background: `radial-gradient(ellipse at top right, ${category.hex}40, transparent 60%)`,
          }}
        />
        <div className="relative">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: category.hex }}
          >
            {category.label}
            {article.subcategory ? ` · ${article.subcategory}` : ''}
          </p>
          <h1 className="mt-3 max-w-4xl text-3xl font-bold leading-tight text-white sm:text-5xl">
            {article.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base text-white/70">
            {article.summary}
          </p>

          {/* Meta chips */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {article.crops.map((crop) => {
              const cfg = CROP_CONFIG[crop];
              return (
                <span
                  key={crop}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/80"
                >
                  {crop === 'appel' ? (
                    <Apple className="h-3 w-3" />
                  ) : (
                    <TreeDeciduous className="h-3 w-3" />
                  )}
                  {cfg?.label ?? crop}
                </span>
              );
            })}
            {article.relevant_months.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs text-white/80">
                <Calendar className="h-3 w-3" />
                {article.relevant_months.map((m) => MONTH_LABELS[m - 1]).join(', ')}
              </span>
            )}
            <span
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{
                borderColor: `${urgencyCfg.hex}40`,
                backgroundColor: `${urgencyCfg.hex}14`,
                color: urgencyCfg.hex,
              }}
            >
              {urgencyCfg.label}
            </span>
            {article.fusion_sources > 1 && (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                <Sparkles className="h-3 w-3" />
                Samengevoegd uit {article.fusion_sources} bronnen
              </span>
            )}
            {article.status === 'needs_review' && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                Needs review
              </span>
            )}
          </div>
        </div>
      </motion.header>

      {/* Main content + sidebar */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <motion.main
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl"
        >
          <FormattedContent content={article.content} />
        </motion.main>

        {/* Sidebar */}
        <motion.aside
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="space-y-4"
        >
          {/* Timeline */}
          <TimelineSidebarCard
            months={article.relevant_months}
            phases={article.season_phases}
          />

          {/* Products with CTGB status */}
          {article.products_mentioned.length > 0 && (
            <ProductsSidebarCard products={article.products_mentioned} />
          )}

          {/* Varieties */}
          {article.varieties.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                🍎 Relevante rassen
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {article.varieties.map((v) => (
                  <span
                    key={v}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/80"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.aside>
      </div>

      {/* Related articles */}
      {related.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="mt-12"
        >
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/70">
            🔗 Gerelateerde kennis
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((rel) => {
              const relCat = CATEGORY_CONFIG[rel.category];
              return (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => onRelatedClick?.(rel)}
                  className="group text-left rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider"
                    style={{ color: relCat.hex }}
                  >
                    {relCat.label}
                  </span>
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-white group-hover:text-emerald-300">
                    {rel.title}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs text-white/50">
                    {rel.summary}
                  </p>
                </button>
              );
            })}
          </div>
        </motion.section>
      )}
    </div>
  );
}

// ============================================
// Formatted content renderer
// ============================================

function FormattedContent({ content }: { content: string }) {
  // Simple markdown-ish formatting: split paragraphs, detect bold section titles
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  return (
    <div className="prose prose-invert max-w-none">
      {lines.map((line, i) => {
        // Heuristic: "Aanpak:" / "Middelen:" / "Timing:" → heading
        if (/^[A-Z][a-zA-Z ]{2,30}:$/.test(line.trim())) {
          return (
            <h3
              key={i}
              className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80"
            >
              {line.replace(':', '')}
            </h3>
          );
        }
        if (/^[•\-*]/.test(line.trim())) {
          return (
            <p key={i} className="mb-1 pl-4 text-sm leading-relaxed text-white/80">
              {line}
            </p>
          );
        }
        return (
          <p key={i} className="mb-3 text-sm leading-relaxed text-white/80">
            {line}
          </p>
        );
      })}
    </div>
  );
}

// ============================================
// Sidebar: timeline
// ============================================

function TimelineSidebarCard({
  months,
  phases,
}: {
  months: number[];
  phases: string[];
}) {
  const currentMonth = new Date().getUTCMonth() + 1;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        📅 Wanneer relevant
      </h3>
      <div className="grid grid-cols-12 gap-0.5">
        {MONTH_LABELS.map((label, i) => {
          const month = i + 1;
          const isRelevant = months.includes(month);
          const isCurrent = month === currentMonth;
          return (
            <div
              key={month}
              className={cn(
                'flex flex-col items-center justify-center rounded-sm py-1 text-[8px] font-mono uppercase',
                isRelevant
                  ? 'bg-emerald-500/30 text-emerald-200'
                  : isCurrent
                  ? 'border border-emerald-500/30 text-white/60'
                  : 'text-white/30',
              )}
            >
              {label[0]}
            </div>
          );
        })}
      </div>
      {phases.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-white/40">
            Fenologische fases
          </p>
          <div className="flex flex-wrap gap-1">
            {phases.map((phase) => {
              const cfg = PHENOLOGICAL_PHASES.find((p) => p.dbPhase === phase || p.key === phase);
              return (
                <span
                  key={phase}
                  className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70"
                >
                  {cfg?.emoji}
                  {cfg?.label ?? phase}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sidebar: products with CTGB status
// ============================================

function ProductsSidebarCard({ products }: { products: string[] }) {
  const [statuses, setStatuses] = useState<Record<string, 'loading' | 'ok' | 'withdrawn' | 'unknown'>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const init: Record<string, 'loading' | 'ok' | 'withdrawn' | 'unknown'> = {};
      products.forEach((p) => { init[p] = 'loading'; });
      setStatuses(init);

      // Query CTGB products by name — fuzzy ilike
      const results = await Promise.all(
        products.map(async (product) => {
          try {
            const { data } = await supabase
              .from('ctgb_products')
              .select('toelatingsnummer, status, vervaldatum')
              .ilike('naam', `%${product}%`)
              .limit(1)
              .maybeSingle();
            if (!data) return { product, status: 'unknown' as const };
            const isWithdrawn = data.status?.toLowerCase().includes('vervallen') ||
              data.status?.toLowerCase().includes('ingetrokken');
            return { product, status: (isWithdrawn ? 'withdrawn' : 'ok') as 'ok' | 'withdrawn' };
          } catch {
            return { product, status: 'unknown' as const };
          }
        }),
      );
      if (cancelled) return;
      const next: typeof init = {};
      for (const { product, status } of results) next[product] = status;
      setStatuses(next);
    })();
    return () => { cancelled = true; };
  }, [products]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        <FlaskConical className="h-3 w-3" />
        Producten genoemd
      </h3>
      <div className="space-y-1.5">
        {products.map((product) => {
          const status = statuses[product] ?? 'loading';
          return (
            <div
              key={product}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs text-white/80">{product}</span>
              <ProductStatusIndicator status={status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductStatusIndicator({
  status,
}: {
  status: 'loading' | 'ok' | 'withdrawn' | 'unknown';
}) {
  if (status === 'loading') {
    return <CircleDashed className="h-3.5 w-3.5 animate-spin text-white/30" />;
  }
  if (status === 'ok') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        <Check className="h-3 w-3" />
        CTGB
      </span>
    );
  }
  if (status === 'withdrawn') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
        <X className="h-3 w-3" />
        Vervallen
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
      onbekend
    </span>
  );
}

// ============================================
// Loading skeleton
// ============================================

function DossierSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="animate-pulse space-y-6">
        <div className="h-48 rounded-3xl bg-white/5" />
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="h-96 rounded-2xl bg-white/5" />
          <div className="space-y-4">
            <div className="h-24 rounded-2xl bg-white/5" />
            <div className="h-40 rounded-2xl bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
