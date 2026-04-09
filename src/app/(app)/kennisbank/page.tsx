'use client';

/**
 * Knowledge Atlas — the main kennisbank page.
 *
 * Wires together all zones of the Teeltkennis Atlas:
 *   1. Ambient background
 *   2. Hero "Nu in het veld"
 *   3. Fenologische Compas
 *   4. Categorie Constellatie
 *   5. Atlas Grid with filters
 *   6. Season Scrubber (sticky footer)
 *   + ⌘K Command Palette (global)
 *   + Article Dossier (full-screen takeover)
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Command } from 'lucide-react';

import { AmbientBackground } from '@/components/knowledge-atlas/ambient-background';
import { NowInTheField } from '@/components/knowledge-atlas/now-in-the-field';
import { CategoryConstellation } from '@/components/knowledge-atlas/category-constellation';
import { AtlasFilters } from '@/components/knowledge-atlas/atlas-filters';
import { AtlasGrid } from '@/components/knowledge-atlas/atlas-grid';
import { SeasonScrubber } from '@/components/knowledge-atlas/season-scrubber';
import { CommandPalette } from '@/components/knowledge-atlas/command-palette';
import { ArticleDossier } from '@/components/knowledge-atlas/article-dossier';

import type { ArticleFilters, KnowledgeArticleListItem } from '@/lib/knowledge/client-api';
import type { KnowledgeCategory } from '@/lib/knowledge/types';

export default function KnowledgeAtlasPage() {
  // Filter state
  const [filters, setFilters] = useState<ArticleFilters>({});
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Dialog state
  const [commandOpen, setCommandOpen] = useState(false);
  const [dossierArticleId, setDossierArticleId] = useState<string | null>(null);

  // When a month is picked from the scrubber, merge into filters
  const effectiveFilters: ArticleFilters = {
    ...filters,
    months: selectedMonth ? [selectedMonth] : filters.months,
  };

  const handleOpenArticle = (article: KnowledgeArticleListItem) => {
    setDossierArticleId(article.id);
  };

  const handleCloseDossier = () => {
    setDossierArticleId(null);
  };

  const handleCategorySelect = (category: KnowledgeCategory | null) => {
    setFilters((prev) => ({
      ...prev,
      categories: category ? [category] : undefined,
    }));
  };

  const handleClearFilters = () => {
    setFilters({});
    setSelectedMonth(null);
  };

  return (
    <>
      <AmbientBackground month={selectedMonth ?? undefined} />

      <div className="relative min-h-screen pb-32">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="mx-auto max-w-7xl px-6 pt-12"
        >
          <NowInTheField onArticleClick={handleOpenArticle} />
        </motion.div>

        {/* ⌘K hint */}
        <div className="mx-auto mt-6 max-w-7xl px-6">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-3 text-left text-sm text-white/40 backdrop-blur-xl transition-colors hover:border-emerald-500/30 hover:bg-white/[0.04] hover:text-white/70"
          >
            <span className="flex items-center gap-3">
              <Command className="h-4 w-4 text-emerald-400/60" />
              Zoek in 1970+ kennisartikelen met AI-semantisch zoeken...
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px]">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">⌘</kbd>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">K</kbd>
            </span>
          </button>
        </div>

        {/* Category constellation (full width now that the compass is gone) */}
        <div className="mx-auto mt-16 flex max-w-7xl justify-center px-6">
          <CategoryConstellation
            selected={filters.categories?.[0] ?? null}
            onSelect={handleCategorySelect}
          />
        </div>

        {/* Filters */}
        <div className="mt-16 px-6">
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto mb-6 max-w-5xl text-center"
          >
            <span className="block text-xs uppercase tracking-[0.2em] text-emerald-400/70">
              De kennis-atlas
            </span>
            <span className="mt-2 block text-3xl font-light text-white sm:text-5xl">
              Verken alle kennis
            </span>
          </motion.h2>

          <AtlasFilters
            filters={filters}
            onChange={setFilters}
            onClear={handleClearFilters}
          />

          {/* Grid */}
          <div>
            <AtlasGrid filters={effectiveFilters} onArticleClick={handleOpenArticle} />
          </div>
        </div>
      </div>

      {/* Floating UI layers */}
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
        onClose={handleCloseDossier}
        onRelatedClick={(article) => setDossierArticleId(article.id)}
      />
    </>
  );
}
