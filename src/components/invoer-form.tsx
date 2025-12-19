'use client';

import { useFormStatus } from 'react-dom';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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

export function InvoerForm({ onFormSubmit }: { onFormSubmit: (data: FormData) => void }) {
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  return (
    <form action={onFormSubmit} className="relative w-full">
      <Textarea
        name="rawInput"
        placeholder="Vandaag alle conference gespoten met 1,5 kg captan..."
        rows={1}
        required
        onInput={handleInput}
        aria-label="Nieuwe bespuiting invoer"
        className="pr-12 resize-none text-base"
      />
      <SubmitButton />
    </form>
  );
}
