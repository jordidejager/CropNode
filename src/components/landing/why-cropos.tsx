'use client';

import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Clock, FolderOpen, ShieldCheck } from 'lucide-react';

const cards = [
  {
    icon: Clock,
    problem: 'Administratie bijhouden kost je avonden en weekenden',
    solution: 'Eén zin typen is genoeg — CropNode herkent percelen, middelen en doseringen automatisch',
    color: 'emerald',
  },
  {
    icon: FolderOpen,
    problem: 'Alles staat overal: Excel, papier, WhatsApp, je hoofd',
    solution: 'Percelen, registraties, uren en voorraad — eindelijk op één plek',
    color: 'emerald',
  },
  {
    icon: ShieldCheck,
    problem: 'Bij een controle moet je maar hopen dat alles klopt',
    solution: 'Elke registratie wordt direct getoetst aan de CTGB-database',
    color: 'emerald',
  },
];

function Card({
  icon: Icon,
  problem,
  solution,
  index,
}: {
  icon: typeof Clock;
  problem: string;
  solution: string;
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
      className="group relative"
    >
      <div className="relative h-full rounded-2xl bg-slate-900/50 border border-white/5 p-6 sm:p-8 overflow-hidden transition-all duration-300 hover:border-emerald-500/20 hover:bg-slate-900/70">
        {/* Subtle gradient on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="relative z-10">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center mb-6 group-hover:bg-emerald-600/20 transition-colors">
            <Icon className="w-6 h-6 text-emerald-400" />
          </div>

          {/* Problem */}
          <p className="text-slate-500 text-sm font-medium mb-2 uppercase tracking-wider">
            Probleem
          </p>
          <p className="text-slate-200 text-lg font-medium mb-6 leading-relaxed">
            &ldquo;{problem}&rdquo;
          </p>

          {/* Divider */}
          <div className="w-12 h-px bg-emerald-500/30 mb-6" />

          {/* Solution */}
          <p className="text-slate-500 text-sm font-medium mb-2 uppercase tracking-wider">
            Oplossing
          </p>
          <p className="text-emerald-400 text-lg leading-relaxed">{solution}</p>
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
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/10 to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-slate-100 mb-4">
            Waarom CropNode?
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Minder administratie, meer overzicht. CropNode is gebouwd voor hoe jij werkt.
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((card, index) => (
            <Card key={index} {...card} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

