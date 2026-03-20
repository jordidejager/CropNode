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
import { Building2, Package, Activity, Beaker, Calendar, Droplets } from 'lucide-react';
import { getElementDisplayName, getElementDutchName } from '@/lib/element-info';

interface FertilizerDetailDialogProps {
    fertilizer: FertilizerProduct | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

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
            <DialogContent className="sm:max-w-[500px] border-border/40 bg-card/95 backdrop-blur-md max-h-[85vh] overflow-y-auto">
                <DialogHeader className="pb-4 border-b border-border/40">
                    <DialogTitle className="text-2xl font-bold text-white leading-tight">
                        {fertilizer.name}
                    </DialogTitle>
                    <DialogDescription className="text-primary/80 font-medium mt-1">
                        {fertilizer.description || 'Productdetails en samenstelling'}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    {/* Algemene Informatie */}
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
                                    {fertilizer.formulation && (
                                        <TableRow className="hover:bg-transparent border-border/20">
                                            <TableCell className="font-medium text-muted-foreground py-2.5">Formulering</TableCell>
                                            <TableCell className="text-white py-2.5">{fertilizer.formulation}</TableCell>
                                        </TableRow>
                                    )}
                                    {fertilizer.density && (
                                        <TableRow className="hover:bg-transparent border-border/20">
                                            <TableCell className="font-medium text-muted-foreground py-2.5">Dichtheid</TableCell>
                                            <TableCell className="text-white py-2.5">{fertilizer.density} kg/L</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Samenstelling */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Activity className="h-3 w-3" />
                            Samenstelling
                        </h4>
                        {compositionEntries.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {compositionEntries.map(([key, value]) => {
                                    const dutchName = getElementDutchName(key);
                                    const formInfo = fertilizer.compositionForms?.[key];
                                    return (
                                        <div key={key} className="p-3 rounded-lg border border-border/40 bg-card flex flex-col items-center justify-center gap-1 shadow-sm">
                                            <span className="text-[10px] font-bold text-muted-foreground text-center leading-tight">
                                                {dutchName} ({key})
                                            </span>
                                            <span className="text-lg font-bold text-primary">{value}%</span>
                                            {formInfo && (
                                                <span className="text-[9px] text-muted-foreground/70 text-center leading-tight italic">
                                                    {formInfo}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-4 rounded-lg border border-dashed border-border/40 text-center text-sm text-muted-foreground">
                                Geen gedetailleerde samenstelling beschikbaar.
                            </div>
                        )}
                    </div>

                    {/* Dosering Fruitteelt */}
                    {fertilizer.dosageFruit && (
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Droplets className="h-3 w-3" />
                                Dosering Fruitteelt
                            </h4>
                            <div className="p-4 rounded-lg border border-border/40 bg-muted/10">
                                <p className="text-sm text-white leading-relaxed">{fertilizer.dosageFruit}</p>
                            </div>
                        </div>
                    )}

                    {/* Toepassingsperiode */}
                    {fertilizer.applicationTiming && (
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Calendar className="h-3 w-3" />
                                Toepassingsperiode
                            </h4>
                            <div className="p-4 rounded-lg border border-border/40 bg-muted/10">
                                <p className="text-sm text-white leading-relaxed">{fertilizer.applicationTiming}</p>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
