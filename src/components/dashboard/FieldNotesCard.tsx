'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StickyNote, ArrowRight, Check, Inbox } from 'lucide-react';
import { useFieldNotes, useCreateFieldNote, type FieldNote } from '@/hooks/use-field-notes';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function formatCompactTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((todayStart.getTime() - dateStart.getTime()) / 86400000);

  const time = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) return time;
  if (diffDays === 1) return 'gisteren';
  if (diffDays < 7) {
    return date.toLocaleDateString('nl-NL', { weekday: 'short' });
  }
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function QuickAddCompact({ onSubmit }: { onSubmit: (content: string) => void }) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.currentTarget;
      const value = input.value.trim();
      if (value && value.length <= 2000) {
        onSubmit(value);
        input.value = '';
      }
    }
  }, [onSubmit]);

  return (
    <input
      type="text"
      placeholder="Snelle notitie..."
      onKeyDown={handleKeyDown}
      maxLength={2000}
      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-emerald-500/30 focus:shadow-[0_0_12px_rgba(16,185,129,0.06)] transition-all"
    />
  );
}

const TAG_COMPACT: Record<string, { bg: string; text: string; label: string }> = {
  bespuiting: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Bespuiting' },
  bemesting:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Bemesting' },
  taak:       { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Taak' },
  waarneming: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Waarneming' },
  overig:     { bg: 'bg-zinc-500/15', text: 'text-zinc-400', label: 'Overig' },
};

function CompactNoteRow({ note }: { note: FieldNote }) {
  const router = useRouter();
  const isDone = note.status === 'done';
  const tag = note.auto_tag ? TAG_COMPACT[note.auto_tag] : null;

  return (
    <button
      onClick={() => router.push('/veldnotities')}
      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-all text-left"
    >
      <div className={cn(
        "flex-shrink-0 h-4 w-4 rounded border-[1.5px] flex items-center justify-center mt-0.5",
        isDone
          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
          : "border-white/20"
      )}>
        {isDone && <Check className="h-2.5 w-2.5" />}
      </div>
      {note.photo_url && (
        <img
          src={note.photo_url}
          alt=""
          loading="lazy"
          className="flex-shrink-0 h-10 w-10 rounded-lg object-cover border border-white/[0.08]"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm truncate",
          isDone ? "text-white/25 line-through" : "text-white/60"
        )}>
          {note.content}
        </p>
        {(tag || (note.sub_parcels && note.sub_parcels.length > 0)) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {tag && (
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                tag.bg, tag.text
              )}>
                {tag.label}
              </span>
            )}
            {note.sub_parcels?.[0] && (
              <span className="text-[10px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded-md">
                {note.sub_parcels[0].parcel_name || note.sub_parcels[0].name}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="text-[11px] text-white/20 flex-shrink-0 tabular-nums mt-0.5">
        {formatCompactTime(note.created_at)}
      </span>
    </button>
  );
}

export function FieldNotesCard() {
  const { data: notes, isLoading } = useFieldNotes();
  const createMutation = useCreateFieldNote();
  const { toast } = useToast();

  const handleCreate = useCallback((content: string) => {
    createMutation.mutate({ content }, {
      onError: (err) => {
        toast({ title: 'Fout', description: err.message, variant: 'destructive' });
      },
    });
  }, [createMutation, toast]);

  const recentNotes = (notes ?? []).slice(0, 3);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest flex items-center gap-2">
          <StickyNote className="h-3.5 w-3.5" />
          Veldnotities
        </h2>
        <Link
          href="/veldnotities"
          className="text-xs text-white/25 hover:text-emerald-400 transition-colors flex items-center gap-1.5 group"
        >
          Alles
          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="dashboard-card dashboard-shimmer rounded-2xl overflow-hidden">
        {/* Quick add */}
        <div className="p-3 border-b border-white/[0.04]">
          <QuickAddCompact onSubmit={handleCreate} />
        </div>

        {/* Recent notes */}
        {isLoading ? (
          <div className="divide-y divide-white/[0.04]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="h-4 w-4 rounded flex-shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        ) : recentNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <Inbox className="h-6 w-6 text-white/15 mb-2" />
            <p className="text-xs text-white/25">Nog geen notities</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {recentNotes.map((note) => (
              <CompactNoteRow key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
