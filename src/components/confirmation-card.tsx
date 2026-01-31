'use client';

import * as React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Edit2, AlertTriangle, AlertCircle, Info, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { SprayableParcel } from '@/lib/supabase-store';

/**
 * Confirmation Card Component (2.6.4 Confirmation Loop)
 *
 * Shows a summary of the spray registration before saving to database.
 * User must confirm, edit, or cancel before data is persisted.
 */

// Accept any parcel-like object with id, name, area
type ParcelLike = { id: string; name: string; area: number | null };

interface ConfirmationCardProps {
    plots: string[];
    products: Array<{
        product: string;
        dosage: number;
        unit: string;
        targetReason?: string;
    }>;
    date?: string;
    validationResult?: {
        status: string;
        validationMessage?: string;
        flags?: Array<{ type: string; message: string }>;
    };
    allParcels: ParcelLike[];  // Works with SprayableParcel or Parcel
    isSaving?: boolean;
    onConfirm: () => void;
    onEdit: () => void;
    onCancel: () => void;
}

export function ConfirmationCard({
    plots,
    products,
    date,
    validationResult,
    allParcels,
    isSaving = false,
    onConfirm,
    onEdit,
    onCancel
}: ConfirmationCardProps) {
    // Resolve parcel names from IDs
    const parcelNames = plots.map(plotId => {
        const parcel = allParcels.find(p => p.id === plotId);
        return parcel?.name || plotId;
    });

    // Calculate total area
    const totalArea = plots.reduce((sum, plotId) => {
        const parcel = allParcels.find(p => p.id === plotId);
        return sum + (parcel?.area || 0);
    }, 0);

    // Calculate total product amounts
    const productTotals = products.map(p => ({
        ...p,
        total: (p.dosage * totalArea).toFixed(2)
    }));

    // Parse date
    const formattedDate = date
        ? format(new Date(date), 'EEEE d MMMM yyyy', { locale: nl })
        : format(new Date(), 'EEEE d MMMM yyyy', { locale: nl });

    // Get status color
    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'Akkoord': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'Waarschuwing': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            case 'Afgekeurd': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        }
    };

    // Get flag icon
    const getFlagIcon = (type: string) => {
        switch (type) {
            case 'error': return <AlertCircle className="h-4 w-4 text-red-400" />;
            case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-400" />;
            default: return <Info className="h-4 w-4 text-blue-400" />;
        }
    };

    return (
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                        <Check className="h-5 w-5 text-emerald-500" />
                        Bevestig Registratie
                    </CardTitle>
                    {validationResult?.status && (
                        <Badge className={`${getStatusColor(validationResult.status)} border`}>
                            {validationResult.status}
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Date */}
                <div className="flex justify-between items-center text-sm">
                    <span className="text-white/50">Datum</span>
                    <span className="text-white font-medium">{formattedDate}</span>
                </div>

                {/* Parcels */}
                <div className="space-y-1">
                    <span className="text-white/50 text-sm">Percelen ({plots.length})</span>
                    <div className="flex flex-wrap gap-1.5">
                        {parcelNames.slice(0, 5).map((name, i) => (
                            <Badge key={i} variant="outline" className="bg-white/5 text-white/80 border-white/10">
                                {name}
                            </Badge>
                        ))}
                        {parcelNames.length > 5 && (
                            <Badge variant="outline" className="bg-white/5 text-white/50 border-white/10">
                                +{parcelNames.length - 5} meer
                            </Badge>
                        )}
                    </div>
                    <span className="text-white/40 text-xs">Totaal: {totalArea.toFixed(2)} ha</span>
                </div>

                {/* Products */}
                <div className="space-y-2">
                    <span className="text-white/50 text-sm">Middelen</span>
                    <div className="space-y-2">
                        {productTotals.map((product, i) => (
                            <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-white font-medium">{product.product}</span>
                                        {product.targetReason && (
                                            <span className="text-white/40 text-xs ml-2">
                                                ({product.targetReason})
                                            </span>
                                        )}
                                    </div>
                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                        {product.dosage} {product.unit}/ha
                                    </Badge>
                                </div>
                                <div className="text-white/40 text-xs mt-1">
                                    Totaal: {product.total} {product.unit}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Validation flags */}
                {validationResult?.flags && validationResult.flags.length > 0 && (
                    <div className="space-y-2">
                        <span className="text-white/50 text-sm">Opmerkingen</span>
                        <div className="space-y-1.5">
                            {validationResult.flags.map((flag, i) => (
                                <div
                                    key={i}
                                    className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                                        flag.type === 'error' ? 'bg-red-500/10 text-red-300' :
                                        flag.type === 'warning' ? 'bg-amber-500/10 text-amber-300' :
                                        'bg-blue-500/10 text-blue-300'
                                    }`}
                                >
                                    {getFlagIcon(flag.type)}
                                    <span>{flag.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex gap-2 pt-4 border-t border-white/5">
                <Button
                    onClick={onConfirm}
                    disabled={isSaving}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Opslaan...
                        </>
                    ) : (
                        <>
                            <Check className="h-4 w-4 mr-2" />
                            Bevestigen
                        </>
                    )}
                </Button>
                <Button
                    onClick={onEdit}
                    disabled={isSaving}
                    variant="outline"
                    className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Aanpassen
                </Button>
                <Button
                    onClick={onCancel}
                    disabled={isSaving}
                    variant="ghost"
                    className="text-white/50 hover:text-white hover:bg-white/5"
                >
                    <X className="h-4 w-4" />
                </Button>
            </CardFooter>
        </Card>
    );
}
