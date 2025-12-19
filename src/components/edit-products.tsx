'use client';

import type { ProductEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface EditProductsProps {
  allProducts: string[];
  selectedProducts: ProductEntry[];
  onProductsChange: (products: ProductEntry[]) => void;
}

export function EditProducts({ allProducts, selectedProducts, onProductsChange }: EditProductsProps) {
  
  const handleProductChange = (index: number, field: keyof ProductEntry, value: string | number) => {
    const newProducts = [...selectedProducts];
    if (field === 'dosage') {
      newProducts[index] = { ...newProducts[index], [field]: Number(value) };
    } else {
      newProducts[index] = { ...newProducts[index], [field]: value as string };
    }
    onProductsChange(newProducts);
  };

  const addProduct = () => {
    const newProduct: ProductEntry = { product: allProducts[0] || '', dosage: 0, unit: 'kg' };
    onProductsChange([...selectedProducts, newProduct]);
  };

  const removeProduct = (index: number) => {
    onProductsChange(selectedProducts.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
       <Label className="font-semibold">Middelen</Label>
      {selectedProducts.map((entry, index) => (
        <div key={index} className="grid grid-cols-[1fr_100px_50px_auto] gap-2 items-end">
          <div>
            <Label htmlFor={`product-select-${index}`} className="sr-only">Middel</Label>
            <Select
              value={entry.product}
              onValueChange={(value) => handleProductChange(index, 'product', value)}
            >
              <SelectTrigger id={`product-select-${index}`}>
                <SelectValue placeholder="Kies een middel" />
              </SelectTrigger>
              <SelectContent>
                {allProducts.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`dosage-input-${index}`} className="sr-only">Dosering</Label>
            <Input
              id={`dosage-input-${index}`}
              type="number"
              value={entry.dosage}
              onChange={(e) => handleProductChange(index, 'dosage', e.target.value)}
              placeholder="Dosering"
              step="0.01"
            />
          </div>
          <div>
             <Label htmlFor={`unit-input-${index}`} className="sr-only">Eenheid</Label>
             <Input
                id={`unit-input-${index}`}
                value={entry.unit}
                onChange={(e) => handleProductChange(index, 'unit', e.target.value)}
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
