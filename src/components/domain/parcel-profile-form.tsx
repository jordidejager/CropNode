"use client";

import React, { useMemo, useCallback, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { useParcelProfile, useUpdateParcelProfile } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronDown, Save, Loader2, TreePine, Ruler, Settings2,
  Shield, Droplets, Mountain, Award, History, FileText, Sprout, X,
} from "lucide-react";
import {
  GEWAS_OPTIES, RAS_SUGGESTIES, ONDERSTAM_SUGGESTIES,
  TEELTSYSTEEM_OPTIES, RIJRICHTING_OPTIES,
  HAGELNET_OPTIES, REGENKAP_OPTIES, INSECTENNET_OPTIES, WINDSCHERM_OPTIES, STEUNCONSTRUCTIE_OPTIES,
  IRRIGATIE_OPTIES, FERTIGATIE_OPTIES, NACHTVORSTBEREGENING_OPTIES, KOELBEREGENING_OPTIES, WATERBRON_OPTIES, DRAINAGE_OPTIES,
  GRONDSOORT_OPTIES, GRONDWATERNIVEAU_OPTIES,
  CERTIFICERING_OPTIES, DUURZAAMHEIDSPROGRAMMA_OPTIES,
  VOORGAAND_GEWAS_OPTIES, HERINPLANT_OPTIES,
} from "@/lib/parcel-profile-constants";

interface ParcelProfileFormProps {
  parcelId?: string;
  subParcelId?: string;
  /** Pre-fill gewas/ras vanuit het subperceel als er nog geen profiel is */
  defaultGewas?: string;
  defaultRas?: string;
}

type FormData = Record<string, unknown>;

// ============================================
// Section wrapper met voortgangsindicator
// ============================================

function ProfileSection({
  title,
  icon: Icon,
  fields,
  values,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  fields: string[];
  values: FormData;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const filled = fields.filter(f => values[f] != null && values[f] !== '' && values[f] !== undefined).length;
  const total = fields.length;
  const isComplete = filled === total && total > 0;

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] transition-all group">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="font-bold text-[14px] text-white flex-1 text-left">{title}</span>
        <span className={`text-[11px] font-mono font-bold tabular-nums ${isComplete ? 'text-primary' : 'text-white/25'}`}>
          {filled}/{total}
        </span>
        <ChevronDown className="h-4 w-4 text-white/20 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-5 py-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================
// Field helpers
// ============================================

function Field({ label, children, source, className = "" }: { label: string; children: React.ReactNode; source?: string; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5 flex items-center gap-2">
        {label}
        {source && (
          <span className="text-[9px] text-primary/60 font-normal normal-case tracking-normal bg-primary/10 px-1.5 py-0.5 rounded">
            {source}
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder = "Selecteer...",
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  options: readonly string[] | readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  const items = options.map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="bg-white/[0.03] border-white/[0.08] h-10">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map(item => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectChips({
  value = [],
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: readonly string[];
}) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter(v => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const selected = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selected
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:border-white/15'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ComboboxField({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes((search || value || '').toLowerCase())
  );

  return (
    <div className="relative">
      <Input
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className="bg-white/[0.03] border-white/[0.08] h-10"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-40 overflow-auto bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl">
          {filtered.slice(0, 8).map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Weighted multi-value field (e.g. 70% Kwee MC + 30% Kwee Adams)
// ============================================

type WeightedEntry = { value: string; percentage: number };

function WeightedComboboxField({
  value = [],
  onChange,
  suggestions,
  placeholder = "Typ of selecteer...",
}: {
  value: WeightedEntry[];
  onChange: (v: WeightedEntry[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const addEntry = () => {
    const remaining = 100 - value.reduce((sum, e) => sum + e.percentage, 0);
    onChange([...value, { value: '', percentage: Math.max(0, remaining) }]);
  };

  const updateEntry = (index: number, field: 'value' | 'percentage', val: string | number) => {
    const updated = [...value];
    if (field === 'percentage') {
      updated[index] = { ...updated[index], percentage: Math.min(100, Math.max(0, Number(val))) };
    } else {
      updated[index] = { ...updated[index], value: val as string };
    }
    onChange(updated);
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const total = value.reduce((sum, e) => sum + e.percentage, 0);

  // Als er nog geen entries zijn, toon een simpel "toevoegen" button
  if (value.length === 0) {
    return (
      <button
        type="button"
        onClick={addEntry}
        className="w-full h-10 rounded-lg border border-dashed border-white/10 text-xs text-white/30 hover:border-white/20 hover:text-white/50 transition-all flex items-center justify-center gap-1.5"
      >
        <span className="text-lg leading-none">+</span> Onderstam toevoegen
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {value.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* Percentage */}
          <div className="w-20 shrink-0">
            <Input
              type="number"
              min={0}
              max={100}
              value={entry.percentage}
              onChange={(e) => updateEntry(i, 'percentage', e.target.value)}
              className="bg-white/[0.03] border-white/[0.08] h-9 text-center text-sm font-mono"
            />
          </div>
          <span className="text-xs text-white/30 shrink-0">%</span>

          {/* Combobox */}
          <div className="flex-1">
            <ComboboxField
              value={entry.value}
              onChange={(v) => updateEntry(i, 'value', v)}
              suggestions={suggestions}
              placeholder={placeholder}
            />
          </div>

          {/* Remove */}
          <button
            type="button"
            onClick={() => removeEntry(i)}
            className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Footer: totaal + toevoegen */}
      <div className="flex items-center justify-between pt-1">
        <span className={`text-[11px] font-mono font-bold ${
          total === 100 ? 'text-emerald-400' : total > 100 ? 'text-red-400' : 'text-amber-400'
        }`}>
          Totaal: {total}%
        </span>
        <button
          type="button"
          onClick={addEntry}
          className="text-[11px] text-primary/60 hover:text-primary font-bold transition-colors"
        >
          + Nog een onderstam
        </button>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ParcelProfileForm({ parcelId, subParcelId, defaultGewas, defaultRas }: ParcelProfileFormProps) {
  const id = subParcelId || parcelId || '';
  const type = subParcelId ? 'sub_parcel' : 'parcel';
  const { data: profileData, isLoading } = useParcelProfile(id || undefined, type as 'parcel' | 'sub_parcel');
  const updateProfile = useUpdateParcelProfile(id, type as 'parcel' | 'sub_parcel');
  const { toast } = useToast();

  const profile = profileData?.profile;
  const latestAnalysis = profileData?.latestSoilAnalysis;

  const { register, handleSubmit, watch, setValue, control, reset } = useForm<FormData>({
    defaultValues: {},
  });

  // Helper: vul bodemkenmerken aan vanuit grondmonster (altijd overschrijven als grondmonster data heeft)
  const applySoilDefaults = useCallback((target: FormData, analysis: any) => {
    if (!analysis || analysis.extractie_status !== 'completed') return;
    // Altijd vullen vanuit grondmonster als de waarde beschikbaar is
    if (analysis.grondsoort_rapport) target.grondsoort = analysis.grondsoort_rapport;
    if (analysis.organische_stof_pct != null) target.organische_stof_pct = analysis.organische_stof_pct;
    if (analysis.klei_percentage != null) target.klei_percentage = analysis.klei_percentage;
  }, []);

  // Populate form when profile loads, or use defaults from sub_parcel + latest soil analysis
  useEffect(() => {
    if (profile) {
      const merged = { ...profile };
      applySoilDefaults(merged, latestAnalysis);
      reset(merged);
    } else if (profileData && !profile) {
      const defaults: FormData = {};
      if (defaultGewas) defaults.gewas = defaultGewas;
      if (defaultRas) defaults.ras = defaultRas;
      applySoilDefaults(defaults, latestAnalysis);
      if (Object.keys(defaults).length > 0) reset(defaults);
    }
  }, [profile, profileData, latestAnalysis, reset, defaultGewas, defaultRas, applySoilDefaults]);

  const values = watch();

  // Live plantdichtheid berekening (-10% correctie voor koppakkers etc.)
  const plantdichtheid = useMemo(() => {
    const rij = Number(values.rijafstand_m);
    const plant = Number(values.plantafstand_m);
    if (rij > 0 && plant > 0) return Math.round((10000 / (rij * plant)) * 0.9);
    return null;
  }, [values.rijafstand_m, values.plantafstand_m]);

  const selectedGewas = (values.gewas as string) || '';
  const rasSuggesties = RAS_SUGGESTIES[selectedGewas] || [];
  const onderstamSuggesties = ONDERSTAM_SUGGESTIES[selectedGewas] || [];

  const onSubmit = useCallback(async (data: FormData) => {
    try {
      await updateProfile.mutateAsync(data);
      toast({ title: 'Profiel opgeslagen', description: 'Alle wijzigingen zijn opgeslagen.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fout', description: err.message });
    }
  }, [updateProfile, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const bodemSource = latestAnalysis?.extractie_status === 'completed'
    ? `Eurofins ${latestAnalysis.datum_monstername}`
    : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 pb-20">

      {/* 1. Aanplantgegevens */}
      <ProfileSection
        title="Aanplantgegevens"
        icon={Sprout}
        fields={['plantjaar', 'gewas', 'ras', 'onderstammen', 'bestuiversras', 'kloon_selectie']}
        values={values}
      >
        <Field label="Plantjaar">
          <Input type="number" {...register('plantjaar', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="bijv. 2018" />
        </Field>
        <Field label="Gewas">
          <Controller name="gewas" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={GEWAS_OPTIES} placeholder="Selecteer gewas" />
          )} />
        </Field>
        <Field label="Ras">
          <Controller name="ras" control={control} render={({ field }) => (
            <ComboboxField value={field.value as string} onChange={field.onChange} suggestions={rasSuggesties} placeholder="Typ of selecteer ras" />
          )} />
        </Field>
        <Field label="Onderstam(men)" className="col-span-full">
          <Controller name="onderstammen" control={control} render={({ field }) => (
            <WeightedComboboxField
              value={(field.value as WeightedEntry[]) || []}
              onChange={field.onChange}
              suggestions={onderstamSuggesties}
              placeholder="Typ of selecteer onderstam"
            />
          )} />
        </Field>
        <Field label="Bestuiversras">
          <Input {...register('bestuiversras')} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="Optioneel" />
        </Field>
        <Field label="Kloon / selectie">
          <Input {...register('kloon_selectie')} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="Optioneel" />
        </Field>
      </ProfileSection>

      {/* 2. Plantverband */}
      <ProfileSection
        title="Plantverband & dichtheid"
        icon={Ruler}
        fields={['rijafstand_m', 'plantafstand_m', 'aantal_bomen']}
        values={values}
      >
        <Field label="Rijafstand (m)">
          <Input type="number" step="0.01" {...register('rijafstand_m', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="bijv. 3.25" />
        </Field>
        <Field label="Plantafstand (m)">
          <Input type="number" step="0.01" {...register('plantafstand_m', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="bijv. 1.00" />
        </Field>
        <Field label="Plantdichtheid (berekend, -10%)">
          <div className="h-10 flex items-center px-3 rounded-md bg-white/[0.02] border border-white/[0.06] text-white/50 font-mono text-sm">
            {plantdichtheid ? `${plantdichtheid} bomen/ha` : '\u2014'}
          </div>
          {plantdichtheid && (
            <p className="text-[10px] text-white/20 mt-1">Bruto: {Math.round(plantdichtheid / 0.9)} &middot; -10% koppakkers</p>
          )}
        </Field>
        <Field label="Aantal bomen">
          <Input type="number" {...register('aantal_bomen', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="Totaal aantal" />
        </Field>
      </ProfileSection>

      {/* 3. Teeltsysteem */}
      <ProfileSection
        title="Teeltsysteem"
        icon={TreePine}
        fields={['teeltsysteem', 'boomhoogte_m', 'rijrichting']}
        values={values}
      >
        <Field label="Teeltsysteem">
          <Controller name="teeltsysteem" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={TEELTSYSTEEM_OPTIES} />
          )} />
        </Field>
        <Field label="Boomhoogte (m)">
          <Input type="number" step="0.1" {...register('boomhoogte_m', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="bijv. 3.2" />
        </Field>
        <Field label="Rijrichting">
          <Controller name="rijrichting" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={RIJRICHTING_OPTIES} />
          )} />
        </Field>
      </ProfileSection>

      {/* 4. Infrastructuur — zonder regenkap en insectennet */}
      <ProfileSection
        title="Infrastructuur & bescherming"
        icon={Shield}
        fields={['hagelnet', 'windscherm', 'steunconstructie']}
        values={values}
      >
        <Field label="Hagelnet">
          <Controller name="hagelnet" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={HAGELNET_OPTIES} />
          )} />
        </Field>
        <Field label="Windscherm">
          <Controller name="windscherm" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={WINDSCHERM_OPTIES} />
          )} />
        </Field>
        <Field label="Steunconstructie">
          <Controller name="steunconstructie" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={STEUNCONSTRUCTIE_OPTIES} />
          )} />
        </Field>
      </ProfileSection>

      {/* 5. Waterhuishouding */}
      <ProfileSection
        title="Waterhuishouding"
        icon={Droplets}
        fields={['irrigatiesysteem', 'fertigatie_aansluiting', 'nachtvorstberegening', 'koelberegening', 'waterbron', 'drainage']}
        values={values}
      >
        <Field label="Irrigatiesysteem">
          <Controller name="irrigatiesysteem" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={IRRIGATIE_OPTIES} />
          )} />
        </Field>
        <Field label="Fertigatie">
          <Controller name="fertigatie_aansluiting" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={FERTIGATIE_OPTIES} />
          )} />
        </Field>
        <Field label="Nachtvorstberegening">
          <Controller name="nachtvorstberegening" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={NACHTVORSTBEREGENING_OPTIES} />
          )} />
        </Field>
        <Field label="Koelberegening">
          <Controller name="koelberegening" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={KOELBEREGENING_OPTIES} />
          )} />
        </Field>
        <Field label="Waterbron">
          <Controller name="waterbron" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={WATERBRON_OPTIES} />
          )} />
        </Field>
        <Field label="Drainage">
          <Controller name="drainage" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={DRAINAGE_OPTIES} />
          )} />
        </Field>
      </ProfileSection>

      {/* 6. Bodemkenmerken */}
      <ProfileSection
        title="Bodemkenmerken"
        icon={Mountain}
        fields={['grondsoort', 'bodem_ph', 'organische_stof_pct', 'klei_percentage', 'grondwaterniveau']}
        values={values}
      >
        <Field label="Grondsoort" source={bodemSource}>
          <Controller name="grondsoort" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={GRONDSOORT_OPTIES} />
          )} />
        </Field>
        <Field label="pH">
          <Input type="number" step="0.1" {...register('bodem_ph', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="bijv. 6.5" />
        </Field>
        <Field label="Organische stof (%)" source={bodemSource}>
          <Input type="number" step="0.1" {...register('organische_stof_pct', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="bijv. 2.7" />
        </Field>
        <Field label="Klei (%)" source={bodemSource}>
          <Input type="number" step="0.1" {...register('klei_percentage', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="bijv. 15" />
        </Field>
        <Field label="Grondwaterniveau">
          <Controller name="grondwaterniveau" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={GRONDWATERNIVEAU_OPTIES} />
          )} />
        </Field>
      </ProfileSection>

      {/* 7. Perceelhistorie */}
      <ProfileSection
        title="Perceelhistorie"
        icon={History}
        fields={['voorgaand_gewas', 'herinplant', 'verwachte_rooidatum']}
        values={values}
      >
        <Field label="Voorgaand gewas">
          <Controller name="voorgaand_gewas" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={VOORGAAND_GEWAS_OPTIES} />
          )} />
        </Field>
        <Field label="Herinplant">
          <Controller name="herinplant" control={control} render={({ field }) => (
            <SelectField value={field.value as string} onChange={field.onChange} options={HERINPLANT_OPTIES} />
          )} />
        </Field>
        <Field label="Verwachte rooidatum (jaar)">
          <Input type="number" {...register('verwachte_rooidatum', { valueAsNumber: true })} className="bg-white/[0.03] border-white/[0.08] h-10" placeholder="bijv. 2035" />
        </Field>
      </ProfileSection>

      {/* 9. Notities */}
      <ProfileSection
        title="Notities"
        icon={FileText}
        fields={['notities']}
        values={values}
        defaultOpen={false}
      >
        <Field label="Extra informatie" className="md:col-span-2">
          <textarea
            {...register('notities')}
            rows={4}
            className="w-full rounded-md bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none resize-none"
            placeholder="Vrij tekstveld voor extra context over dit perceel..."
          />
        </Field>
      </ProfileSection>

      {/* Sticky Save Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          type="submit"
          disabled={updateProfile.isPending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-8 h-12 rounded-full shadow-xl shadow-primary/20"
        >
          {updateProfile.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan...</>
          ) : (
            <><Save className="mr-2 h-4 w-4" /> Profiel opslaan</>
          )}
        </Button>
      </div>
    </form>
  );
}
