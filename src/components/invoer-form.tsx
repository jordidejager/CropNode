'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { processSprayEntry, type FormState } from '@/app/actions';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wand2 } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
      Verwerk Invoer
    </Button>
  );
}

export function InvoerForm() {
  const initialState: FormState = { message: '', errors: {} };
  const [state, dispatch] = useFormState(processSprayEntry, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) { // Only show toast if a message is returned
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

    if (state.entry?.status && state.entry.status !== 'Fout') {
      formRef.current?.reset();
    }
  }, [state, toast]);

  return (
    <form ref={formRef} action={dispatch} className="space-y-4">
      <Textarea
        name="rawInput"
        placeholder="Vandaag alle conference gespoten met 1,5 kg captan..."
        rows={4}
        required
        aria-label="Nieuwe bespuiting invoer"
      />
      {state.errors?.rawInput && <p className="text-sm font-medium text-destructive">{state.errors.rawInput}</p>}
      
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
