'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

export function FinalCTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-28 sm:py-36 px-4 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/[0.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-emerald-600/[0.06] rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-teal-500/[0.05] rounded-full blur-[100px]" />
      </div>

      {/* Grid pattern fading in */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(to bottom, transparent, black 50%, black)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 50%, black)',
        }}
      />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.7 }}
        className="relative z-10 max-w-3xl mx-auto text-center"
      >
        {/* Decorative icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-8"
        >
          <Sparkles className="w-8 h-8 text-emerald-400" />
        </motion.div>

        <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl text-white mb-5 leading-tight">
          Klaar om te beginnen?
        </h2>
        <p className="text-slate-400 text-lg sm:text-xl mb-10 max-w-xl mx-auto leading-relaxed">
          Maak gratis een account aan en doe je eerste AI-registratie in minder dan 30 seconden.
          Geen creditcard, geen verplichtingen.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            asChild
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-base h-14 px-10 shadow-xl shadow-emerald-900/40 group transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-800/50"
          >
            <Link href="/login" className="flex items-center gap-2">
              Gratis beginnen
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex items-center justify-center gap-6 text-slate-500 text-sm"
        >
          <span>Gratis plan beschikbaar</span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span>Direct aan de slag</span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span>Op elk moment opzegbaar</span>
        </motion.div>
      </motion.div>
    </section>
  );
}
