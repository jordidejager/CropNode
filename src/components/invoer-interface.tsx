'use client';

import { processSprayEntry, updateAndConfirmEntry, type FormState } from '@/app/actions';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { InvoerForm } from './invoer-form';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { cn } from '@/lib/utils';
import { Check, Pencil, X, AlertTriangle, Loader2 } from 'lucide-react';
import { parcels } from '@/lib/data';
import { getProducts } from '@/lib/store';
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
  const [state, formAction] = useActionState(processSprayEntry, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  
  const [isProcessing, startFormTransition] = useTransition();
  const [isConfirming, startConfirmTransition] = useTransition();

  const [showResult, setShowResult] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editableEntry, setEditableEntry] = useState<LogbookEntry | null>(null);
  const [allProducts, setAllProducts] = useState<string[]>([]);

  useEffect(() => {
    async function fetchProducts() {
        const products = await getProducts();
        setAllProducts(products);
    }
    fetchProducts();
  }, []);

  const handleFormSubmit = (formData: FormData) => {
    startFormTransition(() => {
        formAction(formData);
    });
    setShowResult(true);
    setIsEditing(false); 
    setEditableEntry(null);
    const textarea = formRef.current?.querySelector('textarea');
    if (textarea) {
        textarea.value = '';
        textarea.style.height = 'auto';
    }
  }
  
  const resetInterface = () => {
    setShowResult(false);
    setIsEditing(false);
    setEditableEntry(null);
  }

  const handleConfirm = () => {
    if (!editableEntry) return;
    startConfirmTransition(async () => {
      const result = await updateAndConfirmEntry(editableEntry);
      toast({
        title: result.entry?.status === 'Akkoord' ? 'Opgeslagen!' : 'Bijgewerkt',
        description: result.message,
      });
      resetInterface();
    });
  }

  const startEditing = () => {
    if (state.entry) {
      setEditableEntry(JSON.parse(JSON.stringify(state.entry))); // Deep copy
      setIsEditing(true);
    }
  };
  
  useEffect(() => {
    if (state.entry) {
      setEditableEntry(JSON.parse(JSON.stringify(state.entry)));
    }
  }, [state.entry]);

  useEffect(() => {
    if (state.message && showResult && !isProcessing) {
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
      }
    }
  }, [state, toast, showResult, isProcessing]);

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

  const displayProducts = isEditing ? editableEntry?.parsedData?.products || [] : state.entry?.parsedData?.products || [];
  const displayPlots = isEditing ? editableEntry?.parsedData?.plots || [] : state.entry?.parsedData?.plots || [];
  
  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col h-full">
      <div className="flex-grow flex flex-col items-center justify-center">
        {!showResult && !isProcessing && (
             <div className="text-center mb-8">
                <h1 className="text-4xl font-bold tracking-tight mb-2">Hallo Jordi</h1>
                <p className="text-2xl text-muted-foreground">Waar zullen we mee beginnen?</p>
             </div>
        )}

        {(isProcessing || showResult) && (
            <div className="w-full">
            {isProcessing && (
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle>Een ogenblik geduld...</CardTitle>
                        <CardDescription>De AI analyseert je invoer.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center p-10">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    </CardContent>
                </Card>
            )}

            {!isProcessing && entryToDisplay && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
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
                                    allProducts={allProducts}
                                    selectedProducts={displayProducts}
                                    onProductsChange={handleProductsChange}
                                />
                                 <EditParcels 
                                    allParcels={parcels} 
                                    selectedParcelIds={displayPlots}
                                    onSelectionChange={handleParcelsChange}
                                />
                            </div>
                        ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                           <div className="sm:col-span-2 font-semibold">Middelen:</div>
                            {displayProducts.map((p, i) => (
                               <div key={i} className="contents">
                                    <div className="pl-4">{p.product}:</div>
                                    <div>{p.dosage.toFixed(2)} {p.unit}</div>
                               </div>
                            ))}
                            <div className="mt-2 font-semibold">Percelen:</div>
                            <div className="mt-2">{getParcelNames(entryToDisplay.parsedData.plots)}</div>
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
                           <AlertTriangle className="size-5 mt-0.5" />
                           <p className="flex-1">{entryToDisplay.validationMessage}</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="gap-2 justify-end flex-wrap">
                     {entryToDisplay.status !== 'Fout' && (
                        <>
                            <Button variant="ghost" onClick={resetInterface}><X className="mr-2"/> Annuleren</Button>
                            {isEditing ? (
                              <Button onClick={() => setIsEditing(false)}><Check className="mr-2"/> Opslaan</Button>
                            ) : (
                              <Button variant="outline" onClick={startEditing}><Pencil className="mr-2"/> Aanpassen</Button>
                            )}
                            <Button onClick={handleConfirm} disabled={isEditing || isConfirming}>
                                {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2"/>}
                                Bevestigen
                            </Button>
                        </>
                     )}
                     {entryToDisplay.status === 'Fout' && (
                        <Button variant="ghost" onClick={resetInterface}><X className="mr-2"/> Sluiten</Button>
                     )}
                </CardFooter>
              </Card>
            )}
            </div>
        )}
      </div>

      <div ref={formRef} className="py-4">
        <div className="bg-card border rounded-lg p-2 w-full">
            <InvoerForm onFormSubmit={handleFormSubmit} isProcessing={isProcessing} />
        </div>
      </div>
    </div>
  );
}
