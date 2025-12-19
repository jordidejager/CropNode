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
import type { LogbookEntry, ParsedSprayData, Parcel, Middel } from '@/lib/types';
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
        // Initialize editableEntry with a single product if parsedData exists
        const initialProducts = state.entry.parsedData ? [{
            product: state.entry.parsedData.product,
            dosage: state.entry.parsedData.dosage,
            unit: state.entry.parsedData.unit,
        }] : [];

        setEditableEntry({
            ...state.entry,
            parsedData: {
                plots: state.entry.parsedData?.plots || [],
                // This is now an array to support multiple products
                products: initialProducts
            }
        });
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
    if (editableEntry) {
        setEditableEntry({
            ...editableEntry,
            parsedData: {
                ...editableEntry.parsedData!,
                plots: selectedIds,
            }
        });
    }
  };

  const handleProductsChange = (products: { product: string; dosage: number; unit: string; }[]) => {
    if (editableEntry) {
        setEditableEntry({
            ...editableEntry,
            parsedData: {
                ...editableEntry.parsedData!,
                products: products,
            }
        });
    }
  };


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
                            <EditParcels 
                                allParcels={parcels} 
                                selectedParcelIds={entryToDisplay.parsedData.plots}
                                onSelectionChange={handleParcelsChange}
                            />
                            <EditProducts
                                allProducts={middelMatrix.map(m => m.product)}
                                selectedProducts={('products' in entryToDisplay.parsedData ? entryToDisplay.parsedData.products : [{product: entryToDisplay.parsedData.product, dosage: entryToDisplay.parsedData.dosage, unit: entryToDisplay.parsedData.unit}]) || []}
                                onProductsChange={handleProductsChange}
                            />
                        </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><strong className="font-semibold">Product:</strong> {entryToDisplay.parsedData.product}</div>
                        <div><strong className="font-semibold">Dosering:</strong> {entryToDisplay.parsedData.dosage} {entryToDisplay.parsedData.unit}</div>
                        <div className="col-span-2"><strong className="font-semibold">Percelen:</strong> {getParcelNames(entryToDisplay.parsedData.plots)}</div>
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
