'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Search, Trash2 } from 'lucide-react';
import { DosageTotalField } from './dosage-total-field';
import type { ProductEntry } from '@/lib/types';
import type { SprayableParcel } from '@/lib/supabase-store';

// ============================================
// EditableProduct
// ============================================

interface EditableProductProps {
    product: ProductEntry;
    allProducts: ComboboxOption[];
    totalArea: number;
    onUpdate: (product: ProductEntry) => void;
    onRemove: () => void;
    /** Label for the combobox (default "Middel") */
    label?: string;
    /** Color tint for toggle + selected unit (default 'emerald') */
    tint?: 'emerald' | 'lime';
}

export function EditableProduct({
    product,
    allProducts,
    totalArea,
    onUpdate,
    onRemove,
    label = 'Middel',
    tint = 'emerald',
}: EditableProductProps) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-4">
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                    <Label className="text-sm text-slate-300 font-medium">{label}</Label>
                    <Combobox
                        options={allProducts}
                        value={product.product}
                        onValueChange={(value) => onUpdate({ ...product, product: value })}
                        placeholder={`Selecteer ${label.toLowerCase()}`}
                    />
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 mt-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={onRemove}
                    aria-label="Verwijder"
                >
                    <Trash2 className="h-5 w-5" />
                </Button>
            </div>
            <div className="space-y-2">
                <Label className="text-sm text-slate-300 font-medium">Dosering</Label>
                <DosageTotalField
                    dosage={product.dosage}
                    unit={product.unit}
                    totalArea={totalArea}
                    onDosageChange={(dosage) => onUpdate({ ...product, dosage })}
                    onUnitChange={(unit) => onUpdate({ ...product, unit })}
                    tint={tint}
                />
            </div>
        </div>
    );
}

// ============================================
// EditableParcels
// ============================================

interface EditableParcelsProps {
    selectedIds: string[];
    allParcels: SprayableParcel[];
    onChange: (ids: string[]) => void;
}

export function EditableParcels({ selectedIds, allParcels, onChange }: EditableParcelsProps) {
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
