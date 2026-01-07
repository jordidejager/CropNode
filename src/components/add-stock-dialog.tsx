'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Combobox } from './ui/combobox';
import { addNewStock } from '@/app/actions';

interface AddStockDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    allProducts: string[];
    onStockAdded: () => void;
}

export function AddStockDialog({ open, onOpenChange, allProducts, onStockAdded }: AddStockDialogProps) {
    const [isSubmitting, startSubmitTransition] = useTransition();
    const { toast } = useToast();

    // Use standard state management
    const [productName, setProductName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('');

    const productOptions = allProducts.map(p => ({ value: p, label: p }));

    const resetForm = () => {
        setProductName('');
        setQuantity('');
        setUnit('');
    }

    const handleSubmit = () => {
        startSubmitTransition(async () => {
            const formData = new FormData();
            formData.append('productName', productName);
            formData.append('quantity', quantity);
            formData.append('unit', unit);
            
            const result = await addNewStock(formData);
            if (result.success) {
                toast({
                    title: 'Succesvol Toegevoegd',
                    description: result.message,
                });
                onStockAdded();
                onOpenChange(false);
                resetForm();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Toevoegen Mislukt',
                    description: result.message,
                });
            }
        });
    };

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            resetForm();
        }
        onOpenChange(isOpen);
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Levering Toevoegen</DialogTitle>
                    <DialogDescription>
                        Voeg een nieuwe levering van een middel toe aan de voorraad.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="productName">Middel</Label>
                       <Combobox
                           options={productOptions}
                           value={productName}
                           onValueChange={setProductName}
                           placeholder="Kies of maak een middel"
                           creatable={true}
                       />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="quantity">Hoeveelheid</Label>
                        <Input 
                            id="quantity" 
                            name="quantity" 
                            type="number" 
                            step="0.001" 
                            required 
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="unit">Eenheid</Label>
                        <Input 
                            id="unit" 
                            name="unit" 
                            placeholder="kg, l, etc." 
                            required 
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                        />
                    </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Annuleren
                        </Button>
                        <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !productName || !quantity || !unit}>
                            {isSubmitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="mr-2 h-4 w-4" />
                            )}
                            Toevoegen
                        </Button>
                    </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
