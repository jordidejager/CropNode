'use client';

/**
 * Zone 4 — Atlas Grid
 *
 * Masonry-style grid of article cards. Uses CSS columns for performance
 * (framer-motion on a real masonry lib gets heavy with 500+ items).
 * Cards have 3D tilt on hover via mouse perspective transform.
 */

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useRef } from 'react';

import { useArticles } from '@/hooks/use-knowledge';
import type { ArticleFilters, KnowledgeArticleListItem } from '@/lib/knowledge/client-api';
import {
  CATEGORY_CONFIG,
  URGENCY_CONFIG,
  estimateUrgency,
  CROP_CONFIG,
} from '@/lib/knowledge/ui-tokens';
import { cn } from '@/lib/utils';

interface AtlasGridProps {
  filters: ArticleFilters;
  onArticleClick?: (article: KnowledgeArticleListItem) => void;
}

export function AtlasGrid({ filters, onArticleClick }: AtlasGridProps) {
  const { data: articles = [], isLoading } = useArticles({ ...filters, limit: 200 });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <GridSkeleton />
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center backdrop-blur-xl">
        <p className="text-lg text-white/70">Geen artikelen gevonden</p>
        <p className="mt-2 text-sm text-white/40">
          Pas je filters aan of probeer een andere categorie.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex items-center justify-between text-xs text-white/50">
        <span className="font-mono tabular-nums">{articles.length} resultaten</span>
      </div>

      {/* Masonry via CSS columns */}
      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
        {articles.map((article, i) => (
          <ArticleCard
            key={article.id}
            article={article}
            index={i}
            onClick={() => onArticleClick?.(article)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Article Card with 3D tilt
// ============================================

function ArticleCard({
  article,
  index,
  onClick,
}: {
  article: KnowledgeArticleListItem;
  index: number;
  onClick?: () => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rotateX = useTransform(useSpring(mouseY, { stiffness: 200, damping: 30 }), [0, 1], [6, -6]);
  const rotateY = useTransform(useSpring(mouseX, { stiffness: 200, damping: 30 }), [0, 1], [-6, 6]);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  const category = CATEGORY_CONFIG[article.category];
  const urgency = estimateUrgency(article);
  const urgencyCfg = URGENCY_CONFIG[urgency];

  // Determine vertical "size" based on content length + importance for masonry variety
  const isFeature = article.fusion_sources >= 3 || article.content.length > 1500;

  return (
    <motion.button
      ref={cardRef}
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: Math.min(index * 0.03, 0.6),
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
      }}
      className={cn(
        'group relative mb-5 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-xl transition-all hover:border-white/20',
        isFeature && 'ring-1 ring-emerald-500/20',
      )}
    >
      {/* Category gradient background */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-20 transition-opacity group-hover:opacity-40',
          category.gradientFrom,
          category.gradientTo,
        )}
      />
      {/* Featured glow */}
      {isFeature && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${category.hex}30, transparent 60%)`,
          }}
        />
      )}

      <div className="relative z-10 flex flex-col gap-3">
        {/* Category + urgency line */}
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: category.hex }}
          >
            {category.label}
            {article.subcategory ? ` · ${article.subcategory}` : ''}
          </span>
          <span
            className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
            style={{ color: urgencyCfg.hex }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: urgencyCfg.hex }}
            />
            {urgencyCfg.label}
          </span>
        </div>

        {/* Title */}
        <h3
          className={cn(
            'font-semibold text-white transition-colors',
            isFeature ? 'text-xl' : 'text-base',
          )}
        >
          {article.title}
        </h3>

        {/* Summary */}
        <p
          className={cn(
            'text-xs text-white/60',
            isFeature ? 'line-clamp-4' : 'line-clamp-3',
          )}
        >
          {article.summary}
        </p>

        {/* Products */}
        {article.products_mentioned && article.products_mentioned.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.products_mentioned.slice(0, 3).map((product) => (
              <span
                key={product}
                className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-white/70"
              >
                {product}
              </span>
            ))}
            {article.products_mentioned.length > 3 && (
              <span className="rounded border border-white/5 px-1.5 py-0.5 font-mono text-[9px] text-white/40">
                +{article.products_mentioned.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-1 flex items-center justify-between">
          <div className="flex gap-1">
            {article.crops.map((crop) => (
              <span
                key={crop}
                title={CROP_CONFIG[crop]?.label}
                className="text-sm"
              >
                {CROP_CONFIG[crop]?.emoji ?? '•'}
              </span>
            ))}
          </div>
          {article.fusion_sources > 1 && (
            <span
              className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300"
              title={`Samengevoegd uit ${article.fusion_sources} bronnen`}
            >
              ✦ {article.fusion_sources}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ============================================
// Loading skeleton
// ============================================

function GridSkeleton() {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.03 }}
          className="mb-5 h-48 break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
          style={{ height: `${150 + (i % 4) * 60}px` }}
        >
          <motion.div
            className="h-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>
      ))}
    </div>
  );
}
