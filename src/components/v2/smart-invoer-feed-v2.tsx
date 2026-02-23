'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
    User,
    Bot,
    Loader2,
    Search,
    Shield,
    Wrench,
    Check,
    AlertCircle,
    Undo2,
} from 'lucide-react';
import { RegistrationGroupCard } from '@/components/registration-group-card';
import { ClarificationOptionsInline } from './clarification-options';
import { Button } from '@/components/ui/button';
import type {
    ConversationMessage,
    ProcessingPhaseV2,
    SmartInputV2Response,
} from '@/lib/types-v2';
import type { SprayRegistrationGroup } from '@/lib/types';
import type { ValidationFlag } from '@/lib/validation-service';

// Tool name to friendly label mapping
const TOOL_LABELS: Record<string, string> = {
    get_parcels: 'Percelen ophalen',
    resolve_product: 'Product resolven',
    validate_registration: 'Valideren',
    get_spray_history: 'Historie ophalen',
    save_registration: 'Opslaan',
};

interface SmartInvoerFeedV2Props {
    messages: ConversationMessage[];
    draft: SprayRegistrationGroup | null;
    phase: ProcessingPhaseV2;
    currentPhaseLabel?: string;
    toolsCalling?: string[];
    toolsDone?: string[];
    canUndo?: boolean;
    onUndo?: () => void;
    onClarificationSelect?: (option: string) => void;
    onConfirmUnit?: (unitId: string) => void;
    onConfirmAll?: () => void;
    onCancelAll?: () => void;
    onEditUnit?: (unitId: string) => void;
    onRemoveUnit?: (unitId: string) => void;
    parcels?: Array<{ id: string; name: string; area: number | null }>;
}

/**
 * SmartInvoerFeedV2 - Chat feed for Slimme Invoer 2.0
 *
 * Features:
 * - Chat-style message display (user + assistant)
 * - Processing phase indicators
 * - Tool call chips (with progress)
 * - Registration card display
 * - Clarification options
 * - Undo button
 */
export function SmartInvoerFeedV2({
    messages,
    draft,
    phase,
    currentPhaseLabel,
    toolsCalling = [],
    toolsDone = [],
    canUndo = false,
    onUndo,
    onClarificationSelect,
    onConfirmUnit,
    onConfirmAll,
    onCancelAll,
    onEditUnit,
    onRemoveUnit,
    parcels = [],
}: SmartInvoerFeedV2Props) {
    const bottomRef = React.useRef<HTMLDivElement>(null);
    const lastMessageCountRef = React.useRef(0);

    // Auto-scroll on new messages
    React.useEffect(() => {
        if (messages.length > lastMessageCountRef.current) {
            lastMessageCountRef.current = messages.length;
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [messages.length]);

    // Also scroll when phase changes to complete
    React.useEffect(() => {
        if (phase === 'complete') {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [phase]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Goedemorgen';
        if (hour < 18) return 'Goedemiddag';
        return 'Goedenavond';
    };

    // Create parcel lookup map
    const parcelMap = React.useMemo(
        () => new Map(parcels.map(p => [p.id, p.name])),
        [parcels]
    );

    return (
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            {/* Empty state */}
            {messages.length === 0 && phase === 'idle' && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                        <Bot className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-medium text-slate-200">
                            {getGreeting()}!
                        </h3>
                        <p className="text-sm text-slate-400 max-w-sm">
                            Vertel me wat je hebt gespoten. Bijvoorbeeld:
                            <br />
                            <span className="text-emerald-400">
                                "Gisteren alle peren met merpan 2L"
                            </span>
                        </p>
                    </div>
                </div>
            )}

            {/* Messages */}
            {messages.map((message, index) => (
                <MessageBubble
                    key={message.id}
                    message={message}
                    isLast={index === messages.length - 1}
                    parcelMap={parcelMap}
                    onClarificationSelect={onClarificationSelect}
                />
            ))}

            {/* Processing indicator */}
            {phase === 'processing' && (
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            <span className="text-sm text-slate-300">
                                {currentPhaseLabel || 'Even denken...'}
                            </span>
                        </div>

                        {/* Tool chips */}
                        {(toolsCalling.length > 0 || toolsDone.length > 0) && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {toolsDone.map((tool, i) => (
                                    <ToolChip key={`done-${i}`} tool={tool} status="done" />
                                ))}
                                {toolsCalling.map((tool, i) => (
                                    <ToolChip key={`calling-${i}`} tool={tool} status="calling" />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Current draft card */}
            {draft && phase !== 'processing' && (
                <div className="relative">
                    {/* Undo button */}
                    {canUndo && onUndo && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onUndo}
                            className="absolute -top-2 right-0 text-slate-400 hover:text-slate-200"
                        >
                            <Undo2 className="w-4 h-4 mr-1" />
                            Ongedaan maken
                        </Button>
                    )}

                    <RegistrationGroupCard
                        group={draft}
                        allParcels={parcels}
                        onConfirmUnit={(unit) => onConfirmUnit?.(unit.id)}
                        onConfirmAll={onConfirmAll || (() => {})}
                        onEditUnit={(unit) => onEditUnit?.(unit.id)}
                        onRemoveUnit={(unitId) => onRemoveUnit?.(unitId)}
                        onCancelAll={onCancelAll || (() => {})}
                    />
                </div>
            )}

            {/* Scroll anchor */}
            <div ref={bottomRef} className="h-1" />
        </div>
    );
}

// ============================================================================
// Message Bubble Component
// ============================================================================

interface MessageBubbleProps {
    message: ConversationMessage;
    isLast: boolean;
    parcelMap: Map<string, string>;
    onClarificationSelect?: (option: string) => void;
}

function MessageBubble({
    message,
    isLast,
    parcelMap,
    onClarificationSelect,
}: MessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <div
            className={cn(
                'flex items-start gap-3',
                isUser ? 'flex-row-reverse' : 'flex-row'
            )}
        >
            {/* Avatar */}
            <div
                className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    isUser
                        ? 'bg-blue-500/20'
                        : 'bg-emerald-500/20'
                )}
            >
                {isUser ? (
                    <User className="w-4 h-4 text-blue-400" />
                ) : (
                    <Bot className="w-4 h-4 text-emerald-400" />
                )}
            </div>

            {/* Content */}
            <div
                className={cn(
                    'flex flex-col max-w-[80%]',
                    isUser ? 'items-end' : 'items-start'
                )}
            >
                {/* Message bubble */}
                <div
                    className={cn(
                        'px-4 py-2.5 rounded-2xl',
                        isUser
                            ? 'bg-blue-500/20 border border-blue-500/30 text-slate-200'
                            : 'bg-slate-800/50 border border-slate-700 text-slate-200'
                    )}
                >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* Validation flags */}
                {message.validationFlags && message.validationFlags.length > 0 && (
                    <ValidationFlags flags={message.validationFlags} />
                )}

                {/* Clarification options */}
                {isLast && message.clarification && onClarificationSelect && (
                    <ClarificationOptionsInline
                        clarification={message.clarification}
                        onSelect={onClarificationSelect}
                        className="mt-2"
                    />
                )}

                {/* Tools called */}
                {message.toolsCalled && message.toolsCalled.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                        {message.toolsCalled.map((tool, i) => (
                            <ToolChip key={i} tool={tool} status="done" size="sm" />
                        ))}
                    </div>
                )}

                {/* Timestamp */}
                <span className="text-xs text-slate-500 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString('nl-NL', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            </div>
        </div>
    );
}

// ============================================================================
// Tool Chip Component
// ============================================================================

interface ToolChipProps {
    tool: string;
    status: 'calling' | 'done';
    size?: 'sm' | 'md';
}

function ToolChip({ tool, status, size = 'md' }: ToolChipProps) {
    const label = TOOL_LABELS[tool] || tool;
    const isDone = status === 'done';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full',
                'border transition-colors',
                size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs',
                isDone
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800 border-slate-600 text-slate-400'
            )}
        >
            {isDone ? (
                <Check className={cn('text-emerald-400', size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
            ) : (
                <Loader2 className={cn('animate-spin', size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
            )}
            {label}
        </span>
    );
}

// ============================================================================
// Validation Flags Component
// ============================================================================

interface ValidationFlagsProps {
    flags: ValidationFlag[];
}

function ValidationFlags({ flags }: ValidationFlagsProps) {
    const errors = flags.filter(f => f.type === 'error');
    const warnings = flags.filter(f => f.type === 'warning');

    if (errors.length === 0 && warnings.length === 0) {
        return null;
    }

    return (
        <div className="mt-2 space-y-1">
            {errors.map((flag, i) => (
                <div
                    key={`error-${i}`}
                    className="flex items-center gap-1.5 text-xs text-red-400"
                >
                    <AlertCircle className="w-3 h-3" />
                    {flag.message}
                </div>
            ))}
            {warnings.map((flag, i) => (
                <div
                    key={`warning-${i}`}
                    className="flex items-center gap-1.5 text-xs text-amber-400"
                >
                    <AlertCircle className="w-3 h-3" />
                    {flag.message}
                </div>
            ))}
        </div>
    );
}
