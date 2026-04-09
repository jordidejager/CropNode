'use client';

/**
 * ⌘K Command Palette
 *
 * Global keyboard shortcut (Cmd+K / Ctrl+K) opens a full-screen search
 * overlay. Uses /api/knowledge/search for semantic (vector) similarity.
 *
 * Also offers suggested queries and shows similarity percentages per result.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Search, Sparkles, Command, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useDebounce } from '@/hooks/use-debounce';
import { useKnowledgeSearch } from '@/hooks/use-knowledge';
import { CATEGORY_CONFIG } from '@/lib/knowledge/ui-tokens';
import type { KnowledgeArticleListItem } from '@/lib/knowledge/client-api';

const SUGGESTED_QUERIES = [
  'schurft preventief voorjaar',
  'perenbladvlo larven',
  'calciumbespuitingen Conference',
  'dunning Brevis dosering',
  'bewaring scald',
  'vruchtboomkanker captan',
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (article: KnowledgeArticleListItem) => void;
}

export function CommandPalette({ open, onOpenChange, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results = [], isLoading } = useKnowledgeSearch(debouncedQuery, {
    limit: 8,
  });

  // Listen for ⌘K / Ctrl+K globally
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  // Auto-focus when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [open]);

  const handleSelect = (article: KnowledgeArticleListItem) => {
    onSelect?.(article);
    onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[15vh] backdrop-blur-md"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
              <Search className="h-5 w-5 text-emerald-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Wat wil je weten?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-lg text-white placeholder-white/30 focus:outline-none"
              />
              <kbd className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/50">
                ESC
              </kbd>
            </div>

            {/* Results or suggestions */}
            <div className="max-h-[50vh] overflow-y-auto p-3">
              {debouncedQuery.trim().length < 2 ? (
                <SuggestionsPane
                  onPick={(q) => {
                    setQuery(q);
                    inputRef.current?.focus();
                  }}
                />
              ) : isLoading ? (
                <ResultsSkeleton />
              ) : results.length > 0 ? (
                <div className="space-y-1">
                  <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Vector search · {results.length} treffers
                  </div>
                  {results.map((article, i) => (
                    <ResultRow
                      key={article.id}
                      article={article}
                      index={i}
                      onSelect={() => handleSelect(article)}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-white/40">
                  Geen artikelen gevonden voor "{debouncedQuery}"
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-5 py-2 text-[10px] text-white/40">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-400/60" />
                Semantic search via Gemini embeddings
              </span>
              <span className="flex items-center gap-1">
                <Command className="h-3 w-3" />
                K opent deze zoekbalk
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Suggestions pane
// ============================================

function SuggestionsPane({ onPick }: { onPick: (query: string) => void }) {
  return (
    <div className="py-4">
      <div className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
        Populaire vragen
      </div>
      <div className="space-y-1">
        {SUGGESTED_QUERIES.map((q, i) => (
          <motion.button
            key={q}
            type="button"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onPick(q)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400/40" />
              {q}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-white/20" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Result row
// ============================================

function ResultRow({
  article,
  index,
  onSelect,
}: {
  article: KnowledgeArticleListItem & { similarity?: number };
  index: number;
  onSelect: () => void;
}) {
  const category = CATEGORY_CONFIG[article.category];
  const similarity = (article.similarity ?? 0.8) * 100;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onSelect}
      className="group flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-white/10 hover:bg-white/[0.04]"
    >
      <div
        className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: category.hex }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: category.hex }}
          >
            {category.label}
          </span>
          {article.subcategory && (
            <span className="text-[10px] text-white/40">· {article.subcategory}</span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm font-medium text-white">
          {article.title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-white/50">
          {article.summary}
        </p>
      </div>
      <div className="ml-2 flex shrink-0 flex-col items-end">
        <SimilarityBar value={similarity} />
        <span className="mt-1 font-mono text-[9px] tabular-nums text-emerald-400/60">
          {similarity.toFixed(0)}%
        </span>
      </div>
    </motion.button>
  );
}

function SimilarityBar({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-1 w-1.5 rounded-sm transition-colors"
          style={{
            backgroundColor: value > i * 20 ? '#10b981' : 'rgba(255,255,255,0.1)',
          }}
        />
      ))}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-1 py-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.05 }}
          className="flex gap-3 rounded-xl px-3 py-3"
        >
          <div className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-white/20" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-white/15" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
