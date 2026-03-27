'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

export interface SubParcelInfo {
  id: string;
  name: string;
  crop: string;
  variety: string;
}

export interface FieldNote {
  id: string;
  user_id: string;
  content: string;
  status: 'open' | 'done' | 'transferred';
  auto_tag: 'bespuiting' | 'bemesting' | 'taak' | 'waarneming' | 'overig' | null;
  is_pinned: boolean;
  parcel_id: string | null;
  source: 'web' | 'whatsapp' | 'voice';
  created_at: string;
  updated_at: string;
  // Joined from sub_parcels via API
  sub_parcel?: SubParcelInfo | null;
}

const QUERY_KEY = ['field-notes'];

// How often to refetch when there are notes with null auto_tag (classification pending)
const PENDING_POLL_INTERVAL_MS = 4000;

async function fetchFieldNotes(): Promise<FieldNote[]> {
  const res = await fetch('/api/field-notes');
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Fout bij ophalen notities');
  return json.data;
}

async function createFieldNote(content: string): Promise<FieldNote> {
  const res = await fetch('/api/field-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Fout bij opslaan notitie');
  return json.data;
}

async function updateFieldNote(
  id: string,
  updates: Partial<Pick<FieldNote, 'content' | 'status' | 'is_pinned' | 'parcel_id'>>
): Promise<FieldNote> {
  const res = await fetch(`/api/field-notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Fout bij bijwerken notitie');
  return json.data;
}

async function deleteFieldNote(id: string): Promise<void> {
  const res = await fetch(`/api/field-notes/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Fout bij verwijderen notitie');
}

/**
 * Main hook for field notes.
 * Automatically polls when there are notes with pending auto_tag (null).
 */
export function useFieldNotes() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchFieldNotes,
    // No refetchInterval by default — managed below
    refetchInterval: false,
  });

  // Poll if any notes are awaiting classification
  useEffect(() => {
    const notes = query.data;
    if (!notes) return;

    // Check for newly created notes (temp IDs or notes with null auto_tag created <30s ago)
    const hasPending = notes.some(
      (n) =>
        n.auto_tag === null &&
        n.status === 'open' &&
        Date.now() - new Date(n.created_at).getTime() < 30_000
    );

    if (!hasPending) return;

    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }, PENDING_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [query.data, queryClient]);

  return query;
}

export function useCreateFieldNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createFieldNote,
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FieldNote[]>(QUERY_KEY);

      const optimistic: FieldNote = {
        id: `temp-${Date.now()}`,
        user_id: '',
        content,
        status: 'open',
        auto_tag: null,
        is_pinned: false,
        parcel_id: null,
        source: 'web',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sub_parcel: null,
      };

      queryClient.setQueryData<FieldNote[]>(QUERY_KEY, (old) =>
        [optimistic, ...(old ?? [])]
      );

      return { previous };
    },
    onError: (_err, _content, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUpdateFieldNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: {
      id: string;
      updates: Partial<Pick<FieldNote, 'content' | 'status' | 'is_pinned' | 'parcel_id'>>;
    }) => updateFieldNote(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FieldNote[]>(QUERY_KEY);

      queryClient.setQueryData<FieldNote[]>(QUERY_KEY, (old) =>
        (old ?? []).map((note) =>
          note.id === id ? { ...note, ...updates } : note
        )
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteFieldNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFieldNote,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FieldNote[]>(QUERY_KEY);

      queryClient.setQueryData<FieldNote[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((note) => note.id !== id)
      );

      return { previous, deletedNote: previous?.find(n => n.id === id) };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Restore a note to cache (for undo after delete) */
export function useRestoreFieldNote() {
  const queryClient = useQueryClient();

  return useCallback((note: FieldNote) => {
    queryClient.setQueryData<FieldNote[]>(QUERY_KEY, (old) => {
      if (!old) return [note];
      const withNote = [...old, note].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return withNote;
    });
    // Re-create on server
    createFieldNote(note.content).then(() => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    });
  }, [queryClient]);
}
