'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { SmartInvoerFeed } from '@/components/smart-invoer-feed';
import { CommandBar } from '@/components/command-bar';
import { type InputMode, getModeConfig } from '@/components/mode-selector';
import { useDashboardStats, useCtgbProducts, useInvalidateQueries, queryKeys } from '@/hooks/use-data';
import { useQueryClient } from '@tanstack/react-query';
import {
    deleteLogbookEntry,
    confirmLogbookEntry,
    saveInlineEdit,
    saveStreamedDraft,
    updateLogbookEntryAction,
    deleteSpuitschriftEntry,
    moveSpuitschriftEntryToLogbook,
    saveConversationAsDraft,
    loadConversation,
    confirmDraftDirectToSpuitschrift,
    confirmSingleUnit,
    confirmAllUnits
} from '@/app/actions';
import type { LogbookEntry, LogStatus, SprayRegistrationGroup, SprayRegistrationUnit } from '@/lib/types';
import { RegistrationGroupCard } from '@/components/registration-group-card';
import { ProductInfoCard, ProductInfoCompact } from '@/components/product-info-card';
import { RegistrationBottomSheet } from '@/components/registration-bottom-sheet';
import type { CtgbProduct } from '@/lib/types';
import { useTransition, useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { DashboardSkeleton } from '@/components/ui/data-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Check, X, Edit2, AlertTriangle, AlertCircle, Info, Loader2,
    Calendar, Package, MapPin, MessageSquare, ClipboardList, ChevronDown,
    ChevronUp, Save, FlaskConical
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    initializeFeedbackCache,
    recordDosagePreference,
    recordCorrection,
    recordProductCombo
} from '@/lib/feedback-service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    intent?: string;
    data?: unknown;
}

interface SlotRequest {
    missingSlot: 'plots' | 'products' | 'dosage' | 'date';
    question: string;
    suggestions?: string[];
    currentDraft?: {
        plots: string[];
        products: Array<{ product: string; dosage: number; unit: string }>;
        date?: string;
    };
}

type DraftStatus = 'idle' | 'editing' | 'confirming' | 'saving' | 'saved';

interface ConfirmationData {
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
    wasMerged: boolean;
    existingDraftId?: string;
}

type StreamMessage =
    | { type: 'intent'; intent: string; confidence: number; params?: Record<string, unknown> }
    | { type: 'searching'; terms: string[] }
    | { type: 'context_ready'; productCount: number; parcelCount: number; resolvedAliases?: Record<string, string> }
    | { type: 'extracting' }
    | { type: 'partial'; data: any }
    | { type: 'complete'; data: any; merged?: boolean; reply?: string }
    | { type: 'grouped_complete'; group: SprayRegistrationGroup; reply: string; parcels?: Array<{ id: string; name: string; area: number | null }> }  // V2: Grouped registrations
    | { type: 'answer'; message: string; intent: string; data?: unknown }
    | { type: 'agent_thinking' }
    | { type: 'agent_tool_call'; tool: string; input?: unknown }
    | { type: 'agent_tool_result'; tool: string; result?: unknown }
    | { type: 'agent_answer'; message: string; toolsUsed?: string[] }
    | { type: 'slot_request'; slotRequest: SlotRequest }
    | { type: 'correction'; correction: any; message: string; updatedDraft: any }
    | { type: 'error'; message: string }
    // New multi-modal message types
    | { type: 'product_info'; product: any; message: string; intent: string }
    | { type: 'product_list'; products: any[]; totalCount: number; message: string; intent: string }
    | { type: 'workforce_action'; action: 'start' | 'stop' | 'log'; data: any; message: string };

type ProcessingPhase =
    | 'idle'
    | 'searching'
    | 'context_ready'
    | 'extracting'
    | 'validating'
    | 'agent_thinking'
    | 'agent_tool_call'
    | 'complete'
    | 'error';

interface AgentState {
    isActive: boolean;
    currentTool: string | null;
    toolHistory: Array<{ tool: string; status: 'calling' | 'done' }>;
    answer: string | null;
}

interface DraftContext {
    id: string;
    plots: string[];
    products: Array<{
        product: string;
        dosage: number;
        unit: string;
        targetReason?: string;
    }>;
    date?: string;
}

// ============================================================================
// CROP EMOJI MAPPING
// ============================================================================

const CROP_EMOJI: Record<string, string> = {
    'peer': '',
    'peren': '',
    'appel': '',
    'appels': '',
    'kers': '',
    'kersen': '',
    'pruim': '',
    'pruimen': '',
    'default': ''
};

const getCropEmoji = (crop: string) => {
    const lower = crop.toLowerCase();
    return CROP_EMOJI[lower] || CROP_EMOJI['default'];
};

// ============================================================================
// STATUS PANEL COMPONENT (Integrated, not floating)
// ============================================================================

interface StatusPanelProps {
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
    allParcels: Array<{ id: string; name: string; area: number | null; crop?: string; variety?: string | null }>;
    isSaving?: boolean;
    isSavingDraft?: boolean;
    processingPhase?: ProcessingPhase;
    onConfirm: () => void;
    onSaveAsDraft: () => void;
    onEdit: () => void;
    onCancel: () => void;
    onRemoveParcel?: (parcelId: string) => void;
    onRemoveParcelGroup?: (parcelIds: string[]) => void;
    onUpdateDosage?: (productIndex: number, newDosage: number) => void;
    onUpdateProduct?: (productIndex: number, updates: { dosage?: number; unit?: string }) => void;
}

// Helper function to extract main parcel name from sub-parcel name
function getMainParcelName(name: string): string {
    const parts = name.trim().split(/\s+/);
    return parts[0] || name;
}

// Type for grouped parcels
interface ParcelGroup {
    mainName: string;
    parcels: Array<{ id: string; name: string; area: number | null; crop?: string; variety?: string | null }>;
    totalArea: number;
}

const StatusPanel = React.memo(function StatusPanel({
    plots,
    products,
    date,
    validationResult,
    allParcels,
    isSaving = false,
    isSavingDraft = false,
    processingPhase = 'idle',
    onConfirm,
    onSaveAsDraft,
    onEdit,
    onCancel,
    onRemoveParcel,
    onRemoveParcelGroup,
    onUpdateDosage,
    onUpdateProduct,
}: StatusPanelProps) {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const selectedParcels = useMemo(() => {
        return plots.map(plotId => {
            const parcel = allParcels.find(p => p.id === plotId);
            return parcel || { id: plotId, name: plotId.slice(0, 8) + '...', area: 0, crop: 'Onbekend', variety: null };
        });
    }, [plots, allParcels]);

    const groupedParcels = useMemo((): ParcelGroup[] => {
        const groups: Record<string, ParcelGroup> = {};
        selectedParcels.forEach(parcel => {
            const mainName = getMainParcelName(parcel.name);
            if (!groups[mainName]) {
                groups[mainName] = {
                    mainName,
                    parcels: [],
                    totalArea: 0
                };
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
        return products.map(p => ({
            ...p,
            total: (p.dosage * totalArea).toFixed(2)
        }));
    }, [products, totalArea]);

    const formattedDate = useMemo(() => {
        return date
            ? format(new Date(date), 'EEEE d MMMM', { locale: nl })
            : format(new Date(), 'EEEE d MMMM', { locale: nl });
    }, [date]);

    const getValidationStyle = useCallback((status?: string) => {
        switch (status) {
            case 'Akkoord': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' };
            case 'Waarschuwing': return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' };
            case 'Afgekeurd': return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' };
            default: return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' };
        }
    }, []);

    const validationStyle = getValidationStyle(validationResult?.status);
    const isLoading = processingPhase === 'validating' || processingPhase === 'searching' || processingPhase === 'extracting';

    return (
        <div className="flex flex-col" data-testid="status-panel">
            {/* Content - Flows naturally */}
            <div className="p-4 space-y-4">
                {/* Date & Status Row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                        <Calendar className="h-4 w-4" />
                        <span>{formattedDate}</span>
                    </div>
                    {validationResult?.status && (
                        <Badge className={cn("text-xs", validationStyle.bg, validationStyle.text, validationStyle.border)}>
                            {validationResult.status}
                        </Badge>
                    )}
                </div>

                {/* Validation Warnings - At top, collapsible */}
                {validationResult?.flags && validationResult.flags.length > 0 && (
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
                                    "h-4 w-4 transition-transform duration-200",
                                    validationResult.status === 'Afgekeurd' ? "text-red-400" : "text-amber-400"
                                )} />
                            </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                            <div className="space-y-1.5 mt-2 pl-2">
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
                )}

                {/* Products Section */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider">
                        <Package className="h-3.5 w-3.5" />
                        <span>Middelen ({products.length})</span>
                    </div>
                    <div className="space-y-2">
                        {productTotals.map((product, i) => {
                            const step = product.unit.toLowerCase() === 'kg' ? 0.05 : 0.1;

                            return (
                                <Popover key={`product-${i}-${product.product}`}>
                                    <div className="group/product bg-white/[0.03] rounded-lg p-3 border border-white/[0.06] hover:border-white/[0.1] transition-colors">
                                        <div className="flex justify-between items-start">
                                            <PopoverTrigger asChild>
                                                <button className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                                                    <p className="text-sm text-white font-medium truncate">{product.product}</p>
                                                    {product.targetReason && (
                                                        <p className="text-xs text-white/40 mt-0.5">{product.targetReason}</p>
                                                    )}
                                                    <p className="text-[10px] text-white/30 mt-1">Klik om aan te passen</p>
                                                </button>
                                            </PopoverTrigger>
                                            <div className="text-right flex-shrink-0 ml-3">
                                                <div className="group/dosage relative inline-flex items-center gap-1">
                                                    {onUpdateDosage && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newDosage = Math.max(0, +(product.dosage - step).toFixed(2));
                                                                onUpdateDosage(i, newDosage);
                                                            }}
                                                            className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                                                            title={`-${step}`}
                                                        >
                                                            <ChevronDown className="h-4 w-4" />
                                                        </button>
                                                    )}

                                                    <span className="text-sm font-medium text-emerald-400 tabular-nums min-w-[4.5rem] text-center">
                                                        {product.dosage} {product.unit}/ha
                                                    </span>

                                                    {onUpdateDosage && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newDosage = +(product.dosage + step).toFixed(2);
                                                                onUpdateDosage(i, newDosage);
                                                            }}
                                                            className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                                                            title={`+${step}`}
                                                        >
                                                            <ChevronUp className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-white/30 mt-0.5">
                                                    Totaal: {product.total} {product.unit}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <PopoverContent className="w-64 p-4 bg-zinc-900 border-white/10" align="start">
                                        <div className="space-y-4">
                                            <div className="text-sm font-medium text-white truncate">{product.product}</div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs text-white/60">Dosering</Label>
                                                    <Input
                                                        type="number"
                                                        value={product.dosage}
                                                        onChange={(e) => {
                                                            const newDosage = parseFloat(e.target.value) || 0;
                                                            if (onUpdateProduct) {
                                                                onUpdateProduct(i, { dosage: newDosage });
                                                            } else if (onUpdateDosage) {
                                                                onUpdateDosage(i, newDosage);
                                                            }
                                                        }}
                                                        step="0.1"
                                                        min="0"
                                                        className="h-9 bg-white/5 border-white/10 text-white"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs text-white/60">Eenheid</Label>
                                                    <select
                                                        value={product.unit}
                                                        onChange={(e) => {
                                                            if (onUpdateProduct) {
                                                                onUpdateProduct(i, { unit: e.target.value });
                                                            }
                                                        }}
                                                        className="w-full h-9 rounded-md bg-white/5 border border-white/10 text-white px-3 text-sm"
                                                    >
                                                        <option value="l">l</option>
                                                        <option value="kg">kg</option>
                                                        <option value="ml">ml</option>
                                                        <option value="g">g</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="text-xs text-white/40 pt-2 border-t border-white/10">
                                                Totaal: {(product.dosage * totalArea).toFixed(2)} {product.unit} voor {totalArea.toFixed(2)} ha
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            );
                        })}
                    </div>
                </div>

                {/* Parcels Section */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>Percelen ({plots.length})</span>
                        </div>
                        <span className="text-xs text-white/30">{totalArea.toFixed(2)} ha</span>
                    </div>

                    <div className="space-y-2">
                        {groupedParcels.map((group) => {
                            const isSingleParcel = group.parcels.length === 1;
                            const isExpanded = expandedGroups[group.mainName] ?? false;

                            if (isSingleParcel) {
                                const parcel = group.parcels[0];
                                return (
                                    <div
                                        key={parcel.id}
                                        className="group relative bg-white/[0.03] rounded-lg p-3 border border-white/[0.06] hover:border-emerald-500/30 hover:bg-white/[0.04] transition-all"
                                    >
                                        {onRemoveParcel && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemoveParcel(parcel.id);
                                                }}
                                                className="absolute -top-1.5 -right-1.5 z-10 opacity-0 group-hover:opacity-100 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow transition-all"
                                                title="Verwijder"
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </button>
                                        )}
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white/90 font-medium truncate">
                                                    {parcel.name}
                                                </p>
                                                {parcel.variety && (
                                                    <p className="text-[10px] text-white/40 mt-0.5">{parcel.variety}</p>
                                                )}
                                            </div>
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
                                    open={isExpanded}
                                    onOpenChange={(open) => setExpandedGroups(prev => ({ ...prev, [group.mainName]: open }))}
                                >
                                    <div className="group relative bg-white/[0.05] rounded-lg border border-white/[0.08] overflow-hidden">
                                        <CollapsibleTrigger asChild>
                                            <button className="w-full p-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors text-left">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <ChevronDown
                                                        className={cn(
                                                            "h-4 w-4 text-white/40 transition-transform duration-200 flex-shrink-0",
                                                            isExpanded && "rotate-180"
                                                        )}
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-sm text-white font-semibold truncate">
                                                            {group.mainName}
                                                        </p>
                                                        <p className="text-[10px] text-white/40">
                                                            {group.parcels.length} sub-percelen
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-xs text-emerald-400 font-medium ml-2 flex-shrink-0">
                                                    {group.totalArea.toFixed(2)} ha
                                                </span>
                                            </button>
                                        </CollapsibleTrigger>

                                        {(onRemoveParcel || onRemoveParcelGroup) && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const parcelIds = group.parcels.map(p => p.id);
                                                    if (onRemoveParcelGroup) {
                                                        onRemoveParcelGroup(parcelIds);
                                                    } else if (onRemoveParcel) {
                                                        parcelIds.forEach(id => onRemoveParcel(id));
                                                    }
                                                }}
                                                className="absolute -top-1.5 -right-1.5 z-10 opacity-0 group-hover:opacity-100 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow transition-all"
                                                title={`Verwijder alle ${group.parcels.length} sub-percelen`}
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </button>
                                        )}
                                    </div>

                                    <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-up-2 data-[state=open]:slide-down-2">
                                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-white/[0.06] pl-3">
                                            {group.parcels.map((parcel) => {
                                                const subName = parcel.name.replace(group.mainName, '').trim() || parcel.name;

                                                return (
                                                    <div
                                                        key={parcel.id}
                                                        className="group/sub relative bg-white/[0.02] rounded p-2 border border-white/[0.04] hover:border-emerald-500/20 hover:bg-white/[0.03] transition-all"
                                                    >
                                                        {onRemoveParcel && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onRemoveParcel(parcel.id);
                                                                }}
                                                                className="absolute -top-1 -right-1 z-10 opacity-0 group-hover/sub:opacity-100 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-0.5 shadow transition-all"
                                                                title="Verwijder"
                                                            >
                                                                <X className="h-2 w-2" />
                                                            </button>
                                                        )}
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[11px] text-white/70 truncate">
                                                                    {subName}
                                                                </p>
                                                                {parcel.variety && (
                                                                    <p className="text-[9px] text-white/30 truncate">{parcel.variety}</p>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-white/40 ml-2 flex-shrink-0">
                                                                {(parcel.area || 0).toFixed(2)} ha
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            );
                        })}
                    </div>
                </div>

            </div>

            {/* Fixed Footer with Actions */}
            <div className="flex-shrink-0 p-4 border-t border-white/[0.06] bg-black/30">
                <div className="flex gap-2">
                    <Button
                        onClick={onCancel}
                        disabled={isSaving || isSavingDraft}
                        variant="ghost"
                        size="sm"
                        data-testid="cancel-draft"
                        className="text-white/50 hover:text-white hover:bg-white/5 h-9"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                    <Button
                        onClick={onSaveAsDraft}
                        disabled={isSaving || isSavingDraft}
                        variant="outline"
                        size="sm"
                        data-testid="save-draft"
                        className="bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 h-9"
                    >
                        {isSavingDraft ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-1.5" />
                                Concept
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isSaving || isSavingDraft || isLoading || validationResult?.status === 'Afgekeurd'}
                        size="sm"
                        data-testid="confirm-draft"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-9 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                Opslaan...
                            </>
                        ) : isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                Valideren...
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
        </div>
    );
});

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

function EmptyStatusPanel() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="h-12 w-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                <ClipboardList className="h-6 w-6 text-white/20" />
            </div>
            <p className="text-sm text-white/40 mb-1">Geen actieve registratie</p>
            <p className="text-xs text-white/20">
                Typ een bespuiting in de chat om te beginnen
            </p>
        </div>
    );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

function SmartInputContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('session_id');

    // State
    const [isProcessing, setIsProcessing] = useState(false);
    const [commandInput, setCommandInput] = useState('');
    const [streamingEntry, setStreamingEntry] = useState<LogbookEntry | null>(null);
    const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>('idle');
    const [searchTerms, setSearchTerms] = useState<string[]>([]);
    const [resolvedAliases, setResolvedAliases] = useState<Record<string, string>>({});
    const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
    const [agentState, setAgentState] = useState<AgentState>({
        isActive: false,
        currentTool: null,
        toolHistory: [],
        answer: null,
    });
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [currentSlotRequest, setCurrentSlotRequest] = useState<SlotRequest | null>(null);
    const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
    const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null);
    const [groupedConfirmation, setGroupedConfirmation] = useState<SprayRegistrationGroup | null>(null);
    const [groupedParcels, setGroupedParcels] = useState<Array<{ id: string; name: string; area: number | null }>>([]);
    const [savingUnitId, setSavingUnitId] = useState<string | null>(null);
    const [draftHistory, setDraftHistory] = useState<DraftContext[]>([]);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isLoadingSession, setIsLoadingSession] = useState(false);
    const [activeMode, setActiveMode] = useState<InputMode>('registration');
    // Product info state for multi-modal
    const [productInfoResult, setProductInfoResult] = useState<{
        type: 'single' | 'list';
        product?: CtgbProduct;
        products?: CtgbProduct[];
        totalCount?: number;
    } | null>(null);

    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const abortControllerRef = useRef<AbortController | null>(null);
    const lastAnswerRef = useRef<string | null>(null);

    // Initialize feedback cache
    useEffect(() => {
        initializeFeedbackCache();
    }, []);

    // Load session from URL if session_id is present
    useEffect(() => {
        async function loadSession() {
            if (!sessionId || sessionId === currentSessionId) return;

            setIsLoadingSession(true);
            try {
                const result = await loadConversation(sessionId);
                if (result.success && result.data) {
                    const { draft_data, chat_history, title } = result.data;

                    // Restore chat history
                    if (chat_history && Array.isArray(chat_history)) {
                        const restored = chat_history.map((msg: any) => ({
                            role: msg.role,
                            content: msg.content,
                            timestamp: new Date(msg.timestamp),
                            intent: msg.intent,
                            data: msg.data
                        }));
                        setChatHistory(restored);
                    }

                    // Restore draft data
                    if (draft_data && draft_data.plots && draft_data.products) {
                        setConfirmationData({
                            plots: draft_data.plots,
                            products: draft_data.products,
                            date: draft_data.date,
                            wasMerged: false
                        });
                        setDraftStatus('confirming');
                    }

                    setCurrentSessionId(sessionId);
                    toast({ title: 'Sessie geladen', description: title || 'Concept hervat' });
                } else {
                    toast({ variant: 'destructive', title: 'Fout', description: result.error || 'Sessie niet gevonden' });
                }
            } catch (e) {
                console.error('Error loading session:', e);
                toast({ variant: 'destructive', title: 'Fout', description: 'Kon sessie niet laden' });
            } finally {
                setIsLoadingSession(false);
            }
        }

        loadSession();
    }, [sessionId, currentSessionId, toast]);

    // Handle intent from URL
    useEffect(() => {
        const intent = searchParams.get('intent');
        if (intent) {
            setCommandInput(intent);
            const url = new URL(window.location.href);
            url.searchParams.delete('intent');
            window.history.replaceState({}, '', url);
        }
    }, [searchParams]);

    // Data hooks
    const { data: dashboardData, isLoading: isLoadingDashboard } = useDashboardStats();
    const { data: products = [], isLoading: isLoadingProducts } = useCtgbProducts();
    const { invalidateLogbook, invalidateSpuitschrift, invalidateDashboard } = useInvalidateQueries();

    // Derived data
    const entries = dashboardData?.logbook || [];
    const allParcels = dashboardData?.parcels || [];

    const productNames = useMemo(() => {
        return [...new Set(products.map(p => p.naam))].filter(Boolean).sort() as string[];
    }, [products]);

    const activeDraft = useMemo((): DraftContext | null => {
        if (activeDraftId) {
            const entry = entries.find(e => e.id === activeDraftId);
            if (entry && entry.status !== 'Akkoord') {
                return {
                    id: entry.id,
                    plots: entry.parsedData?.plots || [],
                    products: entry.parsedData?.products || [],
                    date: entry.date ? (typeof entry.date === 'string' ? entry.date : entry.date.toISOString().split('T')[0]) : undefined
                };
            }
        }
        const unconfirmedEntries = entries.filter(e => e.status !== 'Akkoord' && e.status !== 'Analyseren...' && (e.parsedData?.products?.length ?? 0) > 0);
        if (unconfirmedEntries.length === 0) return null;
        const sorted = [...unconfirmedEntries].sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
        const latest = sorted[0];
        return {
            id: latest.id,
            plots: latest.parsedData?.plots || [],
            products: latest.parsedData?.products || [],
            date: latest.date ? (typeof latest.date === 'string' ? latest.date : latest.date.toISOString().split('T')[0]) : undefined
        };
    }, [entries, activeDraftId]);

    const showStatusPanel = (draftStatus === 'confirming' || draftStatus === 'saving' || draftStatus === 'editing') && confirmationData;
    const showGroupedPanel = (draftStatus === 'confirming' || draftStatus === 'saving') && groupedConfirmation;

    const suggestions = useMemo(() => {
        if (currentSlotRequest?.suggestions && currentSlotRequest.suggestions.length > 0) {
            return currentSlotRequest.suggestions;
        }
        if (activeDraft && activeDraft.products.length > 0) {
            const baseSuggestions = ["Verwijder een perceel", "Wijzig dosering", "Dat was alles, bevestig"];
            if (draftHistory.length > 0) {
                return ["Ongedaan maken", ...baseSuggestions];
            }
            return baseSuggestions;
        }
        return ["Alle appels gespoten met Batavia", "1.2 kg Captan op de Elstar", "Gisteren peren gespoten tegen schurft"];
    }, [activeDraft, currentSlotRequest, draftHistory.length]);

    // Handlers
    const handleCancelConfirmation = useCallback(() => {
        setConfirmationData(null);
        setDraftStatus('idle');
        setChatHistory(prev => [...prev, {
            role: 'assistant',
            content: 'De registratie is geannuleerd.',
            timestamp: new Date()
        }]);
        toast({ title: 'Geannuleerd' });
    }, [toast]);

    const handleEditConfirmation = useCallback(() => {
        setDraftStatus('editing');
        setChatHistory(prev => [...prev, {
            role: 'assistant',
            content: 'Wat wil je aanpassen?',
            timestamp: new Date()
        }]);
    }, []);

    const handleRemoveParcel = useCallback((parcelId: string) => {
        if (!confirmationData) return;
        const newPlots = confirmationData.plots.filter(id => id !== parcelId);
        if (newPlots.length === 0) {
            handleCancelConfirmation();
            return;
        }
        setConfirmationData(prev => prev ? { ...prev, plots: newPlots } : null);
        const removedParcel = allParcels.find(p => p.id === parcelId);
        setChatHistory(prev => [...prev, {
            role: 'assistant',
            content: `${removedParcel?.name || 'Perceel'} verwijderd.`,
            timestamp: new Date()
        }]);
    }, [confirmationData, allParcels, handleCancelConfirmation]);

    const handleRemoveParcelGroup = useCallback((parcelIds: string[]) => {
        if (!confirmationData || parcelIds.length === 0) return;
        const newPlots = confirmationData.plots.filter(id => !parcelIds.includes(id));
        if (newPlots.length === 0) {
            handleCancelConfirmation();
            return;
        }
        setConfirmationData(prev => prev ? { ...prev, plots: newPlots } : null);
        const firstParcel = allParcels.find(p => p.id === parcelIds[0]);
        const mainName = firstParcel ? getMainParcelName(firstParcel.name) : 'Groep';
        setChatHistory(prev => [...prev, {
            role: 'assistant',
            content: `${mainName} (${parcelIds.length} percelen) verwijderd.`,
            timestamp: new Date()
        }]);
    }, [confirmationData, allParcels, handleCancelConfirmation]);

    const handleUpdateDosage = useCallback((productIndex: number, newDosage: number) => {
        if (!confirmationData) return;
        const updatedProducts = confirmationData.products.map((product, i) =>
            i === productIndex ? { ...product, dosage: newDosage } : product
        );
        setConfirmationData(prev => prev ? { ...prev, products: updatedProducts } : null);
    }, [confirmationData]);

    const handleUpdateProduct = useCallback((productIndex: number, updates: { dosage?: number; unit?: string }) => {
        if (!confirmationData) return;
        const updatedProducts = confirmationData.products.map((product, i) =>
            i === productIndex ? { ...product, ...updates } : product
        );
        setConfirmationData(prev => prev ? { ...prev, products: updatedProducts } : null);
    }, [confirmationData]);

    // Save as Draft handler
    const handleSaveAsDraft = useCallback(async () => {
        if (!confirmationData) return;

        setIsSavingDraft(true);
        try {
            const draftData = {
                plots: confirmationData.plots,
                products: confirmationData.products,
                date: confirmationData.date
            };

            const chatHistoryData = chatHistory.map(msg => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp.toISOString(),
                intent: msg.intent
            }));

            // Generate title from products and parcels
            const productNames = confirmationData.products.map(p => p.product);
            const title = productNames.length > 0
                ? `${productNames[0]}${productNames.length > 1 ? ` +${productNames.length - 1}` : ''} op ${confirmationData.plots.length} percelen`
                : 'Nieuwe sessie';

            const result = await saveConversationAsDraft({
                id: currentSessionId || undefined,
                title,
                draftData,
                chatHistory: chatHistoryData
            });

            if (result.success) {
                setCurrentSessionId(result.id!);
                toast({ title: 'Concept opgeslagen' });
                router.push('/command-center/timeline');
            } else {
                throw new Error(result.error);
            }
        } catch (e: any) {
            console.error('[handleSaveAsDraft] Error:', e);
            toast({ variant: 'destructive', title: 'Fout', description: e.message });
        } finally {
            setIsSavingDraft(false);
        }
    }, [confirmationData, chatHistory, currentSessionId, toast, router]);

    const handleConfirmSave = useCallback(async () => {
        if (!confirmationData) return;

        // Check of de validatie status "Afgekeurd" is
        if (confirmationData.validationResult?.status === 'Afgekeurd') {
            toast({
                variant: 'destructive',
                title: 'Kan niet bevestigen',
                description: 'Corrigeer eerst de validatiefouten.'
            });
            return;
        }

        setDraftStatus('saving');
        try {
            // DIRECT naar spuitschrift opslaan (niet naar logbook)
            const result = await confirmDraftDirectToSpuitschrift({
                plots: confirmationData.plots,
                products: confirmationData.products,
                date: confirmationData.date || new Date(),
                rawInput: chatHistory.find(m => m.role === 'user')?.content || 'Bevestigde registratie',
                validationMessage: confirmationData.validationResult?.validationMessage || null
            });

            if (!result.success) {
                toast({
                    variant: 'destructive',
                    title: 'Bevestigen mislukt',
                    description: result.message || 'Onbekende fout'
                });
                setDraftStatus('confirming');
                return;
            }

            // Als er een bestaande draft was in logbook, verwijder deze
            if (confirmationData.wasMerged && confirmationData.existingDraftId) {
                try {
                    await deleteLogbookEntry(confirmationData.existingDraftId);
                } catch (e) {
                    console.warn('Could not delete merged draft:', e);
                }
            }

            setDraftStatus('saved');
            setConfirmationData(null);
            invalidateLogbook();
            invalidateDashboard();
            invalidateSpuitschrift();

            // Record feedback
            try {
                for (const product of confirmationData.products) {
                    if (product.dosage && product.unit) {
                        recordDosagePreference(product.product, product.dosage, product.unit);
                    }
                }
                if (confirmationData.products.length > 1) {
                    const prodNames = confirmationData.products.map(p => p.product);
                    recordProductCombo(prodNames);
                }
            } catch (e) {
                console.warn('Failed to record feedback:', e);
            }

            setChatHistory(prev => [...prev, {
                role: 'assistant',
                content: '✅ Bevestigd en opgeslagen in spuitschrift!',
                timestamp: new Date()
            }]);

            setDraftHistory([]);
            toast({
                title: 'Bevestigd',
                description: 'Registratie opgeslagen in het officiële spuitschrift.'
            });

            setTimeout(() => setDraftStatus('idle'), 1000);
        } catch (e: any) {
            console.error('[handleConfirmSave] Error:', e);
            toast({ variant: 'destructive', title: 'Fout', description: e.message });
            setDraftStatus('confirming');
        }
    }, [confirmationData, chatHistory, invalidateLogbook, invalidateDashboard, invalidateSpuitschrift, toast]);

    // ============================================================================
    // GROUPED REGISTRATION HANDLERS (V2)
    // ============================================================================

    const handleConfirmUnit = useCallback(async (unit: SprayRegistrationUnit) => {
        if (!groupedConfirmation) return;

        setSavingUnitId(unit.id);
        try {
            const result = await confirmSingleUnit(unit, groupedConfirmation.date, groupedConfirmation.rawInput);

            if (!result.success) {
                toast({
                    variant: 'destructive',
                    title: 'Bevestigen mislukt',
                    description: result.message || 'Onbekende fout'
                });
                return;
            }

            // Update unit status to confirmed
            setGroupedConfirmation(prev => prev ? {
                ...prev,
                units: prev.units.map(u =>
                    u.id === unit.id ? { ...u, status: 'confirmed' as const } : u
                )
            } : null);

            invalidateLogbook();
            invalidateDashboard();
            invalidateSpuitschrift();

            toast({
                title: 'Bevestigd',
                description: `${unit.label || 'Registratie'} opgeslagen.`
            });
        } catch (e: any) {
            console.error('[handleConfirmUnit] Error:', e);
            toast({ variant: 'destructive', title: 'Fout', description: e.message });
        } finally {
            setSavingUnitId(null);
        }
    }, [groupedConfirmation, invalidateLogbook, invalidateDashboard, invalidateSpuitschrift, toast]);

    const handleConfirmAllUnits = useCallback(async () => {
        if (!groupedConfirmation) return;

        setSavingUnitId('all');
        try {
            const result = await confirmAllUnits(groupedConfirmation);

            if (result.success) {
                setGroupedConfirmation(prev => prev ? {
                    ...prev,
                    units: prev.units.map(u => ({ ...u, status: 'confirmed' as const }))
                } : null);

                invalidateLogbook();
                invalidateDashboard();
                invalidateSpuitschrift();

                setChatHistory(prev => [...prev, {
                    role: 'assistant',
                    content: `✅ ${result.message}`,
                    timestamp: new Date()
                }]);

                toast({
                    title: 'Bevestigd',
                    description: result.message
                });

                setTimeout(() => {
                    setGroupedConfirmation(null);
                    setGroupedParcels([]);
                    setDraftStatus('idle');
                }, 1500);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Bevestigen mislukt',
                    description: result.message
                });
            }
        } catch (e: any) {
            console.error('[handleConfirmAllUnits] Error:', e);
            toast({ variant: 'destructive', title: 'Fout', description: e.message });
        } finally {
            setSavingUnitId(null);
        }
    }, [groupedConfirmation, invalidateLogbook, invalidateDashboard, invalidateSpuitschrift, toast]);

    const handleEditUnit = useCallback((unit: SprayRegistrationUnit) => {
        // Convert unit to regular confirmation data for editing
        // NOTE: Keep groupedParcels! They are needed by StatusPanel for parcel name resolution
        setConfirmationData({
            plots: unit.plots,
            products: unit.products,
            wasMerged: false
        });
        setGroupedConfirmation(null);
        // Don't clear groupedParcels - StatusPanel needs them for name resolution
        setDraftStatus('editing');
        setChatHistory(prev => [...prev, {
            role: 'assistant',
            content: `Bewerken: ${unit.label || 'registratie'}. Wat wil je aanpassen?`,
            timestamp: new Date()
        }]);
    }, []);

    const handleRemoveUnit = useCallback((unitId: string) => {
        if (!groupedConfirmation) return;

        const updatedUnits = groupedConfirmation.units.filter(u => u.id !== unitId);

        if (updatedUnits.length === 0) {
            setGroupedConfirmation(null);
            setGroupedParcels([]); // Clear the parcels too
            setDraftStatus('idle');
            setChatHistory(prev => [...prev, {
                role: 'assistant',
                content: 'Alle deelregistraties verwijderd.',
                timestamp: new Date()
            }]);
            toast({ title: 'Geannuleerd' });
        } else {
            setGroupedConfirmation(prev => prev ? { ...prev, units: updatedUnits } : null);
            toast({ title: 'Verwijderd' });
        }
    }, [groupedConfirmation, toast]);

    const handleCancelGroupedConfirmation = useCallback(() => {
        setGroupedConfirmation(null);
        setGroupedParcels([]); // Clear the parcels too
        setDraftStatus('idle');
        setChatHistory(prev => [...prev, {
            role: 'assistant',
            content: 'Alle registraties geannuleerd.',
            timestamp: new Date()
        }]);
        toast({ title: 'Geannuleerd' });
    }, [toast]);

    const handleSend = useCallback(async (text?: string, mode?: InputMode) => {
        const inputText = text || commandInput;
        const inputMode = mode || activeMode;
        if (!inputText.trim()) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        const userMessage: ChatMessage = {
            role: 'user',
            content: inputText,
            timestamp: new Date()
        };
        setChatHistory(prev => [...prev, userMessage]);
        setCurrentSlotRequest(null);
        setCommandInput('');
        setIsProcessing(true);
        setProcessingPhase('searching');

        const displayDraft = (draftStatus === 'confirming' || draftStatus === 'editing') && confirmationData
            ? { plots: confirmationData.plots, products: confirmationData.products }
            : activeDraft
                ? { plots: activeDraft.plots, products: activeDraft.products }
                : { plots: [], products: [] };

        setStreamingEntry({
            id: 'streaming-' + Date.now(),
            rawInput: inputText,
            status: 'Analyseren...',
            date: new Date(),
            createdAt: new Date(),
            parsedData: displayDraft
        });

        try {
            const recentHistory = chatHistory.slice(-10).map(msg => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp.toISOString()
            }));

            const parcelInfoForCorrection = allParcels.map(p => ({
                id: p.id,
                name: p.name,
                variety: p.variety,
                crop: p.crop
            }));

            // Prioritize confirmationData if it has any data (for slot-filling scenarios)
            const currentDraft = confirmationData && (confirmationData.plots?.length > 0 || confirmationData.products?.length > 0)
                ? {
                    id: activeDraft?.id || 'temp-draft',
                    plots: confirmationData.plots,
                    products: confirmationData.products,
                    date: confirmationData.date
                }
                : activeDraft;

            const response = await fetch('/api/analyze-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rawInput: inputText,
                    previousDraft: currentDraft,
                    chatHistory: recentHistory,
                    parcelInfo: parcelInfoForCorrection,
                    mode: inputMode
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.body) throw new Error('No response body');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let extractedData: any = null;
            let wasMerged = false;
            let botReply: string | null = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
                for (const line of lines) {
                    try {
                        const message: StreamMessage = JSON.parse(line);
                        switch (message.type) {
                            case 'searching': setProcessingPhase('searching'); setSearchTerms(message.terms); break;
                            case 'context_ready': setProcessingPhase('context_ready'); if (message.resolvedAliases) setResolvedAliases(message.resolvedAliases); break;
                            case 'extracting': setProcessingPhase('extracting'); break;
                            case 'partial': setStreamingEntry(prev => prev ? ({ ...prev, parsedData: { plots: message.data.plots || prev.parsedData?.plots || [], products: message.data.products || prev.parsedData?.products || [] } }) : null); break;
                            case 'complete':
                                extractedData = message.data;
                                wasMerged = message.merged || false;
                                botReply = message.reply || null;
                                break;
                            case 'grouped_complete':
                                // V2: Handle grouped registrations with variations
                                setGroupedConfirmation(message.group);
                                // Store the parcels from the API response for accurate lookups
                                if (message.parcels && message.parcels.length > 0) {
                                    setGroupedParcels(message.parcels);
                                }
                                setConfirmationData(null); // Clear regular confirmation
                                setDraftStatus('confirming');
                                setChatHistory(prev => [...prev, {
                                    role: 'assistant',
                                    content: message.reply,
                                    timestamp: new Date()
                                }]);
                                toast({ title: 'AgriBot', description: message.reply });
                                setStreamingEntry(null);
                                setIsProcessing(false);
                                setProcessingPhase('complete');
                                return; // Exit - grouped flow handled separately
                            case 'agent_answer':
                            case 'answer':
                                lastAnswerRef.current = message.message;
                                setChatHistory(prev => [...prev, {
                                    role: 'assistant',
                                    content: message.message,
                                    timestamp: new Date(),
                                    intent: message.type === 'answer' ? message.intent : undefined
                                }]);
                                toast({ title: 'AgriBot', description: message.message.slice(0, 100) });
                                setStreamingEntry(null);
                                setIsProcessing(false);
                                return;
                            case 'slot_request':
                                setCurrentSlotRequest(message.slotRequest);
                                // IMPORTANT: Save currentDraft from slot_request so it persists for the next message
                                if (message.slotRequest.currentDraft) {
                                    const draft = message.slotRequest.currentDraft;
                                    if (draft.plots?.length > 0 || draft.products?.length > 0) {
                                        setConfirmationData({
                                            plots: draft.plots || [],
                                            products: draft.products || [],
                                            date: draft.date,
                                            wasMerged: false
                                        });
                                        setDraftStatus('editing'); // Keep in editing mode for slot filling
                                    }
                                }
                                setChatHistory(prev => [...prev, {
                                    role: 'assistant',
                                    content: message.slotRequest.question,
                                    timestamp: new Date()
                                }]);
                                toast({ title: 'AgriBot vraagt', description: message.slotRequest.question });
                                setStreamingEntry(null);
                                setIsProcessing(false);
                                return;
                            case 'correction':
                                if (message.correction.type === 'undo' || message.correction.type === 'add_back_plots') {
                                    if (draftHistory.length > 0) {
                                        const previousState = draftHistory[draftHistory.length - 1];
                                        setDraftHistory(prev => prev.slice(0, -1));
                                        setStreamingEntry(prev => prev ? ({
                                            ...prev,
                                            parsedData: {
                                                plots: previousState.plots,
                                                products: previousState.products
                                            }
                                        }) : null);
                                        extractedData = {
                                            action: 'update',
                                            plots: previousState.plots,
                                            products: previousState.products,
                                            date: previousState.date
                                        };
                                        wasMerged = true;
                                        const chatMessage = message.correction.type === 'add_back_plots'
                                            ? `${previousState.plots.length} percelen teruggezet.`
                                            : 'Ongedaan gemaakt.';
                                        setChatHistory(prev => [...prev, {
                                            role: 'assistant',
                                            content: chatMessage,
                                            timestamp: new Date()
                                        }]);
                                    } else {
                                        const noHistoryMessage = message.correction.type === 'add_back_plots'
                                            ? 'Geen verwijderde percelen om terug te zetten.'
                                            : 'Niets om ongedaan te maken.';
                                        setChatHistory(prev => [...prev, {
                                            role: 'assistant',
                                            content: noHistoryMessage,
                                            timestamp: new Date()
                                        }]);
                                    }
                                    break;
                                }

                                if (activeDraft) {
                                    setDraftHistory(prev => [...prev, {
                                        id: activeDraft.id,
                                        plots: activeDraft.plots,
                                        products: activeDraft.products,
                                        date: activeDraft.date
                                    }]);
                                }

                                try {
                                    recordCorrection(message.correction.type, message.correction.target, inputText);
                                } catch (e) {
                                    console.warn('Failed to record correction:', e);
                                }

                                setChatHistory(prev => [...prev, {
                                    role: 'assistant',
                                    content: message.message,
                                    timestamp: new Date()
                                }]);

                                if (message.updatedDraft) {
                                    setStreamingEntry(prev => prev ? ({
                                        ...prev,
                                        parsedData: {
                                            plots: message.updatedDraft.plots || [],
                                            products: message.updatedDraft.products || []
                                        }
                                    }) : null);
                                }

                                if (message.correction.type === 'cancel_all') {
                                    setActiveDraftId(null);
                                    setConfirmationData(null);
                                    setDraftStatus('idle');
                                    setDraftHistory([]);
                                }
                                break;

                            // Multi-modal message handling
                            case 'product_info':
                                // Single product with full details
                                setProductInfoResult({
                                    type: 'single',
                                    product: message.product
                                });
                                setChatHistory(prev => [...prev, {
                                    role: 'assistant',
                                    content: message.message,
                                    timestamp: new Date(),
                                    intent: message.intent,
                                    data: { productInfo: message.product }
                                }]);
                                setStreamingEntry(null);
                                setIsProcessing(false);
                                setProcessingPhase('complete');
                                return;

                            case 'product_list':
                                // Multiple products found
                                setProductInfoResult({
                                    type: 'list',
                                    products: message.products,
                                    totalCount: message.totalCount
                                });
                                setChatHistory(prev => [...prev, {
                                    role: 'assistant',
                                    content: message.message,
                                    timestamp: new Date(),
                                    intent: message.intent,
                                    data: { productList: message.products }
                                }]);
                                setStreamingEntry(null);
                                setIsProcessing(false);
                                setProcessingPhase('complete');
                                return;

                            case 'workforce_action':
                                // Timer start/stop action - invalidate team-tasks cache
                                queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskSessions });
                                queryClient.invalidateQueries({ queryKey: queryKeys.taskLogs });
                                queryClient.invalidateQueries({ queryKey: queryKeys.taskStats });

                                setChatHistory(prev => [...prev, {
                                    role: 'assistant',
                                    content: message.message,
                                    timestamp: new Date(),
                                    data: message.data
                                }]);
                                toast({
                                    title: message.action === 'start' ? '⏱️ Timer Gestart' : '✅ Timer Gestopt',
                                    description: message.data?.taskType || 'Urenregistratie bijgewerkt'
                                });
                                setStreamingEntry(null);
                                setIsProcessing(false);
                                setProcessingPhase('complete');
                                return;
                        }
                    } catch (e) { continue; }
                }
            }

            if (!extractedData) throw new Error('Geen data ontvangen');

            // Validation
            setProcessingPhase('validating');
            const validationResponse = await fetch('/api/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ draft: extractedData }),
                signal: abortControllerRef.current.signal
            });
            const validationResult = await validationResponse.json();

            const finalProducts = validationResult.normalizedProducts || extractedData.products;
            const existingId = confirmationData?.existingDraftId || (wasMerged && activeDraft ? activeDraft.id : undefined);

            setConfirmationData({
                plots: extractedData.plots,
                products: finalProducts,
                date: extractedData.date,
                validationResult: {
                    status: validationResult.status,
                    validationMessage: validationResult.validationMessage,
                    flags: validationResult.flags
                },
                wasMerged: wasMerged || !!confirmationData?.existingDraftId,
                existingDraftId: existingId
            });
            setDraftStatus('confirming');
            setStreamingEntry(null);

            const chatReply = botReply || `Klaar! ${extractedData.plots.length} percelen, ${extractedData.products.length} middel(en).`;

            setChatHistory(prev => [...prev, {
                role: 'assistant',
                content: chatReply,
                timestamp: new Date()
            }]);
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('[handleSend] Error:', e);
                toast({ variant: 'destructive', title: 'Fout', description: e.message });
                setStreamingEntry(null);
            }
        } finally {
            setIsProcessing(false);
            setProcessingPhase('idle');
        }
    }, [commandInput, chatHistory, allParcels, activeDraft, draftStatus, confirmationData, draftHistory, toast, activeMode, queryClient]);

    const handleDelete = useCallback((id: string, isDraft: boolean) => {
        startTransition(async () => {
            if (isDraft) await deleteLogbookEntry(id);
            else await deleteSpuitschriftEntry(id);
            invalidateDashboard(); invalidateLogbook(); invalidateSpuitschrift();
            toast({ title: 'Verwijderd' });
        });
    }, [invalidateDashboard, invalidateLogbook, invalidateSpuitschrift, toast]);

    const handleConfirm = useCallback((id: string) => {
        startTransition(async () => {
            const res = await confirmLogbookEntry(id);
            if (res.success) {
                invalidateDashboard(); invalidateSpuitschrift();
                toast({ title: 'Bevestigd' });
            }
        });
    }, [invalidateDashboard, invalidateSpuitschrift, toast]);

    // Calculate summary for bottom sheet (must be before early return to follow hooks rules)
    const bottomSheetSummary = useMemo(() => {
        if (showGroupedPanel && groupedConfirmation) {
            const totalHa = groupedConfirmation.units.reduce((sum, unit) => {
                const parcelHa = unit.plots.reduce((pSum, plotId) => {
                    const parcel = allParcels.find(p => p.id === plotId || p.name === plotId);
                    return pSum + (parcel?.area || 0);
                }, 0);
                return sum + parcelHa;
            }, 0);
            return {
                registrationCount: groupedConfirmation.units.reduce((sum, u) => sum + u.plots.length, 0),
                totalHa,
                productCount: groupedConfirmation.units[0]?.products?.length || 0,
                date: groupedConfirmation.units[0]?.date,
                status: 'Akkoord' as const,
            };
        }
        if (showStatusPanel && confirmationData) {
            const totalHa = confirmationData.plots.reduce((sum, plotId) => {
                const parcel = allParcels.find(p => p.id === plotId || p.name === plotId);
                return sum + (parcel?.area || 0);
            }, 0);
            return {
                registrationCount: confirmationData.plots.length,
                totalHa,
                productCount: confirmationData.products.length,
                date: confirmationData.date,
                status: confirmationData.validationResult?.status as 'Akkoord' | 'Waarschuwing' | 'Fout',
            };
        }
        return undefined;
    }, [showGroupedPanel, groupedConfirmation, showStatusPanel, confirmationData, allParcels]);

    const hasActiveRegistration = showStatusPanel || showGroupedPanel;

    // Loading state
    if (isLoadingDashboard || isLoadingProducts || isLoadingSession) return <DashboardSkeleton />;

    // Status panel content (shared between desktop and mobile bottom sheet)
    const statusPanelContent = (
        <>
            {activeMode === 'product_info' && productInfoResult ? (
                <div className="p-4">
                    {productInfoResult.type === 'single' && productInfoResult.product ? (
                        <ProductInfoCard product={productInfoResult.product} />
                    ) : productInfoResult.type === 'list' && productInfoResult.products ? (
                        <div className="space-y-3">
                            <p className="text-sm text-white/60">
                                {productInfoResult.totalCount} producten gevonden
                            </p>
                            {productInfoResult.products.map((product, i) => (
                                <ProductInfoCompact
                                    key={product.id || i}
                                    product={product}
                                    onClick={() => setProductInfoResult({
                                        type: 'single',
                                        product: product
                                    })}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : showGroupedPanel && groupedConfirmation ? (
                <RegistrationGroupCard
                    group={groupedConfirmation}
                    allParcels={groupedParcels.length > 0 ? groupedParcels : allParcels}
                    savingUnitId={savingUnitId}
                    onConfirmUnit={handleConfirmUnit}
                    onConfirmAll={handleConfirmAllUnits}
                    onEditUnit={handleEditUnit}
                    onRemoveUnit={handleRemoveUnit}
                    onCancelAll={handleCancelGroupedConfirmation}
                />
            ) : showStatusPanel && confirmationData ? (
                <StatusPanel
                    plots={confirmationData.plots}
                    products={confirmationData.products}
                    date={confirmationData.date}
                    validationResult={confirmationData.validationResult}
                    allParcels={groupedParcels.length > 0 ? groupedParcels : allParcels}
                    isSaving={draftStatus === 'saving'}
                    isSavingDraft={isSavingDraft}
                    processingPhase={processingPhase}
                    onConfirm={handleConfirmSave}
                    onSaveAsDraft={handleSaveAsDraft}
                    onEdit={handleEditConfirmation}
                    onCancel={handleCancelConfirmation}
                    onRemoveParcel={handleRemoveParcel}
                    onRemoveParcelGroup={handleRemoveParcelGroup}
                    onUpdateDosage={handleUpdateDosage}
                    onUpdateProduct={handleUpdateProduct}
                />
            ) : activeMode === 'product_info' ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                        <FlaskConical className="h-6 w-6 text-blue-400" />
                    </div>
                    <p className="text-sm text-white/40 mb-1">Zoek een product</p>
                    <p className="text-xs text-white/20">
                        Typ een productnaam om informatie op te halen
                    </p>
                </div>
            ) : (
                <EmptyStatusPanel />
            )}
        </>
    );

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col md:grid md:grid-cols-12 gap-0 overflow-hidden -m-4 md:-m-6">
            {/* MOBILE: Full width chat with bottom sheet */}
            {/* DESKTOP: Left column (7 cols) */}
            <div className="flex-1 md:col-span-7 h-full md:border-r border-white/[0.06] bg-black/20 overflow-hidden flex flex-col">
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm font-medium text-white/80">Logboek</span>
                    </div>
                    <span className="text-xs text-white/30">{chatHistory.length} berichten</span>
                </div>

                {/* Chat History */}
                <div className="flex-1 overflow-y-auto">
                    <SmartInvoerFeed
                        entries={streamingEntry ? [streamingEntry, ...entries] : entries}
                        allParcels={allParcels}
                        productNames={productNames}
                        suggestions={suggestions}
                        chatHistory={chatHistory}
                        onDelete={(id) => handleDelete(id, true)}
                        onConfirm={handleConfirm}
                        onEdit={(e) => setActiveDraftId(e.id)}
                        onSave={async (id, data, date) => { await saveInlineEdit(id, data, date); invalidateLogbook(); }}
                        onSuggestionClick={setCommandInput}
                        processingPhase={processingPhase}
                        searchTerms={searchTerms}
                        resolvedAliases={resolvedAliases}
                        activeDraftId={activeDraft?.id}
                        agentState={agentState}
                    />
                </div>

                {/* Input Area - with padding for bottom sheet on mobile */}
                <div className={cn(
                    "p-4 border-t border-white/[0.06] bg-black/40",
                    hasActiveRegistration && "md:pb-4 pb-[100px]"
                )}>
                    <CommandBar
                        value={commandInput}
                        onValueChange={setCommandInput}
                        onSend={handleSend}
                        isProcessing={isProcessing || isPending}
                        activeMode={activeMode}
                        onModeChange={setActiveMode}
                    />
                </div>

                {/* Mobile Bottom Sheet */}
                <RegistrationBottomSheet
                    isVisible={hasActiveRegistration}
                    summary={bottomSheetSummary}
                    onConfirm={showGroupedPanel ? handleConfirmAllUnits : handleConfirmSave}
                    onCancel={showGroupedPanel ? handleCancelGroupedConfirmation : handleCancelConfirmation}
                >
                    {statusPanelContent}
                </RegistrationBottomSheet>
            </div>

            {/* DESKTOP ONLY: Right column (5 cols) - Status Panel */}
            <div className="hidden md:block md:col-span-5 h-full bg-white/[0.02] overflow-y-auto">
                {/* Status Header - Dynamic based on mode */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#0A0A0A] z-10 backdrop-blur-sm">
                    {activeMode === 'product_info' ? (
                        <div className="flex items-center gap-2">
                            <FlaskConical className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-medium text-white/80">Product Informatie</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-emerald-500" />
                            <span className="text-sm font-medium text-white/80">Actieve Registratie</span>
                        </div>
                    )}
                    {showStatusPanel && confirmationData?.validationResult?.status && (
                        <Badge
                            className={cn(
                                "text-[10px]",
                                confirmationData.validationResult.status === 'Akkoord'
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : confirmationData.validationResult.status === 'Waarschuwing'
                                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                        : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            )}
                        >
                            {confirmationData.validationResult.status}
                        </Badge>
                    )}
                </div>

                {/* Status Content - reuse shared content */}
                <div>
                    {statusPanelContent}
                </div>
            </div>
        </div>
    );
}

// Wrap in Suspense for useSearchParams() - required by Next.js 13+
export default function SmartInputPage() {
    return (
        <Suspense fallback={<DashboardSkeleton />}>
            <SmartInputContent />
        </Suspense>
    );
}
