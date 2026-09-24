'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { processSprayDraft } from '@/lib/whatsapp/spray-inbox';
import {
  approveSprayDraftForUser,
  deleteSprayDraftForUser,
  getOwnedDraft,
  getSprayInboxCountForUser,
  getSprayInboxEntriesForUser,
  saveSprayDraftForUser,
  type DraftActionResult,
  type SprayDraftEdit,
} from '@/lib/spray-inbox-approve';
import type { LogbookEntry } from '@/lib/types';

export type { SprayDraftEdit } from '@/lib/spray-inbox-approve';

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) return user.id;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
  throw new Error('Niet ingelogd.');
}

function failed(error: unknown): DraftActionResult {
  return { success: false, message: error instanceof Error ? error.message : 'Onbekende fout.' };
}

export async function getSprayInboxEntries(): Promise<LogbookEntry[]> {
  return getSprayInboxEntriesForUser(await requireUserId());
}

export async function getSprayInboxCount(): Promise<number> {
  return getSprayInboxCountForUser(await requireUserId());
}

export async function saveSprayDraft(id: string, edit: SprayDraftEdit): Promise<DraftActionResult> {
  try {
    const result = await saveSprayDraftForUser(await requireUserId(), id, edit);
    if (result.success) revalidatePath('/gewasbescherming/inbox');
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function approveSprayDraft(id: string, edit: SprayDraftEdit): Promise<DraftActionResult & { spuitschriftId?: string }> {
  try {
    const result = await approveSprayDraftForUser(await requireUserId(), id, edit, 'whatsapp');
    if (result.success) {
      revalidatePath('/gewasbescherming');
      revalidatePath('/gewasbescherming/inbox');
    }
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function deleteSprayDraft(id: string): Promise<DraftActionResult> {
  try {
    const result = await deleteSprayDraftForUser(await requireUserId(), id);
    if (result.success) revalidatePath('/gewasbescherming/inbox');
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function reprocessSprayDraft(id: string): Promise<DraftActionResult> {
  try {
    const userId = await requireUserId();
    const row = await getOwnedDraft(id, userId);
    if (!row) return { success: false, message: 'Concept niet gevonden.' };
    await processSprayDraft(id, { silent: true });
    revalidatePath('/gewasbescherming/inbox');
    return { success: true };
  } catch (error) {
    return failed(error);
  }
}
