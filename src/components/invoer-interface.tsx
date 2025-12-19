'use client';

import { useFormState } from 'react-dom';
import { processSprayEntry, type FormState } from '@/app/actions';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { InvoerForm } from './invoer-form';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { cn } from '@/lib/utils';
import { Check, Pencil, X, AlertTriangle } from 'lucide-react';
import { parcels, middelMatrix } from '@/lib/data';
import type { LogbookEntry, ProductEntry } from '@/lib/types';
import { EditParcels } from './edit-parcels';
import { EditProducts } from './edit-products';

const statusVariant: Record<"Akkoord" | "Te Controleren" | "Fout", 'default' | 'secondary' | 'destructive'> = {
  'Akkoord': 'default',
  'Te Controleren': 'secondary',
  'Fout': 'destructive',
};

export function InvoerInterface() {
  const initialState: FormState = { message: '', errors: {} };
  const [state, dispatch] = useFormState(processSprayEntry, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const [showResult, setShowResult] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editableEntry, setEditableEntry] = useState<LogbookEntry | null>(null);

  const handleFormAction = (formData: FormData) => {
    dispatch(formData);
    setShowResult(true);
    setIsEditing(false); // Reset editing state on new submission
    formRef.current?.reset();
  }
  
  const resetInterface = () => {
    setShowResult(false);
    setIsEditing(false);
    setEditableEntry(null);
  }

  const handleConfirm = () => {
    // Here you would typically call a server action to save the final `editableEntry`
    // For now, we just show a toast and reset.
    toast({
      title: 'Opgeslagen!',
      description: 'De bespuiting is definitief opgeslagen in het logboek.',
    });
    resetInterface();
  }

  const startEditing = () => {
    if (state.entry) {
      if (state.entry.parsedData) {
        // This is the correct way to get the products for editing
        const displayProducts = getDisplayProducts(state.entry);
        setEditableEntry({
          ...state.entry,
          parsedData: {
            ...state.entry.parsedData,
            plots: state.entry.parsedData.plots || [],
            products: displayProducts,
          },
        });
      }
      setIsEditing(true);
    }
  };


  useEffect(() => {
    if (state.message && showResult) { // Only show toast if a message is returned
      if (state.entry?.status === 'Fout') {
        toast({
            variant: 'destructive',
            title: 'Fout bij verwerking',
            description: state.entry.validationMessage || 'De AI kon de invoer niet analyseren.',
        });
      } else if (state.entry) {
        toast({
            title: 'Analyse voltooid',
            description: `Status: ${state.entry.status}. ${state.entry.validationMessage || ''}`,
        });
        // Set initial state for editing
        setEditableEntry(state.entry);
      }
    }
  }, [state, toast, showResult]);

  const getParcelNames = (plotIds: string[] = []) => {
    if (plotIds.length === 0) return 'Geen';
    return plotIds.map(id => parcels.find(p => p.id === id)?.name || id).join(', ');
  }

  const entryToDisplay = isEditing ? editableEntry : state.entry;

  const handleParcelsChange = (selectedIds: string[]) => {
    if (editableEntry && editableEntry.parsedData) {
        setEditableEntry({
            ...editableEntry,
            parsedData: {
                ...editableEntry.parsedData,
                plots: selectedIds,
            }
        });
    }
  };

  const handleProductsChange = (products: ProductEntry[]) => {
    if (editableEntry && editableEntry.parsedData) {
        setEditableEntry({
            ...editableEntry,
            parsedData: {
                ...editableEntry.parsedData,
                products: products,
            }
        });
    }
  };

  const getDisplayProducts = (entry: LogbookEntry | null | undefined): ProductEntry[] => {
    if (!entry?.parsedData) return [];
    if ('products' in entry.parsedData && Array.isArray(entry.parsedData.products) && entry.parsedData.products.length > 0) {
        return entry.parsedData.products;
    }
    if ('product' in entry.parsedData && typeof entry.parsedData.product === 'string') {
        return [{ 
            product: entry.parsedData.product, 
            dosage: entry.parsedData.dosage, 
            unit: entry.parsedData.unit 
        }];
    }
    return [];
  }

  const displayProducts = getDisplayProducts(entryToDisplay);
  const allUniqueProducts = [...new Set(middelMatrix.map(m => m.product))];


  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col h-full">
      <div className="flex-grow flex flex-col items-center justify-center">
        {!showResult && (
             <div className="text-center mb-8">
                <h1 className="text-4xl font-bold tracking-tight mb-2">Hallo Jordi</h1>
                <p className="text-2xl text-muted-foreground">Waar zullen we mee beginnen?</p>
             </div>
        )}
       
        {showResult && entryToDisplay && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                 <span>{isEditing ? 'Analyse Aanpassen' : 'Resultaat van Analyse'}</span>
                 {!isEditing && (
                    <Badge variant={statusVariant[entryToDisplay.status as keyof typeof statusVariant] || 'secondary'}>
                        {entryToDisplay.status}
                    </Badge>
                 )}
              </CardTitle>
              <CardDescription>
                {entryToDisplay.rawInput}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {entryToDisplay.parsedData ? (
                    isEditing ? (
                        <div className="space-y-6">
                            <EditProducts
                                allProducts={allUniqueProducts}
                                selectedProducts={displayProducts}
                                onProductsChange={handleProductsChange}
                            />
                             <EditParcels 
                                allParcels={parcels} 
                                selectedParcelIds={entryToDisplay.parsedData.plots || []}
                                onSelectionChange={handleParcelsChange}
                            />
                        </div>
                    ) : (
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                        {displayProducts.map((p, i) => (
                           <div key={i} className="contents">
                                <div className="font-semibold">Middel {displayProducts.length > 1 ? i+1 : ''}:</div>
                                <div>{p.product}</div>
                                <div className="font-semibold">Dosering:</div>
                                <div>{p.dosage.toFixed(2)} {p.unit}</div>
                           </div>
                        ))}
                        <div className="col-span-1 font-semibold">Percelen:</div>
                        <div className="col-span-1">{getParcelNames(entryToDisplay.parsedData.plots)}</div>
                    </div>
                    )
                ): (
                    <div className="text-muted-foreground">Geen data om weer te geven.</div>
                )}

                {!isEditing && entryToDisplay.validationMessage && (
                    <div className={cn("flex items-start gap-3 rounded-md border p-3 text-sm", {
                        'border-yellow-500/50 bg-yellow-500/10 text-yellow-200': entryToDisplay.status === 'Te Controleren',
                        'border-destructive/50 bg-destructive/10 text-destructive-foreground': entryToDisplay.status === 'Fout',
                    })}>
                       <AlertTriangle className="size-5" />
                       <p>{entryToDisplay.validationMessage}</p>
                    </div>
                )}
            </CardContent>
            <CardFooter className="gap-2 justify-end">
                <Button variant="ghost" onClick={resetInterface}><X className="mr-2"/> Annuleren</Button>
                {isEditing ? (
                  <Button onClick={() => setIsEditing(false)}><Check className="mr-2"/> Opslaan</Button>
                ) : (
                  <Button variant="outline" onClick={startEditing}><Pencil className="mr-2"/> Aanpassen</Button>
                )}
                <Button onClick={handleConfirm} disabled={isEditing}><Check className="mr-2"/> Bevestigen</Button>
            </CardFooter>
          </Card>
        )}
      </div>

      <div className="py-4">
        <div className="bg-card border rounded-lg p-2 w-full">
            <InvoerForm onFormSubmit={handleFormAction} />
        </div>
      </div>
    </div>
  );
}
