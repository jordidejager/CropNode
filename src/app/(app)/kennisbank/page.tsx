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
import { PhenologicalCompass } from '@/components/knowledge-atlas/phenological-compass';
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
        {/* ===== HERO: Compass + Chat ===== */}
        <div className="mx-auto max-w-5xl px-6 pt-10">
          {/* Header */}
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
              Antwoorden op basis van {stats?.total ?? '2000'}+ kennisartikelen · appel & peer
            </p>
          </motion.div>

          {/* Compass + Chat side by side */}
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:gap-10">
            {/* Compass — full on lg+, compact horizontal bar on mobile */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="hidden shrink-0 lg:block"
            >
              <PhenologicalCompass />
            </motion.div>

            {/* Mobile season indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="w-full lg:hidden"
            >
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex gap-0.5 flex-1">
                  {Array.from({ length: 12 }).map((_, m) => {
                    const isCurrent = m + 1 === (phenology?.month ?? new Date().getUTCMonth() + 1);
                    return (
                      <div
                        key={m}
                        className={`h-2 flex-1 rounded-full ${
                          isCurrent ? 'bg-emerald-400' : m >= 2 && m <= 9 ? 'bg-white/15' : 'bg-white/[0.04]'
                        }`}
                      />
                    );
                  })}
                </div>
                <span className="text-[10px] text-white/40 shrink-0">
                  {phase?.split('/')[0]}
                </span>
              </div>
            </motion.div>

            {/* Chat (takes remaining width) */}
            <div className="w-full min-w-0 flex-1">
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
          </div>
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
