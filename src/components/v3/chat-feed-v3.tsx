'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Sparkles,
  Zap,
  Brain,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClarificationOptionsInline } from '@/components/v2/clarification-options';
import type { ConversationMessage, ClarificationRequest } from '@/lib/types-v2';

// ============================================================================
// Types
// ============================================================================

export interface ChatFeedV3Props {
  messages: ConversationMessage[];
  phase: 'idle' | 'processing' | 'complete' | 'error';
  currentPhaseLabel?: string;
  toolsCalling?: string[];
  toolsDone?: string[];
  onClarificationSelect?: (option: string) => void;
}

// ============================================================================
// Message Bubble
// ============================================================================

function MessageBubble({
  message,
  isLast,
  onClarificationSelect,
}: {
  message: ConversationMessage;
  isLast: boolean;
  onClarificationSelect?: (option: string) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      <div className={cn(
        "h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
        isUser
          ? 'bg-blue-500/20 text-blue-400'
          : 'bg-gradient-to-br from-emerald-500/30 to-teal-500/20 text-emerald-400'
      )}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </div>

      {/* Content */}
      <div className={cn(
        "max-w-[85%] space-y-2",
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* Bubble */}
        <div className={cn(
          "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
          isUser
            ? 'bg-blue-500/15 text-white/90 rounded-br-md'
            : 'bg-white/[0.04] text-white/80 border border-white/[0.06] rounded-bl-md'
        )}>
          {message.content}
        </div>

        {/* Validation flags */}
        {message.validationFlags && message.validationFlags.length > 0 && (
          <div className="space-y-1">
            {message.validationFlags.map((flag, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 px-3 py-1.5 rounded-lg text-xs",
                  flag.type === 'error' && 'bg-red-500/10 text-red-400 border border-red-500/20',
                  flag.type === 'warning' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                  flag.type === 'info' && 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                )}
              >
                {flag.type === 'error' && <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                {flag.type === 'warning' && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                {flag.type === 'info' && <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                <span>{flag.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tools called indicator */}
        {message.toolsCalled && message.toolsCalled.length > 0 && (
          <div className="flex items-center gap-1.5">
            {message.toolsCalled.includes('deterministic_parse') && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-medium">
                <Zap className="h-2.5 w-2.5" />
                Instant
              </span>
            )}
            {message.toolsCalled.includes('ai_parse') && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-400 font-medium">
                <Brain className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>
        )}

        {/* Inline clarification options (only on last assistant message) */}
        {!isUser && isLast && message.clarification && onClarificationSelect && (
          <ClarificationOptionsInline
            clarification={message.clarification}
            onSelect={onClarificationSelect}
          />
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-white/20 pl-1">
          {new Date(message.timestamp).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Processing Indicator
// ============================================================================

function ProcessingIndicator({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5"
    >
      <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500/30 to-teal-500/20 flex items-center justify-center flex-shrink-0">
        <Loader2 className="h-3.5 w-3.5 text-emerald-400 animate-spin" />
      </div>
      <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              />
            ))}
          </div>
          <span className="text-xs text-white/40">{label}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Main Feed Component
// ============================================================================

export function ChatFeedV3({
  messages,
  phase,
  currentPhaseLabel = 'Verwerken...',
  onClarificationSelect,
}: ChatFeedV3Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or phase changes
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, phase]);

  if (messages.length === 0 && phase === 'idle') {
    return null; // Empty state handled by page component
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto space-y-4 px-2 md:px-4 py-4 scrollbar-thin"
    >
      <AnimatePresence mode="popLayout">
        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLast={idx === messages.length - 1 && msg.role === 'assistant'}
            onClarificationSelect={onClarificationSelect}
          />
        ))}
      </AnimatePresence>

      {phase === 'processing' && (
        <ProcessingIndicator label={currentPhaseLabel} />
      )}
    </div>
  );
}
