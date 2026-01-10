'use client';

import { useState, useRef, useEffect } from 'react';
import type { ProductEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, Search, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';

interface InlineEditProductsProps {
  allProducts: string[];
  selectedProducts: ProductEntry[];
  onProductsChange: (products: ProductEntry[]) => void;
}

export function InlineEditProducts({ allProducts, selectedProducts, onProductsChange }: InlineEditProductsProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredProducts = allProducts.filter(product =>
    product.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Focus search input when popover opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleAddProduct = (productName: string) => {
    // Check if product already exists
    const existingIndex = selectedProducts.findIndex(
      p => p.product.toLowerCase() === productName.toLowerCase()
    );

    if (existingIndex >= 0) {
      // Focus on existing product for editing
      setEditingIndex(existingIndex);
    } else {
      // Add new product
      const newProduct: ProductEntry = {
        product: productName,
        dosage: 0,
        unit: 'l/ha'
      };
      onProductsChange([...selectedProducts, newProduct]);
      setEditingIndex(selectedProducts.length);
    }
    setSearchTerm('');
  };

  const handleRemoveProduct = (index: number) => {
    onProductsChange(selectedProducts.filter((_, i) => i !== index));
    setEditingIndex(null);
  };

  const handleUpdateProduct = (index: number, field: keyof ProductEntry, value: string | number) => {
    const newProducts = [...selectedProducts];
    if (field === 'dosage') {
      newProducts[index] = { ...newProducts[index], [field]: Number(value) || 0 };
    } else {
      newProducts[index] = { ...newProducts[index], [field]: value as string };
    }
    onProductsChange(newProducts);
  };

  const displayText = selectedProducts.length === 0
    ? 'Voeg middelen toe...'
    : selectedProducts.length === 1
      ? `${selectedProducts[0].product} (${selectedProducts[0].dosage} ${selectedProducts[0].unit})`
      : `${selectedProducts.length} middelen`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-auto min-h-[36px] py-1.5 px-2 text-left font-normal",
            selectedProducts.length === 0 && "text-muted-foreground"
          )}
        >
          <span className="truncate text-sm">{displayText}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        {/* Selected products list */}
        {selectedProducts.length > 0 && (
          <div className="p-2 border-b space-y-2 max-h-[180px] overflow-y-auto">
            {selectedProducts.map((product, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 p-1.5 rounded bg-accent/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={product.product}>
                    {product.product}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      type="number"
                      value={product.dosage}
                      onChange={(e) => handleUpdateProduct(index, 'dosage', e.target.value)}
                      className="h-7 w-20 text-sm"
                      step="0.1"
                      min="0"
                      placeholder="0"
                    />
                    <Input
                      value={product.unit}
                      onChange={(e) => handleUpdateProduct(index, 'unit', e.target.value)}
                      className="h-7 w-16 text-sm"
                      placeholder="l/ha"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleRemoveProduct(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Search and add */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Zoek en voeg middel toe..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>

        {/* Product suggestions */}
        <ScrollArea className="h-[160px]">
          <div className="p-2 space-y-0.5">
            {filteredProducts.length > 0 ? (
              filteredProducts.slice(0, 50).map((product) => {
                const isSelected = selectedProducts.some(
                  p => p.product.toLowerCase() === product.toLowerCase()
                );
                return (
                  <div
                    key={product}
                    className={cn(
                      "flex items-center gap-2 p-1.5 rounded cursor-pointer text-sm",
                      isSelected ? "bg-accent" : "hover:bg-accent"
                    )}
                    onClick={() => handleAddProduct(product)}
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate flex-1">{product}</span>
                    {isSelected && (
                      <Badge variant="secondary" className="text-xs">
                        Toegevoegd
                      </Badge>
                    )}
                  </div>
                );
              })
            ) : searchTerm ? (
              <p className="text-center text-muted-foreground p-4 text-sm">
                Geen middelen gevonden voor "{searchTerm}"
              </p>
            ) : (
              <p className="text-center text-muted-foreground p-4 text-sm">
                Begin met typen om te zoeken...
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
