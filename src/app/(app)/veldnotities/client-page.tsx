'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  StickyNote, Search, Pin, Trash2, Check, ChevronDown, ChevronUp,
  NotebookPen, Send, Droplets, Leaf, ListTodo, Eye, Tag, MapPin,
  MapPinPlus, ArrowRight, CheckCircle2, Bug, Shrub, Activity, Wind, Info,
  Camera, X, Loader2, List, MapIcon, Lock, Unlock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useFieldNotes, useCreateFieldNote, useUpdateFieldNote, useDeleteFieldNote,
  type FieldNote
} from '@/hooks/use-field-notes';
import { useParcels } from '@/hooks/use-data';
import { PhotoLightbox } from '@/components/field-notes/PhotoLightbox';
import dynamic from 'next/dynamic';

const FieldNotesMap = dynamic(
  () => import('@/components/field-notes/FieldNotesMap').then(m => m.FieldNotesMap),
  { ssr: false, loading: () => <div className="h-[500px] md:h-[600px] rounded-2xl bg-white/[0.03] animate-pulse" /> }
);
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { TransferModal } from '@/components/field-notes/TransferModal';

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
    el.style.height = Math.min(el.scrollHeight, compact ? 40 : 120) + 'px';
  }, [compact]);

  useEffect(() => { autoResize(); }, [value, autoResize]);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));

    // Try EXIF GPS as fallback (only if no manual GPS)
    if (!gpsLocation) {
      try {
        const { extractGpsFromPhoto } = await import('@/lib/photo-upload');
        const coords = await extractGpsFromPhoto(file);
        if (coords) setGpsLocation(coords);
      } catch { /* ignore */ }
    }

    // Reset input so the same file can be re-selected
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
      () => { setIsLocating(false); }, // Silent fail
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

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
  }, [value, onSubmit, pendingPhoto, gpsLocation, photoPreview, isUploading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  return (
    <div className={cn('relative group', compact ? '' : 'sticky top-0 z-10')}>
      <div className={cn(
        'rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300',
        'focus-within:border-emerald-500/30 focus-within:bg-white/[0.04]',
        'focus-within:shadow-[0_0_20px_rgba(16,185,129,0.08)]',
        compact ? 'p-3' : 'p-4 md:p-5'
      )}>
        {!compact && (
          <div className="flex items-center gap-2 mb-3">
            <NotebookPen className="h-4 w-4 text-emerald-500/60" />
            <span className="text-xs font-semibold text-white/40">Nieuwe notitie</span>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={compact
            ? "Snelle notitie..."
            : "Typ je notitie... bijv. 'Blok 3 Elstar morgen spuiten met Delan'"
          }
          rows={1}
          maxLength={2000}
          className={cn(
            'w-full bg-transparent text-white/90 placeholder:text-white/20 resize-none outline-none',
            compact ? 'text-sm' : 'text-sm md:text-base'
          )}
        />

        {/* Photo preview */}
        {photoPreview && (
          <div className="relative inline-block mt-2">
            <img
              src={photoPreview}
              alt="Preview"
              className="h-12 w-12 rounded-lg object-cover border border-white/[0.08]"
            />
            <button
              onClick={handleRemovePhoto}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-zinc-800 border border-white/10 text-white/60 hover:text-white transition-colors"
              aria-label="Foto verwijderen"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Action buttons row */}
        {!compact && (
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {/* Camera button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200',
                  pendingPhoto
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-white/25 hover:text-white/50 hover:bg-white/[0.05]'
                )}
                aria-label="Foto maken"
              >
                <Camera className="h-4 w-4" />
              </button>

              {/* GPS button */}
              <button
                onClick={handleGps}
                disabled={isLocating}
                className={cn(
                  'h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200',
                  gpsLocation
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-white/25 hover:text-white/50 hover:bg-white/[0.05]',
                  isLocating && 'animate-pulse'
                )}
                aria-label="Locatie vastleggen"
              >
                <MapPin className="h-4 w-4" />
              </button>

              {/* Lock button */}
              <button
                onClick={() => setIsLocked(!isLocked)}
                className={cn(
                  'h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200',
                  isLocked
                    ? 'text-amber-400 bg-amber-500/10'
                    : 'text-white/25 hover:text-white/50 hover:bg-white/[0.05]'
                )}
                aria-label={isLocked ? 'Ontgrendelen' : 'Vergrendelen'}
                title={isLocked ? 'Notitie wordt vergrendeld opgeslagen' : 'Vergrendel notitie'}
              >
                {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </button>
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!value.trim() || isUploading}
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded-xl transition-all duration-200',
                'text-emerald-400/40 hover:text-emerald-400 hover:bg-emerald-500/10',
                'disabled:opacity-20 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-emerald-400/40',
              )}
              aria-label="Opslaan"
            >
              {isUploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />
              }
            </button>
          </div>
        )}

        {compact && (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || isUploading}
            className="absolute right-3 bottom-3 h-8 w-8 flex items-center justify-center rounded-xl text-emerald-400/40 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-20 transition-all duration-200"
            aria-label="Opslaan"
          >
            <Send className="h-4 w-4" />
          </button>
        )}

        {!compact && (
          <p className="text-[10px] text-white/15 mt-1 hidden md:block">
            Enter om op te slaan · Shift+Enter voor nieuwe regel
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PARCEL SELECTOR
// ============================================================================

interface ParcelSelectorProps {
  currentParcelId: string | null;
  onSelect: (parcelId: string | null) => void;
  onClose: () => void;
}

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
// NOTE CARD
// ============================================================================

function NoteCard({ note, onToggleStatus, onTogglePin, onToggleLock, onDelete, onEdit, onUpdateParcel, onTransfer, onPhotoClick, onObservationFilter }: {
  note: FieldNote;
  onToggleStatus: () => void;
  onTogglePin: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onEdit: (content: string) => void;
  onUpdateParcel: (parcelId: string | null) => void;
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
  const isLong = note.content.length > 200;
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
      className={cn(
        'group flex gap-3 px-4 py-3.5 md:px-5 transition-all duration-200',
        'hover:bg-white/[0.02] border-b border-white/[0.04] last:border-b-0',
        isTransferred && 'opacity-60',
        note.is_locked && 'bg-amber-500/[0.03] border-l-2 border-l-amber-500/20'
      )}
    >
      {/* Checkbox */}
      {!isTransferred ? (
        <button
          onClick={onToggleStatus}
          className={cn(
            'mt-0.5 flex-shrink-0 h-5 w-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center',
            isDone
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'border-white/20 hover:border-emerald-500/40 hover:bg-emerald-500/5'
          )}
          aria-label={isDone ? 'Markeer als open' : 'Markeer als afgerond'}
        >
          {isDone && <Check className="h-3 w-3" />}
        </button>
      ) : (
        <div className="mt-0.5 flex-shrink-0 h-5 w-5 rounded-md bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center">
          <Check className="h-3 w-3 text-emerald-400" />
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
            className="w-full bg-white/[0.05] border border-emerald-500/30 rounded-lg px-3 py-2 text-sm text-white/90 resize-none outline-none focus:shadow-[0_0_12px_rgba(16,185,129,0.1)]"
          />
        ) : (
          <div onClick={() => { if (!isTransferred) { setEditValue(note.content); setIsEditing(true); } }} className={cn(!isTransferred && 'cursor-text')}>
            <p className={cn(
              'text-sm whitespace-pre-wrap break-words transition-all duration-200',
              isDone || isTransferred ? 'text-white/30' : 'text-white/75',
              isDone && 'line-through',
              isLong && !isExpanded ? 'line-clamp-3' : ''
            )}>
              {note.content}
            </p>
            {isLong && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                className="text-xs text-emerald-400/60 hover:text-emerald-400 mt-1 flex items-center gap-1"
              >
                {isExpanded ? (<>Minder tonen <ChevronUp className="h-3 w-3" /></>) : (<>Meer lezen <ChevronDown className="h-3 w-3" /></>)}
              </button>
            )}
          </div>
        )}

        {/* Photo thumbnail */}
        {note.photo_url && (
          <button
            onClick={() => onPhotoClick?.(note.photo_url!)}
            className="mt-2 rounded-xl overflow-hidden border border-white/[0.08] hover:border-emerald-500/30 transition-colors flex-shrink-0"
          >
            <img
              src={note.photo_url}
              alt="Veldnotitie foto"
              loading="lazy"
              className="h-20 w-20 object-cover"
            />
          </button>
        )}

        {/* Badges row: timestamp + tags + perceel */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className={cn('text-[11px] tabular-nums inline-flex items-center gap-1', isDone || isTransferred ? 'text-white/15' : 'text-white/25')}>
            {note.source === 'whatsapp' && <span title="Via WhatsApp" className="text-[10px]">💬</span>}
            {formatRelativeTime(note.created_at)}
          </span>

          {/* Transferred badge */}
          {isTransferred && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-medium">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Verwerkt
            </span>
          )}

          {/* Auto tag — or pending indicator */}
          {note.auto_tag ? (
            <TagChip tag={note.auto_tag} size="sm" />
          ) : !isDone && !isTransferred && Date.now() - new Date(note.created_at).getTime() < 60_000 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] text-white/20 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-white/20 animate-ping" />
              Analyseren...
            </span>
          )}

          {/* Parcel badges — deduplicated by location name, max 4 */}
          {[...new Map(
            (note.sub_parcels ?? []).map(sp => [sp.parcel_name || sp.name, sp])
          ).values()].slice(0, 4).map(sp => (
            <span key={sp.parcel_name || sp.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] text-white/40 font-medium">
              <MapPin className="h-2.5 w-2.5" />
              <span className="max-w-[100px] truncate">{sp.parcel_name || sp.name}</span>
            </span>
          ))}

          {/* Observation badges — clickable to filter */}
          {note.observation_subject && (
            <button
              onClick={() => onObservationFilter?.(note.observation_subject!)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-medium hover:bg-amber-500/20 transition-colors cursor-pointer"
              title={`Filter op ${note.observation_subject}`}
            >
              <ObservationIcon category={note.observation_category} />
              <span className="max-w-[100px] truncate">{note.observation_subject}</span>
            </button>
          )}
          {note.observation_category && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/[0.06] border border-amber-500/[0.12] text-[10px] text-amber-500/60 font-medium">
              {OBSERVATION_CATEGORY_LABELS[note.observation_category]}
            </span>
          )}
        </div>

        {/* Transfer button */}
        {showTransferBtn && (
          <button
            onClick={onTransfer}
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/25 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/10 transition-all duration-200"
          >
            <ArrowRight className="h-3 w-3" />
            Verwerk via Slimme Invoer
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="relative flex items-start gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-200">
        {/* Parcel link button */}
        <div className="relative">
          <button
            onClick={() => setShowParcelSelector(!showParcelSelector)}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200',
              (note.parcel_ids?.length ?? 0) > 0
                ? 'text-emerald-400 hover:bg-emerald-500/10'
                : 'text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10'
            )}
            aria-label="Perceel koppelen"
          >
            <MapPinPlus className="h-3.5 w-3.5" />
          </button>
          {showParcelSelector && (
            <ParcelSelector
              currentParcelId={(note.parcel_ids ?? [])[0] ?? null}
              onSelect={onUpdateParcel}
              onClose={() => setShowParcelSelector(false)}
            />
          )}
        </div>

        <button
          onClick={onTogglePin}
          className={cn(
            'h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200',
            note.is_pinned
              ? 'text-emerald-400 hover:bg-emerald-500/10'
              : 'text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10'
          )}
          aria-label={note.is_pinned ? 'Losmaken' : 'Vastzetten'}
        >
          <Pin className={cn('h-3.5 w-3.5', note.is_pinned ? 'fill-current' : '')} />
        </button>

        <button
          onClick={onToggleLock}
          className={cn(
            'h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200',
            note.is_locked
              ? 'text-amber-400 hover:bg-amber-500/10'
              : 'text-white/30 hover:text-amber-400 hover:bg-amber-500/10'
          )}
          aria-label={note.is_locked ? 'Ontgrendelen' : 'Vergrendelen'}
        >
          {note.is_locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onDelete}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          aria-label="Verwijderen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// FILTER CHIPS
// ============================================================================

type StatusFilter = 'all' | 'open' | 'done' | 'pinned';

function FilterChips({ activeStatus, activeTags, onStatusChange, onTagToggle, notes }: {
  activeStatus: StatusFilter;
  activeTags: Tag[];
  onStatusChange: (f: StatusFilter) => void;
  onTagToggle: (tag: Tag) => void;
  notes: FieldNote[];
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
    <div className="flex flex-wrap gap-1.5 items-center">
      {/* Status filters */}
      {statusFilters.map((f) => (
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
      {visibleTags.length > 0 && (
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

export function VeldnotitiesClient() {
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
  const [viewMode, setViewMode] = useState<'invoer' | 'kaart' | 'archief'>('invoer');
  const [dateFilter, setDateFilter] = useState<'week' | 'month' | 'season' | 'all'>('all');
  const [archiveCategory, setArchiveCategory] = useState<Tag | null>(null);
  const [showLocked, setShowLocked] = useState(false);

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

  const handleUpdateParcel = useCallback((note: FieldNote, parcelId: string | null) => {
    const parcel_ids = parcelId
      ? [...new Set([...(note.parcel_ids ?? []), parcelId])]
      : [];
    updateMutation.mutate({ id: note.id, updates: { parcel_ids } });
  }, [updateMutation]);

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

        {/* Search + filter bar */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoeken in notities..."
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-emerald-500/30 transition-colors"
              />
            </div>

            {/* Vergrendelde toggle */}
            <button
              onClick={() => setShowLocked(!showLocked)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap',
                showLocked
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-white/[0.03] border-white/[0.08] text-white/30 hover:text-white/50'
              )}
              title={showLocked ? 'Vergrendelde notities worden getoond' : 'Vergrendelde notities zijn verborgen'}
            >
              {showLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              <span className="hidden sm:inline">{showLocked ? 'Verborgen aan' : 'Verborgen'}</span>
            </button>

            {/* Perceel filter */}
            {parcels.length > 0 && (
              <select
                value={activeParcelId ?? ''}
                onChange={(e) => setActiveParcelId(e.target.value || null)}
                className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white/50 outline-none focus:border-emerald-500/30 transition-colors appearance-none cursor-pointer"
              >
                <option value="">Alle percelen</option>
                {parcels.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <FilterChips
            activeStatus={activeStatus}
            activeTags={activeTags}
            onStatusChange={setActiveStatus}
            onTagToggle={handleTagToggle}
            notes={notes ?? []}
          />
        </div>

        {/* Active observation filter chip */}
        {activeObservation && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30">Filter:</span>
            <button
              onClick={() => setActiveObservation(null)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 font-medium hover:bg-amber-500/20 transition-colors"
            >
              {activeObservation}
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Datum filter — only on kaart + archief tabs */}
        {(viewMode === 'kaart' || viewMode === 'archief') && (
          <div className="flex items-center gap-2">
            {(['all', 'week', 'month', 'season'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                  dateFilter === d
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04] border border-transparent'
                )}
              >
                {{ all: 'Alles', week: 'Deze week', month: 'Deze maand', season: 'Dit seizoen' }[d]}
              </button>
            ))}
          </div>
        )}

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
                      onDelete={() => handleDelete(note)}
                      onEdit={(content) => handleEdit(note, content)}
                      onUpdateParcel={(parcelId) => handleUpdateParcel(note, parcelId)}
                      onTransfer={() => setTransferNoteId(note.id)}
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
          return geoNotes.length > 0 ? (
            <>
              <FieldNotesMap
                notes={filteredNotes}
                onViewInList={(noteId) => {
                  setViewMode('invoer');
                  // Brief delay then scroll to note — the note should be visible in the list
                  setTimeout(() => {
                    document.getElementById(`note-${noteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 100);
                }}
              />
              <p className="text-[11px] text-white/15 text-center">
                {geoNotes.length} notitie{geoNotes.length !== 1 ? 's' : ''} met locatie
                {filteredNotes.length > geoNotes.length && (
                  <span> · {filteredNotes.length - geoNotes.length} zonder locatie (alleen in lijst)</span>
                )}
              </p>
            </>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16 text-center">
              <MapPin className="h-8 w-8 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">Geen notities met locatie</p>
              <p className="text-xs text-white/15 mt-1">Gebruik de 📍 knop bij het maken van een notitie</p>
            </div>
          );
        })()}

        {/* ── ARCHIEF TAB ── */}
        {viewMode === 'archief' && (
          <div className="space-y-6">
            {/* Category cards grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(Object.entries(TAG_CONFIG) as [Tag, typeof TAG_CONFIG[Tag]][]).map(([key, cfg]) => {
                const count = (notes ?? []).filter(n => n.auto_tag === key).length;
                const Icon = cfg.icon;
                const isActive = archiveCategory === key;
                return (
                  <button
                    key={key}
                    onClick={() => setArchiveCategory(isActive ? null : key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all',
                      isActive
                        ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                        : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.04]'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">{cfg.label}</span>
                    <span className={cn('text-lg font-bold', isActive ? cfg.text : 'text-white/60')}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Sub-tag filter chips (when a category is selected) */}
            {archiveCategory && (() => {
              const subTags = [...new Set(
                (notes ?? [])
                  .filter(n => n.auto_tag === archiveCategory && n.observation_subject)
                  .map(n => n.observation_subject!)
              )];
              return subTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setActiveObservation(null)}
                    className={cn(
                      'px-2 py-1 rounded-full text-[10px] font-medium border transition-colors',
                      !activeObservation
                        ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                        : 'border-white/[0.08] text-white/30 hover:bg-white/[0.04]'
                    )}
                  >
                    Alle
                  </button>
                  {subTags.map(st => (
                    <button
                      key={st}
                      onClick={() => setActiveObservation(activeObservation === st ? null : st)}
                      className={cn(
                        'px-2 py-1 rounded-full text-[10px] font-medium border transition-colors',
                        activeObservation === st
                          ? 'bg-amber-500/15 border-amber-500/25 text-amber-400'
                          : 'border-white/[0.08] text-white/30 hover:bg-white/[0.04]'
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}

            {/* Timeline grouped by month */}
            <div className="space-y-4">
              {(() => {
                // Group notes by month
                const grouped = new Map<string, FieldNote[]>();
                for (const note of filteredNotes) {
                  const d = new Date(note.created_at);
                  const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
                  const label = d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)!.push(note);
                }

                if (grouped.size === 0) {
                  return (
                    <div className="py-10 text-center">
                      <p className="text-sm text-white/30">Geen notities gevonden</p>
                      {archiveCategory && (
                        <p className="text-xs text-white/15 mt-1">Probeer een ander filter of categorie</p>
                      )}
                    </div>
                  );
                }

                return [...grouped.entries()]
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([key, monthNotes]) => {
                    const d = new Date(monthNotes[0].created_at);
                    const monthLabel = d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
                    return (
                      <div key={key}>
                        <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2 px-1">
                          {monthLabel}
                        </h3>
                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.04]">
                          {monthNotes.map(note => {
                            const tagCfg = note.auto_tag ? TAG_CONFIG[note.auto_tag as Tag] : null;
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
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
                              >
                                {note.photo_url && (
                                  <img
                                    src={note.photo_url}
                                    alt=""
                                    loading="lazy"
                                    className="flex-shrink-0 h-10 w-10 rounded-lg object-cover border border-white/[0.08]"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white/70 truncate">{note.content}</p>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    {tagCfg && (
                                      <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-md', tagCfg.bg, tagCfg.text)}>
                                        {tagCfg.label}
                                      </span>
                                    )}
                                    {note.observation_subject && (
                                      <span className="text-[9px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                                        {note.observation_subject}
                                      </span>
                                    )}
                                    {parcelName && (
                                      <span className="text-[9px] text-white/25">📍 {parcelName}</span>
                                    )}
                                    {note.source === 'whatsapp' && (
                                      <span className="text-[9px]" title="Via WhatsApp">💬</span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-[10px] text-white/20 flex-shrink-0 tabular-nums">
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
