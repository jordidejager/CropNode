'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarIcon, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { StoragePosition, QualityClass } from '@/lib/types';
import { cn } from '@/lib/utils';

const positionSchema = z.object({
  variety: z.string().min(1, 'Selecteer een ras'),
  subParcelId: z.string().optional().nullable(),
  dateStored: z.date().optional().nullable(),
  quantity: z.number().min(1, 'Minimaal 1').max(20, 'Maximaal 20'),
  qualityClass: z.enum(['Klasse I', 'Klasse II', 'Industrie']).optional().nullable(),
  notes: z.string().optional().nullable(),
});

type PositionFormData = z.infer<typeof positionSchema>;

interface StoragePositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position?: StoragePosition | null;
  rowIndex: number;
  colIndex: number;
  varieties: string[];
  parcels: { id: string; name: string; variety: string }[];
  onSave: (data: {
    variety: string | null;
    subParcelId: string | null;
    dateStored: Date | null;
    quantity: number;
    qualityClass: QualityClass | null;
    notes: string | null;
  }) => void;
  onClear: () => void;
  isLoading?: boolean;
}

export function StoragePositionModal({
  open,
  onOpenChange,
  position,
  rowIndex,
  colIndex,
  varieties,
  parcels,
  onSave,
  onClear,
  isLoading,
}: StoragePositionModalProps) {
  const isEditing = !!position;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PositionFormData>({
    resolver: zodResolver(positionSchema),
    defaultValues: {
      variety: '',
      subParcelId: null,
      dateStored: new Date(),
      quantity: 1,
      qualityClass: 'Klasse I',
      notes: '',
    },
  });

  const selectedVariety = watch('variety');
  const dateStored = watch('dateStored');

  // Filter parcels by selected variety
  const filteredParcels = React.useMemo(() => {
    if (!selectedVariety) return parcels;
    return parcels.filter(p => p.variety === selectedVariety);
  }, [parcels, selectedVariety]);

  // Reset form when dialog opens/closes or position changes
  React.useEffect(() => {
    if (open) {
      if (position) {
        reset({
          variety: position.variety || '',
          subParcelId: position.subParcelId,
          dateStored: position.dateStored,
          quantity: position.quantity,
          qualityClass: position.qualityClass,
          notes: position.notes || '',
        });
      } else {
        reset({
          variety: '',
          subParcelId: null,
          dateStored: new Date(),
          quantity: 1,
          qualityClass: 'Klasse I',
          notes: '',
        });
      }
    }
  }, [open, position, reset]);

  const onSubmit = (data: PositionFormData) => {
    onSave({
      variety: data.variety || null,
      subParcelId: data.subParcelId || null,
      dateStored: data.dateStored || null,
      quantity: data.quantity,
      qualityClass: data.qualityClass || null,
      notes: data.notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            Positie ({rowIndex + 1}, {colIndex + 1})
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Bewerk de gegevens van deze kistpositie.'
              : 'Vul de gegevens in voor deze kistpositie.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Variety */}
          <div className="space-y-2">
            <Label>Ras *</Label>
            <Select
              value={selectedVariety}
              onValueChange={(value) => {
                setValue('variety', value);
                // Clear parcel if it doesn't match the new variety
                const currentParcel = watch('subParcelId');
                if (currentParcel) {
                  const parcel = parcels.find(p => p.id === currentParcel);
                  if (parcel && parcel.variety !== value) {
                    setValue('subParcelId', null);
                  }
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecteer ras" />
              </SelectTrigger>
              <SelectContent>
                {varieties.map((variety) => (
                  <SelectItem key={variety} value={variety}>
                    {variety}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.variety && (
              <p className="text-xs text-red-400">{errors.variety.message}</p>
            )}
          </div>

          {/* Parcel */}
          <div className="space-y-2">
            <Label>Perceel (optioneel)</Label>
            <Select
              value={watch('subParcelId') || ''}
              onValueChange={(value) => setValue('subParcelId', value || null)}
              disabled={!selectedVariety}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedVariety ? 'Selecteer perceel' : 'Selecteer eerst een ras'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Geen perceel</SelectItem>
                {filteredParcels.map((parcel) => (
                  <SelectItem key={parcel.id} value={parcel.id}>
                    {parcel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Stored */}
          <div className="space-y-2">
            <Label>Datum inslag</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dateStored && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateStored ? format(dateStored, 'PPP', { locale: nl }) : 'Selecteer datum'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateStored || undefined}
                  onSelect={(date) => setValue('dateStored', date || null)}
                  initialFocus
                  locale={nl}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Quantity & Quality */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Aantal (stapelhoogte)</Label>
              <Input
                type="number"
                min={1}
                max={20}
                {...register('quantity', { valueAsNumber: true })}
              />
              {errors.quantity && (
                <p className="text-xs text-red-400">{errors.quantity.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Kwaliteitsklasse</Label>
              <Select
                value={watch('qualityClass') || ''}
                onValueChange={(value) => setValue('qualityClass', value as QualityClass || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Klasse I">Klasse I</SelectItem>
                  <SelectItem value="Klasse II">Klasse II</SelectItem>
                  <SelectItem value="Industrie">Industrie</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notities (optioneel)</Label>
            <Textarea
              placeholder="Eventuele opmerkingen..."
              rows={2}
              {...register('notes')}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                onClick={onClear}
                disabled={isLoading}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Legen
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
