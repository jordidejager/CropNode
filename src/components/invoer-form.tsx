'use client';

import { useFormStatus } from 'react-dom';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowUp } from 'lucide-react';
import React from 'react';

function SubmitButton({ isProcessing }: { isProcessing: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || isProcessing;
  return (
    <Button type="submit" size="icon" disabled={isDisabled} className="absolute top-1/2 right-3 -translate-y-1/2">
      {isDisabled ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
      <span className="sr-only">Verwerk Invoer</span>
    </Button>
  );
}

interface InvoerFormProps {
  onFormSubmit: (data: FormData) => void;
  isProcessing: boolean;
}

export const InvoerForm = React.forwardRef<HTMLFormElement, InvoerFormProps>(
  ({ onFormSubmit, isProcessing }, ref) => {
    const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };

    return (
      <form ref={ref} action={onFormSubmit} className="relative w-full">
        <Textarea
          name="rawInput"
          placeholder="Vandaag alle conference gespoten met 1,5 kg captan..."
          rows={1}
          required
          onInput={handleInput}
          aria-label="Nieuwe bespuiting invoer"
          className="pr-12 resize-none text-base"
          disabled={isProcessing}
        />
        <SubmitButton isProcessing={isProcessing} />
      </form>
    );
  }
);
InvoerForm.displayName = 'InvoerForm';