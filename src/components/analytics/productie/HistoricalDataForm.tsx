'use client';

import * as React from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCurrentHarvestYear } from '@/lib/analytics/harvest-year-utils';
import type { AnalyticsSubParcel } from '@/lib/analytics/types';
import type { ProductionSummaryInput } from '@/lib/analytics/production-queries';

interface HistoricalDataFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ProductionSummaryInput) => Promise<void>;
  subParcels: AnalyticsSubParcel[];
  existingYears: number[];
  editingEntry?: any;
}

export function HistoricalDataForm({ open, onOpenChange, onSubmit, subParcels, existingYears, editingEntry }: HistoricalDataFormProps) {
  const currentYear = getCurrentHarvestYear();
  const years = Array.from({ length: currentYear - 2014 }, (_, i) => currentYear - i);

  const [harvestYear, setHarvestYear] = React.useState<number>(editingEntry?.harvest_year || currentYear);
  const [subParcelId, setSubParcelId] = React.useState<string>(editingEntry?.sub_parcel_id || '');
  const [variety, setVariety] = React.useState<string>(editingEntry?.variety || '');
  const [totalKg, setTotalKg] = React.useState<string>(editingEntry?.total_kg?.toString() || '');
  const [totalCrates, setTotalCrates] = React.useState<string>(editingEntry?.total_crates?.toString() || '');
  const [weightPerCrate, setWeightPerCrate] = React.useState<string>(editingEntry?.weight_per_crate?.toString() || '18');
  const [hectares, setHectares] = React.useState<string>(editingEntry?.hectares?.toString() || '');
  const [notes, setNotes] = React.useState<string>(editingEntry?.notes || '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [addAnother, setAddAnother] = React.useState(false);

  // Reset on open
  React.useEffect(() => {
    if (open && !editingEntry) {
      setHarvestYear(currentYear);
      setSubParcelId('');
      setVariety('');
      setTotalKg('');
      setTotalCrates('');
      setWeightPerCrate('18');
      setHectares('');
      setNotes('');
    }
  }, [open, editingEntry, currentYear]);

  // Auto-fill variety when sub-parcel is selected
  React.useEffect(() => {
    if (subParcelId) {
      const sp = subParcels.find((s) => s.id === subParcelId);
      if (sp) {
        setVariety(sp.variety);
        if (!hectares) setHectares(sp.area.toString());
      }
    }
  }, [subParcelId, subParcels, hectares]);

  // Auto-calculate kg from crates
  React.useEffect(() => {
    if (totalCrates && weightPerCrate && !totalKg) {
      const kg = Number(totalCrates) * Number(weightPerCrate);
      if (kg > 0) setTotalKg(kg.toString());
    }
  }, [totalCrates, weightPerCrate, totalKg]);

  const varieties = [...new Set(subParcels.map((s) => s.variety))].sort();

  const handleSubmit = async () => {
    const kg = Number(totalKg);
    if (!variety || kg <= 0 || !harvestYear) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        harvest_year: harvestYear,
        sub_parcel_id: subParcelId || null,
        parcel_id: subParcelId ? subParcels.find((s) => s.id === subParcelId)?.parcel_id || null : null,
        variety,
        total_kg: kg,
        total_crates: totalCrates ? Number(totalCrates) : null,
        weight_per_crate: Number(weightPerCrate) || 18,
        hectares: hectares ? Number(hectares) : null,
        notes: notes || null,
      });

      if (addAnother) {
        // Keep parcel/variety, clear amounts and change year
        setTotalKg('');
        setTotalCrates('');
        setNotes('');
      } else {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="text-slate-100">{editingEntry ? 'Productiedata bewerken' : 'Historische productiedata'}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Voer de totale oogstopbrengst in voor een oogstjaar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Harvest Year */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Oogstjaar *</Label>
            <Select value={harvestYear.toString()} onValueChange={(v) => setHarvestYear(Number(v))}>
              <SelectTrigger className="bg-white/5 border-white/10 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()} className="text-slate-200 focus:bg-white/10">
                    Oogst {y}
                    {existingYears.includes(y) && <span className="ml-2 text-[10px] text-emerald-400">(data)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-Parcel */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Perceel (optioneel)</Label>
            <Select value={subParcelId || '__none__'} onValueChange={(v) => setSubParcelId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-slate-200">
                <SelectValue placeholder="Geheel bedrijf" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="__none__" className="text-slate-400 focus:bg-white/10">Geheel bedrijf</SelectItem>
                {subParcels.map((sp) => (
                  <SelectItem key={sp.id} value={sp.id} className="text-slate-200 focus:bg-white/10">
                    {sp.name} ({sp.variety}, {sp.area} ha)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Variety */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Ras *</Label>
            <Input
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              placeholder="bijv. Conference, Elstar"
              list="variety-list"
              className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600"
            />
            <datalist id="variety-list">
              {varieties.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>

          {/* Total KG */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Totaal kg *</Label>
            <Input
              type="number"
              value={totalKg}
              onChange={(e) => setTotalKg(e.target.value)}
              placeholder="bijv. 45000"
              className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600"
            />
          </div>

          {/* Crates + weight per crate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Kisten (optioneel)</Label>
              <Input
                type="number"
                value={totalCrates}
                onChange={(e) => { setTotalCrates(e.target.value); setTotalKg(''); }}
                placeholder="bijv. 2500"
                className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Kg/kist</Label>
              <Input
                type="number"
                value={weightPerCrate}
                onChange={(e) => setWeightPerCrate(e.target.value)}
                className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* Hectares */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Hectares (optioneel — voor kg/ha berekening)</Label>
            <Input
              type="number"
              step="0.01"
              value={hectares}
              onChange={(e) => setHectares(e.target.value)}
              placeholder="bijv. 2.5"
              className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Notities</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optionele opmerkingen"
              rows={2}
              className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => { setAddAnother(true); handleSubmit(); }}
            disabled={isSubmitting || !variety || !totalKg}
            className="text-slate-400 hover:text-slate-200 hover:bg-white/5"
          >
            <Plus className="size-4 mr-1" /> Opslaan & nog een
          </Button>
          <Button
            onClick={() => { setAddAnother(false); handleSubmit(); }}
            disabled={isSubmitting || !variety || !totalKg}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
            {editingEntry ? 'Bijwerken' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
