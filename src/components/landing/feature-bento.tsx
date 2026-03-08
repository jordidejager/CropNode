'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  MessageSquareText,
  MapPin,
  Shield,
  Cloud,
  Apple,
  BookOpen,
  Users,
  Package,
  Microscope,
  ArrowUpRight,
} from 'lucide-react';

const features = [
  {
    id: 'smart-input',
    icon: MessageSquareText,
    title: 'Slimme Invoer',
    description:
      'Typ een spuitregistratie in natuurlijke taal. AI herkent percelen, producten en doseringen — en valideert direct tegen CTGB.',
    size: 'large',
    visual: (
      <div className="mt-4 space-y-2.5">
        <div className="rounded-lg bg-slate-800/40 border border-white/[0.06] p-3 flex items-center gap-2">
          <span className="text-slate-400 text-sm">
            &quot;Merpan spuitkorrel 0,71 kg elstar&quot;
          </span>
          <span className="flex-shrink-0 w-1.5 h-5 bg-emerald-400 rounded-full animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400/80 text-xs font-medium">
            Merpan Spuitkorrel, 0,71 kg/ha, Elstar — CTGB Goedgekeurd
          </span>
        </div>
      </div>
    ),
  },
  {
    id: 'weather',
    icon: Cloud,
    title: 'Weer & Spuitvenster',
    description:
      '5-model ensemble vergelijking met spuitvenster-advies, Delta-T, bladnat-uren en GDD tracking.',
    size: 'large',
    visual: (
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {[
          { h: '52%', label: '8°', time: '06:00' },
          { h: '72%', label: '12°', time: '09:00' },
          { h: '88%', label: '16°', time: '12:00' },
          { h: '64%', label: '14°', time: '15:00' },
        ].map((bar, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-full h-16 bg-slate-800/40 rounded-md relative overflow-hidden">
              <motion.div
                initial={{ height: 0 }}
                whileInView={{ height: bar.h }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-500/40 to-emerald-400/20 rounded-md"
              />
            </div>
            <span className="text-slate-400 text-[10px]">{bar.label}</span>
            <span className="text-slate-600 text-[10px]">{bar.time}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'parcels',
    icon: MapPin,
    title: 'Perceelbeheer',
    description:
      'Percelen op de kaart met blokindeling, ras, onderstam, plantjaar en RVO-import.',
    size: 'medium',
    visual: (
      <div className="mt-4 relative h-24 rounded-lg bg-slate-800/30 border border-white/[0.04] overflow-hidden">
        <svg viewBox="0 0 200 80" className="w-full h-full opacity-50">
          <path
            d="M10,70 L30,20 L70,35 L110,15 L150,30 L180,25 L190,55 L170,70 Z"
            fill="rgba(52,211,153,0.15)"
            stroke="rgba(52,211,153,0.4)"
            strokeWidth="1.5"
          />
          <path
            d="M40,60 L60,45 L90,50 L85,65 Z"
            fill="rgba(52,211,153,0.25)"
            stroke="rgba(52,211,153,0.5)"
            strokeWidth="1"
          />
        </svg>
        <div className="absolute bottom-2 left-2 flex gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-medium">
            Elstar
          </span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-medium">
            Conference
          </span>
        </div>
      </div>
    ),
  },
  {
    id: 'ctgb',
    icon: Shield,
    title: 'CTGB Database',
    description:
      '1.000+ gewasbeschermingsmiddelen met dosering, veiligheidstermijnen en resistentiegroepen.',
    size: 'medium',
    visual: (
      <div className="mt-4 space-y-1.5">
        {['Merpan Spuitkorrel', 'Delan Pro', 'Coragen'].map((name, i) => (
          <div
            key={name}
            className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-slate-800/30 border border-white/[0.04]"
          >
            <span className="text-slate-400 text-xs">{name}</span>
            <span className="text-emerald-400 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10">
              Toegelaten
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'crop-protection',
    icon: Microscope,
    title: 'Gewasbescherming',
    description:
      'Spuitschrift, logboek en 6-staps CTGB validatie. Compliant bij elke controle.',
    size: 'small',
  },
  {
    id: 'harvest',
    icon: Apple,
    title: 'Oogst & Opslag',
    description: 'Plukregistratie, koelcel-visualisatie en kwaliteitsclassificatie.',
    size: 'small',
  },
  {
    id: 'research',
    icon: BookOpen,
    title: 'Research Hub',
    description: '20+ ziekten & plagen encyclopedie met lifecycle, symptomen en bestrijding.',
    size: 'small',
  },
  {
    id: 'team',
    icon: Users,
    title: 'Uren & Teams',
    description: 'Live timer, urenregistratie per taak, per perceel, per persoon met kostenberekening.',
    size: 'small',
  },
  {
    id: 'inventory',
    icon: Package,
    title: 'Voorraad',
    description: 'Automatische voorraadverwerking bij bevestigde registraties met alerting.',
    size: 'small',
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[number];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  const isLarge = feature.size === 'large';
  const isMedium = feature.size === 'medium';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className={`group relative ${
        isLarge
          ? 'md:col-span-2 lg:col-span-2'
          : isMedium
          ? 'md:col-span-2 lg:col-span-1'
          : ''
      }`}
    >
      <div className="relative h-full rounded-2xl bg-slate-900/40 border border-white/[0.06] p-5 sm:p-6 overflow-hidden transition-all duration-500 hover:border-emerald-500/20 hover:bg-slate-900/60">
        {/* Hover gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Corner accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/[0.03] rounded-full blur-2xl translate-x-16 -translate-y-16 group-hover:bg-emerald-500/[0.06] transition-colors duration-500" />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center group-hover:bg-emerald-500/15 group-hover:border-emerald-500/25 transition-all duration-300">
                <feature.icon className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-100 group-hover:text-white transition-colors">
                {feature.title}
              </h3>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>

          {/* Description */}
          <p className="text-sm text-slate-400 leading-relaxed">
            {feature.description}
          </p>

          {/* Visual */}
          {feature.visual && (
            <div className="relative">{feature.visual}</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function FeatureBento() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="features" className="relative py-24 sm:py-32 px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/[0.07] to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.4 }}
            className="inline-block text-emerald-400 text-sm font-medium tracking-widest uppercase mb-4"
          >
            Platform
          </motion.span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white mb-4">
            Alles wat je nodig hebt.{' '}
            <span className="text-slate-400">Niets dat je niet nodig hebt.</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            9 geïntegreerde modules die naadloos samenwerken — van het veld tot het kantoor.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
