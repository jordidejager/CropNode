'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export interface SubParcelInfo {
  id: string;
  name: string;        // display name (from v_sprayable_parcels: e.g. "Yese Red Prince (Jonagold)")
  parcel_name: string; // parent location name (e.g. "Yese", "Jachthoek")
  crop: string;
  variety: string | null;
}

export interface FieldNote {
  id: string;
  user_id: string;
  content: string;
  status: 'open' | 'done' | 'transferred';
  auto_tag: 'bespuiting' | 'bemesting' | 'taak' | 'waarneming' | 'overig' | null;
  is_pinned: boolean;
  parcel_ids: string[];
  observation_subject: string | null;
  observation_category: 'insect' | 'schimmel' | 'ziekte' | 'fysiologisch' | 'overig' | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  source: 'web' | 'whatsapp' | 'voice';
  created_at: string;
  updated_at: string;
  // Resolved parcel info (joined by API)
  sub_parcels?: SubParcelInfo[];
}

const QUERY_KEY = ['field-notes'];

async function fetchFieldNotes(): Promise<FieldNote[]> {
  const res = await fetch('/api/field-notes');
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Fout bij ophalen notities');
  return json.data;
}

interface CreateFieldNoteInput {
  content: string;
  photo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

async function createFieldNote(input: CreateFieldNoteInput): Promise<FieldNote> {
  return fetchWithRetry('/api/field-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 'Fout bij opslaan notitie');
}

/** Retry once on network errors (handles HMR/Turbopack restarts) */
async function fetchWithRetry(url: string, init: RequestInit, fallbackError: string, attempt = 0): Promise<any> {
  try {
    const res = await fetch(url, init);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || fallbackError);
    return json.data;
  } catch (err) {
    if (attempt < 1 && err instanceof TypeError && String(err.message).includes('fetch')) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(url, init, fallbackError, attempt + 1);
    }
    throw err;
  }
}

async function updateFieldNote(
  id: string,
  updates: Partial<Pick<FieldNote, 'content' | 'status' | 'is_pinned' | 'parcel_ids'>>
): Promise<FieldNote> {
  return fetchWithRetry(`/api/field-notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }, 'Fout bij bijwerken notitie');
}

async function deleteFieldNote(id: string): Promise<void> {
  await fetchWithRetry(`/api/field-notes/${id}`, { method: 'DELETE' }, 'Fout bij verwijderen notitie');
}

/**
 * Main hook for field notes.
 * Classification now happens synchronously in the POST route,
 * so the tag is already set when the mutation resolves.
 */
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FieldNote[]>(QUERY_KEY);

      const optimistic: FieldNote = {
        id: `temp-${Date.now()}`,
        user_id: '',
        content: input.content,
        status: 'open',
        auto_tag: null,
        is_pinned: false,
        parcel_ids: [],
        observation_subject: null,
        observation_category: null,
        photo_url: input.photo_url ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        source: 'web',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sub_parcels: [],
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
    onSuccess: (data) => {
      // Trigger AI classification from the client — non-blocking.
      // Includes photo URL for Gemini Vision analysis if available.
      fetch('/api/field-notes/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId: data.id,
          content: data.content,
          ...(data.photo_url ? { photoUrl: data.photo_url } : {}),
        }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      }).catch(() => {
        // Classify failed silently — note is saved, just without tag
      });
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
      updates: Partial<Pick<FieldNote, 'content' | 'status' | 'is_pinned' | 'parcel_ids'>>;
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
    createFieldNote({ content: note.content }).then(() => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    });
  }, [queryClient]);
}
