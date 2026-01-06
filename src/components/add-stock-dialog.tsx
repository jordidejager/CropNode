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
    const formRef = React.useRef<HTMLFormElement>(null);

    const productOptions = allProducts.map(p => ({ value: p, label: p }));

    const handleSubmit = (formData: FormData) => {
        startSubmitTransition(async () => {
            const result = await addNewStock(formData);
            if (result.success) {
                toast({
                    title: 'Succesvol Toegevoegd',
                    description: result.message,
                });
                onStockAdded();
                onOpenChange(false);
                formRef.current?.reset();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Toevoegen Mislukt',
                    description: result.message,
                });
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Levering Toevoegen</DialogTitle>
                    <DialogDescription>
                        Voeg een nieuwe levering van een middel toe aan de voorraad.
                    </DialogDescription>
                </DialogHeader>
                <form action={handleSubmit} ref={formRef} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="productName">Middel</Label>
                        <Controller
                           name="productName"
                           render={({ field }) => (
                               <Combobox
                                   options={productOptions}
                                   value={field.value}
                                   onValueChange={field.onChange}
                                   placeholder="Kies of maak een middel"
                                   creatable={true}
                               />
                           )}
                           control={{
                                name: 'productName',
                                get value() {
                                    // A little hacky, but this is how you can read from FormData
                                    // in a form that is not yet using react-hook-form
                                    const formData = new FormData(formRef.current!);
                                    return formData.get('productName') as string;
                                },
                           } as any}
                        />
                         <input type="hidden" id="productName" name="productName" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="quantity">Hoeveelheid</Label>
                        <Input id="quantity" name="quantity" type="number" step="0.001" required />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="unit">Eenheid</Label>
                        <Input id="unit" name="unit" placeholder="kg, l, etc." required />
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
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="mr-2 h-4 w-4" />
                            )}
                            Toevoegen
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// Dummy Controller for Combobox integration
function Controller({ name, render, control }: { name: string, render: any, control: any }) {
    const [value, setValue] = React.useState(control.value || '');

    const onChange = (newValue: string) => {
        setValue(newValue);
        // This is a bit of a hack to make it work with FormData
        const hiddenInput = document.getElementById(name) as HTMLInputElement;
        if (hiddenInput) {
            hiddenInput.value = newValue;
        }
    };
    
    return render({
        field: {
            name,
            value,
            onChange
        }
    });
}
