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
    description: 'Probeer CropNode',
    features: [
      '2 slimme invoeren per dag',
      'Perceelbeheer',
      'CTGB productzoeker',
    ],
    cta: 'Gratis starten',
    highlighted: false,
  },
  {
    name: 'Basis',
    price: '10',
    description: 'Voor de actieve teler',
    features: [
      '8 slimme invoeren per dag',
      'Alles van Gratis',
      'WhatsApp integratie',
      'Urenregistratie',
    ],
    cta: 'Start met Basis',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '25',
    description: 'Voor het complete bedrijf',
    features: [
      'Onbeperkt slimme invoeren',
      'Alles van Basis',
      'Perceelhistorie & analytics',
      'Research Hub',
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
      className={`relative rounded-2xl p-6 sm:p-8 ${
        tier.highlighted
          ? 'bg-gradient-to-b from-emerald-950/50 to-slate-900/50 border-2 border-emerald-500/30'
          : 'bg-slate-900/50 border border-white/5'
      }`}
    >
      {/* Recommended badge */}
      {tier.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-medium">
            Aanbevolen
          </span>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-6">
        <h3 className="font-display text-xl text-slate-100 mb-1">{tier.name}</h3>
        <p className="text-slate-500 text-sm">{tier.description}</p>
      </div>

      {/* Price */}
      <div className="text-center mb-6">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-slate-500 text-lg">€</span>
          <span className="font-display text-5xl text-slate-100">{tier.price}</span>
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
                  ? 'bg-emerald-600/20'
                  : 'bg-slate-800'
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
        className={`w-full ${
          tier.highlighted
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-white/10'
        }`}
      >
        <Link href="/login">{tier.cta}</Link>
      </Button>
    </motion.div>
  );
}

export function Pricing() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-24 sm:py-32 px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/5 to-transparent" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 sm:mb-16"
        >
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-slate-100 mb-4">
            Eerlijke prijzen
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Geen creditcard nodig. Geen proefperiode. Gratis is echt gratis.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
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
