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
    Layout,
    Zap,
    MapPin,
    Package,
    Calendar as CalendarIcon,
    ChevronRight,
    Loader2,
    X,
    Plus,
    Save,
    RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogbookEntry, Parcel, LogStatus, ProductEntry } from '@/lib/types';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';

interface SmartResultCardProps {
    entry: LogbookEntry;
    allParcels: Parcel[];
    productNames?: string[];
    onDelete: (id: string) => void;
    onEdit: (entry: LogbookEntry) => void;
    onConfirm: (id: string) => void;
    onSave: (id: string, parsedData: any, date: string) => void;
    isLoading?: boolean;
    isStreaming?: boolean;
    isActiveDraft?: boolean;
}

const statusConfig: Record<LogStatus, { color: string, icon: React.ElementType, label: string, glow: string }> = {
    'Nieuw': { color: 'text-blue-400 border-blue-500/30 bg-blue-500/10', icon: Zap, label: 'Nieuw', glow: 'shadow-[0_0_15px_-3px_rgba(96,165,250,0.3)]' },
    'Analyseren...': { color: 'text-amber-400 border-amber-500/30 bg-amber-500/10', icon: Loader2, label: 'Analyseren...', glow: 'shadow-[0_0_15px_-3px_rgba(251,191,36,0.3)]' },
    'Te Controleren': { color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10', icon: AlertTriangle, label: 'Te Controleren', glow: 'shadow-[0_0_15px_-3px_rgba(250,204,21,0.3)]' },
    'Waarschuwing': { color: 'text-orange-400 border-orange-500/30 bg-orange-500/10', icon: AlertTriangle, label: 'Waarschuwing', glow: 'shadow-[0_0_15px_-3px_rgba(251,146,60,0.3)]' },
    'Akkoord': { color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', icon: CheckCircle, label: 'Akkoord', glow: 'shadow-[0_0_15px_-3px_rgba(52,211,153,0.3)]' },
    'Fout': { color: 'text-rose-400 border-rose-500/30 bg-rose-500/10', icon: AlertTriangle, label: 'Fout', glow: 'shadow-[0_0_15px_-3px_rgba(244,63,94,0.3)]' },
    'Afgekeurd': { color: 'text-red-500 border-red-500/30 bg-red-500/10', icon: AlertTriangle, label: 'Afgekeurd', glow: 'shadow-[0_0_15px_-3px_rgba(239,68,68,0.3)]' },
};

export function SmartResultCard({ entry, allParcels, productNames = [], onDelete, onEdit, onConfirm, onSave, isLoading, isStreaming = false, isActiveDraft = false }: SmartResultCardProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [editedData, setEditedData] = React.useState<{
        date: Date;
        plots: string[];
        products: ProductEntry[];
    }>({
        date: new Date(entry.date),
        plots: entry.parsedData?.plots || [],
        products: entry.parsedData?.products || [],
    });

    const [isSaving, setIsSaving] = React.useState(false);

    // Update local state if entry changes
    React.useEffect(() => {
        if (!isEditing) {
            setEditedData({
                date: new Date(entry.date),
                plots: entry.parsedData?.plots || [],
                products: entry.parsedData?.products || [],
            });
        }
    }, [entry, isEditing]);

    const config = statusConfig[entry.status] || statusConfig['Fout'];
    const StatusIcon = config.icon;

    const selectedParcels = allParcels.filter(p => editedData.plots.includes(p.id));
    const availableParcels = allParcels.filter(p => !editedData.plots.includes(p.id));

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(entry.id, { plots: editedData.plots, products: editedData.products }, editedData.date.toISOString());
            setIsEditing(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditedData({
            date: new Date(entry.date),
            plots: entry.parsedData?.plots || [],
            products: entry.parsedData?.products || [],
        });
    };

    const removeParcel = (id: string) => {
        setEditedData(prev => ({ ...prev, plots: prev.plots.filter(p => p !== id) }));
    };

    const addParcel = (id: string) => {
        setEditedData(prev => ({ ...prev, plots: [...prev.plots, id] }));
    };

    const removeProduct = (index: number) => {
        setEditedData(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
    };

    const updateProduct = (index: number, updates: Partial<ProductEntry>) => {
        setEditedData(prev => ({
            ...prev,
            products: prev.products.map((p, i) => i === index ? { ...p, ...updates } : p)
        }));
    };

    const [newProductName, setNewProductName] = React.useState("");
    const [newProductDosage, setNewProductDosage] = React.useState("");

    const handleAddNewProduct = () => {
        if (newProductName && newProductDosage) {
            setEditedData(prev => ({
                ...prev,
                products: [...prev.products, { product: newProductName, dosage: parseFloat(newProductDosage), unit: 'L' }]
            }));
            setNewProductName("");
            setNewProductDosage("");
        }
    };

    return (
        <Card className={cn(
            "group relative overflow-hidden bg-card/30 backdrop-blur-md border border-white/5 transition-all duration-300 hover:border-white/10 hover:bg-card/40",
            config.glow,
            isEditing && "ring-1 ring-primary/30 bg-card/50",
            isActiveDraft && !isEditing && "ring-2 ring-primary/50 border-primary/30"
        )}>
            {/* Active Draft Indicator */}
            {isActiveDraft && !isEditing && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0" />
            )}
            {/* Animated Gradient Background */}
            <div className={cn(
                "absolute inset-0 opacity-5 bg-gradient-to-br from-transparent via-transparent to-white pointer-events-none transition-opacity group-hover:opacity-10"
            )} />

            <CardContent className="p-5 flex flex-col gap-4">
                {/* Header: Status and Date */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn("p-1.5 rounded-lg border", config.color)}>
                            <StatusIcon className={cn("h-4 w-4", entry.status === 'Analyseren...' && "animate-spin")} />
                        </div>
                        <span className={cn("font-bold text-xs uppercase tracking-widest", config.color)}>
                            {config.label}
                        </span>
                    </div>

                    {isEditing ? (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-primary font-bold uppercase tracking-widest bg-primary/10 border border-primary/20 hover:bg-primary/20 rounded-lg px-2">
                                    <CalendarIcon className="h-3 w-3 mr-1.5" />
                                    {format(editedData.date, 'dd MMM HH:mm', { locale: nl })}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-card/90 border-white/10 backdrop-blur-xl" align="end">
                                <Calendar
                                    mode="single"
                                    selected={editedData.date}
                                    onSelect={(date) => date && setEditedData(prev => ({ ...prev, date }))}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                            <CalendarIcon className="h-3 w-3" />
                            {format(new Date(entry.date), 'dd MMM HH:mm')}
                        </div>
                    )}
                </div>

                {/* Content Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Parcels Section */}
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-70">
                            <MapPin className="h-3.5 w-3.5" />
                            Percelen
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {selectedParcels.map(p => (
                                <Badge key={p.id} variant="outline" className={cn(
                                    "text-[10px] px-2 py-0.5 bg-white/5 border-white/10 text-white/80 font-bold tracking-wide rounded-lg flex items-center gap-1.5 transition-all",
                                    isEditing && "hover:bg-rose-500/20 hover:border-rose-500/30 hover:text-rose-400 pr-1 pl-2"
                                )}>
                                    {p.name}
                                    {isEditing && (
                                        <button onClick={() => removeParcel(p.id)} className="p-0.5 hover:bg-white/10 rounded-md transition-colors">
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </Badge>
                            ))}
                            {isEditing && (
                                <Combobox
                                    options={availableParcels.map(p => ({ value: p.id, label: p.name }))}
                                    onValueChange={addParcel}
                                    placeholder="+"
                                    className="h-6 w-8 min-w-8 p-0 px-0 flex items-center justify-center bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 rounded-lg"
                                />
                            )}
                            {selectedParcels.length === 0 && !isEditing && (
                                <span className="text-xs text-muted-foreground italic">Geen percelen</span>
                            )}
                        </div>
                    </div>

                    {/* Products Section */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-70">
                            <Package className="h-3.5 w-3.5" />
                            Middelen
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                            {editedData.products.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 group/row">
                                    {isEditing && (
                                        <button onClick={() => removeProduct(i)} className="text-rose-400/50 hover:text-rose-400 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black tracking-tight text-white/90 uppercase">{p.product}</span>
                                        {p.source === 'fertilizer' && (
                                            <span className="inline-flex items-center px-1 py-0 rounded text-[8px] font-semibold uppercase tracking-wider bg-teal-500/15 text-teal-400 border border-teal-500/25">
                                                meststof
                                            </span>
                                        )}
                                        {isEditing ? (
                                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-md px-1.5 overflow-hidden">
                                                <input
                                                    type="number"
                                                    value={p.dosage}
                                                    onChange={(e) => updateProduct(i, { dosage: parseFloat(e.target.value) || 0 })}
                                                    className="w-12 bg-transparent border-none text-[11px] font-mono font-bold text-primary focus:ring-0 p-0 text-right appearance-none"
                                                    step="0.01"
                                                />
                                                <span className="text-[10px] font-bold text-muted-foreground pb-0.5">{p.unit}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs font-mono font-bold text-primary/80">{p.dosage} {p.unit}</span>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {isEditing && (
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5 w-full justify-end">
                                    <Combobox
                                        options={productNames.map(name => ({ value: name, label: name }))}
                                        value={newProductName}
                                        onValueChange={setNewProductName}
                                        placeholder="Middel..."
                                        className="h-7 text-[10px] bg-white/5 border-white/10 w-32"
                                    />
                                    <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-md px-1.5 overflow-hidden h-7">
                                        <input
                                            type="number"
                                            placeholder="0.0"
                                            value={newProductDosage}
                                            onChange={(e) => setNewProductDosage(e.target.value)}
                                            className="w-10 bg-transparent border-none text-[11px] font-mono font-bold text-primary focus:ring-0 p-0 text-right"
                                        />
                                        <span className="text-[10px] font-bold text-muted-foreground">L</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                                        onClick={handleAddNewProduct}
                                        disabled={!newProductName || !newProductDosage}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )}

                            {editedData.products.length === 0 && !isEditing && (
                                <span className="text-xs text-muted-foreground italic">Geen middelen</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Validation Messages (Read Only) */}
                {!isEditing && entry.validationMessage && (
                    <div className={cn(
                        "p-3 rounded-lg border text-xs flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-300",
                        entry.status === 'Akkoord' ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400/90" : "bg-rose-500/5 border-rose-500/20 text-rose-400/90"
                    )}>
                        {entry.validationMessage.split('\n').filter(l => l.trim()).map((line, i) => (
                            <div key={i} className="flex gap-2 items-start">
                                <span className="mt-0.5">•</span>
                                <span>{line.replace(/^[❌⚠️ℹ️]\s*/, '')}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    {isEditing ? (
                        <div className="flex items-center gap-2 w-full justify-between">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-muted-foreground hover:text-white"
                                onClick={handleCancel}
                                disabled={isSaving}
                            >
                                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                Annuleren
                            </Button>
                            <Button
                                size="sm"
                                className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-4 rounded-full"
                                onClick={handleSave}
                                disabled={isSaving}
                            >
                                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                                Opslaan
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-muted-foreground hover:text-white hover:bg-white/5"
                                    onClick={() => setIsEditing(true)}
                                    disabled={isLoading || isStreaming}
                                >
                                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                                    Bewerk
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-rose-400/70 hover:text-rose-400 hover:bg-rose-400/10"
                                    onClick={() => onDelete(entry.id)}
                                    disabled={isLoading || isStreaming}
                                >
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                    {isStreaming ? 'Annuleer' : 'Verwijder'}
                                </Button>
                            </div>

                            {entry.status !== 'Akkoord' && entry.status !== 'Analyseren...' && !isStreaming && (
                                <Button
                                    size="sm"
                                    className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 rounded-full group/btn"
                                    onClick={() => onConfirm(entry.id)}
                                    disabled={isLoading}
                                >
                                    Bevestig
                                    <ChevronRight className="h-4 w-4 ml-1 transition-transform group-hover/btn:translate-x-0.5" />
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
