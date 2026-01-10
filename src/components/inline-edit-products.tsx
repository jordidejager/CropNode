'use client';

import * as React from 'react';
import type { ProductEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Combobox, ComboboxOption } from './ui/combobox';
import { Label } from './ui/label';


interface ProductBadgeProps {
  allProducts: ComboboxOption[];
  product: ProductEntry;
  onUpdate: (updatedProduct: ProductEntry) => void;
  onRemove: () => void;
}

function ProductBadge({ allProducts, product, onUpdate, onRemove }: ProductBadgeProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Badge 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-accent hover:text-accent-foreground py-1 px-2"
                >
                    {product.product} <span className="text-muted-foreground ml-1.5 font-mono text-xs">({product.dosage} {product.unit})</span>
                </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Middel</Label>
                        <Combobox
                            options={allProducts}
                            value={product.product}
                            onValueChange={(value) => onUpdate({ ...product, product: value })}
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
  selectedProducts: ProductEntry[];
  onProductsChange: (products: ProductEntry[]) => void;
  isEditing: boolean;
}

export function InlineEditProducts({ allProducts, selectedProducts, onProductsChange, isEditing }: InlineEditProductsProps) {
  
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

  if (!isEditing) {
      return (
          <div className="flex flex-wrap gap-2">
              {selectedProducts.map((product, index) => (
                  <ProductBadge
                      key={index}
                      allProducts={productOptions}
                      product={product}
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

  return (
    <div className="space-y-4">
      {selectedProducts.map((entry, index) => (
        <div key={index} className="grid grid-cols-[1fr_100px_50px_auto] gap-2 items-end">
          <div>
            <Label htmlFor={`product-select-${index}`} className="sr-only">Middel</Label>
            <Combobox
              options={productOptions}
              value={entry.product}
              onValueChange={(value) => handleProductChange(index, { ...entry, product: value })}
              placeholder="Kies een middel"
            />
          </div>
          <div>
            <Label htmlFor={`dosage-input-${index}`} className="sr-only">Dosering</Label>
            <Input
              id={`dosage-input-${index}`}
              type="number"
              value={entry.dosage}
              onChange={(e) => handleProductChange(index, { ...entry, dosage: parseFloat(e.target.value) || 0 })}
              placeholder="Dosering"
              step="0.01"
            />
          </div>
          <div>
             <Label htmlFor={`unit-input-${index}`} className="sr-only">Eenheid</Label>
             <Input
                id={`unit-input-${index}`}
                value={entry.unit}
                onChange={(e) => handleProductChange(index, { ...entry, unit: e.target.value })}
                placeholder="Eenheid"
             />
          </div>
          <Button variant="ghost" size="icon" onClick={() => removeProduct(index)} aria-label="Verwijder middel">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
       <Button variant="outline" size="sm" onClick={addProduct}>
          <Plus className="mr-2 h-4 w-4" />
          Middel toevoegen
      </Button>
    </div>
  );
}
