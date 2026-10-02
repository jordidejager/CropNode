/**
 * Afgeleide records van een spuitschrift-registratie: parcel_history (per blok × middel)
 * en inventory_movements (verbruik per middel). Rekent met het GESPOTEN oppervlak:
 * spuitschrift.plot_areas[blok] als dat er is, anders het volledige blok.
 * Server-side (admin-client + expliciete user_id) — werkt zonder cookie-sessie.
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import type { ProductEntry, RegistrationType } from '@/lib/types';

export type PlotAreas = Record<string, number>;

/** Alleen geldige, gedeeltelijke oppervlaktes van blokken die in de registratie zitten. */
export function cleanPlotAreas(plotAreas: PlotAreas | null | undefined, plots: string[], fullAreas: Map<string, number | null>): PlotAreas {
  const out: PlotAreas = {};
  for (const id of plots) {
    const v = Number(plotAreas?.[id]);
    if (!isFinite(v) || v <= 0) continue;
    const full = fullAreas.get(id) ?? null;
    if (full != null && v >= full - 1e-9) continue; // volledig gespoten → niet opslaan
    out[id] = Math.round(v * 10000) / 10000;
  }
  return out;
}

export function sprayedArea(plotId: string, fullArea: number | null | undefined, plotAreas?: PlotAreas | null): number {
  const v = plotAreas?.[plotId];
  if (typeof v === 'number' && isFinite(v) && v > 0) return v;
  return Number(fullArea) || 0;
}

export async function rebuildSprayDerivedRecords(params: {
  userId: string;
  spuitschriftId: string;
  logId?: string | null;
  plots: string[];
  products: ProductEntry[];
  date: Date | string;
  registrationType?: RegistrationType;
  plotAreas?: PlotAreas | null;
}): Promise<void> {
  const admin = getSupabaseAdmin() as any;
  const dateIso = new Date(params.date).toISOString();
  const d = new Date(params.date);
  const harvestYear = d.getMonth() + 1 >= 11 ? d.getFullYear() + 1 : d.getFullYear();

  await admin.from('parcel_history').delete().eq('spuitschrift_id', params.spuitschriftId);
  await admin.from('inventory_movements').delete().eq('reference_id', params.spuitschriftId);

  if (params.plots.length === 0 || params.products.length === 0) return;

  const { data: parcels } = await admin
    .from('v_sprayable_parcels')
    .select('id, name, area, crop, variety')
    .eq('user_id', params.userId)
    .in('id', params.plots);
  const byId = new Map<string, any>((parcels || []).map((p: any) => [p.id, p]));

  const history: any[] = [];
  const usage = new Map<string, { total: number; unit: string; parcels: Set<string>; partial: boolean }>();

  for (const plotId of params.plots) {
    const p = byId.get(plotId);
    if (!p) continue;
    const area = sprayedArea(plotId, p.area, params.plotAreas);
    const partial = params.plotAreas?.[plotId] != null;
    for (const prod of params.products) {
      history.push({
        id: crypto.randomUUID(),
        user_id: params.userId,
        log_id: params.logId || params.spuitschriftId,
        spuitschrift_id: params.spuitschriftId,
        parcel_id: p.id,
        parcel_name: p.name,
        crop: p.crop,
        variety: p.variety,
        product: prod.product,
        dosage: prod.dosage,
        unit: prod.unit,
        date: dateIso,
        registration_type: params.registrationType || 'spraying',
        sprayed_area: partial ? area : null,
        harvest_year: harvestYear,
      });
      const u = usage.get(prod.product) || { total: 0, unit: prod.unit, parcels: new Set<string>(), partial: false };
      u.total += (Number(prod.dosage) || 0) * area;
      u.parcels.add(plotId);
      u.partial = u.partial || partial;
      usage.set(prod.product, u);
    }
  }

  if (history.length) {
    const { error } = await admin.from('parcel_history').insert(history);
    if (error) throw new Error(`parcel_history: ${error.message}`);
  }

  const movements = [...usage.entries()]
    .filter(([, u]) => u.total > 0)
    .map(([product, u]) => ({
      id: crypto.randomUUID(),
      user_id: params.userId,
      product_name: product,
      quantity: -Math.round(u.total * 1000) / 1000,
      unit: (u.unit || '').replace('/ha', ''),
      type: 'usage',
      date: dateIso,
      description: `Gebruikt op ${u.parcels.size} perce${u.parcels.size > 1 ? 'len' : 'el'}${u.partial ? ' (deels gespoten)' : ''}`,
      reference_id: params.spuitschriftId,
    }));
  if (movements.length) {
    const { error } = await admin.from('inventory_movements').insert(movements);
    if (error) throw new Error(`inventory_movements: ${error.message}`);
  }
}
