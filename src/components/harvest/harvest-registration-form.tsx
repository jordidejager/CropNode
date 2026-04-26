'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarIcon, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useParcels } from '@/hooks/use-data';
import { useParcelGroupOptions } from '@/hooks/use-parcel-group-options';
import { UnifiedParcelMultiSelect } from '@/components/domain/unified-parcel-multi-select';
import type { HarvestRegistration, HarvestRegistrationInput, PickNumber, QualityClass } from '@/lib/types';

interface HarvestRegistrationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: HarvestRegistrationInput) => void;
  editingHarvest?: HarvestRegistration | null;
  isLoading?: boolean;
}

export function HarvestRegistrationForm({
  open,
  onOpenChange,
  onSubmit,
  editingHarvest,
  isLoading,
}: HarvestRegistrationFormProps) {
  const { data: parcels = [] } = useParcels();
  const { data: parcelGroups = [] } = useParcelGroupOptions();

  // Form state
  const [subParcelId, setSubParcelId] = React.useState<string>('');
  const [harvestDate, setHarvestDate] = React.useState<Date>(new Date());
  const [pickNumber, setPickNumber] = React.useState<PickNumber>(1);
  const [totalCrates, setTotalCrates] = React.useState<string>('');
  const [qualityClass, setQualityClass] = React.useState<QualityClass | ''>('');
  const [weightPerCrate, setWeightPerCrate] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');

  // Initialize form when editing
  React.useEffect(() => {
    if (editingHarvest) {
      setSubParcelId(editingHarvest.subParcelId || '');
      setHarvestDate(editingHarvest.harvestDate);
      setPickNumber(editingHarvest.pickNumber);
      setTotalCrates(editingHarvest.totalCrates.toString());
      setQualityClass(editingHarvest.qualityClass || '');
      setWeightPerCrate(editingHarvest.weightPerCrate?.toString() || '');
      setNotes(editingHarvest.notes || '');
    } else {
      // Reset form for new registration
      setSubParcelId('');
      setHarvestDate(new Date());
      setPickNumber(1);
      setTotalCrates('');
      setQualityClass('');
      setWeightPerCrate('');
      setNotes('');
    }
  }, [editingHarvest, open]);

  // Get selected parcel info for variety
  // SprayableParcel.id is the sub_parcel id
  const selectedParcel = parcels.find((p) => p.id === subParcelId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!subParcelId || !totalCrates) return;

    const data: HarvestRegistrationInput = {
      subParcelId,
      parcelId: selectedParcel?.parcelId || null,
      variety: selectedParcel?.variety || 'Onbekend',
      harvestDate,
      pickNumber,
      totalCrates: parseInt(totalCrates, 10),
      qualityClass: qualityClass || null,
      weightPerCrate: weightPerCrate ? parseFloat(weightPerCrate) : null,
      season: calculateSeason(harvestDate),
      notes: notes || null,
    };

    onSubmit(data);
  };

  // Calculate season from date
  function calculateSeason(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    if (month >= 7) {
      return `${year}-${year + 1}`;
    } else {
      return `${year - 1}-${year}`;
    }
  }

  // Group parcels by main parcel name for better UX
  const groupedParcels = React.useMemo(() => {
    const groups: Record<string, typeof parcels> = {};
    for (const parcel of parcels) {
      const key = parcel.parcelName || 'Overig';
      if (!groups[key]) groups[key] = [];
      groups[key].push(parcel);
    }
    return groups;
  }, [parcels]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingHarvest ? 'Oogst bewerken' : 'Nieuwe oogst registreren'}
          </DialogTitle>
          <DialogDescription>
            Registreer de geplukte kisten voor een perceel.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Sub-parcel selection */}
          <div className="space-y-2">
            <Label htmlFor="sub-parcel">Perceel / Blok</Label>
            <UnifiedParcelMultiSelect
              groups={parcelGroups}
              selectedSubParcelIds={subParcelId ? [subParcelId] : []}
              onChange={(ids) => setSubParcelId(ids[ids.length - 1] ?? '')}
              mode="single"
              placeholder="Selecteer een perceel..."
            />
          </div>

          {/* Date and pick number row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Plukdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !harvestDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {harvestDate ? (
                      format(harvestDate, 'd MMMM yyyy', { locale: nl })
                    ) : (
                      <span>Selecteer datum</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={harvestDate}
                    onSelect={(date) => date && setHarvestDate(date)}
                    disabled={(date) =>
                      date > new Date() || date < new Date('2020-01-01')
                    }
                    initialFocus
                    locale={nl}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pick-number">Pluk nummer</Label>
              <Select
                value={pickNumber.toString()}
                onValueChange={(v) => setPickNumber(parseInt(v, 10) as PickNumber)}
              >
                <SelectTrigger id="pick-number">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num}e pluk
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Crates and quality row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total-crates">Aantal kisten</Label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="total-crates"
                  type="number"
                  min="1"
                  value={totalCrates}
                  onChange={(e) => setTotalCrates(e.target.value)}
                  placeholder="0"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quality-class">Kwaliteitsklasse</Label>
              <Select
                value={qualityClass || '_none'}
                onValueChange={(v) => setQualityClass(v === '_none' ? '' : v as QualityClass)}
              >
                <SelectTrigger id="quality-class">
                  <SelectValue placeholder="Optioneel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Geen</SelectItem>
                  <SelectItem value="Klasse I">Klasse I</SelectItem>
                  <SelectItem value="Klasse II">Klasse II</SelectItem>
                  <SelectItem value="Industrie">Industrie</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Weight per crate */}
          <div className="space-y-2">
            <Label htmlFor="weight-per-crate">Gewicht per kist (kg)</Label>
            <Input
              id="weight-per-crate"
              type="number"
              step="0.1"
              min="0"
              value={weightPerCrate}
              onChange={(e) => setWeightPerCrate(e.target.value)}
              placeholder="Optioneel"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notities</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optionele opmerkingen..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={!subParcelId || !totalCrates || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? 'Opslaan...' : editingHarvest ? 'Bijwerken' : 'Registreren'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
