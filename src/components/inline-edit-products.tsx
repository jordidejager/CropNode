
'use client';

import * as React from 'react';
import type { ProductEntry, ParsedSprayData } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, Sparkles, Target, Loader2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { Combobox, ComboboxOption } from './ui/combobox';
import { Label } from './ui/label';
import { getTargetsForProductAction, saveProductPreferenceAction } from '@/app/actions';

interface ProductBadgeProps {
    allProducts: ComboboxOption[];
    product: ProductEntry;
    assumedTarget?: string;
    onUpdate: (updatedProduct: ProductEntry) => void;
    onRemove: () => void;
}

function ProductBadge({ allProducts, product, assumedTarget, onUpdate, onRemove }: ProductBadgeProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [availableTargets, setAvailableTargets] = React.useState<string[]>([]);
    const [isLoadingTargets, setIsLoadingTargets] = React.useState(false);

    // Fetch targets when product name changes
    React.useEffect(() => {
        if (product.product && isOpen) {
            setIsLoadingTargets(true);
            getTargetsForProductAction(product.product).then(targets => {
                setAvailableTargets(targets);
                setIsLoadingTargets(false);
            });
        }
    }, [product.product, isOpen]);

    const targetOptions: ComboboxOption[] = availableTargets.map(t => ({ value: t, label: t }));

    const handleProductChange = (newName: string) => {
        onUpdate({ ...product, product: newName });
        // Learning: Save product preference (not implemented in AI yet, but saving the data)
        if (newName) {
            // Get base name if it exists (e.g. "captan" -> "Captan 80 WDG")
            // This is simple for now, we just save what the user picked for this product string
        }
    };

    const handleTargetChange = (newTarget: string) => {
        onUpdate({ ...product, doelorganisme: newTarget });
        // Learning: Save target preference for this product
        if (product.product && newTarget) {
            saveProductPreferenceAction(`doel_${product.product.toLowerCase()}`, newTarget);
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <div className="inline-block">
                    <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground py-1.5 px-3 flex flex-col items-start gap-1"
                    >
                        <span className="font-semibold text-sm">{product.product} <span className="font-mono text-xs">({product.dosage} {product.unit})</span></span>
                        {(product.doelorganisme || product.targetReason || assumedTarget) && (
                            <span className="text-xs font-normal text-muted-foreground flex items-center">
                                <Target className="h-3 w-3 mr-1.5" />
                                {product.doelorganisme || product.targetReason || assumedTarget}
                                {assumedTarget && !product.doelorganisme && <Sparkles className="h-3 w-3 ml-1.5 text-yellow-500" />}
                            </span>
                        )}
                    </Badge>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-84 p-4" align="start">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Middel</Label>
                        <Combobox
                            options={allProducts}
                            value={product.product}
                            onValueChange={handleProductChange}
                            placeholder="Kies een middel"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <Label>Dosering</Label>
                            <Input
                                type="number"
                                value={product.dosage}
                                onChange={(e) => onUpdate({ ...product, dosage: parseFloat(e.target.value) || 0 })}
                                step="0.1"
                                min="0"
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Eenheid</Label>
                            <Input
                                value={product.unit}
                                onChange={(e) => onUpdate({ ...product, unit: e.target.value })}
                                placeholder="l/ha"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center justify-between">
                            Doelorganisme (Toegelaten)
                            {isLoadingTargets && <Loader2 className="h-3 w-3 animate-spin" />}
                        </Label>
                        <Combobox
                            options={targetOptions}
                            value={product.doelorganisme || ''}
                            onValueChange={handleTargetChange}
                            placeholder={availableTargets.length > 0 ? "Kies een doelorganisme" : "Geen doelen gevonden"}
                            disabled={isLoadingTargets || availableTargets.length === 0}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Andere Rede / Notitie</Label>
                        <Input
                            value={product.targetReason || ''}
                            onChange={(e) => onUpdate({ ...product, targetReason: e.target.value })}
                            placeholder="bijv. schurft, luis"
                        />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                                onRemove();
                                setIsOpen(false);
                            }}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Verwijder
                        </Button>
                        <Button size="sm" onClick={() => setIsOpen(false)}>Klaar</Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

interface InlineEditProductsProps {
    allProducts: string[];
    parsedData: ParsedSprayData;
    onProductsChange: (products: ProductEntry[]) => void;
    isEditing: boolean;
}

export function InlineEditProducts({ allProducts, parsedData, onProductsChange, isEditing }: InlineEditProductsProps) {
    const { products: selectedProducts, assumedTargets } = parsedData;

    const productOptions: ComboboxOption[] = allProducts.map(p => ({ value: p, label: p }));

    const handleProductChange = (index: number, updatedProduct: ProductEntry) => {
        const newProducts = [...selectedProducts];
        newProducts[index] = updatedProduct;
        onProductsChange(newProducts);
    };

    const addProduct = () => {
        const newProduct: ProductEntry = { product: '', dosage: 0, unit: 'l/ha' };
        onProductsChange([...selectedProducts, newProduct]);
    };

    const removeProduct = (index: number) => {
        onProductsChange(selectedProducts.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-wrap gap-2 items-center">
            {selectedProducts.map((product, index) => (
                <ProductBadge
                    key={index}
                    allProducts={productOptions}
                    product={product}
                    assumedTarget={assumedTargets?.[product.product]}
                    onUpdate={(updatedProduct) => handleProductChange(index, updatedProduct)}
                    onRemove={() => removeProduct(index)}
                />
            ))}
            <Button
                size="icon"
                variant="outline"
                className="h-6 w-6 shrink-0"
                onClick={addProduct}
            >
                <Plus className="h-4 w-4" />
                <span className="sr-only">Middel toevoegen</span>
            </Button>
        </div>
    )
}

