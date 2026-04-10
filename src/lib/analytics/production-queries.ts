'use client';

import { createClient } from '@/lib/supabase/client';

export interface ProductionSummaryRow {
  id: string;
  user_id: string;
  harvest_year: number;
  parcel_id: string | null;
  sub_parcel_id: string | null;
  variety: string;
  total_kg: number;
  total_crates: number | null;
  weight_per_crate: number;
  hectares: number | null;
  notes: string | null;
  source: string;
  created_at: string;
}

export interface ProductionSummaryInput {
  harvest_year: number;
  parcel_id?: string | null;
  sub_parcel_id?: string | null;
  variety: string;
  total_kg: number;
  total_crates?: number | null;
  weight_per_crate?: number;
  hectares?: number | null;
  notes?: string | null;
}

export async function fetchProductionSummaries(): Promise<ProductionSummaryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('production_summaries')
    .select('*')
    .order('harvest_year', { ascending: false });

  if (error) {
    console.error('Error fetching production summaries:', error);
    return [];
  }
  return data || [];
}

export async function fetchMultiYearHarvests(years: number[]): Promise<any[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('harvest_registrations')
    .select('id, parcel_id, sub_parcel_id, variety, harvest_date, total_crates, quality_class, weight_per_crate, harvest_year')
    .in('harvest_year', years)
    .order('harvest_year', { ascending: true });

  if (error) {
    console.error('Error fetching multi-year harvests:', error);
    return [];
  }
  return data || [];
}

export async function upsertProductionSummary(input: ProductionSummaryInput): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Niet ingelogd' };

  const row = {
    user_id: user.id,
    harvest_year: input.harvest_year,
    parcel_id: input.parcel_id || null,
    sub_parcel_id: input.sub_parcel_id || null,
    variety: input.variety,
    total_kg: input.total_kg,
    total_crates: input.total_crates || null,
    weight_per_crate: input.weight_per_crate || 18,
    hectares: input.hectares || null,
    notes: input.notes || null,
    source: 'manual',
    updated_at: new Date().toISOString(),
  };

  // Check if a matching record already exists (the unique index uses COALESCE,
  // which the Supabase client can't use in onConflict)
  let query = supabase
    .from('production_summaries')
    .select('id')
    .eq('user_id', user.id)
    .eq('harvest_year', input.harvest_year)
    .eq('variety', input.variety);

  if (input.sub_parcel_id) {
    query = query.eq('sub_parcel_id', input.sub_parcel_id);
  } else {
    query = query.is('sub_parcel_id', null);
  }

  const { data: existing } = await query.maybeSingle();

  let error;
  if (existing) {
    // Update existing record
    ({ error } = await supabase
      .from('production_summaries')
      .update(row)
      .eq('id', existing.id));
  } else {
    // Insert new record
    ({ error } = await supabase
      .from('production_summaries')
      .insert(row));
  }

  if (error) {
    console.error('Error upserting production summary:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function deleteProductionSummary(id: string): Promise<{ success: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.from('production_summaries').delete().eq('id', id);
  if (error) {
    console.error('Error deleting production summary:', error);
    return { success: false };
  }
  return { success: true };
}
