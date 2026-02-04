'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Sprout, ShieldCheck, Server, Users } from 'lucide-react';

const trustItems = [
  {
    icon: Sprout,
    label: 'Gebouwd door een fruitteler',
    sublabel: 'voor fruittelers',
  },
  {
    icon: ShieldCheck,
    label: 'Gevalideerd tegen de',
    sublabel: 'officiële CTGB-database',
  },
  {
    icon: Server,
    label: 'Nederlandse data',
    sublabel: 'op Europese servers',
  },
];

export function TrustBlock() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <section className="relative py-16 sm:py-24 px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/10 to-transparent" />

      <div className="relative z-10 max-w-5xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-2xl sm:text-3xl text-slate-100 mb-3">
            Gebouwd voor de fruitteelt
          </h2>
          <p className="text-slate-400">
            Met kennis van de praktijk, gevalideerd door de branche.
          </p>
        </motion.div>

        {/* Trust Items */}
        <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
          {trustItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex flex-col items-center text-center group"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center mb-4 group-hover:bg-emerald-600/20 transition-colors">
                  <Icon className="w-7 h-7 text-emerald-400" />
                </div>
                <p className="text-slate-200 font-medium">{item.label}</p>
                <p className="text-emerald-400 text-sm">{item.sublabel}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
