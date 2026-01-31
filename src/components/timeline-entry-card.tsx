'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    CheckCircle,
    AlertTriangle,
    Trash2,
    Pencil,
    Clock,
    MapPin,
    Package,
    Lock,
    Check,
    ChevronRight,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogbookEntry, SpuitschriftEntry, Parcel, ProductEntry } from '@/lib/types';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CtgbCategoryBadge } from './ctgb-category-badge';

type EntryStatus = 'draft' | 'confirmed';

interface TimelineEntryCardProps {
    entry: LogbookEntry | SpuitschriftEntry;
    status: EntryStatus;
    allParcels: Array<{ id: string; name: string; area: number | null; variety?: string | null }>;
    onDelete: (id: string, isDraft: boolean) => void;
    onEdit: (id: string, isDraft: boolean) => void;
    onConfirm?: (id: string) => void;
}

export function TimelineEntryCard({ entry, status, allParcels, onDelete, onEdit, onConfirm }: TimelineEntryCardProps) {
    const isDraft = status === 'draft';
    const plots = (entry as any).parsedData?.plots || (entry as any).plots || [];
    const products = (entry as any).parsedData?.products || (entry as any).products || [];

    const selectedParcels = allParcels.filter(p => plots.includes(p.id));
    const applicationTime = format(new Date(entry.date), 'HH:mm');

    return (
        <div className="group relative pl-8 pb-8 last:pb-0">
            {/* Timeline Line */}
            <div className="absolute left-[11px] top-0 bottom-0 w-[2px] bg-white/5 group-last:bottom-full border-l border-white/5" />

            {/* Timeline Dot */}
            <div className={cn(
                "absolute left-0 top-1.5 h-6 w-6 rounded-full border-4 border-[#020617] z-10 flex items-center justify-center",
                isDraft ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
            )}>
                {isDraft ? <Clock className="h-3 w-3 text-white" /> : <Check className="h-3 w-3 text-white" />}
            </div>

            <Card className={cn(
                "bg-card/30 backdrop-blur-md border-white/5 transition-all duration-300 hover:bg-card/40",
                isDraft ? "border-l-4 border-l-amber-500/50" : "border-l-4 border-l-emerald-500/50"
            )}>
                <CardContent className="p-4 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        {/* Time and Parcel */}
                        <div className="flex items-start gap-4 min-w-[200px]">
                            <div className="text-xl font-black text-white/50 font-mono tracking-tighter">
                                {applicationTime}
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-primary" />
                                    {selectedParcels.length > 0
                                        ? selectedParcels.map(p => p.name).join(', ')
                                        : 'Onbekende percelen'}
                                </h4>
                                <div className="flex flex-wrap gap-1">
                                    {selectedParcels.map(p => (
                                        <span key={p.id} className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                            {p.variety}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Tank Mix / Products */}
                        <div className="flex-grow">
                            <div className="flex flex-wrap gap-2">
                                {products.map((p: ProductEntry, i: number) => (
                                    <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full pl-1 pr-3 py-1">
                                        <CtgbCategoryBadge category={''} productTypes={[]} /> {/* Placeholder for type-based logic if available */}
                                        <span className="text-xs font-bold text-white/90">
                                            {p.product}
                                        </span>
                                        <span className="text-[10px] font-mono font-bold text-primary/70">
                                            {p.dosage} {p.unit}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Status & Actions */}
                        <div className="flex items-center gap-3 shrink-0">
                            {isDraft ? (
                                <>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-9 px-3 text-muted-foreground hover:text-white"
                                        onClick={() => onEdit(entry.id, true)}
                                    >
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Bewerk
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-9 px-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                                        onClick={() => onConfirm?.(entry.id)}
                                    >
                                        <Check className="h-4 w-4 mr-2" />
                                        Bevestig
                                    </Button>
                                </>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                    <Lock className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                        Geregistreerd
                                    </span>
                                </div>
                            )}

                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 text-muted-foreground hover:text-rose-400"
                                onClick={() => onDelete(entry.id, isDraft)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
