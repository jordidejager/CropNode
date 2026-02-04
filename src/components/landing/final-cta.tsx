'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export function FinalCTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-24 sm:py-32 px-4 overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/30 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[128px]" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-[128px]" />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-3xl mx-auto text-center"
      >
        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-slate-100 mb-4">
          Klaar om je bedrijf slim te beheren?
        </h2>
        <p className="text-slate-400 text-lg sm:text-xl mb-8 max-w-xl mx-auto">
          Je eerste registratie staat er binnen 30 seconden.
        </p>

        <Button
          asChild
          size="lg"
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-base h-14 px-10 shadow-xl shadow-emerald-900/40 group"
        >
          <Link href="/login">
            Gratis beginnen
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </Button>
      </motion.div>
    </section>
  );
}
