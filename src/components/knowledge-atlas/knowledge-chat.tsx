'use client';

/**
 * Knowledge Chat — production chat component for the Atlas page.
 *
 * Features:
 *   - Streaming SSE responses from /api/knowledge/chat
 *   - CTGB product status badges (toegelaten/vervallen/onbekend)
 *   - Source cards linking to knowledge articles
 *   - Seasonal suggestion chips
 *   - Retry logic for transient network issues
 *   - Markdown-like rendering (bold, lists, code)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Sparkles,
  AlertTriangle,
  Check,
  X,
  CircleDashed,
  ChevronDown,
  Leaf,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

import type { CtgbAnnotation } from '@/lib/knowledge/rag/types';
import { cn } from '@/lib/utils';
import { useCurrentPhenology } from '@/hooks/use-knowledge';
import { useRagChat, type RagChatMessage } from '@/hooks/use-rag-chat';

// ============================================
// Seasonal suggestions — fetched dynamically from /api/knowledge/suggestions
// ============================================

const DEFAULT_SUGGESTIONS = [
  'Wat doe ik nu tegen schurft bij Jonagold?',
  'Welke middelen tegen perenbladvlo?',
  'Wanneer GA4/7 op Conference spuiten?',
  'Alternatieven voor Captan tijdens bloei?',
];

// ============================================
// Main component
// ============================================

interface KnowledgeChatProps {
  /** Called when user clicks a source article */
  onArticleClick?: (articleId: string) => void;
  className?: string;
}

export function KnowledgeChat({ onArticleClick, className }: KnowledgeChatProps) {
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: phenology } = useCurrentPhenology();
  const { messages, submit, sendFeedback, isLoading } = useRagChat();
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);

  const currentPhase = phenology?.seasonPhase ?? 'bloei';

  // Fetch phase-aware suggestions (feedback-driven + fallback)
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/knowledge/suggestions?phase=${encodeURIComponent(currentPhase)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { suggestions?: string[] } | null) => {
        if (data?.suggestions && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
        }
      })
      .catch(() => {
        // keep defaults on error
      });
    return () => ctrl.abort();
  }, [currentPhase]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(
    (questionText?: string) => {
      const text = (questionText ?? query).trim();
      if (text.length < 2 || isLoading) return;
      setQuery('');
      setIsExpanded(true);
      void submit(text);
    },
    [query, isLoading, submit],
  );

  return (
    <div className={cn('relative', className)}>
      {/* Chat container */}
      <motion.div
        layout
        className={cn(
          'rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl transition-all',
          isExpanded ? 'p-6' : 'p-4',
        )}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
              <Leaf className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Teelt-assistent</h3>
              <p className="text-[10px] text-white/40">
                Antwoorden op basis van 2000+ kennisartikelen
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="rounded-lg p-1 text-white/40 hover:text-white/70"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
            </button>
          )}
        </div>

        {/* Suggestions (shown when no messages yet) */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Suggesties voor {currentPhase}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSubmit(q)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-emerald-500/30 hover:bg-white/[0.06] hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Messages */}
        <AnimatePresence>
          {isExpanded && messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 max-h-[60vh] space-y-4 overflow-y-auto"
            >
              {messages.map((msg) => (
                <ChatMessageBlock
                  key={msg.id}
                  message={msg}
                  onArticleClick={onArticleClick}
                  onFeedback={sendFeedback}
                />
              ))}
              <div ref={messagesEndRef} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Stel een vraag over appel- of perenteelt..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/30 focus:border-emerald-500/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={query.trim().length < 2 || isLoading}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-400 disabled:opacity-30"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Vraag</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ============================================
// Message block
// ============================================

function ChatMessageBlock({
  message,
  onArticleClick,
  onFeedback,
}: {
  message: RagChatMessage;
  onArticleClick?: (articleId: string) => void;
  onFeedback?: (messageId: string, type: 'positive' | 'negative') => void;
}) {
  return (
    <div className="space-y-2">
      {/* User bubble */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-500/15 px-4 py-2 text-sm text-white">
          {message.query}
        </div>
      </div>

      {/* Loading */}
      {message.loading && !message.answer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 py-2 text-xs text-white/50"
        >
          <CircleDashed className="h-3.5 w-3.5 animate-spin text-emerald-400" />
          {message.pipelineStage}
        </motion.div>
      )}

      {/* Answer */}
      {message.answer && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl rounded-tl-sm border border-white/[0.06] bg-white/[0.02] p-4"
        >
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1 text-sm leading-relaxed text-white/85">
              <FormattedAnswer
                text={message.answer}
                sources={message.sources}
                onArticleClick={onArticleClick}
              />
            </div>
          </div>

          {/* Feedback buttons */}
          {!message.loading && message.answer && (
            <div className="mt-2 flex items-center gap-1">
              <span className="text-[9px] text-white/20 mr-1">Was dit nuttig?</span>
              <button
                type="button"
                onClick={() => onFeedback?.(message.id, 'positive')}
                disabled={message.feedback !== null}
                className={cn(
                  'rounded-md p-1 transition-all',
                  message.feedback === 'positive'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : message.feedback !== null
                      ? 'text-white/10 cursor-default'
                      : 'text-white/25 hover:text-emerald-400 hover:bg-emerald-500/10',
                )}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onFeedback?.(message.id, 'negative')}
                disabled={message.feedback !== null}
                className={cn(
                  'rounded-md p-1 transition-all',
                  message.feedback === 'negative'
                    ? 'bg-rose-500/20 text-rose-400'
                    : message.feedback !== null
                      ? 'text-white/10 cursor-default'
                      : 'text-white/25 hover:text-rose-400 hover:bg-rose-500/10',
                )}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
              {message.feedback && (
                <span className="ml-1 text-[9px] text-white/20">
                  {message.feedback === 'positive' ? 'Bedankt!' : 'Bedankt voor de feedback'}
                </span>
              )}
            </div>
          )}

          {/* Images from sources */}
          {(() => {
            const allImages = message.sources
              .flatMap((s) => s.image_urls ?? [])
              .filter(Boolean)
              .slice(0, 4); // max 4 images
            if (allImages.length === 0) return null;
            return (
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/30">
                  Afbeeldingen uit WUR bronnen
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allImages.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 overflow-hidden rounded-lg border border-white/10 transition-all hover:border-emerald-500/30"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Afbeelding ${i + 1}`}
                        className="h-24 w-32 object-cover sm:h-32 sm:w-44"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* CTGB */}
          {message.annotations.length > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/30">
                CTGB Toelatingscheck
              </p>
              <div className="flex flex-wrap gap-1.5">
                {message.annotations.map((ann) => (
                  <CtgbBadge key={ann.product} annotation={ann} />
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {message.sources.length > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/30">
                Bronnen ({message.sources.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {message.sources.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onArticleClick?.(source.id)}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-emerald-500/20 hover:bg-white/[0.04]"
                  >
                    <span className="mr-1.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400/60">
                      {source.category}
                      {source.subcategory ? ` · ${source.subcategory}` : ''}
                    </span>
                    <span className="text-white/70">{source.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Error */}
      {message.error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {message.error}
        </div>
      )}
    </div>
  );
}

// ============================================
// Formatted answer (basic markdown)
// ============================================

interface FormattedAnswerProps {
  text: string;
  sources?: Array<{ id: string; title: string; category: string; subcategory: string | null }>;
  onArticleClick?: (articleId: string) => void;
}

function FormattedAnswer({ text, sources = [], onArticleClick }: FormattedAnswerProps) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      elements.push(<br key={i} />);
      continue;
    }

    if (line.startsWith('* ') || line.startsWith('- ')) {
      elements.push(
        <li key={i} className="ml-4 list-disc">
          <InlineFormatted text={line.slice(2)} sources={sources} onArticleClick={onArticleClick} />
        </li>,
      );
    } else if (line.match(/^\d+\.\s/)) {
      elements.push(
        <li key={i} className="ml-4 list-decimal">
          <InlineFormatted text={line.replace(/^\d+\.\s/, '')} sources={sources} onArticleClick={onArticleClick} />
        </li>,
      );
    } else {
      elements.push(
        <p key={i} className={i > 0 ? 'mt-2' : ''}>
          <InlineFormatted text={line} sources={sources} onArticleClick={onArticleClick} />
        </p>,
      );
    }
  }

  return <>{elements}</>;
}

function InlineFormatted({
  text,
  sources = [],
  onArticleClick,
}: {
  text: string;
  sources?: Array<{ id: string; title: string; category: string; subcategory: string | null }>;
  onArticleClick?: (articleId: string) => void;
}) {
  // Split on **bold**, *italic*, AND [n] citation markers
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        const citationMatch = /^\[(\d+)\]$/.exec(part);
        if (citationMatch) {
          const n = parseInt(citationMatch[1], 10);
          const source = sources[n - 1];
          const title = source ? `${source.category}${source.subcategory ? ` · ${source.subcategory}` : ''}: ${source.title}` : `Bron ${n}`;
          return (
            <button
              key={i}
              type="button"
              title={title}
              disabled={!source}
              onClick={() => source && onArticleClick?.(source.id)}
              className={cn(
                'mx-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full border px-1 align-[1px] text-[9px] font-semibold transition-colors',
                source
                  ? 'cursor-pointer border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-white/10 bg-white/[0.03] text-white/30',
              )}
            >
              {n}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ============================================
// CTGB badge (compact)
// ============================================

function CtgbBadge({ annotation }: { annotation: CtgbAnnotation }) {
  const config = {
    toegelaten: { icon: Check, color: 'text-emerald-400', border: 'border-emerald-500/20', label: 'TOEGELATEN' },
    vervallen: { icon: X, color: 'text-rose-400', border: 'border-rose-500/20', label: 'VERVALLEN' },
    onbekend: { icon: CircleDashed, color: 'text-white/40', border: 'border-white/10', label: 'ONBEKEND' },
    twijfel: { icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/20', label: 'TWIJFEL' },
  }[annotation.status];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]', config.border)}>
      <span className="font-medium text-white/70">{annotation.product}</span>
      {annotation.toelatingsnummer && (
        <span className="font-mono text-[8px] text-white/30">{annotation.toelatingsnummer}</span>
      )}
      <Icon className={cn('h-3 w-3', config.color)} />
      <span className={cn('font-bold tracking-wider', config.color)}>{config.label}</span>
    </div>
  );
}
