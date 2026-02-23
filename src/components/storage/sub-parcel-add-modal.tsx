'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarIcon, Check, Package, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useLegacyParcels, useAvailableHarvestsForStorage } from '@/hooks/use-data';
import { SUB_PARCEL_COLORS, type CellSubParcel, type PickNumber } from '@/lib/types';

// Pick options for fruit harvesting
const PICK_OPTIONS: { value: PickNumber; label: string }[] = [
  { value: 1, label: '1e pluk' },
  { value: 2, label: '2e pluk' },
  { value: 3, label: '3e pluk' },
  { value: 4, label: '4e pluk' },
  { value: 5, label: '5e pluk' },
];

const formSchema = z.object({
  subParcelId: z.string().min(1, 'Selecteer een subperceel'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Ongeldige kleurcode'),
  pickDate: z.date(),
  pickNumber: z.number().min(1).max(5),
  notes: z.string().optional().nullable(),
  harvestRegistrationId: z.string().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface SubParcelAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cellId: string;
  existingSubParcel?: CellSubParcel; // For edit mode
  usedColors: string[]; // Colors already in use in this cell
  onSubmit: (data: {
    parcelId: string | null;
    subParcelId: string | null;
    variety: string;
    color: string;
    pickDate: Date;
    pickNumber: PickNumber;
    notes: string | null;
    harvestRegistrationId: string | null;
  }) => Promise<void>;
}

export function SubParcelAddModal({
  open,
  onOpenChange,
  cellId,
  existingSubParcel,
  usedColors,
  onSubmit,
}: SubParcelAddModalProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { data: parcels, isLoading: parcelsLoading } = useLegacyParcels();
  const { data: availableHarvests = [] } = useAvailableHarvestsForStorage();

  const isEditMode = !!existingSubParcel;

  // Flatten all sub-parcels from all parcels for the dropdown
  const allSubParcels = React.useMemo(() => {
    if (!parcels) return [];

    const result: Array<{
      id: string;
      parcelId: string;
      parcelName: string;
      name: string | undefined;
      variety: string;
      displayName: string;
    }> = [];

    parcels.forEach((parcel) => {
      if (parcel.subParcels && parcel.subParcels.length > 0) {
        parcel.subParcels.forEach((sp) => {
          const displayName = sp.name
            ? `${parcel.name} - ${sp.name} (${sp.variety})`
            : `${parcel.name} (${sp.variety})`;

          result.push({
            id: sp.id,
            parcelId: parcel.id,
            parcelName: parcel.name,
            name: sp.name,
            variety: sp.variety,
            displayName,
          });
        });
      }
    });

    // Sort by display name
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [parcels]);

  // Get next available color
  const nextAvailableColor = React.useMemo(() => {
    const availableColors = SUB_PARCEL_COLORS.filter(
      (c) => !usedColors.includes(c.hex)
    );
    return availableColors[0]?.hex || SUB_PARCEL_COLORS[0].hex;
  }, [usedColors]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subParcelId: existingSubParcel?.subParcelId || '',
      color: existingSubParcel?.color || nextAvailableColor,
      pickDate: existingSubParcel?.pickDate
        ? new Date(existingSubParcel.pickDate)
        : new Date(),
      pickNumber: existingSubParcel?.pickNumber || 1,
      notes: existingSubParcel?.notes || null,
      harvestRegistrationId: existingSubParcel?.harvestRegistrationId || null,
    },
  });

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      form.reset({
        subParcelId: existingSubParcel?.subParcelId || '',
        color: existingSubParcel?.color || nextAvailableColor,
        pickDate: existingSubParcel?.pickDate
          ? new Date(existingSubParcel.pickDate)
          : new Date(),
        pickNumber: existingSubParcel?.pickNumber || 1,
        notes: existingSubParcel?.notes || null,
        harvestRegistrationId: existingSubParcel?.harvestRegistrationId || null,
      });
    }
  }, [open, existingSubParcel, nextAvailableColor, form]);

  // Get selected sub-parcel details
  const selectedSubParcelId = form.watch('subParcelId');
  const selectedSubParcel = allSubParcels.find((sp) => sp.id === selectedSubParcelId);

  // Get filtered harvests for the selected sub-parcel
  const filteredHarvests = React.useMemo(() => {
    if (!selectedSubParcelId) return availableHarvests;
    return availableHarvests.filter(h => h.subParcelId === selectedSubParcelId);
  }, [availableHarvests, selectedSubParcelId]);

  const handleSubmit = async (data: FormData) => {
    const subParcel = allSubParcels.find((sp) => sp.id === data.subParcelId);
    if (!subParcel) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        parcelId: subParcel.parcelId,
        subParcelId: data.subParcelId,
        variety: subParcel.variety,
        color: data.color,
        pickDate: data.pickDate,
        pickNumber: data.pickNumber as PickNumber,
        notes: data.notes || null,
        harvestRegistrationId: data.harvestRegistrationId && data.harvestRegistrationId !== '_none' ? data.harvestRegistrationId : null,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Partij bewerken' : 'Partij toevoegen'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Wijzig de gegevens van deze partij.'
              : 'Voeg een partij toe aan deze cel voor het tracken van opgeslagen kisten.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Sub-parcel selector */}
            <FormField
              control={form.control}
              name="subParcelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subperceel *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={parcelsLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer subperceel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {allSubParcels.map((sp) => (
                        <SelectItem key={sp.id} value={sp.id}>
                          {sp.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Show selected variety (read-only info) */}
            {selectedSubParcel && (
              <div className="text-sm text-muted-foreground bg-white/5 rounded-lg px-3 py-2">
                Ras: <span className="text-white font-medium">{selectedSubParcel.variety}</span>
              </div>
            )}

            {/* Pick number selector */}
            <FormField
              control={form.control}
              name="pickNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pluk *</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer pluk" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PICK_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Color picker */}
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kleur</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {SUB_PARCEL_COLORS.map((color) => {
                      const isUsed = usedColors.includes(color.hex) && field.value !== color.hex;
                      const isSelected = field.value === color.hex;

                      return (
                        <button
                          key={color.hex}
                          type="button"
                          disabled={isUsed}
                          onClick={() => field.onChange(color.hex)}
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            isSelected && 'ring-2 ring-white ring-offset-2',
                            isUsed && 'opacity-30 cursor-not-allowed'
                          )}
                          style={{ backgroundColor: color.hex }}
                          title={isUsed ? `${color.name} (al in gebruik)` : color.name}
                        >
                          {isSelected && <Check className="h-4 w-4 text-white drop-shadow" />}
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pick date */}
            <FormField
              control={form.control}
              name="pickDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Plukdatum</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'd MMMM yyyy', { locale: nl })
                          ) : (
                            <span>Selecteer datum</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date('2020-01-01')
                        }
                        initialFocus
                        locale={nl}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notities</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Extra informatie over deze partij..."
                      className="resize-none"
                      rows={2}
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Harvest registration link (optional) */}
            {filteredHarvests.length > 0 && (
              <FormField
                control={form.control}
                name="harvestRegistrationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Koppelen aan oogstregistratie
                    </FormLabel>
                    <Select
                      value={field.value || '_none'}
                      onValueChange={(v) => field.onChange(v === '_none' ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Geen koppeling (optioneel)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">Geen koppeling</SelectItem>
                        {filteredHarvests.map((harvest) => {
                          const locationName = harvest.subParcelName
                            ? `${harvest.parcelName || ''} - ${harvest.subParcelName}`.trim()
                            : harvest.parcelName || harvest.variety;
                          return (
                            <SelectItem key={harvest.id} value={harvest.id}>
                              <div className="flex items-center gap-2">
                                <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="truncate">
                                  {format(harvest.harvestDate, 'd MMM', { locale: nl })} — {locationName} ({harvest.variety})
                                </span>
                                <span className="text-xs text-emerald-400 flex-shrink-0">
                                  {harvest.remainingCrates} kisten
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Koppel aan een geregistreerde oogst om de opslag te tracken.
                    </FormDescription>
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting || !selectedSubParcel}>
                {isSubmitting
                  ? 'Opslaan...'
                  : isEditMode
                  ? 'Opslaan'
                  : 'Toevoegen'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
