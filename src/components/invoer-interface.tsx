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
import { parcels } from '@/lib/data';

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

  const handleFormAction = (formData: FormData) => {
    dispatch(formData);
    setShowResult(true);
    formRef.current?.reset();
  }
  
  const resetInterface = () => {
    setShowResult(false);
  }

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
            title: 'Verwerking voltooid',
            description: `Status: ${state.entry.status}. ${state.entry.validationMessage || ''}`,
        });
      }
    }
  }, [state, toast, showResult]);

  const getParcelNames = (plotIds: string[] = []) => {
    return plotIds.map(id => parcels.find(p => p.id === id)?.name || id).join(', ');
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col h-full">
      <div className="flex-grow flex flex-col items-center justify-center">
        {!showResult && (
             <div className="text-center mb-8">
                <h1 className="text-4xl font-bold tracking-tight mb-2">Hallo Jordi</h1>
                <p className="text-2xl text-muted-foreground">Waar zullen we mee beginnen?</p>
             </div>
        )}
       
        {showResult && state.entry && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                 <span>Resultaat van Analyse</span>
                 <Badge variant={statusVariant[state.entry.status as keyof typeof statusVariant] || 'secondary'}>
                    {state.entry.status}
                </Badge>
              </CardTitle>
              <CardDescription>
                {state.entry.rawInput}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {state.entry.parsedData ? (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><strong className="font-semibold">Product:</strong> {state.entry.parsedData.product}</div>
                        <div><strong className="font-semibold">Dosering:</strong> {state.entry.parsedData.dosage} {state.entry.parsedData.unit}</div>
                        <div className="col-span-2"><strong className="font-semibold">Percelen:</strong> {getParcelNames(state.entry.parsedData.plots)}</div>
                    </div>
                ): (
                    <div className="text-muted-foreground">Geen data om weer te geven.</div>
                )}

                {state.entry.validationMessage && (
                    <div className={cn("flex items-start gap-3 rounded-md border p-3 text-sm", {
                        'border-yellow-500/50 bg-yellow-500/10 text-yellow-200': state.entry.status === 'Te Controleren',
                        'border-destructive/50 bg-destructive/10 text-destructive-foreground': state.entry.status === 'Fout',
                    })}>
                       <AlertTriangle className="size-5" />
                       <p>{state.entry.validationMessage}</p>
                    </div>
                )}
            </CardContent>
            <CardFooter className="gap-2 justify-end">
                <Button variant="ghost" onClick={resetInterface}><X className="mr-2"/> Annuleren</Button>
                <Button variant="outline"><Pencil className="mr-2"/> Aanpassen</Button>
                <Button><Check className="mr-2"/> Bevestigen</Button>
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
