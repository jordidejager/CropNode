'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { processSprayEntry, type FormState } from '@/app/actions';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowUp } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="icon" disabled={pending} className="absolute top-1/2 right-3 -translate-y-1/2">
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
      <span className="sr-only">Verwerk Invoer</span>
    </Button>
  );
}

export function InvoerForm() {
  const initialState: FormState = { message: '', errors: {} };
  const [state, dispatch] = useFormState(processSprayEntry, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      if(textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [state, toast]);

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  return (
    <form ref={formRef} action={dispatch} className="relative">
      <Textarea
        ref={textareaRef}
        name="rawInput"
        placeholder="Vandaag alle conference gespoten met 1,5 kg captan..."
        rows={1}
        required
        onInput={handleInput}
        aria-label="Nieuwe bespuiting invoer"
        className="pr-12 resize-none text-base"
      />
      {state.errors?.rawInput && <p className="text-sm font-medium text-destructive mt-2">{state.errors.rawInput}</p>}
      
      <SubmitButton />
    </form>
  );
}
