'use client';

import * as React from 'react';
import { SmartResultCard } from './smart-result-card';
import type { LogbookEntry, Parcel } from '@/lib/types';
import { cn } from '@/lib/utils';
import { User, Bot, Search, Sparkles, Shield, ArrowRight, Brain, Wrench, Check, Database, History, MapPin } from 'lucide-react';

// Processing phase type (mirrored from page.tsx)
type ProcessingPhase =
    | 'idle'
    | 'searching'
    | 'context_ready'
    | 'extracting'
    | 'validating'
    | 'agent_thinking'
    | 'agent_tool_call'
    | 'complete'
    | 'error';

// Agent state for streaming feedback
interface AgentState {
    isActive: boolean;
    currentTool: string | null;
    toolHistory: Array<{ tool: string; status: 'calling' | 'done' }>;
    answer: string | null;
}

// Tool name to friendly label mapping
const TOOL_LABELS: Record<string, { label: string; icon: typeof Search }> = {
    searchProducts: { label: 'Producten zoeken', icon: Search },
    getProductDetails: { label: 'Productdetails ophalen', icon: Database },
    getSprayHistory: { label: 'Spuithistorie ophalen', icon: History },
    getParcelInfo: { label: 'Perceelinformatie ophalen', icon: MapPin },
};

// Chat message type
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    intent?: string;
}

interface SmartInvoerFeedProps {
    entries: LogbookEntry[];
    allParcels: Array<{ id: string; name: string; area: number | null }>;
    productNames?: string[];
    suggestions?: string[];
    chatHistory?: ChatMessage[];  // NEW: Chat messages to display
    onDelete: (id: string) => void;
    onEdit: (entry: LogbookEntry) => void;
    onConfirm: (id: string) => void;
    onSave: (id: string, parsedData: any, date: string) => void;
    onSuggestionClick?: (suggestion: string) => void;
    processingPhase?: ProcessingPhase;
    searchTerms?: string[];
    resolvedAliases?: Record<string, string>;
    activeDraftId?: string;
    agentState?: AgentState;
}

export function SmartInvoerFeed({
    entries,
    allParcels,
    productNames = [],
    suggestions = [],
    chatHistory = [],
    onDelete,
    onEdit,
    onConfirm,
    onSave,
    onSuggestionClick,
    processingPhase = 'idle',
    searchTerms = [],
    resolvedAliases = {},
    activeDraftId,
    agentState
}: SmartInvoerFeedProps) {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const bottomRef = React.useRef<HTMLDivElement>(null);

    // Sort entries by date (ascending for chat-like feel)
    const sortedEntries = [...entries].sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Auto-scroll to bottom on new messages, entries, or phase changes
    React.useEffect(() => {
        // Use a small timeout to ensure DOM is updated
        const timeoutId = setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
        return () => clearTimeout(timeoutId);
    }, [entries.length, chatHistory.length, processingPhase, agentState?.currentTool]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Goedemorgen";
        if (hour < 18) return "Goedemiddag";
        return "Goedenavond";
    };

    // Get processing status message for streaming entries
    const getProcessingStatus = () => {
        const aliasCount = Object.keys(resolvedAliases).length;
        const aliasText = aliasCount > 0
            ? Object.entries(resolvedAliases).map(([a, p]) => `${a} → ${p}`).join(', ')
            : '';

        switch (processingPhase) {
            case 'searching':
                return {
                    icon: Search,
                    label: 'Zoeken...',
                    detail: searchTerms.length > 0 ? `Zoektermen: ${searchTerms.join(', ')}` : 'Analyseren van invoer...'
                };
            case 'context_ready':
                return {
                    icon: Sparkles,
                    label: aliasCount > 0 ? 'Aliassen gevonden' : 'Context geladen',
                    detail: aliasCount > 0 ? aliasText : 'Producten en percelen gevonden'
                };
            case 'extracting':
                return {
                    icon: Sparkles,
                    label: 'AI analyseert...',
                    detail: 'Intentie wordt geextraheerd'
                };
            case 'validating':
                return {
                    icon: Shield,
                    label: 'Valideren...',
                    detail: 'CTGB regels worden gecontroleerd'
                };
            case 'agent_thinking':
                return {
                    icon: Brain,
                    label: 'Aan het nadenken...',
                    detail: 'AgriBot analyseert je vraag'
                };
            case 'agent_tool_call':
                if (agentState?.currentTool) {
                    const toolInfo = TOOL_LABELS[agentState.currentTool] || { label: agentState.currentTool, icon: Wrench };
                    return {
                        icon: toolInfo.icon,
                        label: toolInfo.label,
                        detail: 'Data wordt opgehaald...'
                    };
                }
                return {
                    icon: Wrench,
                    label: 'Tool uitvoeren...',
                    detail: 'Data wordt opgehaald'
                };
            default:
                return null;
        }
    };

    const isStreamingEntry = (entry: LogbookEntry) => entry.id.startsWith('streaming-');

    // Determine if we should show chat messages (from chatHistory) instead of entry-based view
    const hasConversation = chatHistory.length > 0;

    // Filter out streaming entries from the main entries list (they're shown via chat now)
    const confirmedEntries = sortedEntries.filter(e => !isStreamingEntry(e) && e.status === 'Akkoord');

    return (
        <div ref={scrollRef} className="pr-4">
            <div className="flex flex-col gap-6 pt-6 pb-4 max-w-4xl mx-auto">
                {/* Welcome message when no conversation */}
                {!hasConversation && confirmedEntries.length === 0 && (
                    <div className="flex flex-col items-start justify-center min-h-[40vh] gap-8 animate-in fade-in duration-1000 px-4">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <Bot className="h-6 w-6 text-emerald-400" />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                                    {getGreeting()}. Wat is het plan vandaag?
                                </h1>
                                <p className="text-muted-foreground text-sm">Ik sta klaar om je bespuitingen te verwerken.</p>
                            </div>
                        </div>

                        {suggestions.length > 0 && (
                            <div className="flex flex-wrap gap-2 animate-in slide-in-from-left-4 duration-1000 delay-300">
                                {suggestions.map((suggestion, i) => (
                                    <button
                                        key={i}
                                        onClick={() => onSuggestionClick?.(suggestion)}
                                        className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-primary/20 hover:border-primary/40 hover:text-white transition-all duration-300"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Chat History Messages */}
                {chatHistory.map((msg, idx) => (
                    <div key={`chat-${idx}`} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {msg.role === 'user' ? (
                            /* User Message (Right aligned) */
                            <div className="flex justify-end pr-2">
                                <div className="flex gap-3 max-w-[80%]">
                                    <div className="flex flex-col gap-1.5 items-end">
                                        <div className="bg-primary/20 backdrop-blur-sm border border-primary/30 rounded-2xl p-4 text-sm text-white/90 shadow-lg">
                                            {msg.content}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest px-1">
                                            U • {msg.timestamp instanceof Date
                                                ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-1">
                                        <User className="h-4 w-4 text-primary" />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Assistant Message (Left aligned - Simple text bubble) */
                            <div className="flex justify-start pl-2">
                                <div className="flex gap-3 max-w-[80%]">
                                    <div className="h-8 w-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_10px_-2px_rgba(16,185,129,0.3)]">
                                        <Bot className="h-4 w-4 text-emerald-400" />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="bg-emerald-500/10 backdrop-blur-sm border border-emerald-500/20 rounded-2xl p-4 text-sm text-white/90 shadow-lg">
                                            {msg.content}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest px-1">
                                            AgriBot • {msg.timestamp instanceof Date
                                                ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Processing Indicator */}
                {processingPhase !== 'idle' && processingPhase !== 'complete' && (
                    <div className="flex justify-start pl-2 animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="flex gap-3 max-w-[80%]">
                            <div className="h-8 w-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_10px_-2px_rgba(16,185,129,0.3)]">
                                <Bot className="h-4 w-4 text-emerald-400" />
                            </div>
                            <div className="flex flex-col gap-2">
                                {/* Agent Tool History */}
                                {agentState?.toolHistory && agentState.toolHistory.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {agentState.toolHistory.map((tool, idx) => {
                                            const toolInfo = TOOL_LABELS[tool.tool] || { label: tool.tool, icon: Wrench };
                                            const ToolIcon = toolInfo.icon;
                                            return (
                                                <div
                                                    key={`${tool.tool}-${idx}`}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-300",
                                                        tool.status === 'done'
                                                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                                            : "bg-primary/10 border border-primary/20 text-primary animate-pulse"
                                                    )}
                                                >
                                                    {tool.status === 'done' ? (
                                                        <Check className="h-3 w-3" />
                                                    ) : (
                                                        <ToolIcon className="h-3 w-3 animate-spin" />
                                                    )}
                                                    <span>{toolInfo.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Current Processing Status */}
                                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                    {(() => {
                                        const status = getProcessingStatus();
                                        if (!status) return null;
                                        const StatusIcon = status.icon;
                                        return (
                                            <>
                                                <StatusIcon className="h-4 w-4 text-emerald-400 animate-pulse" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-semibold text-emerald-400">{status.label}</span>
                                                    <span className="text-[10px] text-muted-foreground">{status.detail}</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Suggestions when conversation is active but idle */}
                {hasConversation && processingPhase === 'idle' && suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-12 animate-in fade-in duration-500">
                        {suggestions.map((suggestion, i) => (
                            <button
                                key={i}
                                onClick={() => onSuggestionClick?.(suggestion)}
                                className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-primary/20 hover:border-primary/40 hover:text-white transition-all duration-300"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}

                {/* Scroll Anchor for auto-scroll to bottom */}
                <div ref={bottomRef} className="h-4 w-full shrink-0" />
            </div>
        </div>
    );
}
