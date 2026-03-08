'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Zap, Brain, ShieldCheck } from 'lucide-react';

const cards = [
  {
    icon: Zap,
    number: '01',
    title: 'Van uren naar seconden',
    problem: 'Administratie kost je avonden en weekenden',
    solution:
      'Eén zin typen is genoeg. AI herkent percelen, middelen en doseringen — registreer in minder dan 3 seconden.',
  },
  {
    icon: Brain,
    number: '02',
    title: 'Eén platform, nul chaos',
    problem: 'Alles staat overal: Excel, papier, WhatsApp',
    solution:
      'Percelen, registraties, weer, oogst, uren en voorraad — eindelijk op één plek. Volledig geïntegreerd.',
  },
  {
    icon: ShieldCheck,
    number: '03',
    title: 'Altijd compliant',
    problem: 'Bij controle moet je maar hopen dat alles klopt',
    solution:
      'Elke registratie doorloopt automatisch een 6-staps CTGB validatie. Dosering, toelating, interval — alles wordt gecheckt.',
  },
];

function Card({
  card,
  index,
}: {
  card: (typeof cards)[number];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const Icon = card.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative"
    >
      <div className="relative h-full rounded-2xl bg-slate-900/40 border border-white/[0.06] overflow-hidden transition-all duration-500 hover:border-emerald-500/20">
        {/* Top accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="p-6 sm:p-8">
          {/* Number + Icon */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-emerald-500/30 text-5xl font-display font-bold">
              {card.number}
            </span>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center group-hover:bg-emerald-500/15 transition-colors">
              <Icon className="w-6 h-6 text-emerald-400" />
            </div>
          </div>

          {/* Title */}
          <h3 className="font-display text-xl sm:text-2xl text-white mb-4">
            {card.title}
          </h3>

          {/* Problem */}
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/[0.06] border border-red-500/10">
            <p className="text-red-300/70 text-sm leading-relaxed">
              &ldquo;{card.problem}&rdquo;
            </p>
          </div>

          {/* Arrow */}
          <div className="flex justify-center my-3">
            <div className="w-px h-6 bg-gradient-to-b from-red-500/20 to-emerald-500/30" />
          </div>

          {/* Solution */}
          <p className="text-slate-300 text-sm leading-relaxed">
            {card.solution}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export function WhyCropNode() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-24 sm:py-32 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/[0.05] to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto">
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
            Waarom CropNode
          </motion.span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white mb-4">
            Gebouwd voor hoe{' '}
            <span className="text-emerald-400">jij</span> werkt
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Minder administratie. Meer overzicht. Altijd compliant.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-5">
          {cards.map((card, index) => (
            <Card key={index} card={card} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
