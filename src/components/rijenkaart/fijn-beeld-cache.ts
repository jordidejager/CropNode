/**
 * Rijenkaart (beta) — gedeeld scherp beeld (voorjaar 10 cm + zomer 25 cm) van het open perceel.
 *
 * Het voorstel (uiteinden uit de foto) en de verfijning na opslaan gebruiken hetzelfde beeld; zo wordt het maar
 * één keer opgehaald. Eén perceel tegelijk: een beeld van een paar ha is al tientallen MB. Of het beeld de rijen
 * dekt, controleert verfijnVoorPerceel zelf (anders haalt die een nieuw op).
 */

import type { FijnBeeld } from '@/lib/rijen/pdok';

let huidig: { perceelId: string; beeld: FijnBeeld; zomer: FijnBeeld | null } | null = null;

/** Beeld van dit perceel, of { beeld: null, zomer: undefined } (= ophalen) */
export function leesFijnBeeld(perceelId: string): { beeld: FijnBeeld | null; zomer: FijnBeeld | null | undefined } {
  return huidig?.perceelId === perceelId ? { beeld: huidig.beeld, zomer: huidig.zomer } : { beeld: null, zomer: undefined };
}

export function bewaarFijnBeeld(perceelId: string, beeld: FijnBeeld, zomer: FijnBeeld | null): void {
  huidig = { perceelId, beeld, zomer };
}
