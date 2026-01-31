'use client';

import * as React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { FertilizerProduct } from '@/lib/types';
import { Building2, Package, Activity, Loader2 } from 'lucide-react';

interface FertilizerDetailDialogProps {
    fertilizer: FertilizerProduct | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const formatValue = (val: any) => (val !== undefined && val !== null ? val : '-');

export function FertilizerDetailDialog({
    fertilizer,
    open,
    onOpenChange,
}: FertilizerDetailDialogProps) {
    if (!fertilizer) return null;

    const compositionEntries = Object.entries(fertilizer.composition || {}).filter(
        ([_, value]) => value !== undefined && value !== null
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] border-border/40 bg-card/95 backdrop-blur-md">
                <DialogHeader className="pb-4 border-b border-border/40">
                    <DialogTitle className="text-2xl font-bold text-white leading-tight">
                        {fertilizer.name}
                    </DialogTitle>
                    <DialogDescription className="text-primary/80 font-medium mt-1">
                        Productdetails en samenstelling
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Package className="h-3 w-3" />
                            Algemene Informatie
                        </h4>
                        <div className="rounded-lg border border-border/40 overflow-hidden bg-muted/10">
                            <Table>
                                <TableBody>
                                    <TableRow className="hover:bg-transparent border-border/20">
                                        <TableCell className="font-medium text-muted-foreground py-2.5">Producent</TableCell>
                                        <TableCell className="text-white py-2.5">
                                            <div className="flex items-center gap-2">
                                                {fertilizer.manufacturer}
                                                <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-500/30 text-blue-400 bg-blue-500/5">Geverifieerd</Badge>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="hover:bg-transparent border-border/20">
                                        <TableCell className="font-medium text-muted-foreground py-2.5">Categorie</TableCell>
                                        <TableCell className="text-white py-2.5">{fertilizer.category}</TableCell>
                                    </TableRow>
                                    <TableRow className="hover:bg-transparent border-border/20">
                                        <TableCell className="font-medium text-muted-foreground py-2.5">Eenheid</TableCell>
                                        <TableCell className="text-white py-2.5">{fertilizer.unit}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Activity className="h-3 w-3" />
                            Samenstelling
                        </h4>
                        {compositionEntries.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {compositionEntries.map(([key, value]) => (
                                    <div key={key} className="p-3 rounded-lg border border-border/40 bg-card flex flex-col items-center justify-center gap-1 shadow-sm">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{key}</span>
                                        <span className="text-lg font-bold text-primary">{value}%</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 rounded-lg border border-dashed border-border/40 text-center text-sm text-muted-foreground">
                                Geen gedetailleerde samenstelling beschikbaar.
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
