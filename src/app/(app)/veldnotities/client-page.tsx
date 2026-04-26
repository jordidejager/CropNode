'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  StickyNote, Search, Pin, Trash2, Check, ChevronDown, ChevronUp,
  NotebookPen, Send, Droplets, Leaf, ListTodo, Eye, Tag, MapPin,
  MapPinPlus, ArrowRight, CheckCircle2, Bug, Shrub, Activity, Wind, Info,
  Camera, X, Loader2, List, MapIcon, Lock, Unlock,
  CalendarDays, Bell, AlertTriangle, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useFieldNotes, useCreateFieldNote, useUpdateFieldNote, useDeleteFieldNote,
  type FieldNote
} from '@/hooks/use-field-notes';
import { useParcels } from '@/hooks/use-data';
import { useParcelGroupOptions } from '@/hooks/use-parcel-group-options';
import { UnifiedParcelMultiSelect } from '@/components/domain/unified-parcel-multi-select';
import { PhotoLightbox } from '@/components/field-notes/PhotoLightbox';
import { WhatsAppIcon } from '@/components/icons/whatsapp-icon';
import dynamic from 'next/dynamic';

const FieldNotesMap = dynamic(
  () => import('@/components/field-notes/FieldNotesMap').then(m => m.FieldNotesMap),
  { ssr: false, loading: () => <div className="h-[500px] md:h-[600px] rounded-2xl bg-white/[0.03] animate-pulse" /> }
);
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { TransferModal } from '@/components/field-notes/TransferModal';
import { SectionHeader } from '@/components/urenregistratie/primitives/SectionHeader';
import {
  VeldnotitiesKPI,
  NoteCardShell,
  PhotoThumb,
  TagChip as TagChipPrimitive,
  ParcelBadge as ParcelBadgePrimitive,
  ObservationBadge as ObservationBadgePrimitive,
  TagLegend,
} from '@/components/veldnotities/primitives';
import { tagTokens, type FieldNoteTag, type ObservationCategory as ObservationCategoryLocal } from '@/lib/veldnotities/tag-colors';

// ============================================================================
// TAG CONFIG
// ============================================================================

type Tag = 'bespuiting' | 'bemesting' | 'taak' | 'waarneming' | 'overig';

const TAG_CONFIG: Record<Tag, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  text: string;
  border: string;
}> = {
  bespuiting: {
    label: 'Bespuiting',
    icon: Droplets,
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
  },
  bemesting: {
    label: 'Bemesting',
    icon: Leaf,
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  taak: {
    label: 'Taak',
    icon: ListTodo,
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  waarneming: {
    label: 'Waarneming',
    icon: Eye,
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  overig: {
    label: 'Overig',
    icon: Tag,
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/20',
  },
};

function TagChip({ tag, size = 'md' }: { tag: Tag; size?: 'sm' | 'md' }) {
  const cfg = TAG_CONFIG[tag];
  const Icon = cfg.icon;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        cfg.bg, cfg.text, cfg.border,
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      )}
    >
      <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {cfg.label}
    </motion.span>
  );
}

// ============================================================================
// RELATIVE TIME
// ============================================================================

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((todayStart.getTime() - dateStart.getTime()) / 86400000);
  const time = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  if (diffMin < 1) return 'Zojuist';
  if (diffMin < 60) return `${diffMin} min geleden`;
  if (diffDays === 0) return `Vandaag ${time}`;
  if (diffDays === 1) return `Gisteren ${time}`;
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString('nl-NL', { weekday: 'short' });
    return `${dayName} ${time}`;
  }
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================================
// QUICK ADD INPUT
// ============================================================================

interface QuickAddSubmitData {
  content: string;
  photo?: File;
  latitude?: number;
  longitude?: number;
  is_locked?: boolean;
}

function QuickAddInput({ onSubmit, compact = false, isUploading = false }: {
  onSubmit: (data: QuickAddSubmitData) => void;
  compact?: boolean;
  isUploading?: boolean;
}) {
  const [value, setValue] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, compact ? 40 : 160) + 'px';
  }, [compact]);

  useEffect(() => { autoResize(); }, [value, autoResize]);

  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));

    if (!gpsLocation) {
      try {
        const { extractGpsFromPhoto } = await import('@/lib/photo-upload');
        const coords = await extractGpsFromPhoto(file);
        if (coords) setGpsLocation(coords);
      } catch { /* ignore */ }
    }

    e.target.value = '';
  }, [gpsLocation]);

  const handleRemovePhoto = useCallback(() => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPendingPhoto(null);
    setPhotoPreview(null);
  }, [photoPreview]);

  const handleGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      () => { setIsLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleClearGps = useCallback(() => setGpsLocation(null), []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 2000 || isUploading) return;
    onSubmit({
      content: trimmed,
      photo: pendingPhoto ?? undefined,
      latitude: gpsLocation?.lat,
      longitude: gpsLocation?.lng,
      is_locked: isLocked || undefined,
    });
    setValue('');
    setPendingPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setGpsLocation(null);
    setIsLocked(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [value, onSubmit, pendingPhoto, gpsLocation, photoPreview, isUploading, isLocked]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  // Compact variant (dashboard) — klein gelaten
  if (compact) {
    return (
      <div className="relative group">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 focus-within:border-emerald-500/30 transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Snelle notitie..."
            rows={1}
            maxLength={2000}
            className="w-full bg-transparent text-white/90 placeholder:text-white/20 resize-none outline-none text-sm"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || isUploading}
            className="absolute right-3 bottom-3 h-8 w-8 flex items-center justify-center rounded-xl text-emerald-400/40 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-20 transition-all"
            aria-label="Opslaan"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  }

  // Full quick-add — 56×56 knoppen met labels, grotere textarea
  return (
    <div className="relative group">
      <div className={cn(
        'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm transition-all duration-300',
        'focus-within:border-emerald-500/30 focus-within:bg-white/[0.04]',
        'focus-within:shadow-[0_0_28px_rgba(16,185,129,0.12)]',
        'p-4 md:p-5',
      )}>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <NotebookPen className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Nieuwe notitie</span>
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Wat zag je vandaag? Typ je notitie — we herkennen automatisch of het een taak, waarneming, bespuiting of bemesting is."
          rows={2}
          maxLength={2000}
          className="w-full bg-transparent text-white/90 placeholder:text-white/30 resize-none outline-none text-base md:text-lg leading-relaxed min-h-[56px]"
        />

        {/* Photo preview — 80×80 + grote X-knop */}
        {photoPreview && (
          <div className="relative inline-block mt-3">
            <img
              src={photoPreview}
              alt="Preview"
              className="h-20 w-20 rounded-xl object-cover border border-white/[0.12]"
            />
            <button
              onClick={handleRemovePhoto}
              className="absolute -top-2 -right-2 h-8 w-8 flex items-center justify-center rounded-full bg-zinc-900 border border-white/15 text-white/80 hover:text-white hover:bg-zinc-800 transition-colors"
              aria-label="Foto verwijderen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* GPS indicator */}
        {gpsLocation && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-[11px] text-purple-300 font-medium">
            <MapPin className="h-3 w-3" />
            <span className="tabular-nums">
              {gpsLocation.lat.toFixed(4)}, {gpsLocation.lng.toFixed(4)}
            </span>
            <button
              onClick={handleClearGps}
              className="ml-1 h-4 w-4 rounded-full hover:bg-white/10 flex items-center justify-center"
              aria-label="Locatie wissen"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Lock indicator */}
        {isLocked && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 font-medium">
            <Lock className="h-3 w-3" />
            <span>Privé — niet zichtbaar voor anderen</span>
          </div>
        )}

        {/* Action buttons rij — 56×56 knoppen met labels */}
        <div className="flex items-end justify-between gap-3 mt-4 pt-3 border-t border-white/[0.04]">
          <div className="flex items-start gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {/* Foto */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border transition-all duration-200 min-h-[56px] min-w-[56px] px-2 py-2',
                pendingPhoto
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-emerald-500/30 hover:bg-emerald-500/[0.06] hover:text-emerald-300',
              )}
              aria-label="Foto toevoegen"
              title="Maak of kies een foto. Op mobiel opent de camera."
            >
              <Camera className="h-5 w-5" />
              <span className="text-[10px] font-semibold">Foto</span>
            </button>

            {/* Locatie */}
            <button
              onClick={handleGps}
              disabled={isLocating}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border transition-all duration-200 min-h-[56px] min-w-[56px] px-2 py-2',
                gpsLocation
                  ? 'border-purple-500/40 bg-purple-500/10 text-purple-300'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-purple-500/30 hover:bg-purple-500/[0.06] hover:text-purple-300',
                isLocating && 'animate-pulse',
              )}
              aria-label="GPS-locatie toevoegen"
              title="Voeg GPS-locatie toe zodat de notitie op de kaart verschijnt."
            >
              <MapPin className="h-5 w-5" />
              <span className="text-[10px] font-semibold">Locatie</span>
            </button>

            {/* Privé */}
            <button
              onClick={() => setIsLocked(!isLocked)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border transition-all duration-200 min-h-[56px] min-w-[56px] px-2 py-2',
                isLocked
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-amber-500/30 hover:bg-amber-500/[0.06] hover:text-amber-300',
              )}
              aria-label={isLocked ? 'Privé-modus uit' : 'Privé-modus aan'}
              title="Privé-notities zijn alleen zichtbaar als 'verborgen notities tonen' aan staat in Instellingen."
            >
              {isLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
              <span className="text-[10px] font-semibold">Privé</span>
            </button>
          </div>

          {/* Opslaan — 56 px hoog, gradient als actief */}
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || isUploading}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl min-h-[56px] px-5 font-semibold transition-all',
              value.trim() && !isUploading
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-400 hover:to-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.25)] hover:shadow-[0_0_32px_rgba(16,185,129,0.35)]'
                : 'bg-white/[0.05] text-white/30 cursor-not-allowed',
            )}
            aria-label="Notitie opslaan"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="hidden md:inline">Opslaan…</span>
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span className="hidden md:inline">Opslaan</span>
              </>
            )}
          </button>
        </div>

        <p className="text-[10px] text-white/25 mt-2 hidden md:block">
          Enter om op te slaan · Shift+Enter voor nieuwe regel
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// PARCEL SELECTOR
// ============================================================================

/**
 * Multi-select wrapper voor veldnotities — gebruikt UnifiedParcelMultiSelect
 * onder de motorkap, maar zonder eigen Popover (de NoteCard heeft al een
 * eigen relative containers + auto-close-on-blur logica).
 *
 * Bewust expanded panel rendering i.p.v. de standaard Popover-trigger:
 * de notitie heeft al een MapPinPlus-knop als trigger.
 */
function NoteParcelMultiSelector({
  selectedIds,
  onChange,
  onClose,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { data: groups = [] } = useParcelGroupOptions();
  const ref = useRef<HTMLDivElement>(null);

  // Klik buiten = sluiten
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-20 w-80 rounded-xl bg-[#0f1e35] border border-white/[0.1] shadow-2xl overflow-hidden p-2"
    >
      <UnifiedParcelMultiSelect
        groups={groups}
        selectedSubParcelIds={selectedIds}
        onChange={onChange}
        placeholder="Geen perceel"
        showScopeSummary
      />
      <button
        onClick={() => { onChange([]); onClose(); }}
        className="w-full mt-2 text-xs text-white/40 hover:text-white/70 py-1"
      >
        Wissen & sluiten
      </button>
    </div>
  );
}

interface ParcelSelectorProps {
  currentParcelId: string | null;
  onSelect: (parcelId: string | null) => void;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ParcelSelector({ currentParcelId, onSelect, onClose }: ParcelSelectorProps) {
  const { data: parcels = [] } = useParcels();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    parcels.filter(p =>
      !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.variety ?? '').toLowerCase().includes(search.toLowerCase())
    ),
    [parcels, search]
  );

  return (
    <div className="absolute right-0 top-8 z-20 w-64 rounded-xl bg-[#0f1e35] border border-white/[0.1] shadow-2xl overflow-hidden">
      <div className="p-2 border-b border-white/[0.06]">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek perceel..."
          className="w-full bg-white/[0.04] rounded-lg px-3 py-1.5 text-xs text-white/80 placeholder:text-white/20 outline-none"
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        <button
          onClick={() => { onSelect(null); onClose(); }}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left',
            currentParcelId === null ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/60'
          )}
        >
          <span className="text-white/20">—</span>
          Geen perceel
        </button>
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => { onSelect(p.id); onClose(); }}
            className={cn(
              'w-full flex items-start gap-2 px-3 py-2 text-xs transition-colors text-left',
              currentParcelId === p.id ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80'
            )}
          >
            <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-white/30 truncate">{p.crop} · {p.variety}</div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-3 text-xs text-white/25 text-center">Geen percelen gevonden</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// OBSERVATION HELPERS
// ============================================================================

const OBSERVATION_CATEGORY_LABELS: Record<string, string> = {
  insect: 'Insect',
  schimmel: 'Schimmel',
  ziekte: 'Ziekte',
  fysiologisch: 'Fysiologisch',
  overig: 'Overig',
};

function ObservationIcon({ category }: { category: string | null }) {
  const cls = 'h-2.5 w-2.5';
  switch (category) {
    case 'insect': return <Bug className={cls} />;
    case 'schimmel': return <Shrub className={cls} />;
    case 'ziekte': return <Activity className={cls} />;
    case 'fysiologisch': return <Wind className={cls} />;
    default: return <Info className={cls} />;
  }
}

// ============================================================================
// PRODUCT LOCK ROW (for transferred spuitschrift notes)
// ============================================================================

function ProductLockRow({ spuitschriftId, products, hiddenProducts }: {
  spuitschriftId: string;
  products: { product: string; dosage: number; unit: string }[];
  hiddenProducts: { product: string; dosage: number; unit: string }[];
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);

  const toggleProduct = async (productName: string, hide: boolean) => {
    setLoading(productName);
    try {
      const res = await fetch('/api/spuitschrift/hide-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spuitschriftId, productName, hide }),
      });
      if (!res.ok) {
        const json = await res.json();
        console.error('[ProductLock] Error:', json.error);
      }
      // Refresh notes to get updated products
      queryClient.invalidateQueries({ queryKey: ['field-notes'] });
    } catch (err) {
      console.error('[ProductLock] fetch failed:', err);
    } finally {
      setLoading(null);
    }
  };

  // Read showLocked setting from localStorage
  const showHidden = typeof window !== 'undefined' && localStorage.getItem('cropnode:showLockedNotes') === 'true';

  const allProducts = [
    ...products.map(p => ({ ...p, hidden: false })),
    ...(showHidden ? hiddenProducts.map(p => ({ ...p, hidden: true })) : []),
  ];

  if (allProducts.length === 0) return null;

  return (
    <div className="mt-2.5 space-y-1 border-t border-white/[0.04] pt-2">
      <span className="text-[9px] text-white/20 uppercase tracking-wider font-semibold">Middelen</span>
      {allProducts.map(p => (
        <div
          key={p.product}
          className={cn(
            'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-all',
            p.hidden
              ? 'border-amber-500/15 bg-amber-500/[0.04]'
              : 'border-white/[0.06] bg-white/[0.02]'
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Droplets className={cn('h-3 w-3 flex-shrink-0', p.hidden ? 'text-amber-400/40' : 'text-blue-400/50')} />
            <span className={cn(
              'text-[11px] font-medium truncate',
              p.hidden ? 'text-amber-400/50 line-through' : 'text-white/60'
            )}>
              {p.product}
            </span>
            <span className={cn('text-[10px] flex-shrink-0', p.hidden ? 'text-amber-400/30' : 'text-white/20')}>
              {p.dosage} {p.unit}
            </span>
          </div>
          <button
            onClick={() => toggleProduct(p.product, !p.hidden)}
            disabled={loading === p.product}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md transition-all flex-shrink-0',
              p.hidden
                ? 'text-amber-400 hover:bg-amber-500/15'
                : 'text-white/20 hover:text-amber-400 hover:bg-amber-500/10',
              loading === p.product && 'opacity-40 animate-pulse'
            )}
            title={p.hidden ? 'Zichtbaar maken' : 'Verbergen van platform'}
          >
            {p.hidden ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// NOTE CARD
// ============================================================================

function NoteCard({ note, onToggleStatus, onTogglePin, onToggleLock, onDelete, onEdit, onUpdateParcel, onTransfer, onPhotoClick, onObservationFilter }: {
  note: FieldNote;
  onToggleStatus: () => void;
  onTogglePin: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onEdit: (content: string) => void;
  onUpdateParcel: (parcelIds: string[]) => void;
  onTransfer: () => void;
  onPhotoClick?: (url: string) => void;
  onObservationFilter?: (subject: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(note.content);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showParcelSelector, setShowParcelSelector] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isDone = note.status === 'done';
  const isTransferred = note.status === 'transferred';

  // Strip hidden product mentions from display text
  const showHidden = typeof window !== 'undefined' && localStorage.getItem('cropnode:showLockedNotes') === 'true';
  const displayContent = useMemo(() => {
    if (showHidden || !note.spuitschrift_hidden_products?.length) return note.content;
    let text = note.content;
    for (const hp of note.spuitschrift_hidden_products) {
      // Remove patterns like "0,5 kg delan", "0,10 pyrus", "en 0,14 teppeki", "0.75 L/ha pyrus 400 sc"
      const escaped = hp.product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match: optional "en "/"," + dosage number + optional unit + product name
      const pattern = new RegExp(
        `(?:,?\\s*(?:en\\s+)?)?[\\d.,]+\\s*(?:kg|l|ml|g|L)?(?:\\/ha)?\\s*${escaped}`,
        'gi'
      );
      text = text.replace(pattern, '');
    }
    // Clean up leftover artifacts: double spaces, trailing commas, leading "en"
    text = text.replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').replace(/^\s*en\s+/i, '').trim();
    return text;
  }, [note.content, note.spuitschrift_hidden_products, showHidden]);

  const isLong = displayContent.length > 200;
  const showTransferBtn = (note.auto_tag === 'bespuiting' || note.auto_tag === 'bemesting') && !isTransferred;

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
      editRef.current.style.height = 'auto';
      editRef.current.style.height = editRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== note.content && trimmed.length <= 2000) {
      onEdit(trimmed);
    } else {
      setEditValue(note.content);
    }
    setIsEditing(false);
  }, [editValue, note.content, onEdit]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
    if (e.key === 'Escape') { setEditValue(note.content); setIsEditing(false); }
  }, [handleSaveEdit, note.content]);

  return (
    <motion.div
      id={`note-${note.id}`}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
      className="group"
    >
      <NoteCardShell tag={note.auto_tag as FieldNoteTag | null} dimmed={isDone || isTransferred}>
        <div className="flex gap-3 md:gap-4 p-4 md:p-5">
          {/* Checkbox — 28×28, duidelijk zichtbaar */}
          {!isTransferred ? (
            <button
              onClick={onToggleStatus}
              className={cn(
                'mt-0.5 flex-shrink-0 h-7 w-7 rounded-lg border-2 transition-all duration-200 flex items-center justify-center',
                isDone
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'border-white/25 hover:border-emerald-500/50 hover:bg-emerald-500/10',
              )}
              aria-label={isDone ? 'Markeer als open' : 'Markeer als afgerond'}
            >
              {isDone && <Check className="h-4 w-4" />}
            </button>
          ) : (
            <div className="mt-0.5 flex-shrink-0 h-7 w-7 rounded-lg bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center" title="Verwerkt">
              <Check className="h-4 w-4 text-emerald-400" />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <textarea
                ref={editRef}
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onBlur={handleSaveEdit}
                onKeyDown={handleEditKeyDown}
                maxLength={2000}
                className="w-full bg-white/[0.05] border border-emerald-500/30 rounded-lg px-3 py-2 text-sm md:text-base text-white/90 resize-none outline-none focus:shadow-[0_0_12px_rgba(16,185,129,0.1)]"
              />
            ) : (
              <div onClick={() => { if (!isTransferred) { setEditValue(note.content); setIsEditing(true); } }} className={cn(!isTransferred && 'cursor-text')}>
                <p className={cn(
                  'text-sm md:text-base whitespace-pre-wrap break-words transition-all duration-200 leading-relaxed',
                  isDone || isTransferred ? 'text-white/30' : 'text-white/80',
                  isDone && 'line-through',
                  isLong && !isExpanded ? 'line-clamp-3' : '',
                )}>
                  {displayContent}
                </p>
                {isLong && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                    className="text-xs text-emerald-400/70 hover:text-emerald-400 mt-1 flex items-center gap-1 font-medium"
                  >
                    {isExpanded ? (<>Minder tonen <ChevronUp className="h-3 w-3" /></>) : (<>Meer lezen <ChevronDown className="h-3 w-3" /></>)}
                  </button>
                )}
              </div>
            )}

            {/* Photo thumbnail — 112×112 (groot) via primitive */}
            {note.photo_url && (
              <div className="mt-3">
                <PhotoThumb url={note.photo_url} size="lg" onClick={() => onPhotoClick?.(note.photo_url!)} />
              </div>
            )}

            {/* Badges row: timestamp + source + tag + parcels + observation */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={cn('text-[11px] tabular-nums inline-flex items-center gap-1.5', isDone || isTransferred ? 'text-white/25' : 'text-white/40')}>
                {note.source === 'whatsapp' && (
                  <span title="Via WhatsApp" className="inline-flex items-center">
                    <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
                  </span>
                )}
                {formatRelativeTime(note.created_at)}
              </span>

              {/* Transferred badge */}
              {isTransferred && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] text-emerald-300 font-semibold">
                  <CheckCircle2 className="h-3 w-3" />
                  Verwerkt
                </span>
              )}

              {/* Locked badge */}
              {note.is_locked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-300 font-semibold">
                  <Lock className="h-3 w-3" />
                  Privé
                </span>
              )}

              {/* Auto tag — of pending indicator */}
              {note.auto_tag ? (
                <TagChipPrimitive tag={note.auto_tag as FieldNoteTag} size="sm" />
              ) : !isDone && !isTransferred && Date.now() - new Date(note.created_at).getTime() < 60_000 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] text-white/30 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-ping" />
                  Analyseren…
                </span>
              )}

              {/* Parcel badges — deduplicated, max 4 */}
              {[...new Map(
                (note.sub_parcels ?? []).map(sp => [sp.parcel_name || sp.name, sp]),
              ).values()].slice(0, 4).map(sp => (
                <ParcelBadgePrimitive key={sp.parcel_name || sp.id} parcel={sp} size="sm" />
              ))}

              {/* Observation — klikbaar filter */}
              {note.observation_subject && (
                <ObservationBadgePrimitive
                  subject={note.observation_subject}
                  category={note.observation_category as ObservationCategoryLocal}
                  size="sm"
                  onClick={() => onObservationFilter?.(note.observation_subject!)}
                />
              )}
              {note.observation_category && !note.observation_subject && (
                <ObservationBadgePrimitive
                  subject={null}
                  category={note.observation_category as ObservationCategoryLocal}
                  size="sm"
                />
              )}
            </div>

            {/* Transfer button — iets beeldvullender */}
            {showTransferBtn && (
              <button
                onClick={onTransfer}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300 text-xs font-semibold hover:bg-emerald-500/15 hover:border-emerald-400/50 transition-all duration-200 min-h-[40px]"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Verwerk via Slimme Invoer
              </button>
            )}

            {/* Linked spuitschrift products */}
            {note.spuitschrift_id && (note.spuitschrift_products?.length || note.spuitschrift_hidden_products?.length) ? (
              <ProductLockRow
                spuitschriftId={note.spuitschrift_id}
                products={note.spuitschrift_products ?? []}
                hiddenProducts={note.spuitschrift_hidden_products ?? []}
              />
            ) : null}
          </div>

          {/* Actions — altijd zichtbaar met opacity 60, 100 op hover — 40×40 buttons */}
          <div className="relative flex items-start gap-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
            <div className="relative">
              <button
                onClick={() => setShowParcelSelector(!showParcelSelector)}
                className={cn(
                  'h-10 w-10 flex items-center justify-center rounded-lg transition-all duration-200',
                  (note.parcel_ids?.length ?? 0) > 0
                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                    : 'text-white/40 hover:text-emerald-400 hover:bg-emerald-500/10',
                )}
                aria-label="Perceel koppelen"
                title="Perceel koppelen"
              >
                <MapPinPlus className="h-4 w-4" />
              </button>
              {showParcelSelector && (
                <NoteParcelMultiSelector
                  selectedIds={note.parcel_ids ?? []}
                  onChange={onUpdateParcel}
                  onClose={() => setShowParcelSelector(false)}
                />
              )}
            </div>

            <button
              onClick={onTogglePin}
              className={cn(
                'h-10 w-10 flex items-center justify-center rounded-lg transition-all duration-200',
                note.is_pinned
                  ? 'text-emerald-400 hover:bg-emerald-500/10'
                  : 'text-white/40 hover:text-emerald-400 hover:bg-emerald-500/10',
              )}
              aria-label={note.is_pinned ? 'Losmaken' : 'Vastzetten'}
              title={note.is_pinned ? 'Losmaken' : 'Vastzetten'}
            >
              <Pin className={cn('h-4 w-4', note.is_pinned ? 'fill-current' : '')} />
            </button>

            <button
              onClick={onToggleLock}
              className={cn(
                'h-10 w-10 flex items-center justify-center rounded-lg transition-all duration-200',
                note.is_locked
                  ? 'text-amber-300 hover:bg-amber-500/10'
                  : 'text-white/40 hover:text-amber-400 hover:bg-amber-500/10',
              )}
              aria-label={note.is_locked ? 'Ontgrendelen' : 'Vergrendelen'}
              title={note.is_locked ? 'Notitie zichtbaar maken' : 'Notitie privé maken'}
            >
              {note.is_locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>

            <button
              onClick={onDelete}
              className="h-10 w-10 flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
              aria-label="Verwijderen"
              title="Verwijderen"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </NoteCardShell>
    </motion.div>
  );
}

// ============================================================================
// FILTER BAR — progressive disclosure
// ============================================================================

type DateFilter = 'all' | 'week' | 'month' | 'season';

interface ParcelOption { id: string; name: string }

function FilterBar({
  searchQuery,
  onSearchChange,
  activeStatus,
  onStatusChange,
  activeTags,
  onTagToggle,
  activeParcelId,
  onParcelChange,
  activeObservation,
  onObservationClear,
  dateFilter,
  onDateFilterChange,
  parcels,
  notes,
  viewMode,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeStatus: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  activeTags: Tag[];
  onTagToggle: (tag: Tag) => void;
  activeParcelId: string | null;
  onParcelChange: (id: string | null) => void;
  activeObservation: string | null;
  onObservationClear: () => void;
  dateFilter: DateFilter;
  onDateFilterChange: (d: DateFilter) => void;
  parcels: ParcelOption[];
  notes: FieldNote[];
  viewMode: 'invoer' | 'kaart' | 'archief' | 'taken';
}) {
  const [showDrawer, setShowDrawer] = useState(false);

  // Aantal actieve filters (excl. zoek en excl. "all"-status)
  const activeFilterCount =
    (activeStatus !== 'all' ? 1 : 0) +
    activeTags.length +
    (activeParcelId ? 1 : 0) +
    (activeObservation ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0);

  const hasAnyActive = activeFilterCount > 0 || searchQuery.length > 0;

  const activeParcel = useMemo(
    () => (activeParcelId ? parcels.find(p => p.id === activeParcelId) ?? null : null),
    [activeParcelId, parcels],
  );

  const handleReset = () => {
    onSearchChange('');
    onStatusChange('all');
    activeTags.forEach(t => onTagToggle(t));
    onParcelChange(null);
    onObservationClear();
    onDateFilterChange('all');
  };

  const STATUS_LABELS: Record<StatusFilter, string> = {
    all: 'Alles', open: 'Open', done: 'Afgerond', pinned: 'Gepind',
  };

  const DATE_LABELS: Record<DateFilter, string> = {
    all: 'Alle tijden', week: 'Deze week', month: 'Deze maand', season: 'Dit seizoen',
  };

  return (
    <div className="space-y-3">
      {/* Zoek + filters-knop */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Zoeken in notities…"
            className="w-full h-[56px] bg-white/[0.03] border border-white/[0.08] rounded-xl pl-12 pr-12 text-base text-white/85 placeholder:text-white/30 outline-none focus:border-emerald-500/30 focus:bg-white/[0.04] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Zoekveld wissen"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowDrawer(!showDrawer)}
          className={cn(
            'h-[56px] px-4 rounded-xl border flex items-center gap-2 text-sm font-semibold transition-all',
            showDrawer || activeFilterCount > 0
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-white/[0.03] border-white/[0.08] text-white/70 hover:border-white/20',
          )}
          aria-expanded={showDrawer}
        >
          <Tag className="h-4 w-4" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="ml-0.5 flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-emerald-500/25 text-emerald-200 text-xs font-bold">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 transition-transform', showDrawer && 'rotate-180')} />
        </button>

        {hasAnyActive && (
          <button
            onClick={handleReset}
            className="h-[56px] px-4 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Actieve filter-chips (altijd zichtbaar zolang filters actief zijn) */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-white/30 uppercase tracking-wider font-semibold mr-1">Actief:</span>
          {activeStatus !== 'all' && (
            <button
              onClick={() => onStatusChange('all')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[11px] text-emerald-300 font-medium hover:bg-emerald-500/25 transition-colors"
            >
              {STATUS_LABELS[activeStatus]}
              <X className="h-3 w-3" />
            </button>
          )}
          {activeTags.map(tag => {
            const cfg = TAG_CONFIG[tag];
            const Icon = cfg.icon;
            return (
              <button
                key={tag}
                onClick={() => onTagToggle(tag)}
                className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors', cfg.bg, cfg.text, cfg.border)}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
                <X className="h-3 w-3" />
              </button>
            );
          })}
          {activeParcel && (
            <button
              onClick={() => onParcelChange(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.1] text-[11px] text-white/70 font-medium hover:bg-white/[0.08] transition-colors"
            >
              <MapPin className="h-3 w-3" />
              {activeParcel.name}
              <X className="h-3 w-3" />
            </button>
          )}
          {activeObservation && (
            <button
              onClick={onObservationClear}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 font-medium hover:bg-amber-500/20 transition-colors"
            >
              {activeObservation}
              <X className="h-3 w-3" />
            </button>
          )}
          {dateFilter !== 'all' && (
            <button
              onClick={() => onDateFilterChange('all')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-[11px] text-cyan-300 font-medium hover:bg-cyan-500/20 transition-colors"
            >
              <CalendarDays className="h-3 w-3" />
              {DATE_LABELS[dateFilter]}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Filter drawer — opent onder de filter-knop */}
      <AnimatePresence initial={false}>
        {showDrawer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5 space-y-5">
              {/* Status — alleen invoer-tab */}
              {viewMode === 'invoer' && (
                <div>
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">Status</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(STATUS_LABELS) as StatusFilter[]).map(s => (
                      <button
                        key={s}
                        onClick={() => onStatusChange(s)}
                        className={cn(
                          'px-4 py-2 rounded-full text-sm font-medium border transition-all min-h-[40px]',
                          activeStatus === s
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-white/[0.02] border-white/[0.08] text-white/60 hover:border-white/20',
                        )}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">Categorie</p>
                <FilterChips
                  activeStatus={activeStatus}
                  activeTags={activeTags}
                  onStatusChange={onStatusChange}
                  onTagToggle={onTagToggle}
                  notes={notes}
                  tagsOnly
                />
              </div>

              {/* Perceel */}
              {parcels.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">Perceel</p>
                  <div className="relative">
                    <select
                      value={activeParcelId ?? ''}
                      onChange={(e) => onParcelChange(e.target.value || null)}
                      className="w-full h-12 bg-white/[0.03] border border-white/[0.08] rounded-xl pl-4 pr-10 text-sm text-white/80 outline-none focus:border-emerald-500/30 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="">Alle percelen</option>
                      {parcels.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Datum */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">Datumbereik</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(DATE_LABELS) as DateFilter[]).map(d => (
                    <button
                      key={d}
                      onClick={() => onDateFilterChange(d)}
                      className={cn(
                        'px-4 py-2 rounded-full text-sm font-medium border transition-all min-h-[40px]',
                        dateFilter === d
                          ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                          : 'bg-white/[0.02] border-white/[0.08] text-white/60 hover:border-white/20',
                      )}
                    >
                      {DATE_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// FILTER CHIPS
// ============================================================================

type StatusFilter = 'all' | 'open' | 'done' | 'pinned';

function FilterChips({ activeStatus, activeTags, onStatusChange, onTagToggle, notes, tagsOnly = false }: {
  activeStatus: StatusFilter;
  activeTags: Tag[];
  onStatusChange: (f: StatusFilter) => void;
  onTagToggle: (tag: Tag) => void;
  notes: FieldNote[];
  tagsOnly?: boolean;
}) {
  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Alles' },
    { key: 'open', label: 'Open' },
    { key: 'done', label: 'Afgerond' },
    { key: 'pinned', label: 'Gepind' },
  ];

  // Count per tag
  const tagCounts = useMemo(() => {
    const counts: Partial<Record<Tag, number>> = {};
    (Object.keys(TAG_CONFIG) as Tag[]).forEach(tag => {
      counts[tag] = notes.filter(n => n.auto_tag === tag).length;
    });
    return counts;
  }, [notes]);

  const visibleTags = (Object.keys(TAG_CONFIG) as Tag[]).filter(t => (tagCounts[t] ?? 0) > 0);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Status filters — verborgen in tagsOnly mode */}
      {!tagsOnly && statusFilters.map((f) => (
        <button
          key={f.key}
          onClick={() => onStatusChange(f.key)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
            activeStatus === f.key
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
              : 'text-white/30 hover:text-white/50 border border-transparent hover:border-white/10'
          )}
        >
          {f.label}
        </button>
      ))}

      {/* Divider before tag filters */}
      {!tagsOnly && visibleTags.length > 0 && (
        <div className="h-4 w-px bg-white/10 mx-0.5" />
      )}

      {/* Tag filters */}
      {visibleTags.map((tag) => {
        const cfg = TAG_CONFIG[tag];
        const isActive = activeTags.includes(tag);
        return (
          <button
            key={tag}
            onClick={() => onTagToggle(tag)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200',
              isActive
                ? cn(cfg.bg, cfg.text, cfg.border)
                : 'text-white/30 hover:text-white/50 border-transparent hover:border-white/10'
            )}
          >
            <cfg.icon className="h-3 w-3" />
            {cfg.label} ({tagCounts[tag]})
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// EMPTY STATE & SKELETON
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.03] mb-4">
        <StickyNote className="h-8 w-8 text-white/15" />
      </div>
      <p className="text-sm font-medium text-white/35">Nog geen veldnotities</p>
      <p className="text-xs text-white/20 mt-1.5 max-w-xs">
        Leg snel iets vast — typ hierboven je eerste notitie
      </p>
    </div>
  );
}

function NotesSkeleton() {
  return (
    <div className="divide-y divide-white/[0.04]">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-3.5">
          <Skeleton className="h-5 w-5 rounded-md flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

// ============================================================================
// TASKS TAB
// ============================================================================

function formatDueDate(dateStr: string): { label: string; isOverdue: boolean; isToday: boolean } {
  const due = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return { label: `${Math.abs(diffDays)} dag${Math.abs(diffDays) > 1 ? 'en' : ''} te laat`, isOverdue: true, isToday: false };
  if (diffDays === 0) return { label: 'Vandaag', isOverdue: false, isToday: true };
  if (diffDays === 1) return { label: 'Morgen', isOverdue: false, isToday: false };
  if (diffDays < 7) return { label: due.toLocaleDateString('nl-NL', { weekday: 'long' }), isOverdue: false, isToday: false };
  return { label: due.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), isOverdue: false, isToday: false };
}

function getWeekGroup(dateStr: string): string {
  const due = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  const dayOfWeek = today.getDay() || 7; // Mon=1, Sun=7
  const daysUntilEndOfWeek = 7 - dayOfWeek;

  if (diffDays <= daysUntilEndOfWeek) return 'Deze week';
  if (diffDays <= daysUntilEndOfWeek + 7) return 'Volgende week';
  return 'Later';
}

const REMINDER_OPTIONS = [
  { value: 'morning', label: 'Ochtend (08:00)' },
  { value: 'evening', label: 'Avond (18:00)' },
  { value: 'day-before', label: 'Dag ervoor (08:00)' },
  { value: 'hour-before', label: '1 uur van tevoren' },
  { value: 'none', label: 'Geen herinnering' },
] as const;

/** Snelle datum-pills voor taken — voorkomt gedoe met native date picker */
function getQuickDates() {
  const today = new Date();
  const mkDate = (offset: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return d.toISOString().split('T')[0];
  };
  const todayStr = mkDate(0);
  const tomorrowStr = mkDate(1);
  const dayAfterStr = mkDate(2);
  // Eerstvolgende vrijdag
  const dayOfWeek = today.getDay(); // 0=zondag
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5;
  const fridayStr = mkDate(daysUntilFriday > 0 ? daysUntilFriday : 7);
  return [
    { label: 'Vandaag', value: todayStr },
    { label: 'Morgen', value: tomorrowStr },
    { label: 'Overmorgen', value: dayAfterStr },
    { label: 'Vrijdag', value: fridayStr },
  ];
}

function calcReminderAt(dueDate: string, option: string): string | null {
  if (option === 'none' || !dueDate) return null;
  const d = new Date(dueDate + 'T00:00:00');
  switch (option) {
    case 'morning': d.setHours(8, 0, 0); return d.toISOString();
    case 'evening': d.setHours(18, 0, 0); return d.toISOString();
    case 'day-before': d.setDate(d.getDate() - 1); d.setHours(8, 0, 0); return d.toISOString();
    case 'hour-before': d.setHours(d.getHours() - 1); return d.toISOString();
    default: return null;
  }
}

function TasksTab({ notes, showLocked, onToggleStatus, onUpdateDueDate, onUpdateReminder, onCreateTask, onDelete, onViewNote }: {
  notes: FieldNote[];
  showLocked: boolean;
  onToggleStatus: (note: FieldNote) => void;
  onUpdateDueDate: (noteId: string, dueDate: string | null) => void;
  onUpdateReminder: (noteId: string, reminderAt: string | null) => void;
  onCreateTask: (content: string, dueDate: string | null, reminderAt: string | null) => void;
  onDelete: (note: FieldNote) => void;
  onViewNote: (noteId: string) => void;
}) {
  const [newTask, setNewTask] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newReminder, setNewReminder] = useState<string>('morning');
  const [showDone, setShowDone] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState('');

  // Filter to tasks only
  const tasks = notes.filter(n =>
    n.auto_tag === 'taak' && (showLocked || !n.is_locked)
  );

  const openTasks = tasks.filter(n => n.status === 'open');
  const doneTasks = tasks.filter(n => n.status === 'done');

  // Group open tasks
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const overdueAndToday = openTasks.filter(n =>
    n.due_date && n.due_date <= todayStr
  ).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));

  const upcoming = openTasks.filter(n =>
    n.due_date && n.due_date > todayStr
  ).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));

  const noDeadline = openTasks.filter(n => !n.due_date);

  // Group upcoming by week
  const upcomingGroups = new Map<string, FieldNote[]>();
  for (const n of upcoming) {
    const group = getWeekGroup(n.due_date!);
    if (!upcomingGroups.has(group)) upcomingGroups.set(group, []);
    upcomingGroups.get(group)!.push(n);
  }

  const handleCreateTask = () => {
    const trimmed = newTask.trim();
    if (!trimmed) return;
    const reminderAt = newDueDate ? calcReminderAt(newDueDate, newReminder) : null;
    onCreateTask(trimmed, newDueDate || null, reminderAt);
    setNewTask('');
    setNewDueDate('');
    setNewReminder('morning');
  };

  const TaskRow = ({ note }: { note: FieldNote }) => {
    const isDone = note.status === 'done';
    const dueDateInfo = note.due_date ? formatDueDate(note.due_date) : null;
    const isEditing = editingId === note.id;

    return (
      <div className={cn(
        'group/task flex items-start gap-3 px-4 md:px-5 py-3.5 transition-colors min-h-[56px]',
        'hover:bg-white/[0.02] border-b border-white/[0.04] last:border-b-0',
        isDone && 'opacity-50',
      )}>
        {/* Checkbox 28×28 */}
        <button
          onClick={() => onToggleStatus(note)}
          className={cn(
            'mt-0.5 flex-shrink-0 h-7 w-7 rounded-lg border-2 transition-all flex items-center justify-center',
            isDone
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'border-white/25 hover:border-amber-400/60 hover:bg-amber-500/5',
          )}
          aria-label={isDone ? 'Open zetten' : 'Afronden'}
        >
          {isDone && <Check className="h-4 w-4" />}
        </button>

        <button
          onClick={() => !isDone && onViewNote(note.id)}
          className="flex-1 min-w-0 text-left cursor-pointer"
        >
          <p className={cn(
            'text-sm md:text-base leading-relaxed',
            isDone ? 'text-white/30 line-through' : 'text-white/80',
          )}>
            {note.content}
          </p>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {dueDateInfo && (
              <span className={cn(
                'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border',
                dueDateInfo.isOverdue && !isDone
                  ? 'bg-red-500/15 text-red-300 border-red-500/25'
                  : dueDateInfo.isToday && !isDone
                    ? 'bg-amber-500/15 text-amber-200 border-amber-500/25'
                    : 'bg-white/[0.04] text-white/50 border-white/[0.08]',
              )}>
                {dueDateInfo.isOverdue && !isDone ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <CalendarDays className="h-3 w-3" />
                )}
                {dueDateInfo.label}
              </span>
            )}
            {note.reminder_at && !note.is_reminder_sent && (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-full font-medium">
                <Bell className="h-2.5 w-2.5" />
              </span>
            )}
            {(note.sub_parcels ?? []).slice(0, 2).map(sp => (
              <span key={sp.id} className="inline-flex items-center gap-0.5 text-[10px] text-white/35 font-medium">
                <MapPin className="h-2.5 w-2.5" />
                {sp.parcel_name || sp.name}
              </span>
            ))}
            {note.is_locked && (
              <Lock className="h-3 w-3 text-amber-400/70" />
            )}
            {note.source === 'whatsapp' && (
              <WhatsAppIcon className="h-3 w-3 text-[#25D366]" />
            )}
          </div>

          {/* Inline date editor */}
          {isEditing && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 mt-3 flex-wrap"
            >
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="bg-white/[0.06] border border-amber-500/25 rounded-lg px-3 py-2 text-sm text-white/80 outline-none min-h-[40px]"
              />
              <button
                onClick={() => {
                  onUpdateDueDate(note.id, editDueDate || null);
                  if (editDueDate) {
                    onUpdateReminder(note.id, calcReminderAt(editDueDate, 'morning'));
                  }
                  setEditingId(null);
                }}
                className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 min-h-[40px]"
              >
                Opslaan
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="px-3 py-2 rounded-lg text-white/50 hover:text-white text-xs font-medium min-h-[40px]"
              >
                Annuleer
              </button>
            </div>
          )}
        </button>

        {/* Actions — altijd 60 % opacity i.p.v. 40 */}
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 group-hover/task:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditDueDate(note.due_date ?? '');
              setEditingId(isEditing ? null : note.id);
            }}
            className="h-10 w-10 flex items-center justify-center rounded-lg text-white/40 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
            title="Deadline wijzigen"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(note); }}
            className="h-10 w-10 flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Verwijderen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const quickDates = getQuickDates();

  return (
    <div className="space-y-6">
      {/* Quick-add task — amber SpotlightCard */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/15 bg-white/[0.02] p-4 md:p-5">
        {/* Amber glow orb rechtsboven */}
        <div className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full blur-[70px] opacity-[0.08] bg-amber-500" aria-hidden />

        <div className="relative flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
            <ListTodo className="h-4 w-4 text-amber-400" />
          </div>
          <span className="text-[11px] font-semibold text-amber-300/80 uppercase tracking-wider">Nieuwe taak</span>
        </div>

        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateTask(); } }}
          placeholder="Bijv. 'Snoeiploeg regelen blok 3'"
          maxLength={2000}
          className="relative w-full bg-transparent text-base md:text-lg text-white/90 placeholder:text-white/30 outline-none min-h-[48px]"
        />

        <div className="relative mt-4 pt-3 border-t border-white/[0.04] space-y-3">
          {/* Datum pills — SmartDateField stijl */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mr-1">Deadline:</span>
            {quickDates.map(qd => (
              <button
                key={qd.value}
                type="button"
                onClick={() => setNewDueDate(newDueDate === qd.value ? '' : qd.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-all min-h-[36px]',
                  newDueDate === qd.value
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                    : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-amber-500/30 hover:text-amber-300',
                )}
              >
                {qd.label}
              </button>
            ))}
            {/* Native date picker als fallback */}
            <input
              type="date"
              value={newDueDate && !quickDates.some(q => q.value === newDueDate) ? newDueDate : ''}
              onChange={(e) => setNewDueDate(e.target.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs border transition-colors min-h-[36px]',
                newDueDate && !quickDates.some(q => q.value === newDueDate)
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                  : 'bg-white/[0.02] border-white/[0.08] text-white/50',
              )}
            />
            {newDueDate && (
              <button
                onClick={() => setNewDueDate('')}
                className="text-[11px] text-white/40 hover:text-white/70 underline"
              >
                Wis
              </button>
            )}
          </div>

          {/* Herinnering */}
          {newDueDate && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1">
                <Bell className="h-3 w-3" />
                Herinnering:
              </span>
              {REMINDER_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setNewReminder(o.value)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition-all min-h-[32px]',
                    newReminder === o.value
                      ? 'bg-blue-500/15 border-blue-500/30 text-blue-200'
                      : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:border-blue-500/25',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleCreateTask}
              disabled={!newTask.trim()}
              className={cn(
                'flex items-center gap-2 rounded-xl min-h-[56px] px-5 font-semibold transition-all',
                newTask.trim()
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-400 hover:to-amber-500 shadow-[0_0_24px_rgba(245,158,11,0.25)] hover:shadow-[0_0_32px_rgba(245,158,11,0.35)]'
                  : 'bg-white/[0.05] text-white/30 cursor-not-allowed',
              )}
            >
              <Send className="h-5 w-5" />
              <span>Taak opslaan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Vandaag & te laat */}
      {overdueAndToday.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="h-6 w-6 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
            </div>
            <h3 className="text-sm font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-red-300 to-amber-300 bg-clip-text text-transparent">
                Vandaag & te laat
              </span>
            </h3>
            <span className="text-[10px] text-red-300 bg-red-500/15 border border-red-500/25 px-1.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              {overdueAndToday.length}
            </span>
          </div>
          <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.02] overflow-hidden">
            {overdueAndToday.map(n => <TaskRow key={n.id} note={n} />)}
          </div>
        </div>
      )}

      {/* Aankomend (per week-groep) */}
      {upcomingGroups.size > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="h-6 w-6 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <Clock className="h-3.5 w-3.5 text-sky-400" />
            </div>
            <h3 className="text-sm font-semibold tracking-tight text-white/85">Aankomend</h3>
          </div>
          <div className="space-y-3">
            {[...upcomingGroups.entries()].map(([group, groupNotes]) => (
              <div key={group}>
                <p className="text-[10px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 px-1">
                  {group}
                  <span className="ml-1.5 text-white/20">· {groupNotes.length}</span>
                </p>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  {groupNotes.map(n => <TaskRow key={n.id} note={n} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zonder deadline */}
      {noDeadline.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="h-6 w-6 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
              <ListTodo className="h-3.5 w-3.5 text-white/40" />
            </div>
            <h3 className="text-sm font-semibold tracking-tight text-white/70">
              Zonder deadline
            </h3>
            <span className="text-[10px] text-white/40 font-semibold">{noDeadline.length}</span>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            {noDeadline.map(n => <TaskRow key={n.id} note={n} />)}
          </div>
        </div>
      )}

      {/* Lege staat */}
      {openTasks.length === 0 && doneTasks.length === 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16 px-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-4">
            <ListTodo className="h-8 w-8 text-amber-400/70" />
          </div>
          <p className="text-base font-semibold text-white/70">Nog geen taken</p>
          <p className="text-sm text-white/40 mt-1.5 max-w-md mx-auto">
            Maak hierboven snel een taak aan of typ 'm op de Invoer-tab. Gemini herkent automatisch "morgen" of "vrijdag" als deadline.
          </p>
        </div>
      )}

      {/* Afgerond (expandable) */}
      {doneTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-2 mb-2 px-1 text-xs font-semibold text-white/35 hover:text-emerald-300 transition-colors min-h-[36px]"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Afgerond ({doneTasks.length})</span>
            {showDone ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showDone && (
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.01] overflow-hidden">
              {doneTasks.map(n => <TaskRow key={n.id} note={n} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VeldnotitiesClient() {
  const queryClient = useQueryClient();
  const { data: notes, isLoading } = useFieldNotes();
  const { data: parcels = [] } = useParcels();
  const createMutation = useCreateFieldNote();
  const updateMutation = useUpdateFieldNote();
  const deleteMutation = useDeleteFieldNote();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('all');
  const [activeTags, setActiveTags] = useState<Tag[]>([]);
  const [activeParcelId, setActiveParcelId] = useState<string | null>(null);
  const [activeObservation, setActiveObservation] = useState<string | null>(null);
  const [transferNoteId, setTransferNoteId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'invoer' | 'kaart' | 'archief' | 'taken'>('invoer');
  const [dateFilter, setDateFilter] = useState<'week' | 'month' | 'season' | 'all'>('all');
  const [archiveCategory, setArchiveCategory] = useState<Tag | null>(null);
  const [showLocked, setShowLocked] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('cropnode:showLockedNotes') === 'true';
  });

  // Sync showLocked from localStorage (changed on settings page)
  useEffect(() => {
    const handler = () => {
      setShowLocked(localStorage.getItem('cropnode:showLockedNotes') === 'true');
    };
    window.addEventListener('storage', handler);
    // Also check on focus (same-tab changes)
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);

  const transferNote = transferNoteId ? notes?.find(n => n.id === transferNoteId) : null;

  const [isUploading, setIsUploading] = useState(false);

  const handleCreate = useCallback(async (data: QuickAddSubmitData) => {
    let photo_url: string | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;

    // Try photo upload — failure never blocks note saving
    if (data.photo) {
      try {
        setIsUploading(true);
        const { compressPhoto, uploadPhotoToSupabase } = await import('@/lib/photo-upload');
        const compressed = await compressPhoto(data.photo);
        const { data: { user } } = await (await import('@/lib/supabase/client')).createClient().auth.getUser();
        if (user) {
          photo_url = await uploadPhotoToSupabase(compressed, user.id);
        }
      } catch (err) {
        console.error('[Photo upload] failed:', err);
        // Don't show toast — just save without photo
      } finally {
        setIsUploading(false);
      }
    }

    // Only include GPS if available
    if (data.latitude != null && data.longitude != null) {
      latitude = data.latitude;
      longitude = data.longitude;
    }

    // Always save the note — even if photo/GPS failed
    createMutation.mutate({
      content: data.content,
      ...(photo_url ? { photo_url } : {}),
      ...(latitude != null ? { latitude, longitude } : {}),
      ...(data.is_locked ? { is_locked: true } : {}),
    }, {
      onError: (err) => {
        toast({ title: 'Fout', description: err.message, variant: 'destructive' });
      },
    });
  }, [createMutation, toast]);

  const handleToggleStatus = useCallback((note: FieldNote) => {
    const newStatus = note.status === 'done' ? 'open' : 'done';
    updateMutation.mutate({ id: note.id, updates: { status: newStatus } });
  }, [updateMutation]);

  const handleTogglePin = useCallback((note: FieldNote) => {
    updateMutation.mutate({ id: note.id, updates: { is_pinned: !note.is_pinned } });
  }, [updateMutation]);

  const handleToggleLock = useCallback((note: FieldNote) => {
    updateMutation.mutate({ id: note.id, updates: { is_locked: !note.is_locked } });
  }, [updateMutation]);

  const handleDelete = useCallback((note: FieldNote) => {
    deleteMutation.mutate(note.id, {
      onSuccess: () => {
        toast({ title: 'Notitie verwijderd', duration: 3000 });
      },
      onError: (err) => {
        toast({ title: 'Fout', description: err.message, variant: 'destructive' });
      },
    });
  }, [deleteMutation, toast]);

  const handleEdit = useCallback((note: FieldNote, content: string) => {
    updateMutation.mutate({ id: note.id, updates: { content } });
  }, [updateMutation]);

  const handleUpdateParcel = useCallback((note: FieldNote, parcelIds: string[]) => {
    updateMutation.mutate({ id: note.id, updates: { parcel_ids: parcelIds } });
  }, [updateMutation]);

  const handleDirectTransfer = useCallback(async (note: FieldNote) => {
    toast({ title: '⏳ Verwerken...', duration: 10000 });
    try {
      const res = await fetch('/api/field-notes/transfer-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: note.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Fout', description: data.error || 'Verwerking mislukt', variant: 'destructive', duration: 5000 });
        return;
      }
      toast({ title: '✅ Verwerkt naar spuitschrift', duration: 3000 });
      queryClient.invalidateQueries({ queryKey: ['field-notes'] });
      queryClient.invalidateQueries({ queryKey: ['spuitschrift'] });
      queryClient.invalidateQueries({ queryKey: ['parcel-history'] });
    } catch (err) {
      toast({ title: 'Fout', description: 'Verwerking mislukt', variant: 'destructive' });
    }
  }, [toast, queryClient]);

  const handleTagToggle = useCallback((tag: Tag) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }, []);

  // Client-side filtering
  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    let result = notes;

    // Hide locked notes by default
    if (!showLocked) {
      result = result.filter(n => !n.is_locked);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((n) => n.content.toLowerCase().includes(q));
    }

    switch (activeStatus) {
      case 'open': result = result.filter(n => n.status === 'open'); break;
      case 'done': result = result.filter(n => n.status === 'done'); break;
      case 'pinned': result = result.filter(n => n.is_pinned); break;
    }

    if (activeTags.length > 0) {
      result = result.filter(n => n.auto_tag && activeTags.includes(n.auto_tag as Tag));
    }

    if (activeParcelId) {
      result = result.filter(n => (n.parcel_ids ?? []).includes(activeParcelId));
    }

    if (activeObservation) {
      result = result.filter(n => n.observation_subject === activeObservation);
    }

    // Date filter (used by map and archive tabs)
    if (dateFilter !== 'all') {
      const now = new Date();
      let cutoff: Date;
      switch (dateFilter) {
        case 'week': cutoff = new Date(now.getTime() - 7 * 86400000); break;
        case 'month': cutoff = new Date(now.getTime() - 30 * 86400000); break;
        case 'season': {
          // Season starts Aug 1 of current or previous year
          const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
          cutoff = new Date(year, 7, 1);
          break;
        }
      }
      result = result.filter(n => new Date(n.created_at) >= cutoff);
    }

    // Archive category filter
    if (archiveCategory) {
      result = result.filter(n => n.auto_tag === archiveCategory);
    }

    return result;
  }, [notes, searchQuery, activeStatus, activeTags, activeParcelId, activeObservation, dateFilter, archiveCategory, showLocked]);

  return (
    <div className="max-w-3xl mx-auto pb-12 relative">
      <div className="absolute top-[-60px] left-[-40px] w-[400px] h-[400px] bg-emerald-500/[0.02] rounded-full blur-[100px] pointer-events-none" />

      <div className="relative space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <StickyNote className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white/90">Veldnotities</h1>
              <p className="text-xs text-white/30">Snelle notities vanuit het veld</p>
            </div>
          </div>

          {/* 3-tab navigation: Invoer / Kaart / Archief */}
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] p-0.5">
            {([
              { key: 'invoer' as const, label: 'Invoer', icon: List, badge: (notes ?? []).filter(n => n.status === 'open').length },
              { key: 'kaart' as const, label: 'Kaart', icon: MapIcon, badge: (notes ?? []).filter(n => n.latitude != null).length },
              { key: 'archief' as const, label: 'Archief', icon: StickyNote, badge: null },
              { key: 'taken' as const, label: 'Taken', icon: ListTodo, badge: (notes ?? []).filter(n => n.auto_tag === 'taak' && n.status === 'open').length || null },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setViewMode(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  viewMode === tab.key
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.badge != null && tab.badge > 0 && (
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-full font-semibold',
                    viewMode === tab.key ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.06] text-white/25'
                  )}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quick add */}
        <QuickAddInput onSubmit={handleCreate} isUploading={isUploading} />

        {/* Progressive-disclosure filter bar */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
          activeTags={activeTags}
          onTagToggle={handleTagToggle}
          activeParcelId={activeParcelId}
          onParcelChange={setActiveParcelId}
          activeObservation={activeObservation}
          onObservationClear={() => setActiveObservation(null)}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          parcels={parcels}
          notes={notes ?? []}
          viewMode={viewMode}
        />

        {/* ═══ TAB CONTENT ═══ */}

        {/* ── INVOER TAB ── */}
        {viewMode === 'invoer' && (
          <>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              {isLoading ? (
                <NotesSkeleton />
              ) : !notes || notes.length === 0 ? (
                <EmptyState />
              ) : filteredNotes.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-white/30">Geen notities gevonden</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onToggleStatus={() => handleToggleStatus(note)}
                      onTogglePin={() => handleTogglePin(note)}
                      onToggleLock={() => handleToggleLock(note)}
                      onDelete={() => handleDelete(note)}
                      onEdit={(content) => handleEdit(note, content)}
                      onUpdateParcel={(parcelIds) => handleUpdateParcel(note, parcelIds)}
                      onTransfer={() => handleDirectTransfer(note)}
                      onPhotoClick={(url) => setLightboxUrl(url)}
                      onObservationFilter={(subject) => setActiveObservation(subject)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>

            {notes && notes.length > 0 && (
              <p className="text-[11px] text-white/15 text-center">
                {filteredNotes.length} van {notes.length} notities
              </p>
            )}
          </>
        )}

        {/* ── KAART TAB ── */}
        {viewMode === 'kaart' && (() => {
          const geoNotes = filteredNotes.filter(n => n.latitude != null && n.longitude != null);

          // Counts per tag voor legenda
          const legendCounts: Partial<Record<FieldNoteTag, number>> = {};
          for (const n of geoNotes) {
            const t = (n.auto_tag as FieldNoteTag | null) ?? 'overig';
            legendCounts[t] = (legendCounts[t] ?? 0) + 1;
          }

          return geoNotes.length > 0 ? (
            <div className="space-y-3">
              <div className="relative">
                <FieldNotesMap
                  notes={filteredNotes}
                  onViewInList={(noteId) => {
                    setViewMode('invoer');
                    setTimeout(() => {
                      document.getElementById(`note-${noteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                  }}
                />
                {/* Floating TagLegend linksboven over de kaart */}
                <div className="pointer-events-none absolute left-3 bottom-3 z-[400]">
                  <div className="pointer-events-auto">
                    <TagLegend layout="horizontal" counts={legendCounts} compact />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-white/40">
                <span>
                  <span className="font-semibold text-white/70">{geoNotes.length}</span> notitie{geoNotes.length !== 1 ? 's' : ''} met locatie
                </span>
                {filteredNotes.length > geoNotes.length && (
                  <span>{filteredNotes.length - geoNotes.length} zonder locatie (alleen in lijst)</span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16 px-6 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-4">
                <MapPin className="h-8 w-8 text-purple-400/70" />
              </div>
              <p className="text-base font-semibold text-white/70">Nog geen notities op de kaart</p>
              <p className="text-sm text-white/40 mt-1.5 max-w-md mx-auto">
                Tik op de <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20"><MapPin className="h-3 w-3" />Locatie</span> knop bij een notitie om 'm hier te zien.
              </p>
              <button
                onClick={() => setViewMode('invoer')}
                className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 transition-colors min-h-[48px]"
              >
                <ArrowRight className="h-4 w-4" />
                Nieuwe notitie maken
              </button>
            </div>
          );
        })()}

        {/* ── ARCHIEF TAB ── */}
        {viewMode === 'archief' && (
          <div className="space-y-6">
            {/* Category SpotlightCards — kleur per tag */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {(Object.keys(TAG_CONFIG) as Tag[]).map((key) => {
                const cfg = TAG_CONFIG[key];
                const count = (notes ?? []).filter(n => n.auto_tag === key).length;
                const Icon = cfg.icon;
                const isActive = archiveCategory === key;
                const tokens = tagTokens(key as FieldNoteTag);
                return (
                  <button
                    key={key}
                    onClick={() => setArchiveCategory(isActive ? null : key)}
                    className={cn(
                      'relative overflow-hidden flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all min-h-[100px]',
                      isActive
                        ? cn(tokens.bgSubtle, tokens.border)
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
                    )}
                  >
                    {/* Glow orb bij actief */}
                    {isActive && (
                      <div
                        className={cn(
                          'pointer-events-none absolute -top-6 -right-6 w-20 h-20 rounded-full blur-[40px] opacity-30',
                          tokens.orb,
                        )}
                        aria-hidden
                      />
                    )}
                    <div className={cn('relative h-8 w-8 rounded-lg flex items-center justify-center', tokens.bgSubtle, tokens.border, 'border')}>
                      <Icon className={cn('h-4 w-4', tokens.text)} />
                    </div>
                    <span className={cn('relative text-[11px] font-semibold', isActive ? tokens.text : 'text-white/50')}>
                      {cfg.label}
                    </span>
                    <span className={cn('relative text-2xl font-bold tabular-nums', isActive ? tokens.text : 'text-white/70')}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sub-tag filter chips */}
            {archiveCategory && (() => {
              const subTags = [...new Set(
                (notes ?? [])
                  .filter(n => n.auto_tag === archiveCategory && n.observation_subject)
                  .map(n => n.observation_subject!),
              )];
              return subTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveObservation(null)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors min-h-[32px]',
                      !activeObservation
                        ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                        : 'border-white/[0.08] text-white/50 hover:bg-white/[0.04]',
                    )}
                  >
                    Alle
                  </button>
                  {subTags.map(st => (
                    <button
                      key={st}
                      onClick={() => setActiveObservation(activeObservation === st ? null : st)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors min-h-[32px]',
                        activeObservation === st
                          ? 'bg-amber-500/15 border-amber-500/25 text-amber-300'
                          : 'border-white/[0.08] text-white/50 hover:bg-white/[0.04]',
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}

            {/* Maand-tijdlijn */}
            <div className="space-y-5">
              {(() => {
                const grouped = new Map<string, FieldNote[]>();
                for (const note of filteredNotes) {
                  const d = new Date(note.created_at);
                  const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)!.push(note);
                }

                if (grouped.size === 0) {
                  return (
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16 px-6 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.03] mb-4">
                        <StickyNote className="h-8 w-8 text-white/15" />
                      </div>
                      <p className="text-base font-semibold text-white/70">Geen notities gevonden</p>
                      {archiveCategory && (
                        <p className="text-sm text-white/40 mt-1.5">
                          Probeer een ander filter, tijdsbereik of categorie.
                        </p>
                      )}
                    </div>
                  );
                }

                return [...grouped.entries()]
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([key, monthNotes]) => {
                    const d = new Date(monthNotes[0].created_at);
                    const monthLabel = d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
                    const capitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
                    const parts = capitalized.split(' ');
                    const yearPart = parts.pop() ?? '';
                    const monthPart = parts.join(' ');
                    return (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center gap-3 px-1">
                          <div className="h-1 w-6 rounded-full bg-gradient-to-r from-emerald-500/60 to-transparent" />
                          <h3 className="text-sm font-semibold tracking-tight">
                            <span className="text-white/85">{monthPart}</span>
                            <span className="ml-1.5 text-white/30 font-normal">{yearPart}</span>
                          </h3>
                          <span className="text-[10px] font-semibold text-white/30 tabular-nums">
                            {monthNotes.length}
                          </span>
                        </div>
                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.04]">
                          {monthNotes.map(note => {
                            const parcelName = (note.sub_parcels ?? [])[0]?.parcel_name;
                            return (
                              <button
                                key={note.id}
                                onClick={() => {
                                  setViewMode('invoer');
                                  setTimeout(() => {
                                    document.getElementById(`note-${note.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }, 100);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left min-h-[56px]"
                              >
                                {note.photo_url && (
                                  <PhotoThumb url={note.photo_url} size="sm" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white/75 truncate">{note.content}</p>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    {note.auto_tag && (
                                      <TagChipPrimitive tag={note.auto_tag as FieldNoteTag} size="sm" />
                                    )}
                                    {note.observation_subject && (
                                      <span className="text-[10px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md font-medium">
                                        {note.observation_subject}
                                      </span>
                                    )}
                                    {parcelName && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] text-white/35">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {parcelName}
                                      </span>
                                    )}
                                    {note.source === 'whatsapp' && (
                                      <span title="Via WhatsApp" className="inline-flex items-center">
                                        <WhatsAppIcon className="h-3 w-3 text-[#25D366]" />
                                      </span>
                                    )}
                                    {note.is_locked && (
                                      <Lock className="h-2.5 w-2.5 text-amber-400/70" />
                                    )}
                                  </div>
                                </div>
                                <span className="text-[11px] text-white/30 flex-shrink-0 tabular-nums">
                                  {new Date(note.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
              })()}
            </div>
          </div>
        )}

        {/* ── TAKEN TAB ── */}
        {viewMode === 'taken' && (
          <TasksTab
            notes={notes ?? []}
            showLocked={showLocked}
            onToggleStatus={(note) => {
              const newStatus = note.status === 'done' ? 'open' : 'done';
              updateMutation.mutate({ id: note.id, updates: { status: newStatus } });
            }}
            onUpdateDueDate={(noteId, dueDate) => {
              updateMutation.mutate({ id: noteId, updates: { due_date: dueDate } });
            }}
            onUpdateReminder={(noteId, reminderAt) => {
              updateMutation.mutate({ id: noteId, updates: { reminder_at: reminderAt } });
            }}
            onCreateTask={(content, dueDate, reminderAt) => {
              createMutation.mutate({
                content,
                ...(dueDate ? { due_date: dueDate } : {}),
                ...(reminderAt ? { reminder_at: reminderAt } : {}),
              } as any);
            }}
            onDelete={(note) => handleDelete(note)}
            onViewNote={(noteId) => {
              setViewMode('invoer');
              setTimeout(() => {
                document.getElementById(`note-${noteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }}
          />
        )}
      </div>

      {/* Transfer modal */}
      <AnimatePresence>
        {transferNote && (
          <TransferModal
            key={transferNote.id}
            noteId={transferNote.id}
            content={transferNote.content}
            onClose={() => setTransferNoteId(null)}
            onTransferred={() => setTransferNoteId(null)}
          />
        )}
      </AnimatePresence>

      {/* Photo lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
