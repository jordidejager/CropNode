'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Combobox, ComboboxOption } from './ui/combobox';
import type { Parcel } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { getParcels } from '@/lib/store';


const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Naam is verplicht'),
  crop: z.string().min(1, 'Gewas is verplicht'),
  variety: z.string().min(1, 'Ras is verplicht'),
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
  const { register, handleSubmit, formState: { errors }, reset, setValue, control } = useForm<ParcelFormValues>({
    resolver: zodResolver(formSchema),
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allVarieties, setAllVarieties] = useState<ComboboxOption[]>([]);
  const [loadingVarieties, setLoadingVarieties] = useState(true);
  const db = useFirestore();

  useEffect(() => {
    async function fetchVarieties() {
      if (!db || !isOpen) return;
      setLoadingVarieties(true);
      const parcels = await getParcels(db);
      const uniqueVarieties = [...new Set(parcels.map(p => p.variety))];
      setAllVarieties(uniqueVarieties.map(v => ({ value: v, label: v })));
      setLoadingVarieties(false);
    }
    fetchVarieties();
  }, [db, isOpen]);
  
  useEffect(() => {
    if (isOpen) {
      if (parcel) {
        reset({
          id: parcel.id,
          name: parcel.name,
          crop: parcel.crop,
          area: parcel.area,
          variety: parcel.variety,
        });
      } else {
        reset({
          id: undefined,
          name: '',
          crop: '',
          variety: '',
          area: 0.0,
        });
      }
    }
  }, [parcel, isOpen, reset]);

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
               <Controller
                control={control}
                name="crop"
                render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                            <SelectValue placeholder="Kies een gewas" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Appel">Appel</SelectItem>
                            <SelectItem value="Peer">Peer</SelectItem>
                        </SelectContent>
                    </Select>
                )}
                />
              {errors.crop && <p className="text-red-500 text-xs mt-1">{errors.crop.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="variety" className="text-right">Ras</Label>
            <div className="col-span-3">
              {loadingVarieties ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Rassen laden...</span>
                </div>
              ) : (
                <Controller
                    control={control}
                    name="variety"
                    render={({ field }) => (
                       <Combobox
                          options={allVarieties}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Kies of maak een ras..."
                          creatable
                        />
                    )}
                />
              )}
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
