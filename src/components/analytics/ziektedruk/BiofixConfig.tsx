'use client';

import { useState, useTransition } from 'react';
import { Calendar, Leaf, Settings2, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DiseaseModelConfig, InoculumPressure } from '@/lib/disease-models/types';

interface BiofixConfigProps {
  parcels: { id: string; name: string }[];
  selectedParcelId: string;
  onParcelChange: (id: string) => void;
  harvestYear: number;
  config: DiseaseModelConfig | null;
  onSave: (biofixDate: string, inoculumPressure: InoculumPressure) => Promise<void>;
  onRecalculate?: () => Promise<void>;
  suggestedBiofixDate?: string | null; // YYYY-MM-DD, from phenology
}

const INOCULUM_LABELS: Record<InoculumPressure, string> = {
  low: 'Laag',
  medium: 'Gemiddeld',
  high: 'Hoog',
};

const INOCULUM_DESCRIPTIONS: Record<InoculumPressure, string> = {
  low: 'Weinig tot geen schurft vorig seizoen',
  medium: 'Normale schurftdruk',
  high: 'Veel schurft vorig seizoen',
};

export function BiofixConfig({
  parcels,
  selectedParcelId,
  onParcelChange,
  harvestYear,
  config,
  onSave,
  onRecalculate,
  suggestedBiofixDate,
}: BiofixConfigProps) {
  const [biofixDate, setBiofixDate] = useState<Date | undefined>(
    config?.biofix_date ? new Date(config.biofix_date + 'T12:00:00') : undefined
  );
  const [inoculum, setInoculum] = useState<InoculumPressure>(
    (config?.inoculum_pressure as InoculumPressure) ?? 'medium'
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (!biofixDate) return;
    const dateStr = format(biofixDate, 'yyyy-MM-dd');
    startTransition(async () => {
      await onSave(dateStr, inoculum);
    });
  };

  // Setup mode: no config yet
  if (!config) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
            <AlertTriangle className="size-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Stel de groene-punt datum in
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">
              De groene punt is het moment waarop de eerste bladpunten zichtbaar
              worden (fenologisch stadium C/C3). Dit verschilt per ras en per
              jaar.
            </p>
          </div>
        </div>

        {/* Suggested date from phenology */}
        {suggestedBiofixDate && !biofixDate && (
          <button
            onClick={() => setBiofixDate(new Date(suggestedBiofixDate + 'T12:00:00'))}
            className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 hover:bg-emerald-500/15 transition-colors"
          >
            <Sparkles className="size-3.5" />
            Suggestie op basis van bloeidata: {format(new Date(suggestedBiofixDate + 'T12:00:00'), 'd MMMM yyyy', { locale: nl })}
          </button>
        )}

        <div className="flex flex-wrap items-end gap-3">
          {/* Parcel selector */}
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Perceel
            </label>
            <Select value={selectedParcelId} onValueChange={onParcelChange}>
              <SelectTrigger className="w-full bg-white/5 border-white/10">
                <SelectValue placeholder="Selecteer perceel" />
              </SelectTrigger>
              <SelectContent>
                {parcels.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Biofix date picker */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Groene punt ({harvestYear})
            </label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[200px] justify-start bg-white/5 border-white/10 text-left font-normal"
                >
                  <Calendar className="mr-2 size-4 text-slate-400" />
                  {biofixDate
                    ? format(biofixDate, 'd MMMM yyyy', { locale: nl })
                    : 'Selecteer datum'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={biofixDate}
                  onSelect={(d) => {
                    setBiofixDate(d);
                    setCalendarOpen(false);
                  }}
                  locale={nl}
                  defaultMonth={
                    new Date(harvestYear, 1) // February
                  }
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Inoculum pressure */}
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Inoculumdruk
            </label>
            <Select
              value={inoculum}
              onValueChange={(v) => setInoculum(v as InoculumPressure)}
            >
              <SelectTrigger className="w-full bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['low', 'medium', 'high'] as InoculumPressure[]).map(
                  (level) => (
                    <SelectItem key={level} value={level}>
                      <span>{INOCULUM_LABELS[level]}</span>
                      <span className="text-slate-500 ml-2 text-xs">
                        — {INOCULUM_DESCRIPTIONS[level]}
                      </span>
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSave}
            disabled={!biofixDate || isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {isPending ? (
              <>
                <Leaf className="mr-2 size-4 animate-spin" />
                Berekenen...
              </>
            ) : (
              <>
                <Leaf className="mr-2 size-4" />
                Opslaan & berekenen
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Compact mode: config exists
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Parcel selector */}
      <Select value={selectedParcelId} onValueChange={onParcelChange}>
        <SelectTrigger className="w-[200px] bg-white/5 border-white/10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {parcels.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5">
        <Calendar className="size-3.5 text-emerald-400" />
        <span className="text-sm text-slate-300">
          Groene punt:{' '}
          {format(new Date(config.biofix_date + 'T12:00:00'), 'd MMM yyyy', {
            locale: nl,
          })}
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5">
        <Settings2 className="size-3.5 text-slate-400" />
        <span className="text-sm text-slate-300">
          Inoculum: {INOCULUM_LABELS[config.inoculum_pressure as InoculumPressure] ?? 'Gemiddeld'}
        </span>
      </div>

      {/* Recalculate button */}
      {onRecalculate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            startTransition(async () => {
              await onRecalculate();
            });
          }}
          disabled={isPending}
          className="text-slate-400 hover:text-emerald-400"
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'Berekenen...' : 'Herberekenen'}
        </Button>
      )}

      {/* Edit button */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200">
            Wijzigen
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Groene punt
              </label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-white/5 border-white/10 text-left font-normal"
                  >
                    <Calendar className="mr-2 size-4 text-slate-400" />
                    {biofixDate
                      ? format(biofixDate, 'd MMMM yyyy', { locale: nl })
                      : 'Selecteer datum'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={biofixDate}
                    onSelect={(d) => {
                      setBiofixDate(d);
                      setCalendarOpen(false);
                    }}
                    locale={nl}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Inoculumdruk
              </label>
              <Select
                value={inoculum}
                onValueChange={(v) => setInoculum(v as InoculumPressure)}
              >
                <SelectTrigger className="w-full bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high'] as InoculumPressure[]).map(
                    (level) => (
                      <SelectItem key={level} value={level}>
                        {INOCULUM_LABELS[level]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSave}
              disabled={!biofixDate || isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
              size="sm"
            >
              {isPending ? 'Herberekenen...' : 'Opslaan & herberekenen'}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
