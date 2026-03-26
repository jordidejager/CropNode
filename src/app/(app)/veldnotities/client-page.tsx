'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { StickyNote, Search, Pin, Trash2, Check, ChevronDown, ChevronUp, NotebookPen, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFieldNotes, useCreateFieldNote, useUpdateFieldNote, useDeleteFieldNote, type FieldNote } from '@/hooks/use-field-notes';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================================================
// RELATIVE TIME FORMATTING (Dutch)
// ============================================================================

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

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

function QuickAddInput({ onSubmit, compact = false }: { onSubmit: (content: string) => void; compact?: boolean }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = compact ? 40 : 120; // compact = 1 line, full = ~4 lines
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  }, [compact]);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) return;
    onSubmit(trimmed);
    setValue('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    // Refocus
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [value, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className={cn(
      "relative group",
      compact ? "" : "sticky top-0 z-10"
    )}>
      <div className={cn(
        "rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300",
        "focus-within:border-emerald-500/30 focus-within:bg-white/[0.04]",
        "focus-within:shadow-[0_0_20px_rgba(16,185,129,0.08)]",
        compact ? "p-3" : "p-4 md:p-5"
      )}>
        {!compact && (
          <div className="flex items-center gap-2 mb-3">
            <NotebookPen className="h-4 w-4 text-emerald-500/60" />
            <span className="text-xs font-semibold text-white/40">Nieuwe notitie</span>
          </div>
        )}

        <div className="relative">
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
              "w-full bg-transparent text-white/90 placeholder:text-white/20 resize-none outline-none",
              compact ? "text-sm pr-10" : "text-sm md:text-base pr-12"
            )}
          />
          {/* Mobile send button */}
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className={cn(
              "absolute right-0 bottom-0 flex items-center justify-center rounded-xl transition-all duration-200",
              "text-emerald-400/40 hover:text-emerald-400 hover:bg-emerald-500/10",
              "disabled:opacity-20 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-emerald-400/40",
              compact ? "h-8 w-8" : "h-9 w-9 md:h-8 md:w-8"
            )}
            aria-label="Opslaan"
          >
            <Send className={cn(compact ? "h-4 w-4" : "h-4 w-4 md:h-3.5 md:w-3.5")} />
          </button>
        </div>

        {!compact && (
          <p className="text-[10px] text-white/15 mt-2 hidden md:block">
            Enter om op te slaan · Shift+Enter voor nieuwe regel
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// NOTE CARD
// ============================================================================

function NoteCard({ note, onToggleStatus, onTogglePin, onDelete, onEdit }: {
  note: FieldNote;
  onToggleStatus: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onEdit: (content: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(note.content);
  const [isExpanded, setIsExpanded] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isDone = note.status === 'done';
  const isLong = note.content.length > 200;

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
      // Auto resize
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      setEditValue(note.content);
      setIsEditing(false);
    }
  }, [handleSaveEdit, note.content]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
      className={cn(
        "group flex gap-3 px-4 py-3.5 md:px-5 transition-all duration-200",
        "hover:bg-white/[0.02] border-b border-white/[0.04] last:border-b-0",
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggleStatus}
        className={cn(
          "mt-0.5 flex-shrink-0 h-5 w-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center",
          isDone
            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
            : "border-white/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
        )}
        aria-label={isDone ? 'Markeer als open' : 'Markeer als afgerond'}
      >
        {isDone && <Check className="h-3 w-3" />}
      </button>

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
          <div
            onClick={() => {
              setEditValue(note.content);
              setIsEditing(true);
            }}
            className="cursor-text"
          >
            <p className={cn(
              "text-sm whitespace-pre-wrap break-words transition-all duration-200",
              isDone ? "text-white/30 line-through" : "text-white/75",
              isLong && !isExpanded ? "line-clamp-3" : ""
            )}>
              {note.content}
            </p>
            {isLong && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="text-xs text-emerald-400/60 hover:text-emerald-400 mt-1 flex items-center gap-1"
              >
                {isExpanded ? (
                  <>Minder tonen <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>Meer lezen <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </div>
        )}

        <span className={cn(
          "text-[11px] mt-1.5 block tabular-nums",
          isDone ? "text-white/15" : "text-white/25"
        )}>
          {formatRelativeTime(note.created_at)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-start gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={onTogglePin}
          className={cn(
            "h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200",
            note.is_pinned
              ? "text-emerald-400 hover:bg-emerald-500/10"
              : "text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10"
          )}
          aria-label={note.is_pinned ? 'Losmaken' : 'Vastzetten'}
        >
          <Pin className={cn("h-3.5 w-3.5", note.is_pinned ? "fill-current" : "")} />
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

type FilterType = 'all' | 'open' | 'done' | 'pinned';

function FilterChips({ active, onChange }: { active: FilterType; onChange: (f: FilterType) => void }) {
  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Alles' },
    { key: 'open', label: 'Open' },
    { key: 'done', label: 'Afgerond' },
    { key: 'pinned', label: 'Gepind' },
  ];

  return (
    <div className="flex gap-1.5">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
            active === f.key
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
              : "text-white/30 hover:text-white/50 border border-transparent hover:border-white/10"
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// EMPTY STATE
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

// ============================================================================
// LOADING SKELETON
// ============================================================================

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
  const createMutation = useCreateFieldNote();
  const updateMutation = useUpdateFieldNote();
  const deleteMutation = useDeleteFieldNote();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const handleCreate = useCallback((content: string) => {
    createMutation.mutate(content, {
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

  const handleDelete = useCallback((note: FieldNote) => {
    deleteMutation.mutate(note.id, {
      onSuccess: () => {
        toast({
          title: 'Notitie verwijderd',
          duration: 3000,
        });
      },
      onError: (err) => {
        toast({ title: 'Fout', description: err.message, variant: 'destructive' });
      },
    });
  }, [deleteMutation, toast]);

  const handleEdit = useCallback((note: FieldNote, content: string) => {
    updateMutation.mutate({ id: note.id, updates: { content } });
  }, [updateMutation]);

  // Client-side filtering
  const filteredNotes = useMemo(() => {
    if (!notes) return [];

    let result = notes;

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((n) => n.content.toLowerCase().includes(q));
    }

    // Filter by type
    switch (activeFilter) {
      case 'open':
        result = result.filter((n) => n.status === 'open');
        break;
      case 'done':
        result = result.filter((n) => n.status === 'done');
        break;
      case 'pinned':
        result = result.filter((n) => n.is_pinned);
        break;
    }

    return result;
  }, [notes, searchQuery, activeFilter]);

  return (
    <div className="max-w-3xl mx-auto pb-12 relative">
      {/* Ambient background */}
      <div className="absolute top-[-60px] left-[-40px] w-[400px] h-[400px] bg-emerald-500/[0.02] rounded-full blur-[100px] pointer-events-none" />

      <div className="relative space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <StickyNote className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white/90">Veldnotities</h1>
            <p className="text-xs text-white/30">Snelle notities vanuit het veld</p>
          </div>
        </div>

        {/* Quick add */}
        <QuickAddInput onSubmit={handleCreate} />

        {/* Search & filter bar */}
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
          <FilterChips active={activeFilter} onChange={setActiveFilter} />
        </div>

        {/* Notes list */}
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
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Note count */}
        {notes && notes.length > 0 && (
          <p className="text-[11px] text-white/15 text-center">
            {filteredNotes.length} van {notes.length} notities
          </p>
        )}
      </div>
    </div>
  );
}
