'use client';

import Link from 'next/link';
import { Bug, Sprout, ChevronRight, Apple, Droplets, AlertCircle, Wind } from 'lucide-react';

interface DiseaseCard {
  slug: string;
  name: string;
  scientific: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string; // tailwind color family
  bgClass: string;
  borderClass: string;
  description: string;
  status: 'active' | 'coming-soon';
  availableForCrops: string[];
}

const DISEASES: DiseaseCard[] = [
  {
    slug: 'appelschurft',
    name: 'Appelschurft',
    scientific: 'Venturia inaequalis',
    icon: Apple,
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/20 hover:border-emerald-500/40',
    description:
      'Dynamisch infectierisicomodel op basis van temperatuur, bladnatheid en ascospore-dynamiek. RIMpro-niveau simulatie.',
    status: 'active',
    availableForCrops: ['Appel'],
  },
  {
    slug: 'perenschurft',
    name: 'Perenschurft',
    scientific: 'Venturia pirina',
    icon: Sprout,
    colorClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    borderClass: 'border-cyan-500/20 hover:border-cyan-500/40',
    description:
      'RIMpro-niveau dynamisch model (Spotts-Cervantes 1991, Villalta 2000). Zelfde simulatie-engine als appelschurft met pear-specifieke parameters: meer natheid vereist bij warm weer, ascosporen ook overdag én deels \'s nachts.',
    status: 'active',
    availableForCrops: ['Peer'],
  },
  {
    slug: 'bacterievuur',
    name: 'Bacterievuur',
    scientific: 'Erwinia amylovora',
    icon: AlertCircle,
    colorClass: 'text-slate-500',
    bgClass: 'bg-slate-500/5',
    borderClass: 'border-white/5',
    description:
      'Bloeiperiode-gebaseerd model voor bacterievuur-risico. Komt binnenkort.',
    status: 'coming-soon',
    availableForCrops: ['Appel', 'Peer'],
  },
  {
    slug: 'zwartvruchtrot',
    name: 'Zwartvruchtrot',
    scientific: 'Botryosphaeria obtusa',
    icon: Droplets,
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/20 hover:border-amber-500/40',
    description:
      'Dynamisch infectiemodel met seizoens-modulator (Arauz-Sutton 1989/1990). Actief van bloei tot oogst. Piek mei-juli. Onderbroken natperiodes ≥1u stoppen infectie.',
    status: 'active',
    availableForCrops: ['Appel'],
  },
  {
    slug: 'meeldauw',
    name: 'Meeldauw',
    scientific: 'Podosphaera leucotricha',
    icon: Wind,
    colorClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    borderClass: 'border-purple-500/20 hover:border-purple-500/40',
    description:
      'Droog-warm infectiemodel (Xu 1999). Optimaal 19-22°C en RH>70%. Let op: water doodt sporen juist. Strenge winters reduceren inoculum.',
    status: 'active',
    availableForCrops: ['Appel'],
  },
];

export default function ZiektedrukOverviewPage() {
  const active = DISEASES.filter((d) => d.status === 'active');
  const comingSoon = DISEASES.filter((d) => d.status === 'coming-soon');

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-500/5 to-transparent p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10">
            <Bug className="size-6 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-white">Ziektedruk</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Dynamische infectierisicomodellen op basis van weerdata en
              wetenschappelijk gevalideerde ziektemodellen. Selecteer een
              ziekte om het actuele risico per perceel te bekijken.
            </p>
          </div>
        </div>
      </div>

      {/* Active models */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Beschikbare modellen
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {active.map((disease) => (
            <Link
              key={disease.slug}
              href={`/ziektedruk/${disease.slug}`}
              className={`group rounded-xl border bg-white/[0.02] p-5 transition-all ${disease.borderClass}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex size-12 items-center justify-center rounded-xl ${disease.bgClass} shrink-0`}
                >
                  <disease.icon className={`size-6 ${disease.colorClass}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {disease.name}
                      </h3>
                      <p className="text-xs text-slate-500 italic">
                        {disease.scientific}
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0 mt-1" />
                  </div>
                  <p className="text-sm text-slate-400 mt-2">
                    {disease.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {disease.availableForCrops.map((crop) => (
                      <span
                        key={crop}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-slate-400"
                      >
                        {crop}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Coming soon */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Binnenkort beschikbaar
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {comingSoon.map((disease) => (
            <div
              key={disease.slug}
              className={`rounded-xl border bg-white/[0.01] p-5 ${disease.borderClass} opacity-60`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex size-10 items-center justify-center rounded-lg ${disease.bgClass} shrink-0`}
                >
                  <disease.icon className={`size-5 ${disease.colorClass}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-300">
                    {disease.name}
                  </h3>
                  <p className="text-[11px] text-slate-600 italic">
                    {disease.scientific}
                  </p>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                    {disease.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-xs text-amber-400/80">
          De ziektemodellen zijn experimentele indicatoren gebaseerd op
          gepubliceerde wetenschappelijke modellen en weerdata. Gebruik ze
          als aanvulling op, niet als vervanging van, het advies van je
          gewasbeschermingsadviseur.
        </p>
      </div>
    </div>
  );
}
