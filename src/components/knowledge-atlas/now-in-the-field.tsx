'use client';

/**
 * Zone 1 — Hero "Nu in het veld"
 *
 * Shows the current date, phenological phase, and the top 4 most relevant
 * articles for right now. The cards have urgency ring indicators and tilt
 * on hover. Intended as the first thing a user sees when opening the atlas.
 */

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

import { useCurrentlyRelevantArticles, useCurrentPhenology, useArticleStats } from '@/hooks/use-knowledge';
import { MONTH_LABELS_LONG, estimateUrgency, URGENCY_CONFIG, CATEGORY_CONFIG, PHENOLOGICAL_PHASES } from '@/lib/knowledge/ui-tokens';
import type { KnowledgeArticleListItem } from '@/lib/knowledge/client-api';
import { cn } from '@/lib/utils';

/** Convert a raw phase key (e.g. "volle-bloei/bestuiving") to a display label */
function prettifyPhase(raw: string | undefined | null): string {
  if (!raw || raw === 'onbekend') return '—';
  // Strip refinement suffix ("/snoeiperiode", "/bestuiving", etc.)
  const base = raw.split('/')[0];
  const config = PHENOLOGICAL_PHASES.find((p) => p.key === base);
  if (config) return config.label;
  // Fallback: capitalize first letter, replace dashes with spaces
  return base.charAt(0).toUpperCase() + base.slice(1).replace(/-/g, ' ');
}

interface NowInTheFieldProps {
  onArticleClick?: (article: KnowledgeArticleListItem) => void;
}

export function NowInTheField({ onArticleClick }: NowInTheFieldProps) {
  const { data: phenology, isLoading: phenoLoading } = useCurrentPhenology();
  const { data: articles = [], isLoading: articlesLoading } = useCurrentlyRelevantArticles(4);
  const { data: stats } = useArticleStats();

  const today = new Date();
  const dayOfMonth = today.getUTCDate();
  const monthName = MONTH_LABELS_LONG[today.getUTCMonth()];
  const year = today.getUTCFullYear();

  const phaseLabel = prettifyPhase(phenology?.phenologicalPhase);
  const weekOfYear = phenology?.weekOfYear ?? 0;
  const loading = phenoLoading || articlesLoading;

  return (
    <section className="relative">
      {/* Header strip */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/70">
            Teeltkennis Atlas
          </p>
          <h1 className="mt-2 bg-gradient-to-br from-white via-emerald-100 to-emerald-400/60 bg-clip-text text-4xl font-light tracking-tight text-transparent sm:text-6xl">
            Nu in het veld
          </h1>
          <p className="mt-3 text-sm text-white/60 sm:text-base">
            {dayOfMonth} {monthName} {year} · week {weekOfYear} ·{' '}
            <span className="text-emerald-300">{phaseLabel}</span>
          </p>
        </div>
        {stats && (
          <div className="flex gap-6 text-right">
            <Stat label="Artikelen" value={stats.total} />
            <Stat label="Gepubliceerd" value={stats.byStatus.published} />
            <Stat label="Review" value={stats.byStatus.needs_review} dim />
          </div>
        )}
      </motion.div>

      {/* Urgency cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} index={i} />)
          : articles.slice(0, 4).map((article, index) => (
              <UrgencyCard
                key={article.id}
                article={article}
                index={index}
                onClick={() => onArticleClick?.(article)}
              />
            ))}
      </div>

      {articles.length === 0 && !loading && (
        <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center text-sm text-white/50">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-emerald-400/40" />
          Geen artikelen gevonden voor deze maand.
        </div>
      )}
    </section>
  );
}

// ============================================
// Internal components
// ============================================

function Stat({ label, value, dim = false }: { label: string; value: number; dim?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span
        className={cn(
          'font-mono text-2xl tabular-nums',
          dim ? 'text-white/40' : 'text-emerald-300',
        )}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
    </div>
  );
}

function UrgencyCard({
  article,
  index,
  onClick,
}: {
  article: KnowledgeArticleListItem;
  index: number;
  onClick?: () => void;
}) {
  const urgency = estimateUrgency(article);
  const urgencyCfg = URGENCY_CONFIG[urgency];
  const categoryCfg = CATEGORY_CONFIG[article.category];

  // Arbitrary "priority" number 0-100 for the ring
  const priority = urgency === 'time_critical' ? 85 + ((article.fusion_sources * 3) % 15)
    : urgency === 'seasonal' ? 55 + ((article.fusion_sources * 3) % 30)
    : 20 + ((article.fusion_sources * 3) % 30);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-xl transition-colors hover:border-white/20"
    >
      {/* Category gradient background */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-30 transition-opacity group-hover:opacity-50',
          categoryCfg.gradientFrom,
          categoryCfg.gradientTo,
        )}
      />

      {/* Urgency ring in top-right corner */}
      <div className="absolute right-4 top-4 z-10">
        <UrgencyRing value={priority} color={urgencyCfg.hex} urgent={urgency === 'time_critical'} />
      </div>

      <div className="relative z-10 flex h-full flex-col gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/50">
            {categoryCfg.label}
            {article.subcategory ? ` · ${article.subcategory}` : ''}
          </p>
          <h3 className="mt-2 line-clamp-2 pr-12 text-base font-semibold text-white transition-colors group-hover:text-white">
            {article.title}
          </h3>
        </div>

        <p className="line-clamp-2 text-xs text-white/60">{article.summary}</p>

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex gap-1">
            {article.crops.slice(0, 2).map((crop) => (
              <span
                key={crop}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70"
              >
                {crop}
              </span>
            ))}
          </div>
          <span
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: urgencyCfg.hex }}
          >
            {urgencyCfg.label}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function UrgencyRing({
  value,
  color,
  urgent,
}: {
  value: number;
  color: string;
  urgent: boolean;
}) {
  const size = 42;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <motion.div
      animate={urgent ? { scale: [1, 1.08, 1] } : undefined}
      transition={urgent ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      className="relative"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke="rgba(255,255,255,0.08)"
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke={color}
          fill="none"
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
    </motion.div>
  );
}

function CardSkeleton({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.1 }}
      className="relative h-[180px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl"
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      />
    </motion.div>
  );
}
