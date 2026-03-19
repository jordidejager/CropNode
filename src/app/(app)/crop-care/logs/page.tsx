'use client';

import * as React from 'react';
import { useCropProtectionEntries, useParcels, useInvalidateQueries, useCtgbProducts } from '@/hooks/use-data';
import { SpuitschriftEntry, ProductEntry } from '@/lib/types';
import type { SprayableParcel } from '@/lib/supabase-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { MoreHorizontal, Edit, Trash2, BookOpen, CalendarIcon, Plus, Search, X, Save, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { deleteSpuitschriftEntry, updateSpuitschriftEntryAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { SpuitschriftSkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';
import { cn } from '@/lib/utils';
import { CropIcon } from '@/components/ui/crop-icon';
import { NewSprayDialog } from '@/components/spuitschrift';

const formatDate = (date: Date) => {
    return format(date, 'dd MMMM yyyy HH:mm', { locale: nl });
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
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border">
            <div className="flex-1 min-w-[200px]">
                <Label className="text-xs text-muted-foreground">Middel</Label>
                <Combobox
                    options={allProducts}
                    value={product.product}
                    onValueChange={(value) => onUpdate({ ...product, product: value })}
                    placeholder="Selecteer middel"
                />
            </div>
            <div className="w-24">
                <Label className="text-xs text-muted-foreground">Dosering</Label>
                <Input
                    type="number"
                    value={product.dosage}
                    onChange={(e) => onUpdate({ ...product, dosage: parseFloat(e.target.value) || 0 })}
                    step="0.1"
                    min="0"
                    className="h-9"
                />
            </div>
            <div className="w-24">
                <Label className="text-xs text-muted-foreground">Eenheid</Label>
                <Select value={product.unit} onValueChange={(value) => onUpdate({ ...product, unit: value })}>
                    <SelectTrigger className="h-9">
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
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 mt-5"
                onClick={onRemove}
            >
                <Trash2 className="h-4 w-4" />
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
                <Button variant="outline" className="w-full justify-start text-left font-normal h-auto min-h-[40px] py-2">
                    {selectedParcels.length === 0 ? (
                        <span className="text-muted-foreground">Selecteer percelen...</span>
                    ) : selectedParcels.length <= 2 ? (
                        <span className="truncate">{selectedParcels.map(p => p.name).join(', ')}</span>
                    ) : (
                        <span>{selectedParcels.length} percelen geselecteerd</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0" align="start">
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Zoek perceel..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 h-8"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[250px]">
                    <div className="p-2 space-y-1">
                        {filteredParcels.length > 0 ? (
                            filteredParcels.map((parcel) => (
                                <div
                                    key={parcel.id}
                                    className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                                    onClick={() => handleToggle(parcel.id, !selectedIds.includes(parcel.id))}
                                >
                                    <Checkbox
                                        checked={selectedIds.includes(parcel.id)}
                                        onCheckedChange={(checked) => handleToggle(parcel.id, !!checked)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{parcel.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {parcel.crop} - {parcel.variety} • {parcel.area?.toFixed(2)} ha
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground p-4 text-sm">
                                Geen percelen gevonden.
                            </p>
                        )}
                    </div>
                </ScrollArea>
                {selectedIds.length > 0 && (
                    <div className="p-2 border-t bg-muted/50">
                        <p className="text-xs text-muted-foreground">
                            {selectedIds.length} perceel{selectedIds.length !== 1 ? 'en' : ''} geselecteerd
                        </p>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

// ============================================
// Actions Menu Component
// ============================================

function ActionsMenu({ entry, onEdit, onAction }: { entry: SpuitschriftEntry; onEdit: () => void; onAction: () => void }) {
    const [isPending, startTransition] = React.useTransition();
    const [isAlertOpen, setIsAlertOpen] = React.useState(false);
    const { toast } = useToast();
    const { invalidateSpuitschrift, invalidateInventory } = useInvalidateQueries();

    const handleDelete = () => {
        startTransition(async () => {
            await deleteSpuitschriftEntry(entry.id);
            toast({ title: 'Regel verwijderd', description: 'De registratie is permanent verwijderd.' });
            invalidateSpuitschrift();
            invalidateInventory();
            onAction();
        });
    };

    return (
        <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0" disabled={isPending}>
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onEdit}>
                        <Edit className="mr-2 h-4 w-4" />
                        Bewerken
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(e) => {
                            e.preventDefault();
                            setIsAlertOpen(true);
                        }}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Verwijderen
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Deze actie kan niet ongedaan worden gemaakt. Dit zal de registratie permanent uit het spuitschrift verwijderen.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                        Verwijderen
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ============================================
// Spuitschrift Entry Card Component
// ============================================

interface SpuitschriftEntryCardProps {
    entry: SpuitschriftEntry;
    allParcels: SprayableParcel[];
    allProducts: string[];
    onAction: () => void;
}

function SpuitschriftEntryCard({ entry, allParcels, allProducts, onAction }: SpuitschriftEntryCardProps) {
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
        if (!entry.products || entry.products.length === 0) {
            return 'Geen middelen';
        }
        return entry.products.map(p => `${p.product} (${p.dosage} ${p.unit}/ha)`).join(', ');
    };

    const handleStartEdit = () => {
        setEditedDate(entry.date);
        setEditedPlots([...entry.plots]);
        setEditedProducts(entry.products.map(p => ({ ...p })));
        setValidationResult(null);
        setIsEditing(true);
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
        } catch (error) {
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

    return (
        <AccordionItem value={entry.id}>
            <AccordionTrigger>
                <div className="flex justify-between items-center w-full pr-4">
                    <div className="flex items-center gap-2 text-left">
                        <CropIcon parcels={selectedParcels} />
                        <div>
                            <p className="font-semibold">{formatDate(entry.date)}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-xs md:max-w-md" title={generateProductSummary()}>
                                {generateProductSummary()}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {entry.registrationType === 'spreading' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400">
                                Strooien
                            </Badge>
                        )}
                        <div className="text-right hidden sm:block">
                            <p className="text-sm">{selectedParcels.length} perce{selectedParcels.length !== 1 ? 'len' : 'el'}</p>
                            <p className="text-sm text-muted-foreground">{totalArea.toFixed(4)} ha</p>
                        </div>
                    </div>
                </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pt-2 pb-4 space-y-4 bg-muted/50 rounded-b-md">
                {isEditing ? (
                    // Edit Mode
                    <div className="space-y-6">
                        {/* Validation Messages */}
                        {validationResult && validationResult.message && (
                            <div className={cn(
                                "p-3 rounded-lg border text-sm",
                                validationResult.errorCount > 0 ? "bg-destructive/10 border-destructive/50 text-destructive" : "bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400"
                            )}>
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <div className="whitespace-pre-wrap">{validationResult.message}</div>
                                </div>
                            </div>
                        )}

                        {/* Date Picker */}
                        <div className="space-y-2">
                            <Label>Datum & tijd</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {format(editedDate, 'dd MMMM yyyy HH:mm', { locale: nl })}
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
                                        <Label className="text-xs text-muted-foreground">Tijd</Label>
                                        <Input
                                            type="time"
                                            value={format(editedDate, 'HH:mm')}
                                            onChange={(e) => {
                                                const [hours, minutes] = e.target.value.split(':').map(Number);
                                                const newDate = new Date(editedDate);
                                                newDate.setHours(hours, minutes);
                                                setEditedDate(newDate);
                                            }}
                                            className="mt-1"
                                        />
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Parcels */}
                        <div className="space-y-2">
                            <Label>Percelen ({editedTotalArea.toFixed(4)} ha totaal)</Label>
                            <EditableParcels
                                selectedIds={editedPlots}
                                allParcels={allParcels}
                                onChange={setEditedPlots}
                            />
                        </div>

                        {/* Products */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label>Middelen</Label>
                                <Button variant="outline" size="sm" onClick={handleProductAdd}>
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
                                        Geen middelen. Klik op "Middel toevoegen" om een middel toe te voegen.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                                <X className="h-4 w-4 mr-2" />
                                Annuleren
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4 mr-2" />
                                )}
                                Opslaan
                            </Button>
                        </div>
                    </div>
                ) : (
                    // View Mode
                    <>
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-semibold mb-2">Percelen ({totalArea.toFixed(4)} ha totaal)</h4>
                                <div className="text-sm text-muted-foreground space-y-1">
                                    {selectedParcels.map(p => (
                                        <div key={p.id} className="flex justify-between">
                                            <span>{p.name} <span className="text-xs">({p.variety})</span></span>
                                            <span className="ml-4">{p.area ? p.area.toFixed(4) : '0.0000'} ha</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <ActionsMenu entry={entry} onEdit={handleStartEdit} onAction={onAction} />
                        </div>
                        <div>
                            <h4 className="font-semibold mb-2">Middelen</h4>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Middel</TableHead>
                                            <TableHead className="text-right">Dosering per ha</TableHead>
                                            <TableHead className="text-right">Totaal Gebruikt</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {productsWithTotals.map((p, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">
                                                    <span>{p.product}</span>
                                                    {p.source === 'fertilizer' && (
                                                        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400">
                                                            meststof
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">{p.dosage} {p.unit}/ha</TableCell>
                                                <TableCell className="text-right">{p.totalUsed} {p.unit}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                        {entry.validationMessage && (
                            <div className={cn(
                                "p-3 rounded-lg border text-sm",
                                entry.status === 'Waarschuwing' ? "bg-yellow-500/10 border-yellow-500/50" : "bg-green-500/10 border-green-500/50"
                            )}>
                                <div className="flex items-start gap-2">
                                    {entry.status === 'Waarschuwing' ? (
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                                    )}
                                    <div className="whitespace-pre-wrap text-muted-foreground">{entry.validationMessage}</div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </AccordionContent>
        </AccordionItem>
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
        <Accordion type="single" collapsible className="w-full">
            {entries.map(entry => (
                <SpuitschriftEntryCard
                    key={entry.id}
                    entry={entry}
                    allParcels={allParcels}
                    allProducts={allProducts}
                    onAction={onAction}
                />
            ))}
        </Accordion>
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
        <div className="space-y-4">
            <Select onValueChange={setSelectedParcelId}>
                <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="Kies een perceel om de historie te zien" />
                </SelectTrigger>
                <SelectContent>
                    {allParcels.map(parcel => (
                        <SelectItem key={parcel.id} value={parcel.id}>
                            {parcel.name} ({parcel.variety})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {!selectedParcelId && (
                <div className="text-center text-muted-foreground py-10">
                    <p>Kies een perceel om de historie te bekijken.</p>
                </div>
            )}

            {selectedParcelId && history.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    <p>Geen bespuitingen gevonden voor dit perceel.</p>
                </div>
            )}

            {history.length > 0 && (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datum</TableHead>
                                <TableHead>Middel</TableHead>
                                <TableHead className="text-right">Dosering</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell>{format(item.date, 'dd-MM-yyyy')}</TableCell>
                                    <TableCell className="font-medium">{item.product}</TableCell>
                                    <TableCell className="text-right">{item.dosage} {item.unit}/ha</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
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

    // State for new spray dialog
    const [isNewSprayDialogOpen, setIsNewSprayDialogOpen] = React.useState(false);

    const allProductNames = React.useMemo(() =>
        [...new Set(ctgbProducts.map(p => p.naam).filter(Boolean))] as string[],
        [ctgbProducts]
    );

    const handleNewSpraySuccess = () => {
        refetchEntries();
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Spuitschrift</CardTitle>
                    <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen.</CardDescription>
                </CardHeader>
                <CardContent>
                    <SpuitschriftSkeleton />
                </CardContent>
            </Card>
        );
    }

    if (isError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Spuitschrift</CardTitle>
                    <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen.</CardDescription>
                </CardHeader>
                <CardContent>
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
        );
    }

    if (entries.length === 0 && allParcels.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Spuitschrift</CardTitle>
                    <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen.</CardDescription>
                </CardHeader>
                <CardContent>
                    <EmptyState
                        icon={BookOpen}
                        title="Geen registraties gevonden"
                        description="Er zijn nog geen bevestigde bespuitingen of percelen gevonden. Voer bespuitingen in via de Slimme Invoer."
                    />
                </CardContent>
            </Card>
        );
    }

    const handleAction = () => {
        refetchEntries();
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <CardTitle>Spuitschrift</CardTitle>
                            <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen, chronologisch of per perceel.</CardDescription>
                        </div>
                        <Button onClick={() => setIsNewSprayDialogOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nieuwe Bespuiting
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="chronological">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="chronological">Chronologisch</TabsTrigger>
                            <TabsTrigger value="by_parcel">Per Perceel</TabsTrigger>
                        </TabsList>
                        <TabsContent value="chronological" className="mt-6">
                            {entries.length > 0 ? (
                                <ChronologicalView
                                    entries={entries}
                                    allParcels={allParcels}
                                    allProducts={allProductNames}
                                    onAction={handleAction}
                                />
                            ) : (
                                <EmptyState
                                    icon={BookOpen}
                                    title="Geen registraties"
                                    description="Er zijn nog geen bevestigde bespuitingen in het logboek gevonden."
                                />
                            )}
                        </TabsContent>
                        <TabsContent value="by_parcel" className="mt-6">
                            <ParcelHistoryView allParcels={allParcels} entries={entries} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <NewSprayDialog
                open={isNewSprayDialogOpen}
                onOpenChange={setIsNewSprayDialogOpen}
                parcels={allParcels}
                onSuccess={handleNewSpraySuccess}
            />
        </>
    );
}
