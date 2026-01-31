'use client';

import * as React from 'react';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ============================================
// Skeleton Components
// ============================================

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('animate-pulse rounded-md bg-muted/50', className)}
            {...props}
        />
    );
}

// Table skeleton for data grids
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex gap-4 pb-2 border-b">
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-4 py-3">
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <Skeleton
                            key={colIndex}
                            className={cn('h-4', colIndex === 0 ? 'w-24' : 'flex-1')}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

// Card skeleton for dashboard cards
export function CardSkeleton({ className }: { className?: string }) {
    return (
        <Card className={cn('overflow-hidden', className)}>
            <CardContent className="p-6">
                <div className="space-y-3">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-8 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </CardContent>
        </Card>
    );
}

// Dashboard grid skeleton
export function DashboardSkeleton() {
    return (
        <div className="space-y-6" data-testid="dashboard-skeleton">
            {/* Stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
            {/* Chart area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardContent className="p-6">
                        <Skeleton className="h-4 w-1/4 mb-4" />
                        <Skeleton className="h-[200px] w-full" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6">
                        <Skeleton className="h-4 w-1/4 mb-4" />
                        <Skeleton className="h-[200px] w-full" />
                    </CardContent>
                </Card>
            </div>
            {/* Recent activity */}
            <Card>
                <CardContent className="p-6">
                    <Skeleton className="h-4 w-1/4 mb-4" />
                    <TableSkeleton rows={5} columns={5} />
                </CardContent>
            </Card>
        </div>
    );
}

// Parcel list skeleton
export function ParcelListSkeleton() {
    return (
        <div className="space-y-4">
            {/* Search bar */}
            <div className="flex gap-4">
                <Skeleton className="h-10 flex-1 max-w-md" />
                <Skeleton className="h-10 w-32" />
            </div>
            {/* Parcel cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i}>
                        <CardContent className="p-4">
                            <div className="space-y-3">
                                <div className="flex justify-between items-start">
                                    <Skeleton className="h-5 w-1/2" />
                                    <Skeleton className="h-5 w-16 rounded-full" />
                                </div>
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

// Product database skeleton
export function ProductDatabaseSkeleton() {
    return (
        <div className="space-y-4">
            {/* Search and filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <Skeleton className="h-10 flex-1 max-w-md" />
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-10 w-40" />
            </div>
            {/* Results count */}
            <Skeleton className="h-4 w-32" />
            {/* Product table */}
            <TableSkeleton rows={10} columns={5} />
        </div>
    );
}

// Spuitschrift history skeleton
export function SpuitschriftSkeleton() {
    return (
        <div className="space-y-4">
            {/* Header with filters */}
            <div className="flex justify-between items-center">
                <Skeleton className="h-6 w-48" />
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-10 w-32" />
                </div>
            </div>
            {/* Timeline entries */}
            <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i}>
                        <CardContent className="p-4">
                            <div className="flex gap-4">
                                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="flex justify-between">
                                        <Skeleton className="h-5 w-1/3" />
                                        <Skeleton className="h-5 w-24" />
                                    </div>
                                    <Skeleton className="h-4 w-2/3" />
                                    <div className="flex gap-2">
                                        <Skeleton className="h-6 w-20 rounded-full" />
                                        <Skeleton className="h-6 w-20 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

// Inventory skeleton
export function InventorySkeleton() {
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-10 w-40" />
            </div>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
            {/* Inventory table */}
            <TableSkeleton rows={8} columns={5} />
        </div>
    );
}

// Chat/Feed skeleton (for Slimme Invoer)
export function ChatSkeleton() {
    return (
        <div className="space-y-6 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-4">
                    {/* User message */}
                    <div className="flex justify-end">
                        <div className="flex gap-3 max-w-[80%]">
                            <div className="space-y-2">
                                <Skeleton className="h-16 w-64 rounded-2xl" />
                                <Skeleton className="h-3 w-20 ml-auto" />
                            </div>
                            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                        </div>
                    </div>
                    {/* AI response */}
                    <div className="flex justify-start">
                        <div className="flex gap-3 max-w-[90%]">
                            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                            <div className="space-y-2 flex-1">
                                <Skeleton className="h-32 w-full rounded-xl" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================
// Error Component
// ============================================

interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    className?: string;
}

export function ErrorState({
    title = 'Er ging iets mis',
    message = 'Kon de gegevens niet laden. Controleer je internetverbinding en probeer het opnieuw.',
    onRetry,
    className,
}: ErrorStateProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center py-12 px-4', className)}>
            <div className="flex flex-col items-center text-center max-w-md">
                <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground mb-6">{message}</p>
                {onRetry && (
                    <Button onClick={onRetry} variant="outline" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Opnieuw proberen
                    </Button>
                )}
            </div>
        </div>
    );
}

// ============================================
// Empty State Component
// ============================================

interface EmptyStateProps {
    icon?: React.ElementType;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
}: EmptyStateProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center py-12 px-4', className)}>
            <div className="flex flex-col items-center text-center max-w-md">
                {Icon && (
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Icon className="h-8 w-8 text-muted-foreground" />
                    </div>
                )}
                <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
                {description && (
                    <p className="text-sm text-muted-foreground mb-6">{description}</p>
                )}
                {action}
            </div>
        </div>
    );
}

// ============================================
// Loading Spinner
// ============================================

export function LoadingSpinner({ className, size = 'default' }: { className?: string; size?: 'sm' | 'default' | 'lg' }) {
    const sizeClasses = {
        sm: 'h-4 w-4',
        default: 'h-6 w-6',
        lg: 'h-8 w-8',
    };

    return (
        <Loader2 className={cn('animate-spin text-muted-foreground', sizeClasses[size], className)} />
    );
}

// ============================================
// Data State Wrapper
// ============================================

interface DataStateWrapperProps<T> {
    isLoading: boolean;
    isError: boolean;
    error?: Error | null;
    data: T | undefined;
    loadingComponent: React.ReactNode;
    onRetry?: () => void;
    emptyState?: React.ReactNode;
    children: (data: T) => React.ReactNode;
}

export function DataStateWrapper<T>({
    isLoading,
    isError,
    error,
    data,
    loadingComponent,
    onRetry,
    emptyState,
    children,
}: DataStateWrapperProps<T>) {
    if (isLoading) {
        return <>{loadingComponent}</>;
    }

    if (isError) {
        return (
            <ErrorState
                message={error?.message || 'Er is een onbekende fout opgetreden.'}
                onRetry={onRetry}
            />
        );
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
        if (emptyState) {
            return <>{emptyState}</>;
        }
        return (
            <EmptyState
                title="Geen gegevens gevonden"
                description="Er zijn nog geen gegevens beschikbaar."
            />
        );
    }

    return <>{children(data)}</>;
}
