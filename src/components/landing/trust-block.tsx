'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Sprout, ShieldCheck, MapPin, Leaf, Database, Lock } from 'lucide-react';

const trustItems = [
  {
    icon: ShieldCheck,
    title: 'CTGB Gevalideerd',
    description: 'Elke registratie wordt getoetst aan de officiële database',
  },
  {
    icon: MapPin,
    title: 'Nederlands',
    description: 'Ontworpen voor Nederlandse teeltbedrijven en regelgeving',
  },
  {
    icon: Sprout,
    title: 'Door een teler',
    description: 'Gebouwd door iemand die weet hoe het veld werkt',
  },
  {
    icon: Database,
    title: 'RVO Integratie',
    description: 'Importeer percelen rechtstreeks vanuit het RVO-register',
  },
  {
    icon: Leaf,
    title: 'Specialisatie',
    description: 'Specifiek ontwikkeld voor appel- en perenteelt',
  },
  {
    icon: Lock,
    title: 'Veilig & privé',
    description: 'Je data blijft van jou. Beveiligd en beschermd.',
  },
];

export function TrustBlock() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <section className="relative py-20 sm:py-28 px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/[0.06] to-transparent" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl text-white mb-3">
            Gebouwd voor de Nederlandse fruitteelt
          </h2>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            Niet nog een generiek farm management systeem — CropNode is specifiek voor jou.
          </p>
        </motion.div>

        {/* Trust Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
          {trustItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.4, delay: index * 0.06 }}
                className="group flex flex-col items-center text-center p-5 rounded-2xl bg-slate-900/30 border border-white/[0.04] hover:border-emerald-500/15 transition-all duration-400"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mb-4 group-hover:bg-emerald-500/15 transition-colors">
                  <Icon className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-100 mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
