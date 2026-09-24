/**
 * Bedrijfsprofielen (public.companies). Client-side via de ingelogde Supabase-sessie;
 * RLS beperkt alles tot de eigen rijen. parcels.company_id NULL = standaardbedrijf.
 */

import { supabase } from '@/lib/supabase-client';
import type { Company } from '@/lib/types';

export type CompanyInput = Omit<Company, 'id' | 'userId' | 'isDefault' | 'createdAt'>;

const COLUMNS = 'id, user_id, name, address, postal_code, city, country, ggn, gln, grower_number, kvk, is_default, created_at';

function mapCompany(r: any): Company {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    address: r.address ?? '',
    postalCode: r.postal_code ?? '',
    city: r.city ?? '',
    country: r.country ?? 'NL',
    ggn: r.ggn ?? '',
    gln: r.gln ?? '',
    growerNumber: r.grower_number ?? '',
    kvk: r.kvk ?? '',
    isDefault: !!r.is_default,
    createdAt: r.created_at ?? null,
  };
}

function toRow(c: Partial<CompanyInput>) {
  const row: Record<string, string> = {};
  if (c.name !== undefined) row.name = c.name.trim();
  if (c.address !== undefined) row.address = c.address.trim();
  if (c.postalCode !== undefined) row.postal_code = c.postalCode.trim().toUpperCase();
  if (c.city !== undefined) row.city = c.city.trim();
  if (c.country !== undefined) row.country = c.country.trim() || 'NL';
  if (c.ggn !== undefined) row.ggn = c.ggn.replace(/\s+/g, '');
  if (c.gln !== undefined) row.gln = c.gln.replace(/\s+/g, '');
  if (c.growerNumber !== undefined) row.grower_number = c.growerNumber.trim();
  if (c.kvk !== undefined) row.kvk = c.kvk.replace(/\s+/g, '');
  return row;
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd.');
  return user.id;
}

/** Standaardbedrijf eerst, daarna op naam. Maakt een standaardbedrijf aan als er (nog) geen is. */
export async function getCompanies(): Promise<Company[]> {
  const userId = await currentUserId();
  const { data, error } = await (supabase as any)
    .from('companies')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw new Error(error.message);
  const companies = (data || []).map(mapCompany);
  if (companies.length > 0) return companies;

  const { data: created, error: insertError } = await (supabase as any)
    .from('companies')
    .insert({ user_id: userId, name: 'Mijn bedrijf', is_default: true })
    .select(COLUMNS)
    .single();
  if (insertError) throw new Error(insertError.message);
  return [mapCompany(created)];
}

export async function addCompany(input: CompanyInput): Promise<Company> {
  if (!input.name.trim()) throw new Error('Naam is verplicht.');
  const userId = await currentUserId();
  const { data, error } = await (supabase as any)
    .from('companies')
    .insert({ user_id: userId, is_default: false, ...toRow(input) })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return mapCompany(data);
}

export async function updateCompany(id: string, input: Partial<CompanyInput>): Promise<void> {
  if (input.name !== undefined && !input.name.trim()) throw new Error('Naam is verplicht.');
  const { error } = await (supabase as any).from('companies').update(toRow(input)).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Maakt `id` het standaardbedrijf. Percelen zonder expliciet bedrijf (company_id NULL) horen bij
 * het standaardbedrijf; die worden eerst vastgezet op het oude standaardbedrijf zodat ze niet
 * ongemerkt van bedrijf wisselen.
 */
export async function setDefaultCompany(id: string): Promise<void> {
  const userId = await currentUserId();
  const { data: current } = await (supabase as any)
    .from('companies')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (current?.id === id) return;

  if (current?.id) {
    const { error: pinError } = await (supabase as any)
      .from('parcels')
      .update({ company_id: current.id })
      .eq('user_id', userId)
      .is('company_id', null);
    if (pinError) throw new Error(pinError.message);

    const { error: unsetError } = await (supabase as any).from('companies').update({ is_default: false }).eq('id', current.id);
    if (unsetError) throw new Error(unsetError.message);
  }
  const { error } = await (supabase as any).from('companies').update({ is_default: true }).eq('id', id);
  if (error) throw new Error(error.message);

  // Percelen die expliciet op het nieuwe standaardbedrijf stonden: terug naar NULL (= standaard).
  await (supabase as any).from('parcels').update({ company_id: null }).eq('user_id', userId).eq('company_id', id);
}

/** Aantal hoofdpercelen dat (expliciet) aan dit bedrijf hangt. */
export async function countParcelsForCompany(company: Company): Promise<number> {
  let q = (supabase as any).from('parcels').select('id', { count: 'exact', head: true }).eq('user_id', company.userId);
  q = company.isDefault ? q.or(`company_id.is.null,company_id.eq.${company.id}`) : q.eq('company_id', company.id);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Verwijdert een (niet-standaard) bedrijf. Hangen er percelen aan, dan alleen met
 * moveParcelsToDefault=true: die percelen gaan dan naar het standaardbedrijf.
 */
export async function deleteCompany(company: Company, moveParcelsToDefault = false): Promise<void> {
  if (company.isDefault) throw new Error('Het standaardbedrijf kan niet verwijderd worden. Maak eerst een ander bedrijf standaard.');
  const n = await countParcelsForCompany(company);
  if (n > 0 && !moveParcelsToDefault) throw new Error(`Er hangen nog ${n} percelen aan ${company.name}.`);
  if (n > 0) {
    const { error: moveError } = await (supabase as any).from('parcels').update({ company_id: null }).eq('company_id', company.id);
    if (moveError) throw new Error(moveError.message);
  }
  const { error } = await (supabase as any).from('companies').delete().eq('id', company.id);
  if (error) throw new Error(error.message);
}

/** Zet hoofdpercelen op een bedrijf. Het standaardbedrijf wordt opgeslagen als NULL. */
export async function setParcelsCompany(parcelIds: string[], company: Company): Promise<void> {
  if (parcelIds.length === 0) return;
  const { error } = await (supabase as any)
    .from('parcels')
    .update({ company_id: company.isDefault ? null : company.id })
    .in('id', parcelIds);
  if (error) throw new Error(error.message);
}
