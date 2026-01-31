'use client';

import * as React from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

export function ProductCard({
    title,
    subtitle,
    labels,
    status,
    categoryBadge,
    actionLabel = "Toon product",
    onAction,
    footerExtra
}: ProductCardProps) {
    return (
        <Card className="flex flex-col h-full hover:shadow-lg transition-all duration-200 border-border/40 bg-card/50 backdrop-blur-sm">
            <CardHeader className="space-y-1.5 pb-6">
                <div className="flex justify-between items-start gap-4">
                    <h3 className="text-xl font-bold leading-tight text-white line-clamp-2">
                        {title}
                    </h3>
                    <div className="shrink-0 pt-0.5">
                        {categoryBadge}
                    </div>
                </div>
                {subtitle && (
                    <div className="text-sm font-medium text-primary/70 line-clamp-2 min-h-[2.5rem] mt-1 italic">
                        {subtitle}
                    </div>
                )}
            </CardHeader>
            <CardContent className="flex-grow pb-6 pt-2">
                <div className="flex flex-row items-stretch gap-0 text-sm">
                    {labels.map((item, index) => (
                        <React.Fragment key={index}>
                            {index > 0 && (
                                <div className="w-px bg-border/40 mx-4" aria-hidden="true" />
                            )}
                            <div className="flex-1 space-y-1.5 min-w-0">
                                <div className="flex items-center gap-1.5 text-muted-foreground/80">
                                    {item.icon}
                                    <span className="text-[10px] uppercase tracking-widest font-bold">
                                        {item.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 leading-none">
                                    <span className="text-white font-semibold truncate" title={item.value}>
                                        {item.value}
                                    </span>
                                    {item.verified && (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 fill-blue-400/10 shrink-0" />
                                    )}
                                </div>
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </CardContent>
            <CardFooter className="pt-5 border-t border-border/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 bg-muted/20 rounded-b-lg">
                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    {status && (
                        <Badge
                            variant={status.variant}
                            className={cn("font-bold tracking-tight text-[11px] h-6", status.className)}
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
                    className="text-primary font-bold hover:text-primary hover:bg-primary/10 -ml-3 sm:ml-0 group transition-all h-8"
                >
                    {actionLabel}
                    <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
            </CardFooter>
        </Card>
    );
}
