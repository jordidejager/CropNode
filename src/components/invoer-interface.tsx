
'use client';

import { createInitialSprayEntry, type InitialState } from '@/app/actions';
import { useActionState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { InvoerForm } from './invoer-form';
import { useFirestore } from '@/firebase';
import { Loader2 } from 'lucide-react';

export function InvoerInterface({ onNewEntry }: { onNewEntry: () => void }) {
  const [state, formAction, isProcessing] = useActionState(createInitialSprayEntry, { message: '', errors: {} });
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const db = useFirestore();

  useEffect(() => {
    if (state.message && !isProcessing) {
      if (state.errors) {
        toast({
            variant: 'destructive',
            title: 'Fout bij invoer',
            description: state.errors.rawInput?.[0] || state.message,
        });
      } else {
        toast({
            title: 'Invoer ontvangen',
            description: 'De bespuiting wordt nu geanalyseerd in het logboek.',
        });
        onNewEntry();
        formRef.current?.reset();
        const textarea = formRef.current?.querySelector('textarea');
        if (textarea) {
            textarea.style.height = 'auto';
        }
      }
    }
  }, [state, isProcessing, toast, onNewEntry]);


  if (!db) {
      return (
          <div className="w-full max-w-3xl flex flex-col h-full items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 text-muted-foreground">Data laden...</p>
          </div>
      );
  }

  return (
    <div className="w-full max-w-3xl flex flex-col h-full">
      <div className="flex-grow flex flex-col items-start justify-center">
         <div className="text-left mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2">Hallo Jordi</h1>
            <p className="text-2xl text-muted-foreground">Waar zullen we mee beginnen?</p>
         </div>
      </div>

      <div className="py-4">
        <div className="bg-card border rounded-lg p-2 w-full">
            <InvoerForm ref={formRef} onFormSubmit={formAction} isProcessing={isProcessing} />
        </div>
      </div>
    </div>
  );
}
