'use client';

import * as React from 'react';
import { Plus, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCurrentHarvestYear } from '@/lib/analytics/harvest-year-utils';
import type { AnalyticsSubParcel } from '@/lib/analytics/types';
import type { ProductionSummaryInput } from '@/lib/analytics/production-queries';

interface HistoricalDataFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ProductionSummaryInput) => Promise<void>;
  subParcels: AnalyticsSubParcel[];
  parcels?: { id: string; name: string; area: number }[];
  existingYears: number[];
  editingEntry?: any;
  /** Years that already have data per sub_parcel_id, for smart "next" navigation */
  filledCells?: Map<string, Set<number>>;
  /** Available years shown in the grid (for "next empty" logic) */
  displayYears?: number[];
}

export function HistoricalDataForm({ open, onOpenChange, onSubmit, subParcels, parcels, existingYears, editingEntry, filledCells, displayYears }: HistoricalDataFormProps) {
  const currentYear = getCurrentHarvestYear();
  const years = Array.from({ length: currentYear - 2016 }, (_, i) => currentYear - i);

  const [harvestYear, setHarvestYear] = React.useState<number>(currentYear);
  const [subParcelId, setSubParcelId] = React.useState<string>('');
  const [variety, setVariety] = React.useState<string>('');
  const [totalKg, setTotalKg] = React.useState<string>('');
  const [totalCrates, setTotalCrates] = React.useState<string>('');
  const [weightPerCrate, setWeightPerCrate] = React.useState<string>('18');
  const [hectares, setHectares] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [addAnother, setAddAnother] = React.useState(false);

  // Initialize from editingEntry when dialog opens
  React.useEffect(() => {
    if (!open) return;

    if (editingEntry) {
      setHarvestYear(editingEntry.harvest_year || currentYear);
      setSubParcelId(editingEntry.sub_parcel_id || '');
      setVariety(editingEntry.variety || '');
      setTotalKg(editingEntry.total_kg?.toString() || '');
      setTotalCrates(editingEntry.total_crates?.toString() || '');
      setWeightPerCrate(editingEntry.weight_per_crate?.toString() || '18');
      setHectares(editingEntry.hectares?.toString() || '');
      setNotes(editingEntry.notes || '');

      // If sub_parcel_id is prefilled, auto-fill variety + hectares + kg/kist
      if (editingEntry.sub_parcel_id) {
        const sp = subParcels.find((s) => s.id === editingEntry.sub_parcel_id);
        if (sp) {
          if (!editingEntry.variety) setVariety(sp.variety);
          if (!editingEntry.hectares) setHectares(sp.area.toString());
          if (!editingEntry.weight_per_crate) setWeightPerCrate(getDefaultWeightPerCrate(sp.crop));
        }
      }
    } else {
      setHarvestYear(currentYear);
      setSubParcelId('');
      setVariety('');
      setTotalKg('');
      setTotalCrates('');
      setWeightPerCrate('350');
      setHectares('');
      setNotes('');
    }
  }, [open, editingEntry, currentYear, subParcels]);

  // Default kg/kist based on crop type
  function getDefaultWeightPerCrate(crop: string): string {
    const c = crop.toLowerCase();
    if (c.includes('peer')) return '400';
    if (c.includes('appel')) return '350';
    return '350';
  }

  // Auto-fill variety + hectares + kg/kist when sub-parcel changes
  const handleSubParcelChange = (id: string) => {
    const resolved = id === '__none__' ? '' : id;
    setSubParcelId(resolved);
    if (resolved) {
      const sp = subParcels.find((s) => s.id === resolved);
      if (sp) {
        setVariety(sp.variety);
        setHectares(sp.area.toString());
        setWeightPerCrate(getDefaultWeightPerCrate(sp.crop));
      }
    }
  };

  // Auto-calculate kg from crates
  React.useEffect(() => {
    if (totalCrates && weightPerCrate) {
      const kg = Number(totalCrates) * Number(weightPerCrate);
      if (kg > 0) setTotalKg(kg.toString());
    }
  }, [totalCrates, weightPerCrate]);

  // Group sub-parcels by hoofdperceel
  const groupedParcels = React.useMemo(() => {
    if (!parcels || parcels.length === 0) {
      // Fallback: no grouping
      return [{ id: '__all__', name: 'Percelen', subs: subParcels }];
    }

    const groups: { id: string; name: string; subs: AnalyticsSubParcel[] }[] = [];
    const parcelMap = new Map<string, AnalyticsSubParcel[]>();

    subParcels.forEach((sp) => {
      const key = sp.parcel_id || '__ungrouped__';
      if (!parcelMap.has(key)) parcelMap.set(key, []);
      parcelMap.get(key)!.push(sp);
    });

    parcels.forEach((p) => {
      const subs = parcelMap.get(p.id) || [];
      if (subs.length > 0) {
        groups.push({ id: p.id, name: p.name, subs: subs.sort((a, b) => a.name.localeCompare(b.name)) });
      }
    });

    // Any ungrouped
    const ungrouped = parcelMap.get('__ungrouped__');
    if (ungrouped && ungrouped.length > 0) {
      groups.push({ id: '__ungrouped__', name: 'Overig', subs: ungrouped });
    }

    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [subParcels, parcels]);

  // Selected parcel info for header display
  const selectedSp = subParcelId ? subParcels.find((s) => s.id === subParcelId) : null;
  const selectedHoofd = selectedSp && parcels ? parcels.find((p) => p.id === selectedSp.parcel_id) : null;

  // Find next empty cell for "opslaan & nog een"
  const findNextEmpty = React.useCallback((currentSpId: string, currentYear: number) => {
    if (!filledCells || !displayYears || displayYears.length === 0) {
      // No data available — just clear amounts, keep same parcel
      return { subParcelId: currentSpId, year: currentYear };
    }

    // First: try next empty year for same parcel
    const filledForParcel = filledCells.get(currentSpId) || new Set();
    // Add the year we just saved
    const updatedFilled = new Set(filledForParcel);
    updatedFilled.add(currentYear);

    for (const y of displayYears) {
      if (!updatedFilled.has(y)) {
        return { subParcelId: currentSpId, year: y };
      }
    }

    // All years filled for this parcel — try next parcel with empty years
    for (const sp of subParcels) {
      if (sp.id === currentSpId) continue;
      const filled = filledCells.get(sp.id) || new Set();
      for (const y of displayYears) {
        if (!filled.has(y)) {
          return { subParcelId: sp.id, year: y };
        }
      }
    }

    // Everything filled — stay where we are
    return { subParcelId: currentSpId, year: currentYear };
  }, [filledCells, displayYears, subParcels]);

  const handleSubmit = async () => {
    const kg = Number(totalKg);
    if (!subParcelId || !variety || kg <= 0 || !harvestYear) return;

    const input = {
      harvest_year: harvestYear,
      sub_parcel_id: subParcelId || null,
      parcel_id: subParcelId ? subParcels.find((s) => s.id === subParcelId)?.parcel_id || null : null,
      variety,
      total_kg: kg,
      total_crates: totalCrates ? Number(totalCrates) : null,
      weight_per_crate: Number(weightPerCrate) || 18,
      hectares: hectares ? Number(hectares) : null,
      notes: notes || null,
    };

    if (addAnother) {
      // Fire-and-forget — don't wait, immediately navigate to next
      onSubmit(input); // no await

      const next = findNextEmpty(subParcelId, harvestYear);
      if (next.subParcelId !== subParcelId) {
        // Switch to next parcel
        const sp = subParcels.find((s) => s.id === next.subParcelId);
        if (sp) {
          setSubParcelId(sp.id);
          setVariety(sp.variety);
          setHectares(sp.area.toString());
          setWeightPerCrate(getDefaultWeightPerCrate(sp.crop));
        }
      }
      setHarvestYear(next.year);
      setTotalKg('');
      setTotalCrates('');
      setNotes('');
    } else {
      // Normal save — fire-and-forget too, close immediately
      onSubmit(input); // no await
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="text-slate-100">{editingEntry?.id ? 'Productiedata bewerken' : 'Productiedata invoeren'}</DialogTitle>
          {selectedSp ? (
            <DialogDescription className="text-slate-400">
              <span className="text-emerald-400 font-medium">{selectedHoofd?.name || ''}</span>
              {selectedHoofd && ' → '}
              <span className="text-slate-300">{selectedSp.name}</span>
              {' · '}{selectedSp.variety}{' · '}{selectedSp.area} ha{' · Oogst '}{harvestYear}
            </DialogDescription>
          ) : (
            <DialogDescription className="text-slate-400">
              Selecteer een perceel en vul de oogstopbrengst in.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Row: Year + Parcel side by side */}
          <div className="grid grid-cols-5 gap-3">
            {/* Harvest Year — compact */}
            <div className="col-span-2 space-y-1.5">
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

            {/* Sub-Parcel — grouped by hoofdperceel */}
            <div className="col-span-3 space-y-1.5">
              <Label className="text-xs text-slate-400">Perceel *</Label>
              <Select value={subParcelId || '__none__'} onValueChange={handleSubParcelChange}>
                <SelectTrigger className={`bg-white/5 border-white/10 text-slate-200 ${!subParcelId ? 'border-amber-500/30' : ''}`}>
                  <SelectValue placeholder="Selecteer perceel..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 max-h-[300px]">
                  {groupedParcels.map((group) => (
                    <SelectGroup key={group.id}>
                      <SelectLabel className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider px-2 py-1.5 flex items-center gap-1.5">
                        <MapPin className="size-3" />
                        {group.name}
                      </SelectLabel>
                      {group.subs.map((sp) => (
                        <SelectItem key={sp.id} value={sp.id} className="text-slate-200 focus:bg-white/10 pl-6">
                          {sp.name} — {sp.variety}, {sp.area} ha
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Auto-filled info strip */}
          {subParcelId && selectedSp && (
            <div className="flex items-center gap-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2 text-xs text-slate-300">
              <span>Ras: <strong className="text-slate-100">{variety}</strong></span>
              <span className="text-slate-600">·</span>
              <span>Hectares: <strong className="text-slate-100">{hectares}</strong></span>
            </div>
          )}

          {/* Total KG — or calculate from crates */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Totaal kg * <span className="text-slate-600">(of bereken via kisten hieronder)</span></Label>
            <Input
              type="number"
              value={totalKg}
              onChange={(e) => setTotalKg(e.target.value)}
              placeholder="bijv. 45000"
              autoFocus={!!subParcelId}
              className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600"
            />
          </div>

          {/* Crates + weight per crate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Kisten</Label>
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
                onChange={(e) => { setWeightPerCrate(e.target.value); setTotalKg(''); }}
                className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600"
              />
            </div>
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
            disabled={!subParcelId || !variety || !totalKg}
            className="text-slate-400 hover:text-slate-200 hover:bg-white/5"
          >
            <Plus className="size-4 mr-1" /> Opslaan & nog een
          </Button>
          <Button
            onClick={() => { setAddAnother(false); handleSubmit(); }}
            disabled={!subParcelId || !variety || !totalKg}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {editingEntry?.id ? 'Bijwerken' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
