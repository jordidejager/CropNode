'use client';

/**
 * Chat Debug page — minimal UI to inspect the RAG pipeline.
 *
 * Shows the raw event stream + retrieved chunks per message so we can verify
 * each stage (understanding, retrieval, confidence, generation, CTGB, sources).
 * Uses the shared `useRagChat` hook with `debug: true` so the plumbing stays
 * in sync with the production Atlas chat.
 */

import { useState } from 'react';
import { Send, Sparkles, AlertTriangle, Check, X, CircleDashed } from 'lucide-react';

import type { CtgbAnnotation, RagEvent } from '@/lib/knowledge/rag/types';
import { useRagChat, type RagChatMessage } from '@/hooks/use-rag-chat';
import { cn } from '@/lib/utils';

const SUGGESTED_QUERIES = [
  'Wat doe ik nu tegen schurft bij Jonagold?',
  'Welke dosering Captan is toegestaan op appel?',
  'Wanneer begin ik met dunnen bij Elstar?',
  'Mag ik Topsin M gebruiken tegen vruchtboomkanker?',
  'Welke middelen tegen perenbladvlo in april?',
  'Welke kunstmest is goed voor tomaten?', // off-topic test
  'Hoe werkt fotosynthese?', // off-topic test
];

export default function ChatDebugPage() {
  const [query, setQuery] = useState('');
  const { messages, submit, isLoading } = useRagChat({ debug: true });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim().length < 2 || isLoading) return;
    const text = query;
    setQuery('');
    void submit(text);
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-light text-white">Chat Debug</h1>
        <p className="mt-1 text-sm text-white/60">
          Test de RAG-pipeline met grounded generation. Elk antwoord wordt
          gebaseerd op alleen de CropNode kennisbank.
        </p>
      </div>

      {/* Suggested queries */}
      {messages.length === 0 && (
        <div className="mb-8">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Probeer een voorbeeld
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuery(q)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-emerald-500/30 hover:bg-white/[0.06] hover:text-white"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-6">
        {messages.map((msg) => (
          <MessageBlock key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-8 flex gap-2">
        <input
          type="text"
          placeholder="Stel een vraag over appel- of perenteelt..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/30 focus:border-emerald-500/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={query.trim().length < 2 || isLoading}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
          Vraag
        </button>
      </form>
    </div>
  );
}

// ============================================
// Message block
// ============================================

function MessageBlock({ message }: { message: RagChatMessage }) {
  return (
    <div className="space-y-3">
      {/* User query */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm text-white">
          {message.query}
        </div>
      </div>

      {/* Loading indicator */}
      {message.loading && message.answer.length === 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/60">
          <CircleDashed className="h-4 w-4 animate-spin text-emerald-400" />
          <PipelineStatus events={message.events} />
        </div>
      )}

      {/* Answer */}
      {message.answer && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="flex-1 whitespace-pre-wrap text-sm text-white/90">
              {message.answer}
            </div>
          </div>

          {/* CTGB annotations */}
          {message.annotations.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                CTGB Toelatingscheck
              </p>
              <div className="space-y-1">
                {message.annotations.map((ann) => (
                  <CtgbRow key={ann.product} annotation={ann} />
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {message.sources.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Bronnen ({message.sources.length})
              </p>
              <div className="space-y-1">
                {message.sources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/70">
                      {source.category}
                      {source.subcategory ? ` · ${source.subcategory}` : ''}
                    </span>
                    <span className="text-white/80">{source.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {message.error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4" />
          {message.error}
        </div>
      )}

      {/* Debug events drawer */}
      <details className="text-[10px] text-white/30">
        <summary className="cursor-pointer">Debug events ({message.events.length})</summary>
        <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-white/5 bg-slate-950/50 p-3">
          {JSON.stringify(message.events, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function PipelineStatus({ events }: { events: RagEvent[] }) {
  const latest = events[events.length - 1];
  if (!latest) return <span>Bezig met initialiseren...</span>;
  const labels: Record<RagEvent['type'], string> = {
    understanding_start: 'Intentie analyseren...',
    understanding_done: 'Intentie gevonden',
    retrieval_start: 'Zoeken in kennisbank...',
    retrieval_done: 'Relevante artikelen gevonden',
    confidence_fail: 'Onvoldoende vertrouwen',
    generation_start: 'Antwoord formuleren...',
    answer_chunk: 'Antwoord streamt...',
    generation_done: 'Antwoord gereed',
    ctgb_annotation: 'CTGB-status checken...',
    sources: 'Bronnen samenvatten...',
    error: 'Fout opgetreden',
    done: 'Klaar',
  };
  return <span>{labels[latest.type]}</span>;
}

function CtgbRow({ annotation }: { annotation: CtgbAnnotation }) {
  const cfg = {
    toegelaten: { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Toegelaten' },
    vervallen: { icon: X, color: 'text-rose-400', bg: 'bg-rose-500/10', label: 'Vervallen' },
    onbekend: { icon: CircleDashed, color: 'text-white/40', bg: 'bg-white/5', label: 'Onbekend' },
    twijfel: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Twijfel' },
  }[annotation.status];
  const Icon = cfg.icon;

  return (
    <div className={cn('flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-xs', cfg.bg)}>
      <span className="font-mono text-white/80">{annotation.product}</span>
      <div className="flex items-center gap-2">
        {annotation.toelatingsnummer && (
          <span className="font-mono text-[9px] text-white/40">{annotation.toelatingsnummer}</span>
        )}
        <span className={cn('flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider', cfg.color)}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </span>
      </div>
    </div>
  );
}
