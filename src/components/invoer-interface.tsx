
'use client';

import { createInitialSprayEntry, type InitialState } from '@/app/actions';
import { useActionState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { InvoerForm } from './invoer-form';
import { Loader2 } from 'lucide-react';

export function InvoerInterface({ onNewEntry }: { onNewEntry: () => void }) {
  const [state, formAction, isProcessing] = useActionState(createInitialSprayEntry, { message: '', errors: {} });
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
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




  return (
    <div className="w-full">
      <div className="text-left mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Slimme Invoer</h1>
        <p className="text-muted-foreground">Omschrijf een bespuiting in natuurlijke taal.</p>
      </div>

      <div className="bg-card border rounded-lg p-2 w-full">
        <InvoerForm ref={formRef} onFormSubmit={formAction} isProcessing={isProcessing} />
      </div>
    </div>
  );
}
