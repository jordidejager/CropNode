/**
 * Perceelkaart — database-kant (server, admin-client + expliciete userId). Alleen lezen.
 * Haalt perceel, rijen (zelfde features als de rijen-export), RD-ligging (perceelkaart_geometrie, migratie 096)
 * en de rijinstellingen op en bouwt daarmee de perceelkaart (perceelkaart.ts).
 */

import { parseGeometrie } from './geo';
import { bouwPerceelkaart, type Perceelkaart, type PerceelkaartInvoer } from './perceelkaart';
import { db, dbFout, getal, rijenGeoJSON } from './store';
import type { LngLat, XY } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbRij = Record<string, any>;

/** null = perceel niet gevonden (of niet van deze gebruiker) */
export async function laadPerceelkaart(userId: string, perceelId: string): Promise<Perceelkaart | null> {
  if (!userId || !perceelId) throw new Error('Perceel ontbreekt.');
  const { data: perceel, error } = await db()
    .from('parcels')
    .select('id, name, area, geometry, source, rvo_id')
    .eq('id', perceelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw dbFout(error, 'Perceel ophalen');
  if (!perceel) return null;
  const p = perceel as DbRij;

  const [fc, geo, inst, actief, gerooid] = await Promise.all([
    rijenGeoJSON(userId, perceelId, false),
    db().rpc('perceelkaart_geometrie', { p_user_id: userId, p_perceel_id: perceelId }),
    db().from('perceel_rijinstellingen').select('*').eq('perceel_id', perceelId).eq('user_id', userId).maybeSingle(),
    db().from('rijen').select('id', { count: 'exact', head: true }).eq('perceel_id', perceelId).eq('user_id', userId).eq('status', 'actief'),
    db().from('rijen').select('id', { count: 'exact', head: true }).eq('perceel_id', perceelId).eq('user_id', userId).eq('status', 'gerooid'),
  ]);
  if (geo.error) throw dbFout(geo.error, 'Perceelkaart (RD) ophalen');
  if (inst.error) throw dbFout(inst.error, 'Rijinstellingen ophalen');
  if (actief.error) throw dbFout(actief.error, 'Rijen tellen');
  if (gerooid.error) throw dbFout(gerooid.error, 'Rijen tellen');

  const g = (typeof geo.data === 'string' ? JSON.parse(geo.data) : geo.data) as DbRij | null;
  const rdPerId = new Map<string, { rd: XY[]; buiten: number | null }>(
    (Array.isArray(g?.rijen) ? g.rijen : []).map((r: DbRij) => [
      String(r.id),
      { rd: (r.rd as number[][]).map(c => [Number(c[0]), Number(c[1])] as XY), buiten: getal(r.buiten_grens_m) },
    ]),
  );

  const rijen: PerceelkaartInvoer['rijen'] = [];
  for (const f of fc?.features ?? []) {
    const rd = rdPerId.get(String(f.id));
    const coords = (f.geometry as { coordinates?: unknown } | null)?.coordinates;
    if (!rd || rd.rd.length < 2 || !Array.isArray(coords) || coords.length < 2) continue;
    rijen.push({
      feature: {
        type: 'Feature',
        id: f.id,
        geometry: { type: 'LineString', coordinates: coords as LngLat[] },
        properties: (f.properties ?? {}) as Record<string, unknown>,
      },
      rd: rd.rd,
      buitenGrensM: rd.buiten,
    });
  }

  const geometrie = parseGeometrie(p.geometry);
  const i = inst.data as DbRij | null;
  return bouwPerceelkaart({
    exportTijd: new Date().toISOString(),
    perceel: {
      id: String(p.id),
      naam: String(p.name ?? ''),
      geometrie,
      rd: g?.perceel?.rd ?? null,
      oppervlakM2: getal(g?.perceel?.oppervlak_m2),
      oppervlakHaGeregistreerd: getal(p.area),
      grensBron: p.source ?? null,
      brpId: p.rvo_id ?? null,
    },
    instellingen: i
      ? {
          rijrichtingGraden: getal(i.rijrichting_graden),
          rijafstandM: getal(i.rijafstand_m),
          boomafstandM: getal(i.boomafstand_m),
          kopakkerBeginM: getal(i.kopakker_begin_m),
          kopakkerEindM: getal(i.kopakker_eind_m),
          beginkantGraden: getal(i.beginkant_graden),
          bronBeeld: i.bron_beeld ?? null,
          detectieMethode: i.detectie_methode ?? null,
          laatstGegenereerdOp: i.laatst_gegenereerd_op ?? null,
        }
      : null,
    rijen,
    aantalActiefInCropnode: actief.count ?? 0,
    aantalGerooid: gerooid.count ?? 0,
  });
}
