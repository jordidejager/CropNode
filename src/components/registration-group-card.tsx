'use client';

import * as React from 'react';
import { useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Check,
    X,
    Edit2,
    AlertTriangle,
    AlertCircle,
    Info,
    Loader2,
    ChevronDown,
    ChevronUp,
    Trash2,
    Calendar,
    Package,
    MapPin,
    Save
} from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry, ConfidenceBreakdown } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DoelorganismeSelector } from '@/components/doelorganisme-selector';

type ParcelLike = { id: string; name: string; area: number | null; crop?: string; variety?: string | null };

interface ValidationResultPerUnit {
    [unitId: string]: {
        status: 'Akkoord' | 'Waarschuwing' | 'Afgekeurd';
        flags?: Array<{ type: string; message: string }>;
    };
}

interface RegistrationGroupCardProps {
    group: SprayRegistrationGroup;
    allParcels: ParcelLike[];
    validationResults?: ValidationResultPerUnit;
    savingUnitId?: string | null;
    onConfirmUnit: (unit: SprayRegistrationUnit) => void;
    onConfirmAll: () => void;
    onEditUnit: (unit: SprayRegistrationUnit) => void;
    onRemoveUnit: (unitId: string) => void;
    onCancelAll: () => void;
}

// Helper function to extract main parcel name from sub-parcel name
function getMainParcelName(name: string): string {
    const parts = name.trim().split(/\s+/);
    return parts[0] || name;
}

/**
 * Punt 4: Confidence Indicator Component
 *
 * Shows visual feedback about how confident the system is about the parsed data.
 * - Green (>= 0.85): High confidence, no extra text
 * - Orange (0.65-0.84): Medium confidence with warning
 * - Red (< 0.65): Low confidence with warning and field highlights
 */
function ConfidenceIndicator({ confidence }: { confidence?: ConfidenceBreakdown }) {
    if (!confidence) return null;

    const overall = confidence.overall;

    // High confidence - subtle green indicator
    if (overall >= 0.85) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-xs text-emerald-400 font-medium">
                                {Math.round(overall * 100)}%
                            </span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs font-medium mb-1">Hoge zekerheid</p>
                        <div className="text-xs text-white/60 space-y-0.5">
                            <p>Intent: {Math.round(confidence.intentClassification * 100)}%</p>
                            <p>Producten: {Math.round(confidence.productResolution * 100)}%</p>
                            <p>Percelen: {Math.round(confidence.parcelResolution * 100)}%</p>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    // Medium confidence - orange warning
    if (overall >= 0.65) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-xs text-amber-400 font-medium">
                                Controleer gegevens
                            </span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs font-medium mb-1">Gemiddelde zekerheid ({Math.round(overall * 100)}%)</p>
                        <p className="text-xs text-white/60 mb-2">Ik ben niet 100% zeker. Controleer of alles klopt.</p>
                        <div className="text-xs text-white/60 space-y-0.5">
                            <p className={cn(confidence.intentClassification < 0.85 && "text-amber-400")}>
                                Intent: {Math.round(confidence.intentClassification * 100)}%
                            </p>
                            <p className={cn(confidence.productResolution < 0.85 && "text-amber-400")}>
                                Producten: {Math.round(confidence.productResolution * 100)}%
                            </p>
                            <p className={cn(confidence.parcelResolution < 0.85 && "text-amber-400")}>
                                Percelen: {Math.round(confidence.parcelResolution * 100)}%
                            </p>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    // Low confidence - red warning with uncertain fields
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs text-red-400 font-medium">
                            Klopt dit?
                        </span>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-xs font-medium mb-1">Lage zekerheid ({Math.round(overall * 100)}%)</p>
                    <p className="text-xs text-white/60 mb-2">Ik kon niet alles met zekerheid herkennen.</p>
                    <div className="text-xs text-white/60 space-y-0.5">
                        <p className={cn(confidence.intentClassification < 0.65 && "text-red-400")}>
                            Intent: {Math.round(confidence.intentClassification * 100)}%
                            {confidence.intentClassification < 0.65 && " - onzeker"}
                        </p>
                        <p className={cn(confidence.productResolution < 0.65 && "text-red-400")}>
                            Producten: {Math.round(confidence.productResolution * 100)}%
                            {confidence.productResolution < 0.65 && " - onzeker"}
                        </p>
                        <p className={cn(confidence.parcelResolution < 0.65 && "text-red-400")}>
                            Percelen: {Math.round(confidence.parcelResolution * 100)}%
                            {confidence.parcelResolution < 0.65 && " - onzeker"}
                        </p>
                    </div>
                    {confidence.uncertainFields && confidence.uncertainFields.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                            <p className="text-xs text-red-400">
                                Onzekere velden: {confidence.uncertainFields.join(', ')}
                            </p>
                        </div>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

interface ParcelGroup {
    mainName: string;
    parcels: ParcelLike[];
    totalArea: number;
}

function UnitPanel({
    unit,
    allParcels,
    validationResult,
    isSaving,
    isConfirmed,
    isExpanded,
    onToggle,
    onConfirm,
    onEdit,
    onRemove,
}: {
    unit: SprayRegistrationUnit;
    allParcels: ParcelLike[];
    validationResult?: { status: string; flags?: Array<{ type: string; message: string }> };
    isSaving: boolean;
    isConfirmed: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onConfirm: () => void;
    onEdit: () => void;
    onRemove: () => void;
}) {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Resolve parcels
    const selectedParcels = useMemo(() => {
        return unit.plots.map(plotId => {
            const parcel = allParcels.find(p => p.id === plotId);
            return parcel || { id: plotId, name: plotId.slice(0, 8) + '...', area: 0 };
        });
    }, [unit.plots, allParcels]);

    // Group parcels by main name
    const groupedParcels = useMemo((): ParcelGroup[] => {
        const groups: Record<string, ParcelGroup> = {};
        selectedParcels.forEach(parcel => {
            const mainName = getMainParcelName(parcel.name);
            if (!groups[mainName]) {
                groups[mainName] = { mainName, parcels: [], totalArea: 0 };
            }
            groups[mainName].parcels.push(parcel);
            groups[mainName].totalArea += parcel.area || 0;
        });
        return Object.values(groups).sort((a, b) => a.mainName.localeCompare(b.mainName));
    }, [selectedParcels]);

    const totalArea = useMemo(() => {
        return selectedParcels.reduce((sum, p) => sum + (p.area || 0), 0);
    }, [selectedParcels]);

    const productTotals = useMemo(() => {
        return unit.products.map(p => ({
            ...p,
            total: (p.dosage * totalArea).toFixed(2)
        }));
    }, [unit.products, totalArea]);

    // Get the primary crop from selected parcels (for doelorganisme filtering)
    const primaryCrop = useMemo(() => {
        const crops = selectedParcels.map(p => p.crop).filter(Boolean) as string[];
        if (crops.length === 0) return undefined;
        // Return the most common crop
        const cropCounts = crops.reduce((acc, crop) => {
            acc[crop] = (acc[crop] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(cropCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    }, [selectedParcels]);

    const getValidationStyle = useCallback((status?: string) => {
        if (isConfirmed) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' };
        switch (status) {
            case 'Akkoord': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' };
            case 'Waarschuwing': return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' };
            case 'Afgekeurd': return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' };
            default: return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' };
        }
    }, [isConfirmed]);

    const validationStyle = getValidationStyle(validationResult?.status);

    return (
        <Collapsible open={isExpanded} onOpenChange={onToggle}>
            <div className={cn(
                "bg-white/[0.03] rounded-xl border overflow-hidden transition-all",
                isConfirmed ? "border-emerald-500/30" :
                validationResult?.status === 'Afgekeurd' ? "border-red-500/30" :
                validationResult?.status === 'Waarschuwing' ? "border-amber-500/30" :
                "border-white/10"
            )}>
                {/* Collapsed Header */}
                <CollapsibleTrigger asChild>
                    <button className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left">
                        <div className="flex items-center gap-3">
                            <ChevronDown className={cn(
                                "h-4 w-4 text-white/40 transition-transform duration-200",
                                isExpanded && "rotate-180"
                            )} />
                            <div>
                                <span className="text-white font-semibold">
                                    {unit.label || `Registratie`}
                                </span>
                                <div className="text-white/40 text-xs mt-0.5 flex items-center gap-2">
                                    {unit.date && (
                                        <span className="flex items-center gap-1 text-blue-400/80">
                                            <Calendar className="h-3 w-3" />
                                            {format(unit.date instanceof Date ? unit.date : new Date(unit.date), 'd MMM', { locale: nl })}
                                        </span>
                                    )}
                                    <span>{totalArea.toFixed(2)} ha • {unit.products.length} middel{unit.products.length !== 1 ? 'en' : ''}</span>
                                </div>
                            </div>
                        </div>
                        <Badge className={cn("text-xs border", validationStyle.bg, validationStyle.text, validationStyle.border)}>
                            {isConfirmed ? 'Bevestigd' : (validationResult?.status || 'Concept')}
                        </Badge>
                    </button>
                </CollapsibleTrigger>

                {/* Expanded Content - StatusPanel style */}
                <CollapsibleContent>
                    <div className="border-t border-white/[0.06]">
                        {/* Validation Flags at top when expanded */}
                        {validationResult?.flags && validationResult.flags.length > 0 && (
                            <div className="p-4 border-b border-white/[0.06]">
                                <Collapsible defaultOpen={false}>
                                    <CollapsibleTrigger asChild>
                                        <button className={cn(
                                            "w-full flex items-center justify-between p-3 rounded-lg transition-colors",
                                            validationResult.status === 'Afgekeurd'
                                                ? "bg-red-500/10 hover:bg-red-500/15 border border-red-500/20"
                                                : "bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20"
                                        )}>
                                            <div className="flex items-center gap-2">
                                                <AlertCircle className={cn(
                                                    "h-4 w-4",
                                                    validationResult.status === 'Afgekeurd' ? "text-red-400" : "text-amber-400"
                                                )} />
                                                <span className={cn(
                                                    "text-sm font-medium",
                                                    validationResult.status === 'Afgekeurd' ? "text-red-400" : "text-amber-400"
                                                )}>
                                                    {validationResult.status === 'Afgekeurd' ? 'Afgekeurd' : 'Waarschuwingen'}
                                                </span>
                                                <Badge variant="outline" className={cn(
                                                    "text-[10px] ml-1",
                                                    validationResult.status === 'Afgekeurd'
                                                        ? "border-red-500/30 text-red-400"
                                                        : "border-amber-500/30 text-amber-400"
                                                )}>
                                                    {validationResult.flags.length}
                                                </Badge>
                                            </div>
                                            <ChevronDown className={cn(
                                                "h-4 w-4",
                                                validationResult.status === 'Afgekeurd' ? "text-red-400" : "text-amber-400"
                                            )} />
                                        </button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <div className="space-y-1.5 mt-2">
                                            {validationResult.flags.map((flag, i) => (
                                                <div
                                                    key={`flag-${i}`}
                                                    className={cn(
                                                        "flex items-start gap-2 text-xs p-2 rounded",
                                                        flag.type === 'error' ? 'bg-red-500/10 text-red-300' :
                                                        flag.type === 'warning' ? 'bg-amber-500/10 text-amber-300' :
                                                        'bg-blue-500/10 text-blue-300'
                                                    )}
                                                >
                                                    {flag.type === 'error' ? <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> :
                                                     flag.type === 'warning' ? <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> :
                                                     <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />}
                                                    <span>{flag.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            </div>
                        )}

                        <div className="p-4 space-y-4">
                            {/* Products Section */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider">
                                    <Package className="h-3.5 w-3.5" />
                                    <span>Middelen ({unit.products.length})</span>
                                </div>
                                <div className="space-y-2">
                                    {productTotals.map((product, i) => (
                                        <div key={`product-${i}`} className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-white font-medium truncate">{product.product}</p>
                                                    {product.targetReason && (
                                                        <p className="text-xs text-white/40 mt-0.5">{product.targetReason}</p>
                                                    )}
                                                    {/* Doelorganisme Display (read-only in group card) */}
                                                    <div className="mt-1.5">
                                                        <DoelorganismeSelector
                                                            productName={product.product}
                                                            gewas={primaryCrop}
                                                            selectedDoelorganisme={product.doelorganisme}
                                                            onSelect={() => {}} // Read-only in group card
                                                            disabled={isConfirmed}
                                                            compact
                                                        />
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0 ml-3">
                                                    <span className="text-sm font-medium text-emerald-400">
                                                        {product.dosage} {product.unit}/ha
                                                    </span>
                                                    <p className="text-[10px] text-white/30 mt-0.5">
                                                        Totaal: {product.total} {product.unit}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Parcels Section */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider">
                                        <MapPin className="h-3.5 w-3.5" />
                                        <span>Percelen ({unit.plots.length})</span>
                                    </div>
                                    <span className="text-xs text-white/30">{totalArea.toFixed(2)} ha</span>
                                </div>

                                <div className="space-y-2">
                                    {groupedParcels.map((group) => {
                                        const isSingleParcel = group.parcels.length === 1;
                                        const isGroupExpanded = expandedGroups[group.mainName] ?? false;

                                        if (isSingleParcel) {
                                            const parcel = group.parcels[0];
                                            return (
                                                <div
                                                    key={parcel.id}
                                                    className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]"
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <p className="text-sm text-white/90 font-medium truncate">{parcel.name}</p>
                                                        <span className="text-xs text-emerald-400/80 font-medium ml-2">
                                                            {(parcel.area || 0).toFixed(2)} ha
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <Collapsible
                                                key={group.mainName}
                                                open={isGroupExpanded}
                                                onOpenChange={(open) => setExpandedGroups(prev => ({ ...prev, [group.mainName]: open }))}
                                            >
                                                <div className="bg-white/[0.05] rounded-lg border border-white/[0.08] overflow-hidden">
                                                    <CollapsibleTrigger asChild>
                                                        <button className="w-full p-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors text-left">
                                                            <div className="flex items-center gap-2">
                                                                <ChevronDown className={cn(
                                                                    "h-4 w-4 text-white/40 transition-transform duration-200",
                                                                    isGroupExpanded && "rotate-180"
                                                                )} />
                                                                <div>
                                                                    <p className="text-sm text-white font-semibold">{group.mainName}</p>
                                                                    <p className="text-[10px] text-white/40">{group.parcels.length} sub-percelen</p>
                                                                </div>
                                                            </div>
                                                            <span className="text-xs text-emerald-400 font-medium">
                                                                {group.totalArea.toFixed(2)} ha
                                                            </span>
                                                        </button>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent>
                                                        <div className="ml-4 pb-2 space-y-1 border-l-2 border-white/[0.06] pl-3">
                                                            {group.parcels.map((parcel) => {
                                                                const subName = parcel.name.replace(group.mainName, '').trim() || parcel.name;
                                                                return (
                                                                    <div
                                                                        key={parcel.id}
                                                                        className="bg-white/[0.02] rounded p-2 border border-white/[0.04]"
                                                                    >
                                                                        <div className="flex justify-between items-center">
                                                                            <p className="text-[11px] text-white/70 truncate">{subName}</p>
                                                                            <span className="text-[10px] text-white/40">
                                                                                {(parcel.area || 0).toFixed(2)} ha
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </CollapsibleContent>
                                                </div>
                                            </Collapsible>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Actions Footer */}
                        {!isConfirmed && (
                            <div className="p-4 border-t border-white/[0.06] bg-black/20">
                                <div className="flex gap-2">
                                    <Button
                                        onClick={onRemove}
                                        disabled={isSaving}
                                        variant="ghost"
                                        size="sm"
                                        className="text-white/50 hover:text-white hover:bg-white/5 h-9"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        onClick={onEdit}
                                        disabled={isSaving}
                                        variant="outline"
                                        size="sm"
                                        className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-9"
                                    >
                                        <Edit2 className="h-4 w-4 mr-1.5" />
                                        Bewerk
                                    </Button>
                                    <Button
                                        onClick={onConfirm}
                                        disabled={isSaving || validationResult?.status === 'Afgekeurd'}
                                        size="sm"
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-9 disabled:opacity-50"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                                Opslaan...
                                            </>
                                        ) : (
                                            <>
                                                <Check className="h-4 w-4 mr-1.5" />
                                                Bevestigen
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Confirmed state */}
                        {isConfirmed && (
                            <div className="p-4 border-t border-white/[0.06] bg-emerald-500/5">
                                <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm">
                                    <Check className="h-4 w-4" />
                                    Bevestigd
                                </div>
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

export function RegistrationGroupCard({
    group,
    allParcels,
    validationResults = {},
    savingUnitId,
    onConfirmUnit,
    onConfirmAll,
    onEditUnit,
    onRemoveUnit,
    onCancelAll
}: RegistrationGroupCardProps) {
    // Track which units are expanded - default: first one expanded
    const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        group.units.forEach((u, i) => {
            initial[u.id] = i === 0; // First unit expanded by default
        });
        return initial;
    });

    // Defensive Date parsing: group.date might be a string from JSON serialization
    const groupDate = group.date instanceof Date ? group.date : new Date(group.date);
    const formattedDate = format(groupDate, 'EEEE d MMMM', { locale: nl });
    const pendingUnits = group.units.filter(u => u.status === 'pending');
    const confirmedUnits = group.units.filter(u => u.status === 'confirmed');
    const canConfirmAll = pendingUnits.every(unit => {
        const validation = validationResults[unit.id];
        return !validation || validation.status !== 'Afgekeurd';
    });
    const isSavingAny = !!savingUnitId;

    const toggleUnit = (unitId: string) => {
        setExpandedUnits(prev => ({ ...prev, [unitId]: !prev[unitId] }));
    };

    return (
        <div className="flex flex-col max-w-full overflow-hidden" data-testid="registration-group-card">
            {/* Header */}
            <div className="p-4 border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                        <Calendar className="h-4 w-4" />
                        <span>{formattedDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Punt 4: Confidence Indicator */}
                        <ConfidenceIndicator confidence={group.confidence} />
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 border text-xs">
                            {group.units.length} registratie{group.units.length !== 1 ? 's' : ''}
                        </Badge>
                    </div>
                </div>
            </div>

            {/* Units */}
            <div className="p-4 space-y-3">
                {group.units.map((unit) => (
                    <UnitPanel
                        key={unit.id}
                        unit={unit}
                        allParcels={allParcels}
                        validationResult={validationResults[unit.id]}
                        isSaving={savingUnitId === unit.id}
                        isConfirmed={unit.status === 'confirmed'}
                        isExpanded={expandedUnits[unit.id] ?? false}
                        onToggle={() => toggleUnit(unit.id)}
                        onConfirm={() => onConfirmUnit(unit)}
                        onEdit={() => onEditUnit(unit)}
                        onRemove={() => onRemoveUnit(unit.id)}
                    />
                ))}
            </div>

            {/* Bulk Actions Footer */}
            {pendingUnits.length > 1 && (
                <div className="p-4 border-t border-white/[0.06] bg-black/20">
                    <div className="flex gap-2">
                        <Button
                            onClick={onCancelAll}
                            disabled={isSavingAny}
                            variant="ghost"
                            size="sm"
                            className="text-white/50 hover:text-white hover:bg-white/5 h-9"
                        >
                            <X className="h-4 w-4 mr-1.5" />
                            Annuleer alles
                        </Button>
                        <Button
                            onClick={onConfirmAll}
                            disabled={isSavingAny || !canConfirmAll}
                            size="sm"
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-9"
                        >
                            {savingUnitId === 'all' ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                    Alles opslaan...
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4 mr-1.5" />
                                    Bevestig alles ({pendingUnits.length})
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            )}

            {/* All confirmed */}
            {pendingUnits.length === 0 && confirmedUnits.length > 0 && (
                <div className="p-4 border-t border-white/[0.06] bg-emerald-500/5">
                    <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm">
                        <Check className="h-4 w-4" />
                        Alle registraties bevestigd
                    </div>
                </div>
            )}
        </div>
    );
}
