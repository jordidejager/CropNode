'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    Sparkles,
    MapPin,
    FlaskConical,
    Save,
    Clock,
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

// Tool name to friendly label + icon mapping
const TOOL_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    get_parcels: { label: 'Percelen ophalen', icon: MapPin },
    resolve_product: { label: 'Product resolven', icon: FlaskConical },
    validate_registration: { label: 'CTGB Validatie', icon: Shield },
    get_spray_history: { label: 'Historie ophalen', icon: Clock },
    save_registration: { label: 'Opslaan', icon: Save },
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
 * SmartInvoerFeedV2 - Premium chat feed for Slimme Invoer 2.0
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
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
            {/* Empty state - Premium welcome */}
            {messages.length === 0 && phase === 'idle' && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-16">
                    {/* Animated AI avatar */}
                    <div className="relative">
                        <motion.div
                            animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.05, 0.15] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute -inset-8 rounded-full border border-emerald-500/10"
                        />
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.03, 0.1] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                            className="absolute -inset-16 rounded-full border border-emerald-500/5"
                        />
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            className="relative"
                        >
                            <div className="absolute -inset-1 bg-emerald-500/20 rounded-2xl blur-lg" />
                            <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-teal-500/10 border border-emerald-500/25 flex items-center justify-center shadow-xl shadow-emerald-500/10">
                                <Sparkles className="w-10 h-10 text-emerald-400" />
                            </div>
                        </motion.div>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="space-y-2"
                    >
                        <h3 className="text-2xl font-bold text-white">
                            {getGreeting()}!
                        </h3>
                        <p className="text-sm text-white/40 max-w-sm leading-relaxed">
                            Vertel me wat je hebt gespoten. Bijvoorbeeld:
                        </p>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="text-emerald-400 text-sm font-medium"
                        >
                            &ldquo;Gisteren alle peren met merpan 2L&rdquo;
                        </motion.p>
                    </motion.div>

                    {/* Capability pills */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7 }}
                        className="flex flex-wrap justify-center gap-2 max-w-xs"
                    >
                        {[
                            { icon: Shield, label: '6-staps CTGB validatie' },
                            { icon: MapPin, label: 'Multi-perceel herkenning' },
                            { icon: FlaskConical, label: '1.000+ middelen' },
                        ].map(({ icon: Icon, label }, i) => (
                            <motion.div
                                key={label}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.8 + i * 0.1 }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-white/30 text-[11px]"
                            >
                                <Icon className="h-3 w-3 text-emerald-500/50" />
                                {label}
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            )}

            {/* Messages */}
            <AnimatePresence mode="popLayout">
                {messages.map((message, index) => (
                    <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <MessageBubble
                            message={message}
                            isLast={index === messages.length - 1}
                            parcelMap={parcelMap}
                            onClarificationSelect={onClarificationSelect}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Processing indicator - Premium AI pipeline */}
            {phase === 'processing' && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3"
                >
                    {/* Bot avatar with pulse */}
                    <div className="relative flex-shrink-0">
                        <motion.div
                            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute -inset-1 rounded-xl bg-emerald-500/20 blur-sm"
                        />
                        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/25 to-teal-500/10 border border-emerald-500/25 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                        </div>
                    </div>

                    <div className="flex-1 space-y-2">
                        {/* Phase label */}
                        <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
                            <div className="relative h-4 w-4">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                    className="absolute inset-0 rounded-full border-2 border-emerald-500/30 border-t-emerald-400"
                                />
                            </div>
                            <span className="text-sm text-white/60 font-medium">
                                {currentPhaseLabel || 'Even denken...'}
                            </span>
                        </div>

                        {/* Tool pipeline chips */}
                        {(toolsCalling.length > 0 || toolsDone.length > 0) && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-wrap gap-1.5"
                            >
                                {toolsDone.map((tool, i) => (
                                    <ToolChip key={`done-${i}`} tool={tool} status="done" />
                                ))}
                                {toolsCalling.map((tool, i) => (
                                    <ToolChip key={`calling-${i}`} tool={tool} status="calling" />
                                ))}
                            </motion.div>
                        )}
                    </div>
                </motion.div>
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
// Message Bubble Component - Premium design
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
            <div className="flex-shrink-0">
                {isUser ? (
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-400" />
                    </div>
                ) : (
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                    </div>
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
                        'px-4 py-3 rounded-2xl',
                        isUser
                            ? 'bg-blue-500/15 border border-blue-500/20 text-white/90'
                            : 'bg-white/[0.04] border border-white/[0.08] text-white/85'
                    )}
                >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
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
                    <div className="flex flex-wrap gap-1 mt-2">
                        {message.toolsCalled.map((tool, i) => (
                            <ToolChip key={i} tool={tool} status="done" size="sm" />
                        ))}
                    </div>
                )}

                {/* Timestamp */}
                <span className="text-[10px] text-white/20 mt-1.5 px-1">
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
// Tool Chip Component - Premium pipeline style
// ============================================================================

interface ToolChipProps {
    tool: string;
    status: 'calling' | 'done';
    size?: 'sm' | 'md';
}

function ToolChip({ tool, status, size = 'md' }: ToolChipProps) {
    const config = TOOL_CONFIG[tool] || { label: tool, icon: Wrench };
    const isDone = status === 'done';
    const Icon = config.icon;

    return (
        <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-lg',
                'border transition-all duration-300',
                size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
                isDone
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-white/[0.03] border-white/[0.08] text-white/40'
            )}
        >
            {isDone ? (
                <Check className={cn('text-emerald-400', size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
            ) : (
                <Loader2 className={cn('animate-spin text-emerald-400/50', size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
            )}
            <Icon className={cn(size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3', isDone ? 'text-emerald-400/60' : 'text-white/20')} />
            {config.label}
        </motion.span>
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
                    className="flex items-center gap-1.5 text-xs text-red-400 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/15"
                >
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {flag.message}
                </div>
            ))}
            {warnings.map((flag, i) => (
                <div
                    key={`warning-${i}`}
                    className="flex items-center gap-1.5 text-xs text-amber-400 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/15"
                >
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {flag.message}
                </div>
            ))}
        </div>
    );
}
