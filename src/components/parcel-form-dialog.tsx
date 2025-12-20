'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Parcel } from '@/lib/types';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Naam is verplicht'),
  crop: z.string().min(1, 'Gewas is verplicht'),
  variety: z.union([z.string(), z.array(z.string())]).refine(val => (Array.isArray(val) && val.length > 0) || (typeof val === 'string' && val.length > 0), {
    message: 'Ras is verplicht',
  }),
  area: z.coerce.number().min(0.01, 'Oppervlakte moet groter dan 0 zijn'),
});

type ParcelFormValues = z.infer<typeof formSchema>;

interface ParcelFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  parcel: Parcel | null;
  onSubmit: (data: ParcelFormValues) => Promise<boolean>;
}

export function ParcelFormDialog({ isOpen, onOpenChange, parcel, onSubmit }: ParcelFormDialogProps) {
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm<ParcelFormValues>({
    resolver: zodResolver(formSchema),
  });
  
  useEffect(() => {
    if (parcel) {
      setValue('id', parcel.id);
      setValue('name', parcel.name);
      setValue('crop', parcel.crop);
      setValue('area', parcel.area);
      setValue('variety', Array.isArray(parcel.variety) ? parcel.variety.join(', ') : parcel.variety);
    } else {
      reset({ id: undefined, name: '', crop: '', variety: '', area: 0 });
    }
  }, [parcel, reset, setValue, isOpen]);


  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset();
    }
    onOpenChange(open);
  }

  const processSubmit: SubmitHandler<ParcelFormValues> = async (data) => {
    setIsSubmitting(true);
    const success = await onSubmit(data);
    setIsSubmitting(false);
    if (success) {
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{parcel ? 'Perceel Aanpassen' : 'Nieuw Perceel Toevoegen'}</DialogTitle>
          <DialogDescription>
            {parcel ? 'Pas de gegevens van het perceel aan.' : 'Voer de gegevens voor het nieuwe perceel in.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(processSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">Naam</Label>
            <div className="col-span-3">
              <Input id="name" {...register('name')} className="w-full" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="crop" className="text-right">Gewas</Label>
            <div className="col-span-3">
              <Input id="crop" {...register('crop')} className="w-full" />
              {errors.crop && <p className="text-red-500 text-xs mt-1">{errors.crop.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="variety" className="text-right">Ras</Label>
            <div className="col-span-3">
              <Input id="variety" {...register('variety')} className="w-full" placeholder="bv. Conference, Doyenné" />
              <p className="text-xs text-muted-foreground mt-1">Scheid meerdere rassen met een komma.</p>
              {errors.variety && <p className="text-red-500 text-xs mt-1">{errors.variety.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="area" className="text-right">Opp. (ha)</Label>
            <div className="col-span-3">
              <Input id="area" type="number" step="0.01" {...register('area')} className="w-full" />
              {errors.area && <p className="text-red-500 text-xs mt-1">{errors.area.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Annuleren</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
