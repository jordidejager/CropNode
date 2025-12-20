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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Combobox } from './ui/combobox';
import { useFirestore } from '@/firebase';
import { getParcels } from '@/lib/store';
import { Loader2 } from 'lucide-react';

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
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch, control } = useForm<ParcelFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      crop: '',
      variety: [],
      area: 0,
    }
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allVarieties, setAllVarieties] = useState<string[]>([]);
  const [loadingVarieties, setLoadingVarieties] = useState(true);
  const db = useFirestore();

  useEffect(() => {
    async function fetchVarieties() {
      if (!db) return;
      setLoadingVarieties(true);
      const parcels = await getParcels(db);
      const uniqueVarieties = [...new Set(parcels.flatMap(p => p.variety))];
      setAllVarieties(uniqueVarieties);
      setLoadingVarieties(false);
    }
    fetchVarieties();
  }, [db, isOpen]);
  
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

  const varietyValue = watch('variety');

  const varietyOptions = allVarieties.map(v => ({ value: v, label: v }));

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
                <Combobox
                    options={varietyOptions}
                    value={typeof varietyValue === 'string' ? varietyValue.split(',').map(v => v.trim()).filter(Boolean) : varietyValue}
                    onValueChange={(values) => setValue('variety', values.join(', '))}
                    placeholder="Kies of maak rassen..."
                    multiple
                />
              )}
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
