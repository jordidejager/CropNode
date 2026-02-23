'use client';

import * as React from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

export type ValidationFlagType = 'error' | 'warning' | 'info';

export interface ValidationFlag {
    type: ValidationFlagType;
    message: string;
    field?: string;
    details?: Record<string, unknown>;
}

interface ValidationFeedbackProps {
    flags: ValidationFlag[];
    className?: string;
    compact?: boolean;
}

const iconMap = {
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
};

const colorMap = {
    error: {
        bg: 'bg-destructive/10',
        border: 'border-destructive/30',
        text: 'text-destructive',
        icon: 'text-destructive',
    },
    warning: {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        text: 'text-yellow-600 dark:text-yellow-400',
        icon: 'text-yellow-600 dark:text-yellow-400',
    },
    info: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-600 dark:text-blue-400',
        icon: 'text-blue-600 dark:text-blue-400',
    },
};

export function ValidationFeedback({
    flags,
    className,
    compact = false,
}: ValidationFeedbackProps) {
    if (flags.length === 0) return null;

    // Group flags by type
    const errorFlags = flags.filter((f) => f.type === 'error');
    const warningFlags = flags.filter((f) => f.type === 'warning');
    const infoFlags = flags.filter((f) => f.type === 'info');

    if (compact) {
        // Compact mode: show summary
        return (
            <div className={cn('flex flex-wrap gap-2', className)}>
                {errorFlags.length > 0 && (
                    <div className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                        colorMap.error.bg,
                        colorMap.error.text
                    )}>
                        <AlertCircle className="h-3 w-3" />
                        {errorFlags.length} fout{errorFlags.length !== 1 ? 'en' : ''}
                    </div>
                )}
                {warningFlags.length > 0 && (
                    <div className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                        colorMap.warning.bg,
                        colorMap.warning.text
                    )}>
                        <AlertTriangle className="h-3 w-3" />
                        {warningFlags.length} waarschuwing{warningFlags.length !== 1 ? 'en' : ''}
                    </div>
                )}
                {infoFlags.length > 0 && (
                    <div className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                        colorMap.info.bg,
                        colorMap.info.text
                    )}>
                        <Info className="h-3 w-3" />
                        {infoFlags.length} info
                    </div>
                )}
            </div>
        );
    }

    // Full mode: show all messages
    return (
        <div className={cn('space-y-2', className)}>
            {flags.map((flag, index) => {
                const Icon = iconMap[flag.type];
                const colors = colorMap[flag.type];

                return (
                    <Alert
                        key={`${flag.type}-${index}`}
                        className={cn(
                            'py-2',
                            colors.bg,
                            colors.border
                        )}
                    >
                        <Icon className={cn('h-4 w-4', colors.icon)} />
                        <AlertDescription className={cn('text-sm', colors.text)}>
                            {flag.message}
                        </AlertDescription>
                    </Alert>
                );
            })}
        </div>
    );
}

interface ValidationStatusProps {
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    className?: string;
}

export function ValidationStatus({
    isValid,
    errorCount,
    warningCount,
    className,
}: ValidationStatusProps) {
    if (isValid && warningCount === 0) {
        return (
            <div className={cn(
                'flex items-center gap-2 text-emerald-600 dark:text-emerald-400',
                className
            )}>
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Validatie geslaagd</span>
            </div>
        );
    }

    if (errorCount > 0) {
        return (
            <div className={cn(
                'flex items-center gap-2 text-destructive',
                className
            )}>
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">
                    {errorCount} fout{errorCount !== 1 ? 'en' : ''} gevonden
                </span>
            </div>
        );
    }

    return (
        <div className={cn(
            'flex items-center gap-2 text-yellow-600 dark:text-yellow-400',
            className
        )}>
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">
                {warningCount} waarschuwing{warningCount !== 1 ? 'en' : ''}
            </span>
        </div>
    );
}
