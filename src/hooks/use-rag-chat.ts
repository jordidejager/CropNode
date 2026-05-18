'use client';

/**
 * useRagChat — shared chat state machine for the knowledge RAG pipeline.
 *
 * Handles:
 *   - POSTing to /api/knowledge/chat with query + history
 *   - SSE parsing and event dispatch
 *   - Retry with backoff on transient network failures
 *   - Optimistic message state for the UI
 *
 * Both the production chat (Atlas) and the debug page consume this hook so
 * we don't duplicate the SSE plumbing in two places.
 */

import { useCallback, useState } from 'react';

import type {
  ChatTurn,
  CtgbAnnotation,
  RagEvent,
  RetrievedChunk,
} from '@/lib/knowledge/rag/types';

export interface ChatSource {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  image_urls?: string[];
}

export interface RagChatMessage {
  id: string;
  query: string;
  answer: string;
  annotations: CtgbAnnotation[];
  sources: ChatSource[];
  /** Raw retrieved chunks (only populated when debug=true) */
  chunks: RetrievedChunk[];
  /** Full event log (only populated when debug=true) */
  events: RagEvent[];
  loading: boolean;
  error: string | null;
  pipelineStage: string;
  feedback: 'positive' | 'negative' | null;
}

const PIPELINE_LABELS: Record<RagEvent['type'], string> = {
  understanding_start: 'Vraag analyseren...',
  understanding_done: 'Zoeken in kennisbank...',
  retrieval_start: 'Zoeken in 2000+ artikelen...',
  retrieval_done: 'Antwoord formuleren...',
  confidence_fail: 'Onvoldoende vertrouwen',
  generation_start: 'Antwoord schrijven...',
  answer_chunk: '',
  generation_done: '',
  ctgb_annotation: 'CTGB-status checken...',
  sources: 'Bronnen samenvatten...',
  error: 'Fout opgetreden',
  done: '',
};

const MAX_HISTORY_TURNS = 6; // last 3 exchanges

export interface UseRagChatOptions {
  /** When true, keeps the full event log and retrieved chunks per message. */
  debug?: boolean;
}

export function useRagChat(options: UseRagChatOptions = {}) {
  const { debug = false } = options;
  const [messages, setMessages] = useState<RagChatMessage[]>([]);

  const updateMessage = useCallback(
    (id: string, patch: (m: RagChatMessage) => RagChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
    },
    [],
  );

  const submit = useCallback(
    async (queryText: string): Promise<void> => {
      const trimmed = queryText.trim();
      if (trimmed.length < 2) return;

      const id = `msg-${Date.now()}`;
      const initial: RagChatMessage = {
        id,
        query: trimmed,
        answer: '',
        annotations: [],
        sources: [],
        chunks: [],
        events: [],
        loading: true,
        error: null,
        pipelineStage: PIPELINE_LABELS.understanding_start,
        feedback: null,
      };

      // Snapshot history BEFORE optimistically appending the new message.
      const history: ChatTurn[] = [];
      for (const m of messages) {
        if (!m.answer) continue;
        history.push({ role: 'user', content: m.query });
        history.push({ role: 'assistant', content: m.answer });
      }
      const trimmedHistory = history.slice(-MAX_HISTORY_TURNS);
      setMessages((prev) => [...prev, initial]);

      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch('/api/knowledge/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: trimmed, history: trimmedHistory }),
          });

          if (!res.ok || !res.body) {
            const isRetryable = res.status >= 500 || res.status === 503;
            if (attempt < MAX_ATTEMPTS && isRetryable) {
              await new Promise((r) => setTimeout(r, 1000 * attempt));
              continue;
            }
            throw new Error(
              res.status === 401
                ? 'Je sessie is verlopen. Ververs de pagina.'
                : `Er ging iets mis (${res.status}).`,
            );
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const event = JSON.parse(line.slice(6)) as RagEvent;
                updateMessage(id, (m) => applyEvent(m, event, debug));
              } catch {
                // malformed SSE chunk — ignore
              }
            }
          }
          return; // success
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTransient = /fetch failed|ECONNRESET|NetworkError|TypeError.*fetch/i.test(message);
          if (attempt < MAX_ATTEMPTS && isTransient) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }
          updateMessage(id, (m) => ({
            ...m,
            error: isTransient
              ? 'Tijdelijk verbindingsprobleem. Probeer het opnieuw.'
              : message,
            loading: false,
          }));
          return;
        }
      }
    },
    [debug, messages, updateMessage],
  );

  const sendFeedback = useCallback(
    async (messageId: string, type: 'positive' | 'negative') => {
      updateMessage(messageId, (m) => ({ ...m, feedback: type }));
      try {
        const msg = messages.find((m) => m.id === messageId);
        await fetch('/api/knowledge/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId,
            query: msg?.query,
            answer: msg?.answer?.slice(0, 500),
            feedback: type,
          }),
        });
      } catch {
        // fire-and-forget
      }
    },
    [messages, updateMessage],
  );

  const clear = useCallback(() => setMessages([]), []);

  return {
    messages,
    submit,
    sendFeedback,
    clear,
    isLoading: messages.some((m) => m.loading),
  };
}

function applyEvent(msg: RagChatMessage, event: RagEvent, debug: boolean): RagChatMessage {
  const next: RagChatMessage = debug
    ? { ...msg, events: [...msg.events, event] }
    : { ...msg };

  switch (event.type) {
    case 'understanding_start':
    case 'understanding_done':
    case 'retrieval_start':
    case 'generation_start':
    case 'ctgb_annotation':
    case 'sources':
      if (event.type === 'ctgb_annotation') next.annotations = event.annotations;
      if (event.type === 'sources') next.sources = event.chunks;
      next.pipelineStage = PIPELINE_LABELS[event.type];
      break;
    case 'retrieval_done':
      if (debug) next.chunks = event.chunks;
      next.pipelineStage = PIPELINE_LABELS[event.type];
      break;
    case 'answer_chunk':
      next.answer += event.text;
      next.pipelineStage = '';
      break;
    case 'generation_done':
      next.pipelineStage = '';
      break;
    case 'confidence_fail':
      next.pipelineStage = PIPELINE_LABELS[event.type];
      break;
    case 'error':
      next.error = event.message;
      break;
    case 'done':
      next.loading = false;
      next.pipelineStage = '';
      break;
  }
  return next;
}
