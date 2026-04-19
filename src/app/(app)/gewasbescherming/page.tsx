'use client';

import * as React from 'react';
import { useCropProtectionEntries, useParcels, useInvalidateQueries, useCtgbProducts } from '@/hooks/use-data';
import { SpuitschriftEntry, ProductEntry } from '@/lib/types';
import type { SprayableParcel } from '@/lib/supabase-store';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Edit, Trash2, BookOpen, CalendarIcon, Plus, Search, X, Save, AlertTriangle, CheckCircle, Loader2, ChevronDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { deleteSpuitschriftEntry, updateSpuitschriftEntryAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { SpuitschriftSkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';
import { cn } from '@/lib/utils';
import { CropIcon } from '@/components/ui/crop-icon';
import { DosageField } from '@/components/spuitschrift/dosage-field';
import { NewSprayDialog } from '@/components/spuitschrift';
import { SectionHeader, SpotlightCard, GlowOrb } from '@/components/ui/premium';
import { AnimatePresence, motion } from 'framer-motion';

const formatDate = (date: Date) => {
    return format(date, 'dd MMMM yyyy \'om\' HH:mm', { locale: nl });
};

// ============================================
// Editable Products Component
// ============================================

interface EditableProductProps {
    product: ProductEntry;
    allProducts: ComboboxOption[];
    onUpdate: (product: ProductEntry) => void;
    onRemove: () => void;
}

function EditableProduct({ product, allProducts, onUpdate, onRemove }: EditableProductProps) {
    return (
        <div className="flex flex-wrap items-end gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/10">
            <div className="flex-1 min-w-[220px] space-y-2">
                <Label className="text-sm text-slate-300 font-medium">Middel</Label>
                <Combobox
                    options={allProducts}
                    value={product.product}
                    onValueChange={(value) => onUpdate({ ...product, product: value })}
                    placeholder="Selecteer middel"
                />
            </div>
            <div className="w-32 space-y-2">
                <Label className="text-sm text-slate-300 font-medium">Dosering</Label>
                <DosageField
                    value={product.dosage}
                    onChange={(dosage) => onUpdate({ ...product, dosage })}
                />
            </div>
            <div className="w-28 space-y-2">
                <Label className="text-sm text-slate-300 font-medium">Eenheid</Label>
                <Select value={product.unit} onValueChange={(value) => onUpdate({ ...product, unit: value })}>
                    <SelectTrigger className="h-11 text-base">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="L/ha">L/ha</SelectItem>
                        <SelectItem value="kg/ha">kg/ha</SelectItem>
                        <SelectItem value="ml/ha">ml/ha</SelectItem>
                        <SelectItem value="g/ha">g/ha</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button
                variant="ghost"
                size="lg"
                className="h-11 px-4 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onRemove}
            >
                <Trash2 className="h-5 w-5 mr-2" />
                Verwijder
            </Button>
        </div>
    );
}

// ============================================
// Editable Parcels Component
// ============================================

interface EditableParcelsProps {
    selectedIds: string[];
    allParcels: SprayableParcel[];
    onChange: (ids: string[]) => void;
}

function EditableParcels({ selectedIds, allParcels, onChange }: EditableParcelsProps) {
    const [open, setOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');

    const filteredParcels = React.useMemo(() =>
        allParcels.filter(parcel =>
            parcel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (parcel.crop && parcel.crop.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (parcel.variety && parcel.variety.toLowerCase().includes(searchTerm.toLowerCase()))
        ), [allParcels, searchTerm]
    );

    const selectedParcels = React.useMemo(() =>
        selectedIds.map(id => allParcels.find(p => p.id === id)).filter(Boolean) as SprayableParcel[],
        [selectedIds, allParcels]
    );

    const handleToggle = (parcelId: string, checked: boolean) => {
        const newSelection = checked
            ? [...selectedIds, parcelId]
            : selectedIds.filter(id => id !== parcelId);
        onChange(newSelection);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal h-auto min-h-[48px] py-3 text-base">
                    {selectedParcels.length === 0 ? (
                        <span className="text-muted-foreground">Selecteer percelen...</span>
                    ) : selectedParcels.length <= 2 ? (
                        <span className="truncate">{selectedParcels.map(p => p.name).join(', ')}</span>
                    ) : (
                        <span>{selectedParcels.length} percelen geselecteerd</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[380px] p-0" align="start">
                <div className="p-3 border-b">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder="Zoek perceel..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 h-11 text-base"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[300px]">
                    <div className="p-2 space-y-1">
                        {filteredParcels.length > 0 ? (
                            filteredParcels.map((parcel) => (
                                <div
                                    key={parcel.id}
                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer min-h-[52px]"
                                    onClick={() => handleToggle(parcel.id, !selectedIds.includes(parcel.id))}
                                >
                                    <Checkbox
                                        checked={selectedIds.includes(parcel.id)}
                                        onCheckedChange={(checked) => handleToggle(parcel.id, !!checked)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-5 w-5"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-base truncate">{parcel.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {parcel.crop} — {parcel.variety} · {parcel.area?.toFixed(2)} ha
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground p-6 text-base">
                                Geen percelen gevonden.
                            </p>
                        )}
                    </div>
                </ScrollArea>
                {selectedIds.length > 0 && (
                    <div className="p-3 border-t bg-muted/50">
                        <p className="text-sm text-muted-foreground">
                            {selectedIds.length} perceel{selectedIds.length !== 1 ? 'en' : ''} geselecteerd
                        </p>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

// ============================================
// Spuitschrift Entry Card (SpotlightCard variant)
// ============================================

interface SpuitschriftEntryCardProps {
    entry: SpuitschriftEntry;
    allParcels: SprayableParcel[];
    allProducts: string[];
    onAction: () => void;
}

function SpuitschriftEntryCard({ entry, allParcels, allProducts, onAction }: SpuitschriftEntryCardProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    const [editedDate, setEditedDate] = React.useState<Date>(entry.date);
    const [editedPlots, setEditedPlots] = React.useState<string[]>(entry.plots);
    const [editedProducts, setEditedProducts] = React.useState<ProductEntry[]>(entry.products);
    const [validationResult, setValidationResult] = React.useState<{
        message: string | null;
        errorCount: number;
        warningCount: number;
    } | null>(null);
    const { toast } = useToast();
    const { invalidateSpuitschrift, invalidateInventory } = useInvalidateQueries();

    const productOptions: ComboboxOption[] = allProducts.map(p => ({ value: p, label: p }));

    const selectedParcels = allParcels.filter(p => entry.plots.includes(p.id));
    const totalArea = selectedParcels.reduce((sum, p) => sum + (p.area || 0), 0);

    const productsWithTotals = entry.products.map(product => ({
        ...product,
        totalUsed: (product.dosage * totalArea).toFixed(3)
    }));

    const generateProductSummary = () => {
        if (!entry.products || entry.products.length === 0) return 'Geen middelen';
        return entry.products.map(p => `${p.product} (${p.dosage} ${p.unit}/ha)`).join(', ');
    };

    const handleStartEdit = () => {
        setEditedDate(entry.date);
        setEditedPlots([...entry.plots]);
        setEditedProducts(entry.products.map(p => ({ ...p })));
        setValidationResult(null);
        setIsEditing(true);
        setIsExpanded(true);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setValidationResult(null);
    };

    const handleProductUpdate = (index: number, updatedProduct: ProductEntry) => {
        const newProducts = [...editedProducts];
        newProducts[index] = updatedProduct;
        setEditedProducts(newProducts);
    };

    const handleProductRemove = (index: number) => {
        setEditedProducts(editedProducts.filter((_, i) => i !== index));
    };

    const handleProductAdd = () => {
        setEditedProducts([...editedProducts, { product: '', dosage: 0, unit: 'L/ha' }]);
    };

    const handleSave = async () => {
        if (editedProducts.length === 0) {
            toast({ variant: 'destructive', title: 'Fout', description: 'Voeg minimaal één middel toe.' });
            return;
        }
        if (editedPlots.length === 0) {
            toast({ variant: 'destructive', title: 'Fout', description: 'Selecteer minimaal één perceel.' });
            return;
        }

        setIsSaving(true);
        try {
            const result = await updateSpuitschriftEntryAction(entry.id, {
                date: editedDate,
                plots: editedPlots,
                products: editedProducts,
            });

            if (result.success) {
                toast({ title: 'Opgeslagen', description: 'De wijzigingen zijn opgeslagen.' });
                setIsEditing(false);
                setValidationResult(null);
                invalidateSpuitschrift();
                invalidateInventory();
                onAction();
            } else {
                setValidationResult({
                    message: result.validationMessage || result.message || 'Onbekende fout',
                    errorCount: result.errorCount || 0,
                    warningCount: result.warningCount || 0,
                });
                toast({
                    variant: 'destructive',
                    title: 'Kan niet opslaan',
                    description: result.message || 'Validatiefouten gevonden.',
                });
            }
        } catch {
            toast({
                variant: 'destructive',
                title: 'Fout',
                description: 'Er is een fout opgetreden bij het opslaan.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const editedSelectedParcels = allParcels.filter(p => editedPlots.includes(p.id));
    const editedTotalArea = editedSelectedParcels.reduce((sum, p) => sum + (p.area || 0), 0);

    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = React.useState(false);
    const [isDeleting, startDeleteTransition] = React.useTransition();

    const handleDirectDelete = () => {
        startDeleteTransition(async () => {
            await deleteSpuitschriftEntry(entry.id);
            toast({ title: 'Registratie verwijderd', description: 'De bespuiting is permanent verwijderd uit het spuitschrift.' });
            invalidateSpuitschrift();
            invalidateInventory();
            onAction();
        });
    };

    return (
        <SpotlightCard color="emerald" padding="p-0">
            {/* Summary row — always visible, click to toggle expand */}
            <button
                type="button"
                onClick={() => !isEditing && setIsExpanded(!isExpanded)}
                disabled={isEditing}
                className="w-full flex items-start gap-4 p-5 text-left focus-visible:outline-none focus-visible:bg-emerald-500/5 transition-colors"
            >
                <div className="shrink-0 pt-0.5">
                    <CropIcon parcels={selectedParcels} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1.5">
                        <p className="font-semibold text-lg text-white">{formatDate(entry.date)}</p>
                        {entry.registrationType === 'spreading' && (
                            <Badge variant="outline" className="text-xs px-2.5 py-1 bg-teal-500/10 border-teal-500/30 text-teal-400">
                                Strooien
                            </Badge>
                        )}
                    </div>
                    {entry.products && entry.products.length > 0 ? (
                        <div className="space-y-1" title={generateProductSummary()}>
                            {(isExpanded ? entry.products : entry.products.slice(0, 2)).map((p, i) => (
                                <div key={i} className="flex items-baseline gap-2 text-sm">
                                    <span className="w-1 h-1 rounded-full bg-emerald-500/40 shrink-0 translate-y-[-3px]" aria-hidden />
                                    <span className="text-slate-200 font-medium truncate">{p.product}</span>
                                    <span className="text-slate-500 tabular-nums shrink-0">{p.dosage} {p.unit}/ha</span>
                                </div>
                            ))}
                            {entry.products.length > 2 && !isExpanded && (
                                <div className="flex items-baseline gap-2 text-sm pt-0.5">
                                    <span className="w-1 h-1 shrink-0" aria-hidden />
                                    <span className="text-emerald-400/90 font-semibold">
                                        + {entry.products.length - 2} {entry.products.length - 2 === 1 ? 'ander middel' : 'andere middelen'}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 italic">Geen middelen</p>
                    )}
                </div>
                <div className="hidden sm:flex flex-col items-end text-right mr-2 pt-0.5 shrink-0">
                    <p className="text-sm text-slate-300 font-medium">
                        {selectedParcels.length} perce{selectedParcels.length !== 1 ? 'len' : 'el'}
                    </p>
                    <p className="text-sm text-slate-500">{totalArea.toFixed(2)} ha</p>
                </div>
                <ChevronDown
                    className={cn(
                        'h-5 w-5 text-slate-400 transition-transform duration-300 shrink-0 mt-1',
                        isExpanded && 'rotate-180',
                    )}
                />
            </button>

            {/* Action buttons row — directly visible when collapsed, on touch-friendly tap size */}
            {!isExpanded && !isEditing && (
                <div className="flex gap-2 px-5 pb-4 pt-0">
                    <Button
                        variant="outline"
                        size="lg"
                        className="h-11 flex-1 sm:flex-none text-base border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/10"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit();
                        }}
                    >
                        <Edit className="h-5 w-5 mr-2" />
                        Bewerken
                    </Button>
                    <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                        <Button
                            variant="outline"
                            size="lg"
                            className="h-11 flex-1 sm:flex-none text-base border-white/10 text-destructive hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDeleteAlertOpen(true);
                            }}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Trash2 className="h-5 w-5 mr-2" />}
                            Verwijderen
                        </Button>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Bespuiting verwijderen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Weet je zeker dat je de registratie van {formatDate(entry.date)} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="h-11 text-base">Annuleren</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDirectDelete} className="h-11 text-base bg-destructive hover:bg-destructive/90">
                                    Verwijderen
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}

            {/* Expanded content */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 pt-1 space-y-5 border-t border-white/[0.06]">
                            {isEditing ? (
                                // Edit Mode
                                <div className="space-y-5 pt-4">
                                    {validationResult && validationResult.message && (
                                        <div className={cn(
                                            'p-4 rounded-xl border text-sm',
                                            validationResult.errorCount > 0
                                                ? 'bg-destructive/10 border-destructive/50 text-destructive'
                                                : 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400',
                                        )}>
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                                                <div className="whitespace-pre-wrap text-base">{validationResult.message}</div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Label className="text-sm text-slate-300 font-medium">Datum & tijd</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className="w-full justify-start text-left font-normal h-12 text-base">
                                                    <CalendarIcon className="mr-2 h-5 w-5" />
                                                    {format(editedDate, 'dd MMMM yyyy \'om\' HH:mm', { locale: nl })}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={editedDate}
                                                    onSelect={(date) => date && setEditedDate(date)}
                                                    locale={nl}
                                                />
                                                <div className="p-3 border-t">
                                                    <Label className="text-sm text-muted-foreground">Tijd</Label>
                                                    <Input
                                                        type="time"
                                                        value={format(editedDate, 'HH:mm')}
                                                        onChange={(e) => {
                                                            const [hours, minutes] = e.target.value.split(':').map(Number);
                                                            const newDate = new Date(editedDate);
                                                            newDate.setHours(hours, minutes);
                                                            setEditedDate(newDate);
                                                        }}
                                                        className="mt-1 h-11 text-base"
                                                    />
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm text-slate-300 font-medium">Percelen ({editedTotalArea.toFixed(2)} ha totaal)</Label>
                                        <EditableParcels
                                            selectedIds={editedPlots}
                                            allParcels={allParcels}
                                            onChange={setEditedPlots}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-sm text-slate-300 font-medium">Middelen</Label>
                                            <Button variant="outline" size="sm" onClick={handleProductAdd} className="h-10 text-sm">
                                                <Plus className="h-4 w-4 mr-1" />
                                                Middel toevoegen
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            {editedProducts.map((product, index) => (
                                                <EditableProduct
                                                    key={index}
                                                    product={product}
                                                    allProducts={productOptions}
                                                    onUpdate={(updated) => handleProductUpdate(index, updated)}
                                                    onRemove={() => handleProductRemove(index)}
                                                />
                                            ))}
                                            {editedProducts.length === 0 && (
                                                <p className="text-sm text-muted-foreground text-center py-4">
                                                    Geen middelen. Klik op &quot;Middel toevoegen&quot; om een middel toe te voegen.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.06]">
                                        <Button variant="outline" size="lg" onClick={handleCancel} disabled={isSaving} className="h-11 text-base">
                                            <X className="h-5 w-5 mr-2" />
                                            Annuleren
                                        </Button>
                                        <Button size="lg" onClick={handleSave} disabled={isSaving} className="h-11 text-base">
                                            {isSaving ? (
                                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                            ) : (
                                                <Save className="h-5 w-5 mr-2" />
                                            )}
                                            Opslaan
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                // View Mode
                                <div className="pt-4 space-y-5">
                                    <div>
                                        <h4 className="font-semibold text-base mb-2 text-white">Percelen ({totalArea.toFixed(2)} ha totaal)</h4>
                                        <div className="text-sm text-slate-400 space-y-1.5">
                                            {selectedParcels.map(p => (
                                                <div key={p.id} className="flex justify-between gap-4">
                                                    <span>{p.name} <span className="text-slate-500">({p.variety})</span></span>
                                                    <span className="tabular-nums shrink-0">{p.area ? p.area.toFixed(2) : '0.00'} ha</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-base mb-2 text-white">Middelen</h4>
                                        <div className="rounded-xl border border-white/10 overflow-hidden">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="border-white/10 hover:bg-transparent">
                                                        <TableHead className="text-sm">Middel</TableHead>
                                                        <TableHead className="text-sm text-right">Dosering per ha</TableHead>
                                                        <TableHead className="text-sm text-right">Totaal Gebruikt</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {productsWithTotals.map((p, index) => (
                                                        <TableRow key={index} className="border-white/[0.06]">
                                                            <TableCell className="font-medium text-base">
                                                                <span>{p.product}</span>
                                                                {p.source === 'fertilizer' && (
                                                                    <Badge variant="outline" className="ml-2 text-xs px-2 py-0.5 bg-teal-500/10 border-teal-500/30 text-teal-400">
                                                                        meststof
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right text-base tabular-nums">{p.dosage} {p.unit}/ha</TableCell>
                                                            <TableCell className="text-right text-base tabular-nums">{p.totalUsed} {p.unit}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                    {entry.validationMessage && (
                                        <div className={cn(
                                            'p-4 rounded-xl border text-base',
                                            entry.status === 'Waarschuwing'
                                                ? 'bg-yellow-500/10 border-yellow-500/50'
                                                : 'bg-green-500/10 border-green-500/50',
                                        )}>
                                            <div className="flex items-start gap-2">
                                                {entry.status === 'Waarschuwing' ? (
                                                    <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-yellow-400" />
                                                ) : (
                                                    <CheckCircle className="h-5 w-5 mt-0.5 shrink-0 text-green-400" />
                                                )}
                                                <div className="whitespace-pre-wrap text-slate-300">{entry.validationMessage}</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Expanded action row */}
                                    <div className="flex gap-2 pt-2">
                                        <Button
                                            variant="outline"
                                            size="lg"
                                            className="h-11 flex-1 sm:flex-none text-base border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/10"
                                            onClick={handleStartEdit}
                                        >
                                            <Edit className="h-5 w-5 mr-2" />
                                            Bewerken
                                        </Button>
                                        <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                                            <Button
                                                variant="outline"
                                                size="lg"
                                                className="h-11 flex-1 sm:flex-none text-base border-white/10 text-destructive hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10"
                                                onClick={() => setIsDeleteAlertOpen(true)}
                                                disabled={isDeleting}
                                            >
                                                {isDeleting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Trash2 className="h-5 w-5 mr-2" />}
                                                Verwijderen
                                            </Button>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Bespuiting verwijderen?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Weet je zeker dat je de registratie van {formatDate(entry.date)} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel className="h-11 text-base">Annuleren</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleDirectDelete} className="h-11 text-base bg-destructive hover:bg-destructive/90">
                                                        Verwijderen
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </SpotlightCard>
    );
}

// ============================================
// Chronological View Component
// ============================================

function ChronologicalView({ entries, allParcels, allProducts, onAction }: {
    entries: SpuitschriftEntry[];
    allParcels: SprayableParcel[];
    allProducts: string[];
    onAction: () => void;
}) {
    return (
        <div className="space-y-3">
            {entries.map(entry => (
                <SpuitschriftEntryCard
                    key={entry.id}
                    entry={entry}
                    allParcels={allParcels}
                    allProducts={allProducts}
                    onAction={onAction}
                />
            ))}
        </div>
    );
}

// ============================================
// Parcel History View Component
// ============================================

function ParcelHistoryView({ allParcels, entries }: { allParcels: SprayableParcel[], entries: SpuitschriftEntry[] }) {
    const [selectedParcelId, setSelectedParcelId] = React.useState<string | null>(null);

    const history = React.useMemo(() => {
        if (!selectedParcelId) return [];

        return entries
            .filter(entry => entry.plots.includes(selectedParcelId))
            .flatMap(entry =>
                entry.products.map(product => ({
                    id: `${entry.id}-${product.product}`,
                    date: entry.date,
                    product: product.product,
                    dosage: product.dosage,
                    unit: product.unit,
                }))
            )
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedParcelId, entries]);

    return (
        <div className="space-y-5">
            <Select onValueChange={setSelectedParcelId}>
                <SelectTrigger className="w-full md:w-[360px] h-12 text-base">
                    <SelectValue placeholder="Kies een perceel om de historie te zien" />
                </SelectTrigger>
                <SelectContent>
                    {allParcels.map(parcel => (
                        <SelectItem key={parcel.id} value={parcel.id} className="text-base py-3">
                            {parcel.name} ({parcel.variety})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {!selectedParcelId && (
                <div className="text-center text-muted-foreground py-12 text-base">
                    <p>Kies een perceel om de historie te bekijken.</p>
                </div>
            )}

            {selectedParcelId && history.length === 0 && (
                <div className="text-center text-muted-foreground py-12 text-base">
                    <p>Geen bespuitingen gevonden voor dit perceel.</p>
                </div>
            )}

            {history.length > 0 && (
                <SpotlightCard color="emerald" padding="p-0" disableSpotlight>
                    <div className="rounded-2xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/10 hover:bg-transparent">
                                    <TableHead className="text-sm px-5">Datum</TableHead>
                                    <TableHead className="text-sm">Middel</TableHead>
                                    <TableHead className="text-sm text-right px-5">Dosering</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.map(item => (
                                    <TableRow key={item.id} className="border-white/[0.06]">
                                        <TableCell className="text-base px-5">{format(item.date, 'dd-MM-yyyy')}</TableCell>
                                        <TableCell className="font-medium text-base">{item.product}</TableCell>
                                        <TableCell className="text-right text-base tabular-nums px-5">{item.dosage} {item.unit}/ha</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </SpotlightCard>
            )}
        </div>
    );
}

// ============================================
// Main Page Component
// ============================================

export default function SpuitschriftPage() {
    const {
        data: entries = [],
        isLoading: isLoadingEntries,
        isError: isErrorEntries,
        error: errorEntries,
        refetch: refetchEntries
    } = useCropProtectionEntries();

    const {
        data: allParcels = [],
        isLoading: isLoadingParcels,
        isError: isErrorParcels,
        error: errorParcels,
        refetch: refetchParcels
    } = useParcels();

    const {
        data: ctgbProducts = [],
        isLoading: isLoadingProducts,
    } = useCtgbProducts();

    const isLoading = isLoadingEntries || isLoadingParcels || isLoadingProducts;
    const isError = isErrorEntries || isErrorParcels;

    const [isNewSprayDialogOpen, setIsNewSprayDialogOpen] = React.useState(false);

    const allProductNames = React.useMemo(() =>
        [...new Set(ctgbProducts.map(p => p.naam).filter(Boolean))] as string[],
        [ctgbProducts]
    );

    const handleNewSpraySuccess = () => {
        refetchEntries();
    };

    const currentYear = new Date().getFullYear();
    const entriesThisYear = entries.filter(e => new Date(e.date).getFullYear() === currentYear).length;

    const header = (
        <SectionHeader
            eyebrow="Gewasbescherming"
            title="Spuitschrift"
            titleGradient={entries.length > 0 ? `${entriesThisYear} in ${currentYear}` : undefined}
            description="Alle definitief geregistreerde bespuitingen — chronologisch of per perceel."
            color="emerald"
            action={
                <Button
                    size="lg"
                    onClick={() => setIsNewSprayDialogOpen(true)}
                    className="h-12 px-6 text-base font-semibold"
                >
                    <Plus className="h-5 w-5 mr-2" />
                    Nieuwe Bespuiting
                </Button>
            }
        />
    );

    if (isLoading) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="emerald" position="top-left" size="w-[400px] h-[300px]" blur="blur-[140px]" opacity={0.06} />
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <SpuitschriftSkeleton />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="emerald" position="top-left" size="w-[400px] h-[300px]" blur="blur-[140px]" opacity={0.06} />
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <ErrorState
                            title="Kon spuitschrift niet laden"
                            message={errorEntries?.message || errorParcels?.message || 'Er is een fout opgetreden.'}
                            onRetry={() => {
                                refetchEntries();
                                refetchParcels();
                            }}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }

    const handleAction = () => {
        refetchEntries();
    };

    return (
        <>
            <div className="relative space-y-8">
                {/* Ambient background orbs */}
                <GlowOrb color="emerald" position="top-left" size="w-[500px] h-[320px]" blur="blur-[140px]" opacity={0.07} />
                <GlowOrb color="lime" position="top-right" size="w-[360px] h-[260px]" blur="blur-[140px]" opacity={0.04} />

                {header}

                {entries.length === 0 && allParcels.length === 0 ? (
                    <SpotlightCard color="emerald">
                        <EmptyState
                            icon={BookOpen}
                            title="Geen registraties gevonden"
                            description="Er zijn nog geen bevestigde bespuitingen of percelen gevonden. Voer bespuitingen in via de Slimme Invoer of via Nieuwe Bespuiting."
                        />
                    </SpotlightCard>
                ) : (
                    <Tabs defaultValue="chronological" className="space-y-6">
                        <TabsList className="h-12 p-1 bg-white/[0.04] border border-white/10">
                            <TabsTrigger value="chronological" className="h-10 px-6 text-base data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400">
                                Chronologisch
                            </TabsTrigger>
                            <TabsTrigger value="by_parcel" className="h-10 px-6 text-base data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400">
                                Per perceel
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="chronological" className="mt-0">
                            {entries.length > 0 ? (
                                <ChronologicalView
                                    entries={entries}
                                    allParcels={allParcels}
                                    allProducts={allProductNames}
                                    onAction={handleAction}
                                />
                            ) : (
                                <SpotlightCard color="emerald">
                                    <EmptyState
                                        icon={BookOpen}
                                        title="Geen registraties"
                                        description="Er zijn nog geen bevestigde bespuitingen in het logboek gevonden."
                                    />
                                </SpotlightCard>
                            )}
                        </TabsContent>
                        <TabsContent value="by_parcel" className="mt-0">
                            <ParcelHistoryView allParcels={allParcels} entries={entries} />
                        </TabsContent>
                    </Tabs>
                )}
            </div>

            <NewSprayDialog
                open={isNewSprayDialogOpen}
                onOpenChange={setIsNewSprayDialogOpen}
                parcels={allParcels}
                onSuccess={handleNewSpraySuccess}
            />
        </>
    );
}
