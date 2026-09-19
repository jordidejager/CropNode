'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { confirmRegistration, mirrorRegistrationToFieldNotes } from '@/lib/registration-service';
import { addParcelHistoryEntries } from '@/lib/supabase-store';
import { invalidateContextCache } from '@/lib/registration-pipeline';
import { processSprayDraft } from '@/lib/whatsapp/spray-inbox';
import type { LogbookEntry, ProductEntry, RegistrationType } from '@/lib/types';

export interface SprayDraftEdit {
  date: Date | string;
  plots: string[];
  products: ProductEntry[];
  registrationType: RegistrationType;
}

type ActionResult = { success: boolean; message?: string };

const DRAFT_COLUMNS = 'id, raw_input, status, date, created_at, parsed_data, registration_type, validation_message, source, wa_message_id, review_meta';

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) return user.id;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
  throw new Error('Niet ingelogd.');
}

function mapRow(row: any): LogbookEntry {
  return {
    id: row.id,
    rawInput: row.raw_input,
    status: row.status,
    date: new Date(row.date),
    createdAt: new Date(row.created_at),
    parsedData: row.parsed_data || undefined,
    registrationType: row.registration_type || undefined,
    validationMessage: row.validation_message || undefined,
    source: row.source || 'web',
    waMessageId: row.wa_message_id || undefined,
    reviewMeta: row.review_meta || {},
  };
}

export async function getSprayInboxEntries(): Promise<LogbookEntry[]> {
  const userId = await requireUserId();
  const { data, error } = await getSupabaseAdmin()
    .from('logbook')
    .select(DRAFT_COLUMNS)
    .eq('user_id', userId)
    .eq('source', 'whatsapp_spray')
    .neq('status', 'Akkoord')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data || []).map(mapRow);
}

export async function getSprayInboxCount(): Promise<number> {
  const userId = await requireUserId();
  const { count, error } = await getSupabaseAdmin()
    .from('logbook')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'whatsapp_spray')
    .neq('status', 'Akkoord');
  if (error) return 0;
  return count ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOwnedDraft(id: string, userId: string): Promise<any | null> {
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('logbook')
    .select(DRAFT_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .eq('source', 'whatsapp_spray')
    .single();
  if (error || !data) return null;
  return data;
}

function toDate(d: Date | string): Date {
  const parsed = d instanceof Date ? d : new Date(d);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function cleanProducts(products: ProductEntry[]): ProductEntry[] {
  return products
    .filter(p => p.product && p.product.trim())
    .map(p => ({
      product: p.product.trim(),
      dosage: Number(p.dosage) || 0,
      unit: p.unit || 'L',
      ...(p.source ? { source: p.source } : {}),
      ...(p.targetReason ? { targetReason: p.targetReason } : {}),
      ...(p.doelorganisme ? { doelorganisme: p.doelorganisme } : {}),
      ...(p.totalAmount != null ? { totalAmount: p.totalAmount } : {}),
    }));
}

export async function saveSprayDraft(id: string, edit: SprayDraftEdit): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const row = await getOwnedDraft(id, userId);
    if (!row) return { success: false, message: 'Concept niet gevonden.' };

    const { error } = await getSupabaseAdmin()
      .from('logbook')
      .update({
        date: toDate(edit.date).toISOString(),
        parsed_data: { ...(row.parsed_data || {}), plots: edit.plots, products: cleanProducts(edit.products) },
        registration_type: edit.registrationType,
        status: row.status === 'Fout' ? 'Te Controleren' : row.status,
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return { success: false, message: error.message };
    revalidatePath('/gewasbescherming/inbox');
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Onbekende fout.' };
  }
}

export async function approveSprayDraft(id: string, edit: SprayDraftEdit): Promise<ActionResult & { spuitschriftId?: string }> {
  try {
    const userId = await requireUserId();
    const row = await getOwnedDraft(id, userId);
    if (!row) return { success: false, message: 'Concept niet gevonden.' };

    const products = cleanProducts(edit.products);
    if (edit.plots.length === 0) return { success: false, message: 'Selecteer minimaal één perceel.' };
    if (products.length === 0) return { success: false, message: 'Voeg minimaal één middel toe.' };
    if (products.some(p => !p.dosage || p.dosage <= 0)) return { success: false, message: 'Elke dosering moet groter dan 0 zijn.' };

    const date = toDate(edit.date);
    const result = await confirmRegistration(
      {
        userId,
        plots: edit.plots,
        products,
        date,
        rawInput: row.raw_input,
        validationMessage: null,
        registrationType: edit.registrationType,
        registrationSource: 'whatsapp',
      },
      async ({ logbookEntry, sprayableParcels, isConfirmation, spuitschriftId }) => {
        await addParcelHistoryEntries({ logbookEntry, sprayableParcels, isConfirmation, spuitschriftId, providedUserId: userId });
      }
    );

    if (!result.success) return { success: false, message: result.message };

    await mirrorRegistrationToFieldNotes({
      userId,
      rawInput: row.raw_input,
      registrationType: edit.registrationType,
      spuitschriftId: result.spuitschriftId,
    });

    await learnProductCorrections(userId, row, products);

    const admin = getSupabaseAdmin();
    await admin
      .from('logbook')
      .update({
        status: 'Akkoord',
        date: date.toISOString(),
        parsed_data: { ...(row.parsed_data || {}), plots: edit.plots, products },
        registration_type: edit.registrationType,
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (result.spuitschriftId) {
      await admin.from('spuitschrift').update({ original_logbook_id: id }).eq('id', result.spuitschriftId).eq('user_id', userId);
    }

    invalidateContextCache(userId);
    revalidatePath('/gewasbescherming');
    revalidatePath('/gewasbescherming/inbox');
    return { success: true, spuitschriftId: result.spuitschriftId };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Onbekende fout.' };
  }
}

/**
 * When the grower corrects a parsed product name (or picks one for an unresolved
 * product), remember it as a per-user alias so the next note resolves automatically.
 */
async function learnProductCorrections(userId: string, row: any, finalProducts: ProductEntry[]): Promise<void> {
  const parsed: ProductEntry[] = row.parsed_data?.products || [];
  const assumptions: Array<{ field: string; productIndex?: number; from: string; to: string }> = row.review_meta?.assumptions || [];
  const rawInput: string = (row.raw_input || '').toLowerCase();

  const learned: Array<{ alias: string; preferred: string }> = [];

  parsed.forEach((orig, i) => {
    const chosen = finalProducts[i];
    if (!chosen || !chosen.product) return;

    // What did the grower literally type for this product? Prefer the pre-enrichment name.
    const assumption = assumptions.find(a => a.field === 'product' && a.productIndex === i);
    const typed = (assumption?.from || orig.product || '').trim();
    if (!typed) return;

    const changedByUser = chosen.product.toLowerCase() !== (orig.product || '').toLowerCase();
    const wasUnresolved = orig.resolved === false;
    const typedAppearsInNote = rawInput.includes(typed.toLowerCase());

    if ((changedByUser || wasUnresolved) && typedAppearsInNote && typed.toLowerCase() !== chosen.product.toLowerCase()) {
      learned.push({ alias: `middel_${typed.toLowerCase()}`, preferred: chosen.product });
    }
  });

  if (learned.length === 0) return;

  const admin = getSupabaseAdmin();
  for (const { alias, preferred } of learned) {
    const docId = `${alias.replace(/\s+/g, '-')}-${userId.slice(0, 8)}`;
    const { error } = await admin
      .from('user_preferences')
      .upsert({ id: docId, user_id: userId, alias, preferred });
    if (error) console.warn('[approveSprayDraft] Could not save preference:', error.message);
  }
}

export async function deleteSprayDraft(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { error } = await getSupabaseAdmin()
      .from('logbook')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('source', 'whatsapp_spray');
    if (error) return { success: false, message: error.message };
    revalidatePath('/gewasbescherming/inbox');
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Onbekende fout.' };
  }
}

export async function reprocessSprayDraft(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const row = await getOwnedDraft(id, userId);
    if (!row) return { success: false, message: 'Concept niet gevonden.' };
    await processSprayDraft(id, { silent: true });
    revalidatePath('/gewasbescherming/inbox');
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Onbekende fout.' };
  }
}
