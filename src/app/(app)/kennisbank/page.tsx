'use client';

/**
 * Kennisbank — Chat-first design.
 *
 * The chatbot is the PRIMARY interface. Articles, categories, and filters
 * are secondary — accessible by scrolling down or via ⌘K.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Command, BookOpen, Sparkles } from 'lucide-react';

import { AmbientBackground } from '@/components/knowledge-atlas/ambient-background';
import { CategoryConstellation } from '@/components/knowledge-atlas/category-constellation';
import { AtlasFilters } from '@/components/knowledge-atlas/atlas-filters';
import { AtlasGrid } from '@/components/knowledge-atlas/atlas-grid';
import { SeasonScrubber } from '@/components/knowledge-atlas/season-scrubber';
import { CommandPalette } from '@/components/knowledge-atlas/command-palette';
import { ArticleDossier } from '@/components/knowledge-atlas/article-dossier';
import { KnowledgeChat } from '@/components/knowledge-atlas/knowledge-chat';
import { useCurrentPhenology, useArticleStats } from '@/hooks/use-knowledge';

import type { ArticleFilters, KnowledgeArticleListItem } from '@/lib/knowledge/client-api';
import type { KnowledgeCategory } from '@/lib/knowledge/types';

const MONTH_LABELS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

export default function KnowledgeAtlasPage() {
  const [filters, setFilters] = useState<ArticleFilters>({});
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [dossierArticleId, setDossierArticleId] = useState<string | null>(null);
  const [showArticles, setShowArticles] = useState(false);

  const { data: phenology } = useCurrentPhenology();
  const { data: stats } = useArticleStats();

  const effectiveFilters: ArticleFilters = {
    ...filters,
    months: selectedMonth ? [selectedMonth] : filters.months,
  };

  const handleOpenArticle = (article: KnowledgeArticleListItem) => {
    setDossierArticleId(article.id);
  };

  const phase = phenology?.phenologicalPhase?.replace(/-/g, ' ').replace(/\//g, ' / ') ?? '';
  const monthName = phenology?.month ? MONTH_LABELS[phenology.month - 1] : '';

  return (
    <>
      <AmbientBackground month={selectedMonth ?? undefined} />

      <div className="relative min-h-screen pb-32">
        {/* ===== HERO: Chat-centric ===== */}
        <div className="mx-auto max-w-3xl px-6 pt-10">
          {/* Minimal header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 text-center"
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              <Sparkles className="h-3 w-3" />
              {phase || 'Teeltkennis'}
              {monthName ? ` · ${monthName}` : ''}
            </div>
            <h1 className="text-3xl font-light text-white sm:text-4xl">
              Stel je teeltvraag
            </h1>
            <p className="mt-2 text-sm text-white/40">
              Antwoorden op basis van {stats?.total ?? '2000'}+ kennisartikelen
              {' '}· appel & peer
            </p>
          </motion.div>

          {/* ===== THE CHAT ===== */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <KnowledgeChat
              onArticleClick={(id) => setDossierArticleId(id)}
            />
          </motion.div>

          {/* ⌘K shortcut hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-3"
          >
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="group flex w-full items-center justify-between rounded-xl border border-white/[0.04] bg-transparent px-4 py-2 text-left text-xs text-white/25 transition-colors hover:border-emerald-500/15 hover:text-white/40"
            >
              <span className="flex items-center gap-2">
                <Command className="h-3 w-3 text-emerald-400/30" />
                Zoek direct in alle artikelen
              </span>
              <span className="flex items-center gap-1 font-mono text-[9px]">
                <kbd className="rounded border border-white/[0.05] bg-white/[0.02] px-1 py-0.5">⌘</kbd>
                <kbd className="rounded border border-white/[0.05] bg-white/[0.02] px-1 py-0.5">K</kbd>
              </span>
            </button>
          </motion.div>
        </div>

        {/* ===== DIVIDER: Show articles section ===== */}
        <div className="mx-auto mt-16 max-w-3xl px-6">
          <button
            type="button"
            onClick={() => setShowArticles(!showArticles)}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.01] px-4 py-3 text-xs text-white/30 transition-colors hover:border-white/10 hover:text-white/50"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {showArticles ? 'Artikelen verbergen' : `Blader door ${stats?.total ?? '2000'}+ kennisartikelen`}
          </button>
        </div>

        {/* ===== ARTICLES SECTION (collapsed by default) ===== */}
        {showArticles && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.4 }}
          >
            {/* Categories */}
            <div className="mx-auto mt-12 flex max-w-7xl justify-center px-6">
              <CategoryConstellation
                selected={filters.categories?.[0] ?? null}
                onSelect={(cat) =>
                  setFilters((prev) => ({
                    ...prev,
                    categories: cat ? [cat] : undefined,
                  }))
                }
              />
            </div>

            {/* Filters + Grid */}
            <div className="mt-12 px-6">
              <AtlasFilters
                filters={filters}
                onChange={setFilters}
                onClear={() => {
                  setFilters({});
                  setSelectedMonth(null);
                }}
              />
              <div className="mt-4">
                <AtlasGrid filters={effectiveFilters} onArticleClick={handleOpenArticle} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Floating layers */}
      <SeasonScrubber
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
      />

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onSelect={handleOpenArticle}
      />

      <ArticleDossier
        articleId={dossierArticleId}
        onClose={() => setDossierArticleId(null)}
        onRelatedClick={(article) => setDossierArticleId(article.id)}
      />
    </>
  );
}
