'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const tiers = [
  {
    name: 'Gratis',
    price: '0',
    description: 'Probeer CropNode zonder verplichtingen',
    features: [
      '2 AI-registraties per dag',
      'Perceelbeheer met kaart',
      'CTGB productzoeker',
      'Weer dashboard',
    ],
    cta: 'Gratis starten',
    highlighted: false,
  },
  {
    name: 'Basis',
    price: '10',
    description: 'Voor de actieve teler',
    features: [
      '8 AI-registraties per dag',
      'Alles van Gratis',
      'Urenregistratie & timer',
      'Voorraadbeheer',
      'Spuitschrift export',
    ],
    cta: 'Start met Basis',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '25',
    description: 'Voor het complete bedrijf',
    features: [
      'Onbeperkt AI-registraties',
      'Alles van Basis',
      'Weather Hub (5 modellen)',
      'Harvest Hub & koelcel',
      'Research Hub & encyclopedie',
      'Perceelhistorie & analytics',
      'Prioriteit support',
    ],
    cta: 'Start met Pro',
    highlighted: true,
  },
];

function PricingCard({
  tier,
  index,
}: {
  tier: (typeof tiers)[0];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={`relative rounded-2xl overflow-hidden ${
        tier.highlighted
          ? 'bg-gradient-to-b from-emerald-950/40 to-slate-900/50 border-2 border-emerald-500/25'
          : 'bg-slate-900/40 border border-white/[0.06]'
      }`}
    >
      {/* Top accent */}
      {tier.highlighted && (
        <div className="h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
      )}

      <div className="p-6 sm:p-8">
        {/* Recommended badge */}
        {tier.highlighted && (
          <div className="flex justify-center mb-4">
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold tracking-wide">
              Aanbevolen
            </span>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <h3 className="font-display text-xl text-white mb-1">{tier.name}</h3>
          <p className="text-slate-500 text-sm">{tier.description}</p>
        </div>

        {/* Price */}
        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-slate-500 text-lg">&euro;</span>
            <span className="font-display text-5xl text-white">{tier.price}</span>
            <span className="text-slate-500">/maand</span>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-3 mb-8">
          {tier.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-3">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  tier.highlighted
                    ? 'bg-emerald-500/15'
                    : 'bg-slate-800/80'
                }`}
              >
                <Check
                  className={`w-3 h-3 ${
                    tier.highlighted ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
              </div>
              <span className="text-slate-300 text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Button
          asChild
          className={`w-full h-11 ${
            tier.highlighted
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-100 border border-white/[0.06]'
          }`}
        >
          <Link href="/login">{tier.cta}</Link>
        </Button>
      </div>
    </motion.div>
  );
}

export function Pricing() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="pricing" className="relative py-24 sm:py-32 px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/[0.04] to-transparent" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 sm:mb-16"
        >
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.4 }}
            className="inline-block text-emerald-400 text-sm font-medium tracking-widest uppercase mb-4"
          >
            Pricing
          </motion.span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white mb-4">
            Eerlijke, transparante prijzen
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Geen creditcard nodig. Geen proefperiode. Gratis is echt gratis.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
          {tiers.map((tier, index) => (
            <PricingCard key={tier.name} tier={tier} index={index} />
          ))}
        </div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-center text-slate-500 text-sm mt-8"
        >
          Alle prijzen zijn exclusief BTW. Op elk moment opzegbaar.
        </motion.p>
      </div>
    </section>
  );
}
