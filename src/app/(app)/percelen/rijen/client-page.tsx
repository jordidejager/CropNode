'use client';

/**
 * Rijenkaart (beta) — overzicht van alle hoofdpercelen met hun rijen.
 */

import Link from 'next/link';
import { AlertTriangle, ChevronRight, MapPinOff, Rows3 } from 'lucide-react';
import { SectionHeader, SpotlightCard } from '@/components/ui/premium';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/data-states';
import { rijenFoutmelding, useRijenOverzicht } from '@/hooks/use-rijen';
import type { RijenSamenvatting } from '@/lib/rijen/types';
import { cn } from '@/lib/utils';
import { fmt, fmtDatum, fmtHa } from '@/components/rijenkaart/rijen-hulp';
import { useVersBijOpenen } from '@/components/rijenkaart/use-vers-bij-openen';

export function RijenOverzichtClient() {
  const query = useRijenOverzicht();
  const { data, isError, error, refetch } = query;
  // Na rijen genereren/verwijderen op een detailpagina is het overzicht ongeldig gemaakt terwijl het
  // niet open stond; met refetchOnMount: false zou het anders oude tellingen tonen.
  useVersBijOpenen(query);

  const percelen = data ?? [];
  const metRijen = percelen.filter(p => p.aantalActief > 0);
  const totaalRijen = metRijen.reduce((s, p) => s + p.aantalActief, 0);

  return (
    <div className="space-y-6 pb-8">
      <SectionHeader
        eyebrow="Beta"
        title="Rijenkaart"
        description="Elke boomrij als eigen object op de luchtfoto: rijen detecteren of intekenen, nummeren, blokken en bestuivers vastleggen, en bespuitingen en notities op rijniveau registreren."
        aurora={false}
      />

      {data === undefined && isError ? (
        <ErrorState
          title="Rijenoverzicht laden mislukt"
          message={rijenFoutmelding(error)}
          onRetry={() => void refetch()}
        />
      ) : data === undefined ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : percelen.length === 0 ? (
        <EmptyState
          icon={Rows3}
          title="Nog geen percelen"
          description="Voeg eerst percelen toe (met perceelgrens) onder Percelen; daarna kun je hier de rijen intekenen."
        />
      ) : (
        <>
          <p className="text-sm text-white/50">
            {metRijen.length} van {percelen.length} percelen met rijen · {fmt(totaalRijen, 0)} rijen
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {percelen.map(p => (
              <PerceelKaart key={p.perceelId} perceel={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function methodeTekst(p: RijenSamenvatting): string | null {
  if (!p.detectieMethode) return null;
  if (p.detectieMethode === 'auto') {
    return p.detectieConfidence !== null
      ? `Luchtfoto · ${Math.round(p.detectieConfidence * 100)}% zeker`
      : 'Luchtfoto';
  }
  return 'Handmatig (referentierij)';
}

function PerceelKaart({ perceel: p }: { perceel: RijenSamenvatting }) {
  const heeftRijen = p.aantalActief > 0;
  const methode = methodeTekst(p);

  const inhoud = (
    <SpotlightCard
      color="emerald"
      padding="p-4"
      disableOrb
      interactive={p.heeftGeometrie}
      className={cn(!p.heeftGeometrie && 'opacity-50')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">{p.perceelNaam || 'Naamloos perceel'}</h3>
          <p className="text-[12px] text-white/45">RVO {fmtHa(p.oppervlakHa)}</p>
        </div>
        {p.heeftGeometrie && <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-white/30" aria-hidden="true" />}
      </div>

      {!p.heeftGeometrie ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-white/50">
          <MapPinOff className="h-4 w-4" aria-hidden="true" /> geen perceelgrens
        </p>
      ) : heeftRijen ? (
        <div className="mt-3 space-y-1">
          <p className="text-[13px] text-white/85">
            {p.aantalActief} rijen · {p.aantalBlokken} {p.aantalBlokken === 1 ? 'blok' : 'blokken'} · rij-opp {fmtHa(p.rijOppervlakHa)}
          </p>
          {(methode || p.laatstGegenereerdOp) && (
            <p className="text-[12px] text-white/45">
              {[methode, p.laatstGegenereerdOp ? fmtDatum(p.laatstGegenereerdOp) : null].filter(Boolean).join(' · ')}
            </p>
          )}
          {p.aantalControleren > 0 && (
            <p className="flex items-center gap-1.5 text-[12px] text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {p.aantalControleren} {p.aantalControleren === 1 ? 'rij' : 'rijen'} controleren
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-white/50">Nog geen rijen</p>
      )}
    </SpotlightCard>
  );

  if (!p.heeftGeometrie) {
    return (
      <div aria-disabled="true" title="Dit perceel heeft geen perceelgrens">
        {inhoud}
      </div>
    );
  }
  return (
    <Link
      href={`/percelen/rijen/${encodeURIComponent(p.perceelId)}`}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
    >
      {inhoud}
    </Link>
  );
}
