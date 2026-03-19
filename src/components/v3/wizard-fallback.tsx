'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  FlaskConical,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  MessageSquare,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SprayableParcel } from '@/lib/supabase-store';
import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry } from '@/lib/types';
import type { CtgbProductSlim } from '@/lib/types-v2';

// ============================================================================
// Types
// ============================================================================

interface WizardFallbackProps {
  parcels: SprayableParcel[];
  products: CtgbProductSlim[];
  onComplete: (registration: SprayRegistrationGroup) => void;
  onCancel: () => void;
  onSwitchToChat: () => void;
}

type WizardStep = 'parcels' | 'products' | 'date' | 'review';

const STEPS: { key: WizardStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'parcels', label: 'Percelen', icon: MapPin },
  { key: 'products', label: 'Producten', icon: FlaskConical },
  { key: 'date', label: 'Datum', icon: Calendar },
  { key: 'review', label: 'Bevestig', icon: Check },
];

// ============================================================================
// Step 1: Parcel Selection
// ============================================================================

function ParcelStep({
  parcels,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  parcels: SprayableParcel[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (crop: string) => void;
  onDeselectAll: (crop: string) => void;
}) {
  // Group by crop
  const byCrop = React.useMemo(() => {
    const map = new Map<string, SprayableParcel[]>();
    for (const p of parcels) {
      const crop = p.crop || 'Overig';
      if (!map.has(crop)) map.set(crop, []);
      map.get(crop)!.push(p);
    }
    return map;
  }, [parcels]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50">Selecteer de percelen die je wilt behandelen:</p>
      {[...byCrop.entries()].map(([crop, cropParcels]) => {
        const allSelected = cropParcels.every(p => selected.has(p.id));
        const someSelected = cropParcels.some(p => selected.has(p.id));

        return (
          <div key={crop} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">{crop}</span>
              <button
                onClick={() => allSelected ? onDeselectAll(crop) : onSelectAll(crop)}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {allSelected ? 'Deselecteer alles' : 'Selecteer alles'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {cropParcels.map(p => (
                <button
                  key={p.id}
                  onClick={() => onToggle(p.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all",
                    selected.has(p.id)
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-white'
                      : 'bg-white/[0.03] border border-white/[0.06] text-white/60 hover:bg-white/[0.06]'
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0",
                    selected.has(p.id) ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'
                  )}>
                    {selected.has(p.id) && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="truncate">{p.name}</span>
                  {p.area && (
                    <span className="text-[10px] text-white/30 ml-auto">{p.area.toFixed(2)} ha</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Step 2: Product Selection
// ============================================================================

function ProductStep({
  allProducts,
  selectedProducts,
  onAddProduct,
  onRemoveProduct,
  onUpdateDosage,
}: {
  allProducts: CtgbProductSlim[];
  selectedProducts: Array<{ product: string; dosage: number; unit: string }>;
  onAddProduct: (name: string) => void;
  onRemoveProduct: (idx: number) => void;
  onUpdateDosage: (idx: number, dosage: number, unit: string) => void;
}) {
  const [search, setSearch] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);

  const filtered = React.useMemo(() => {
    if (!search || search.length < 2) return [];
    const q = search.toLowerCase();
    return allProducts
      .filter(p => p.naam.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, allProducts]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50">Welke producten heb je gebruikt?</p>

      {/* Selected products */}
      {selectedProducts.map((prod, idx) => (
        <div key={idx} className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg p-3">
          <FlaskConical className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span className="text-sm text-white font-medium flex-grow truncate">{prod.product}</span>
          <input
            type="number"
            value={prod.dosage || ''}
            onChange={(e) => onUpdateDosage(idx, parseFloat(e.target.value) || 0, prod.unit)}
            placeholder="Dosering"
            className="w-20 bg-white/[0.06] border border-white/10 rounded px-2 py-1 text-sm text-white text-right outline-none focus:border-emerald-500/50"
          />
          <select
            value={prod.unit}
            onChange={(e) => onUpdateDosage(idx, prod.dosage, e.target.value)}
            className="bg-white/[0.06] border border-white/10 rounded px-2 py-1 text-sm text-white outline-none"
          >
            <option value="L">L/ha</option>
            <option value="kg">kg/ha</option>
          </select>
          <button
            onClick={() => onRemoveProduct(idx)}
            className="text-white/30 hover:text-red-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* Add product search */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-white/[0.03] border border-dashed border-white/10 rounded-lg p-2.5">
          <Search className="h-4 w-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="Zoek een product..."
            className="flex-grow bg-transparent text-sm text-white outline-none placeholder:text-white/25"
          />
        </div>

        {showSearch && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  onAddProduct(p.naam);
                  setSearch('');
                  setShowSearch(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white/70 hover:bg-emerald-500/10 hover:text-white transition-colors"
              >
                <FlaskConical className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                <span className="truncate">{p.naam}</span>
                {p.categorie && (
                  <span className="text-[10px] text-white/20 ml-auto">{p.categorie}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Step 3: Date Selection
// ============================================================================

function DateStep({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const dayBefore = new Date(today); dayBefore.setDate(dayBefore.getDate() - 2);

  const quickDates = [
    { label: 'Vandaag', date: today },
    { label: 'Gisteren', date: yesterday },
    { label: 'Eergisteren', date: dayBefore },
  ];

  const formatDate = (d: Date) => d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50">Wanneer was de bespuiting?</p>

      <div className="grid grid-cols-3 gap-2">
        {quickDates.map(({ label, date }) => (
          <button
            key={label}
            onClick={() => onSelectDate(date)}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-3 rounded-lg border transition-all text-center",
              isSameDay(selectedDate, date)
                ? 'bg-emerald-500/15 border-emerald-500/30 text-white'
                : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06]'
            )}
          >
            <span className="text-sm font-medium">{label}</span>
            <span className="text-[10px] text-white/30">
              {date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-white/30" />
        <input
          type="date"
          value={selectedDate.toISOString().split('T')[0]}
          onChange={(e) => {
            const d = new Date(e.target.value);
            if (!isNaN(d.getTime())) onSelectDate(d);
          }}
          className="bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
        />
      </div>

      <p className="text-xs text-white/30">
        Geselecteerd: <span className="text-white/60">{formatDate(selectedDate)}</span>
      </p>
    </div>
  );
}

// ============================================================================
// Step 4: Review
// ============================================================================

function ReviewStep({
  parcels,
  selectedParcels,
  selectedProducts,
  selectedDate,
  allParcels,
}: {
  parcels: Set<string>;
  selectedParcels: Set<string>;
  selectedProducts: Array<{ product: string; dosage: number; unit: string }>;
  selectedDate: Date;
  allParcels: SprayableParcel[];
}) {
  const parcelNames = [...selectedParcels]
    .map(id => allParcels.find(p => p.id === id)?.name || id)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50">Controleer de registratie:</p>

      <div className="space-y-3">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 space-y-1">
          <div className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Datum</div>
          <div className="text-sm text-white">
            {selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 space-y-1">
          <div className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">
            Percelen ({selectedParcels.size})
          </div>
          <div className="text-sm text-white">
            {parcelNames.join(', ')}
            {selectedParcels.size > 5 && ` en ${selectedParcels.size - 5} andere`}
          </div>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 space-y-1">
          <div className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">
            Producten ({selectedProducts.length})
          </div>
          {selectedProducts.map((p, i) => (
            <div key={i} className="text-sm text-white flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5 text-blue-400" />
              {p.product}
              {p.dosage > 0 && <span className="text-white/50">{p.dosage} {p.unit}/ha</span>}
              {p.dosage === 0 && <span className="text-amber-400 text-xs">(dosering ontbreekt)</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Wizard Component
// ============================================================================

export function WizardFallback({
  parcels,
  products,
  onComplete,
  onCancel,
  onSwitchToChat,
}: WizardFallbackProps) {
  const [currentStep, setCurrentStep] = React.useState<WizardStep>('parcels');
  const [selectedParcels, setSelectedParcels] = React.useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = React.useState<Array<{ product: string; dosage: number; unit: string }>>([]);
  const [selectedDate, setSelectedDate] = React.useState(new Date());

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);
  const canNext = currentStep === 'parcels' ? selectedParcels.size > 0
    : currentStep === 'products' ? selectedProducts.length > 0
    : true;

  const handleNext = () => {
    const idx = STEPS.findIndex(s => s.key === currentStep);
    if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1].key);
  };

  const handleBack = () => {
    const idx = STEPS.findIndex(s => s.key === currentStep);
    if (idx > 0) setCurrentStep(STEPS[idx - 1].key);
  };

  const handleComplete = () => {
    const group: SprayRegistrationGroup = {
      groupId: crypto.randomUUID(),
      date: selectedDate,
      rawInput: '[wizard]',
      units: [{
        id: crypto.randomUUID(),
        plots: [...selectedParcels],
        products: selectedProducts.map(p => ({
          product: p.product,
          dosage: p.dosage,
          unit: p.unit,
        })),
        status: 'pending',
      }],
    };
    onComplete(group);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.02] border border-white/[0.08] rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Stapsgewijze invoer</span>
          <span className="text-[10px] text-white/30 bg-white/[0.06] px-2 py-0.5 rounded-full">
            Stap {stepIndex + 1} / {STEPS.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToChat}
            className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            Vrije invoer
          </button>
          <button onClick={onCancel} className="text-white/30 hover:text-white/60 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center px-4 py-2 gap-1">
        {STEPS.map((step, i) => (
          <React.Fragment key={step.key}>
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all",
              i === stepIndex ? 'bg-emerald-500/15 text-emerald-400' :
              i < stepIndex ? 'text-emerald-400/50' : 'text-white/20'
            )}>
              <step.icon className="h-3 w-3" />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("flex-grow h-px", i < stepIndex ? 'bg-emerald-500/30' : 'bg-white/[0.06]')} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <div className="px-4 py-4 min-h-[300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentStep === 'parcels' && (
              <ParcelStep
                parcels={parcels}
                selected={selectedParcels}
                onToggle={(id) => {
                  const next = new Set(selectedParcels);
                  next.has(id) ? next.delete(id) : next.add(id);
                  setSelectedParcels(next);
                }}
                onSelectAll={(crop) => {
                  const next = new Set(selectedParcels);
                  parcels.filter(p => p.crop === crop).forEach(p => next.add(p.id));
                  setSelectedParcels(next);
                }}
                onDeselectAll={(crop) => {
                  const next = new Set(selectedParcels);
                  parcels.filter(p => p.crop === crop).forEach(p => next.delete(p.id));
                  setSelectedParcels(next);
                }}
              />
            )}
            {currentStep === 'products' && (
              <ProductStep
                allProducts={products}
                selectedProducts={selectedProducts}
                onAddProduct={(name) => setSelectedProducts(prev => [...prev, { product: name, dosage: 0, unit: 'L' }])}
                onRemoveProduct={(idx) => setSelectedProducts(prev => prev.filter((_, i) => i !== idx))}
                onUpdateDosage={(idx, dosage, unit) => setSelectedProducts(prev =>
                  prev.map((p, i) => i === idx ? { ...p, dosage, unit } : p)
                )}
              />
            )}
            {currentStep === 'date' && (
              <DateStep
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            )}
            {currentStep === 'review' && (
              <ReviewStep
                parcels={selectedParcels}
                selectedParcels={selectedParcels}
                selectedProducts={selectedProducts}
                selectedDate={selectedDate}
                allParcels={parcels}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={stepIndex === 0}
          className="text-white/50"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Vorige
        </Button>

        {currentStep === 'review' ? (
          <Button
            size="sm"
            onClick={handleComplete}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Check className="h-4 w-4 mr-1" />
            Registratie aanmaken
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleNext}
            disabled={!canNext}
            className="bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
          >
            Volgende
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
