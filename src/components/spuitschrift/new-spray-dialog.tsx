'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarIcon, Plus, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ProductSelector } from './product-selector';
import { DosageInput } from './dosage-input';
import { ParcelMultiSelect } from './parcel-multi-select';
import { ValidationFeedback, ValidationStatus, type ValidationFlag } from './validation-feedback';
import type { SprayableParcel } from '@/lib/supabase-store';
import type { CtgbProduct, ProductEntry } from '@/lib/types';
import { addManualSprayEntry } from '@/app/actions';

interface ProductRow {
    id: string;
    product: string;
    ctgbProduct?: CtgbProduct;
    dosage: number;
    unit: string;
}

interface NewSprayDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    parcels: SprayableParcel[];
    onSuccess?: () => void;
}

export function NewSprayDialog({
    open,
    onOpenChange,
    parcels,
    onSuccess,
}: NewSprayDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isValidating, setIsValidating] = React.useState(false);

    // Form state
    const [date, setDate] = React.useState<Date>(new Date());
    const [time, setTime] = React.useState<string>(
        format(new Date(), 'HH:mm')
    );
    const [selectedParcelIds, setSelectedParcelIds] = React.useState<string[]>([]);
    const [products, setProducts] = React.useState<ProductRow[]>([
        { id: crypto.randomUUID(), product: '', dosage: 0, unit: 'L/ha' },
    ]);
    const [notes, setNotes] = React.useState('');

    // Validation state
    const [validationFlags, setValidationFlags] = React.useState<ValidationFlag[]>([]);
    const [isValid, setIsValid] = React.useState(false);
    const [errorCount, setErrorCount] = React.useState(0);
    const [warningCount, setWarningCount] = React.useState(0);

    // Validation debounce
    const validationTimeout = React.useRef<NodeJS.Timeout | null>(null);

    // Reset form when dialog opens
    React.useEffect(() => {
        if (open) {
            setDate(new Date());
            setTime(format(new Date(), 'HH:mm'));
            setSelectedParcelIds([]);
            setProducts([{ id: crypto.randomUUID(), product: '', dosage: 0, unit: 'L/ha' }]);
            setNotes('');
            setValidationFlags([]);
            setIsValid(false);
            setErrorCount(0);
            setWarningCount(0);
        }
    }, [open]);

    // Run validation when inputs change
    React.useEffect(() => {
        if (validationTimeout.current) {
            clearTimeout(validationTimeout.current);
        }

        // Only validate if we have parcels and at least one product with a name
        const hasParcel = selectedParcelIds.length > 0;
        const hasProduct = products.some(p => p.product.trim());

        if (!hasParcel || !hasProduct) {
            setValidationFlags([]);
            setIsValid(false);
            setErrorCount(0);
            setWarningCount(0);
            return;
        }

        validationTimeout.current = setTimeout(() => {
            runValidation();
        }, 500);

        return () => {
            if (validationTimeout.current) {
                clearTimeout(validationTimeout.current);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedParcelIds, products, date]);

    const runValidation = async () => {
        setIsValidating(true);
        try {
            // Combine date and time
            const [hours, minutes] = time.split(':').map(Number);
            const applicationDate = new Date(date);
            applicationDate.setHours(hours, minutes, 0, 0);

            // Build product entries
            const productEntries: ProductEntry[] = products
                .filter(p => p.product.trim())
                .map(p => ({
                    product: p.product,
                    dosage: p.dosage,
                    unit: p.unit,
                }));

            // Call validation API (expects 'draft' object)
            const response = await fetch('/api/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    draft: {
                        plots: selectedParcelIds,
                        products: productEntries,
                        date: applicationDate.toISOString(),
                    },
                }),
            });

            if (response.ok) {
                const result = await response.json();
                setValidationFlags(result.flags || []);
                setIsValid(result.isValid);
                setErrorCount(result.errorCount || 0);
                setWarningCount(result.warningCount || 0);
            } else {
                console.error('Validation API error:', await response.text());
            }
        } catch (error) {
            console.error('Validation error:', error);
        } finally {
            setIsValidating(false);
        }
    };

    // Product row handlers
    const addProductRow = () => {
        setProducts([
            ...products,
            { id: crypto.randomUUID(), product: '', dosage: 0, unit: 'L/ha' },
        ]);
    };

    const removeProductRow = (id: string) => {
        if (products.length > 1) {
            setProducts(products.filter(p => p.id !== id));
        }
    };

    const updateProduct = (id: string, field: keyof ProductRow, value: any) => {
        setProducts(products.map(p => {
            if (p.id === id) {
                return { ...p, [field]: value };
            }
            return p;
        }));
    };

    const handleProductSelect = (id: string, productName: string, ctgbProduct?: CtgbProduct) => {
        setProducts(products.map(p => {
            if (p.id === id) {
                return { ...p, product: productName, ctgbProduct };
            }
            return p;
        }));
    };

    // Form submission
    const handleSubmit = async () => {
        // Validate required fields
        if (selectedParcelIds.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Validatiefout',
                description: 'Selecteer minimaal één perceel.',
            });
            return;
        }

        const validProducts = products.filter(p => p.product.trim());
        if (validProducts.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Validatiefout',
                description: 'Voeg minimaal één middel toe.',
            });
            return;
        }

        // Check for blocking errors
        if (errorCount > 0) {
            toast({
                variant: 'destructive',
                title: 'Validatiefouten',
                description: 'Los de fouten op voordat je kunt opslaan.',
            });
            return;
        }

        setIsSubmitting(true);
        try {
            // Combine date and time
            const [hours, minutes] = time.split(':').map(Number);
            const applicationDate = new Date(date);
            applicationDate.setHours(hours, minutes, 0, 0);

            // Build product entries
            const productEntries: ProductEntry[] = validProducts.map(p => ({
                product: p.product,
                dosage: p.dosage,
                unit: p.unit,
            }));

            // Call server action
            const result = await addManualSprayEntry({
                date: applicationDate,
                plots: selectedParcelIds,
                products: productEntries,
                notes: notes.trim() || undefined,
            });

            if (result.success) {
                toast({
                    title: 'Bespuiting toegevoegd',
                    description: 'De bespuiting is succesvol geregistreerd.',
                });
                onOpenChange(false);
                onSuccess?.();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Fout bij opslaan',
                    description: result.message || 'Er is een fout opgetreden.',
                });
            }
        } catch (error) {
            console.error('Submit error:', error);
            toast({
                variant: 'destructive',
                title: 'Fout bij opslaan',
                description: 'Er is een onverwachte fout opgetreden.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const canSubmit = selectedParcelIds.length > 0 &&
        products.some(p => p.product.trim()) &&
        errorCount === 0 &&
        !isSubmitting;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Nieuwe Bespuiting</DialogTitle>
                    <DialogDescription>
                        Voeg handmatig een nieuwe bespuiting toe aan het spuitschrift.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Date and Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Datum</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            'w-full justify-start text-left font-normal',
                                            !date && 'text-muted-foreground'
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, 'PPP', { locale: nl }) : 'Selecteer datum'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={(d) => d && setDate(d)}
                                        initialFocus
                                        locale={nl}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label>Tijd</Label>
                            <Input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                            />
                        </div>
                    </div>

                    <Separator />

                    {/* Parcels */}
                    <div className="space-y-2">
                        <Label>Percelen</Label>
                        <ParcelMultiSelect
                            parcels={parcels}
                            selectedIds={selectedParcelIds}
                            onChange={setSelectedParcelIds}
                            placeholder="Selecteer één of meerdere percelen..."
                        />
                        {selectedParcelIds.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Totaal: {parcels
                                    .filter(p => selectedParcelIds.includes(p.id))
                                    .reduce((sum, p) => sum + (p.area || 0), 0)
                                    .toFixed(2)} ha
                            </p>
                        )}
                    </div>

                    <Separator />

                    {/* Products */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label>Middelen</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addProductRow}
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Middel toevoegen
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {products.map((product, index) => (
                                <div
                                    key={product.id}
                                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                                >
                                    <div className="flex-1 space-y-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">
                                                Middel {index + 1}
                                            </Label>
                                            <ProductSelector
                                                value={product.product}
                                                onChange={(name, ctgb) =>
                                                    handleProductSelect(product.id, name, ctgb)
                                                }
                                                onClear={() =>
                                                    updateProduct(product.id, 'product', '')
                                                }
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">
                                                Dosering
                                            </Label>
                                            <DosageInput
                                                dosage={product.dosage}
                                                unit={product.unit}
                                                onDosageChange={(d) =>
                                                    updateProduct(product.id, 'dosage', d)
                                                }
                                                onUnitChange={(u) =>
                                                    updateProduct(product.id, 'unit', u)
                                                }
                                            />
                                        </div>
                                    </div>
                                    {products.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeProductRow(product.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <Separator />

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Notities (optioneel)</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Eventuele opmerkingen..."
                            rows={2}
                        />
                    </div>

                    {/* Validation Feedback */}
                    {(validationFlags.length > 0 || isValidating) && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label>Validatie</Label>
                                    {isValidating ? (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span className="text-sm">Valideren...</span>
                                        </div>
                                    ) : (
                                        <ValidationStatus
                                            isValid={isValid}
                                            errorCount={errorCount}
                                            warningCount={warningCount}
                                        />
                                    )}
                                </div>
                                <ValidationFeedback flags={validationFlags} />
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Annuleren
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Opslaan...
                            </>
                        ) : (
                            'Opslaan'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
