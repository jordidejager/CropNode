'use client';

/**
 * Rijenkaart (beta) — "Rij toevoegen" op basis van de selectie (gedeeld door het Rijen-paneel en
 * de selectiebalk): twee naast elkaar gelegen rijen → ertussen, één buitenste rij → ernaast.
 */

import { useCallback, useMemo, useState } from 'react';
import { rijenToepassenAction } from '@/app/rijen-actions';
import { useRijenkaartCtx } from './rijenkaart-context';
import { rijToevoegenVoorstel, volgendNummer, type RijToevoegenVoorstel } from './rijen-hulp';

export function useRijToevoegen(): {
  voorstel: RijToevoegenVoorstel | null;
  bezig: boolean;
  voegToe: () => Promise<void>;
} {
  const ctx = useRijenkaartCtx();
  const { rijen, actieveRijen, geselecteerd, perceelRD, richting, perceelId } = ctx;
  const [bezig, setBezig] = useState(false);

  const voorstel = useMemo(() => {
    if (!perceelRD || richting === null || geselecteerd.size === 0) return null;
    const selectie = actieveRijen.filter(r => geselecteerd.has(r.id));
    if (selectie.length === 0) return null;
    try {
      return rijToevoegenVoorstel(selectie, actieveRijen, perceelRD, richting);
    } catch {
      return null;
    }
  }, [geselecteerd, actieveRijen, perceelRD, richting]);

  const { meld, meldFout, verversen, zetSelectie } = ctx;
  const voegToe = useCallback(async () => {
    if (!voorstel) return;
    if (!voorstel.ok) {
      meld('Rij toevoegen', voorstel.reden);
      return;
    }
    const nummer = volgendNummer(rijen);
    setBezig(true);
    try {
      const r = await rijenToepassenAction(perceelId, {
        rijen: [
          {
            sleutel: 'toegevoegd',
            nummer,
            coordinates: voorstel.coordinates,
            geomBron: 'getekend',
            ...(voorstel.blokId ? { blokId: voorstel.blokId } : {}),
          },
        ],
      });
      meld(`Rij ${nummer} toegevoegd`, voorstel.omschrijving);
      await verversen();
      const nieuw = r.ingevoegd[0]?.id;
      if (nieuw) zetSelectie([nieuw]);
    } catch (e) {
      meldFout(e, 'Rij toevoegen mislukt');
    } finally {
      setBezig(false);
    }
  }, [voorstel, rijen, perceelId, meld, meldFout, verversen, zetSelectie]);

  return { voorstel, bezig, voegToe };
}
