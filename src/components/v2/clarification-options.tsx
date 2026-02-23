'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ClarificationRequest } from '@/lib/types-v2';

interface ClarificationOptionsProps {
    clarification: ClarificationRequest;
    onSelect: (option: string) => void;
    className?: string;
}

/**
 * ClarificationOptions Component
 *
 * Displays a clarification question with clickable option buttons.
 * When the user clicks an option, it sends that as a message to the agent.
 *
 * Example:
 * ┌──────────────────────────────────────┐
 * │ Welke dosering voor de Score?        │
 * │                                      │
 * │ [0.3 L/ha (vorige keer)]  [Anders]   │
 * └──────────────────────────────────────┘
 */
export function ClarificationOptions({
    clarification,
    onSelect,
    className,
}: ClarificationOptionsProps) {
    const hasOptions = clarification.options && clarification.options.length > 0;

    return (
        <div
            className={cn(
                'rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4',
                className
            )}
        >
            {/* Question */}
            <p className="text-sm font-medium text-slate-200 mb-3">
                {clarification.question}
            </p>

            {/* Options */}
            {hasOptions && (
                <div className="flex flex-wrap gap-2">
                    {clarification.options!.map((option, index) => (
                        <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            onClick={() => onSelect(option)}
                            className={cn(
                                'bg-slate-800/50 border-slate-700 hover:bg-emerald-500/20',
                                'hover:border-emerald-500/50 transition-colors',
                                'text-slate-200 hover:text-white'
                            )}
                        >
                            {option}
                        </Button>
                    ))}

                    {/* Always show "Anders" option for custom input */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelect('__custom__')}
                        className="text-slate-400 hover:text-slate-200"
                    >
                        Anders...
                    </Button>
                </div>
            )}

            {/* If no options, show a hint */}
            {!hasOptions && (
                <p className="text-xs text-slate-400">
                    Typ je antwoord in het invoerveld hieronder
                </p>
            )}
        </div>
    );
}

/**
 * Inline variant for chat bubbles
 */
export function ClarificationOptionsInline({
    clarification,
    onSelect,
    className,
}: ClarificationOptionsProps) {
    const hasOptions = clarification.options && clarification.options.length > 0;

    if (!hasOptions) {
        return null;
    }

    return (
        <div className={cn('flex flex-wrap gap-1.5 mt-2', className)}>
            {clarification.options!.map((option, index) => (
                <button
                    key={index}
                    onClick={() => onSelect(option)}
                    className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium',
                        'bg-emerald-500/20 text-emerald-300',
                        'hover:bg-emerald-500/30 transition-colors',
                        'border border-emerald-500/30'
                    )}
                >
                    {option}
                </button>
            ))}
        </div>
    );
}
