'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpotlightCard, type PaletteColor } from '@/components/ui/premium';

interface ProductCardProps {
    title: string;
    subtitle?: string; // e.g. active substances or composition
    labels: {
        label: string;
        value: string;
        icon?: React.ReactNode;
        verified?: boolean;
    }[];
    status?: {
        label: string;
        variant: 'default' | 'destructive' | 'secondary' | 'outline';
        className?: string;
    };
    categoryBadge?: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    footerExtra?: React.ReactNode;
    /** Palette color for spotlight + glow orb (defaults to 'emerald') */
    color?: PaletteColor;
}

export function ProductCard({
    title,
    subtitle,
    labels,
    status,
    categoryBadge,
    actionLabel = 'Toon product',
    onAction,
    footerExtra,
    color = 'emerald',
}: ProductCardProps) {
    return (
        <SpotlightCard color={color} padding="p-0" className="h-full">
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-6 pt-6 pb-5 space-y-2">
                    <div className="flex justify-between items-start gap-4">
                        <h3 className="text-xl font-bold leading-tight text-white line-clamp-2">
                            {title}
                        </h3>
                        {categoryBadge && <div className="shrink-0 pt-0.5">{categoryBadge}</div>}
                    </div>
                    {subtitle && (
                        <div className="text-sm font-medium text-primary/80 line-clamp-2 min-h-[2.5rem] italic">
                            {subtitle}
                        </div>
                    )}
                </div>

                {/* Labels */}
                <div className="px-6 pb-6 flex-grow">
                    <div className="flex flex-row items-stretch gap-0">
                        {labels.map((item, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && (
                                    <div className="w-px bg-white/[0.08] mx-4" aria-hidden="true" />
                                )}
                                <div className="flex-1 space-y-1.5 min-w-0">
                                    <div className="flex items-center gap-1.5 text-slate-400">
                                        {item.icon}
                                        <span className="text-xs uppercase tracking-widest font-bold">
                                            {item.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 leading-none">
                                        <span className="text-white font-semibold truncate text-sm" title={item.value}>
                                            {item.value}
                                        </span>
                                        {item.verified && (
                                            <CheckCircle2 className="h-4 w-4 text-blue-400 fill-blue-400/10 shrink-0" />
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-5 pb-5 px-6 border-t border-white/[0.06] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/[0.02]">
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                        {status && (
                            <Badge
                                variant={status.variant}
                                className={cn('font-bold tracking-tight text-xs h-7 px-2.5', status.className)}
                            >
                                {status.label}
                            </Badge>
                        )}
                        {footerExtra}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onAction}
                        className="text-primary font-bold hover:text-primary hover:bg-primary/10 -ml-3 sm:ml-0 group transition-all h-10 text-sm"
                    >
                        {actionLabel}
                        <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                </div>
            </div>
        </SpotlightCard>
    );
}
