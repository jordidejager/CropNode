'use client';

/**
 * Rijenkaart (beta) — react-query hooks rond src/app/rijen-actions.ts.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRijenkaartAction,
  getRijenOverzichtAction,
  rijenVoorBespuitingenAction,
  rijenVoorNotitiesAction,
} from '@/app/rijen-actions';

// ============================================
// Query keys
// ============================================

function sleutelVanIds(ids: readonly string[]): string {
  return Array.from(new Set(ids.filter(Boolean))).sort().join(',');
}

export const rijenQueryKeys = {
  alles: ['rijen'] as const,
  overzicht: ['rijen', 'overzicht'] as const,
  kaart: (perceelId: string) => ['rijen', 'kaart', perceelId] as const,
  bespuitingen: (spuitschriftIds: readonly string[]) => ['rijen', 'bespuitingen', sleutelVanIds(spuitschriftIds)] as const,
  notities: (veldnotitieIds: readonly string[]) => ['rijen', 'notities', sleutelVanIds(veldnotitieIds)] as const,
};

// ============================================
// Foutmeldingen
// ============================================

/** Moet gelijk blijven aan FOUT_PREFIX in src/app/rijen-actions.ts */
const RIJEN_FOUT_PREFIX = 'rijenkaart:';

/**
 * Nederlandse foutmelding uit een fout van een rijen-action. In productie vervangt
 * React de message door een algemene tekst; de echte melding staat dan in `digest`.
 */
export function rijenFoutmelding(fout: unknown, standaard = 'Er ging iets mis. Probeer het opnieuw.'): string {
  if (fout && typeof fout === 'object') {
    const digest = (fout as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith(RIJEN_FOUT_PREFIX)) {
      return digest.slice(RIJEN_FOUT_PREFIX.length) || standaard;
    }
    const message = (fout as { message?: unknown }).message;
    if (typeof message === 'string' && message && !message.includes('omitted in production')) return message;
  }
  return standaard;
}

/**
 * Inhoudelijke fouten van de rijen-actions (perceel niet gevonden, rij zonder subperceel, …)
 * veranderen niet door opnieuw te proberen; alleen netwerkfouten e.d. nog 2× proberen.
 */
function opnieuwProberen(aantalKeer: number, fout: unknown): boolean {
  const digest = fout && typeof fout === 'object' ? (fout as { digest?: unknown }).digest : undefined;
  if (typeof digest === 'string' && digest.startsWith(RIJEN_FOUT_PREFIX)) return false;
  return aantalKeer < 2;
}

// ============================================
// Queries
// ============================================

/** Alles voor de perceelpagina "Rijen" (perceel, instellingen, blokken, rijen, status, notities, bespuitingen). */
export function useRijenkaart(perceelId: string | null | undefined) {
  return useQuery({
    queryKey: rijenQueryKeys.kaart(perceelId ?? ''),
    queryFn: () => getRijenkaartAction(perceelId as string),
    enabled: !!perceelId,
    staleTime: 30 * 1000,
    retry: opnieuwProberen,
  });
}

/** Alle hoofdpercelen met rijtellingen. */
export function useRijenOverzicht() {
  return useQuery({
    queryKey: rijenQueryKeys.overzicht,
    queryFn: () => getRijenOverzichtAction(),
    staleTime: 60 * 1000,
    retry: opnieuwProberen,
  });
}

/** Gekoppelde rijen per bespuiting-id (alleen bespuitingen met rijen staan in het resultaat). */
export function useRijenVoorBespuitingen(spuitschriftIds: readonly string[]) {
  const sleutel = sleutelVanIds(spuitschriftIds);
  const ids = useMemo(() => (sleutel ? sleutel.split(',') : []), [sleutel]);
  return useQuery({
    queryKey: rijenQueryKeys.bespuitingen(ids),
    queryFn: () => rijenVoorBespuitingenAction(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 1000,
    retry: opnieuwProberen,
  });
}

/** Gekoppelde rijen per veldnotitie-id (alleen notities met rijen staan in het resultaat). */
export function useRijenVoorNotities(veldnotitieIds: readonly string[]) {
  const sleutel = sleutelVanIds(veldnotitieIds);
  const ids = useMemo(() => (sleutel ? sleutel.split(',') : []), [sleutel]);
  return useQuery({
    queryKey: rijenQueryKeys.notities(ids),
    queryFn: () => rijenVoorNotitiesAction(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 1000,
    retry: opnieuwProberen,
  });
}

// ============================================
// Invalidatie
// ============================================

export function useInvalidateRijen() {
  const queryClient = useQueryClient();
  const invalideerKaart = useCallback(
    (perceelId: string) => queryClient.invalidateQueries({ queryKey: rijenQueryKeys.kaart(perceelId) }),
    [queryClient],
  );
  const invalideerOverzicht = useCallback(
    () => queryClient.invalidateQueries({ queryKey: rijenQueryKeys.overzicht }),
    [queryClient],
  );
  const invalideerAlles = useCallback(
    () => queryClient.invalidateQueries({ queryKey: rijenQueryKeys.alles }),
    [queryClient],
  );
  return useMemo(
    () => ({ invalideerKaart, invalideerOverzicht, invalideerAlles }),
    [invalideerKaart, invalideerOverzicht, invalideerAlles],
  );
}
