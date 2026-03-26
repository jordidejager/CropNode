'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export interface FieldNote {
  id: string;
  user_id: string;
  content: string;
  status: 'open' | 'done' | 'transferred';
  auto_tag: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['field-notes'];

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

async function updateFieldNote(id: string, updates: Partial<Pick<FieldNote, 'content' | 'status' | 'is_pinned'>>): Promise<FieldNote> {
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

export function useFieldNotes() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchFieldNotes,
  });
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<FieldNote, 'content' | 'status' | 'is_pinned'>> }) =>
      updateFieldNote(id, updates),
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

export function useRestoreFieldNote() {
  const queryClient = useQueryClient();

  return useCallback((note: FieldNote) => {
    queryClient.setQueryData<FieldNote[]>(QUERY_KEY, (old) => {
      if (!old) return [note];
      // Re-insert in correct position (by created_at desc, pinned first)
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
