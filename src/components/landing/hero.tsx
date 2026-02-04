'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Sparkles, ChevronDown } from 'lucide-react';

const DEMO_TEXT = 'Vandaag captan 2kg elstar en conference';

interface DemoState {
  phase: 'typing' | 'processing' | 'result' | 'pause';
  typedText: string;
  charIndex: number;
}

function SmartInputDemo() {
  const [state, setState] = useState<DemoState>({
    phase: 'typing',
    typedText: '',
    charIndex: 0,
  });
  const inputRef = useRef<HTMLDivElement>(null);

  // Typewriter effect
  useEffect(() => {
    if (state.phase === 'typing' && state.charIndex < DEMO_TEXT.length) {
      const timeout = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          typedText: DEMO_TEXT.slice(0, prev.charIndex + 1),
          charIndex: prev.charIndex + 1,
        }));
      }, 50 + Math.random() * 30);
      return () => clearTimeout(timeout);
    } else if (state.phase === 'typing' && state.charIndex >= DEMO_TEXT.length) {
      // Typing complete, start processing
      const timeout = setTimeout(() => {
        setState((prev) => ({ ...prev, phase: 'processing' }));
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [state.phase, state.charIndex]);

  // Processing phase
  useEffect(() => {
    if (state.phase === 'processing') {
      const timeout = setTimeout(() => {
        setState((prev) => ({ ...prev, phase: 'result' }));
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [state.phase]);

  // Result phase - pause then restart
  useEffect(() => {
    if (state.phase === 'result') {
      const timeout = setTimeout(() => {
        setState((prev) => ({ ...prev, phase: 'pause' }));
      }, 4000);
      return () => clearTimeout(timeout);
    }
  }, [state.phase]);

  // Pause phase - restart the demo
  useEffect(() => {
    if (state.phase === 'pause') {
      const timeout = setTimeout(() => {
        setState({ phase: 'typing', typedText: '', charIndex: 0 });
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [state.phase]);

  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Demo Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="relative rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl overflow-hidden shadow-2xl shadow-emerald-900/10"
      >
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-slate-500 ml-2 font-medium">Slimme Invoer</span>
        </div>

        {/* Input Area */}
        <div className="p-4">
          <div
            ref={inputRef}
            className="min-h-[52px] px-4 py-3 rounded-xl bg-slate-800/50 border border-white/10 text-slate-100 text-sm flex items-center"
          >
            <span className="text-slate-300">{state.typedText}</span>
            {(state.phase === 'typing' || state.phase === 'processing') && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="inline-block w-0.5 h-5 bg-emerald-400 ml-0.5"
              />
            )}
          </div>
        </div>

        {/* Processing / Result */}
        <AnimatePresence mode="wait">
          {state.phase === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-4"
            >
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                <span>Analyseren...</span>
              </div>
            </motion.div>
          )}

          {(state.phase === 'result' || state.phase === 'pause') && (
            <motion.div
              key="result"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="px-4 pb-4"
            >
              {/* Result Card */}
              <div className="rounded-xl bg-slate-800/30 border border-emerald-500/20 overflow-hidden">
                {/* Status Header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 text-sm font-medium">CTGB Goedgekeurd</span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  {/* Date */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Datum</span>
                    <span className="text-slate-200">{today}</span>
                  </div>

                  {/* Parcels */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Percelen</span>
                    <div className="flex gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-slate-700/50 text-slate-200 text-xs">
                        Elstar
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-700/50 text-slate-200 text-xs">
                        Conference
                      </span>
                    </div>
                  </div>

                  {/* Product */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Product</span>
                    <span className="text-slate-200">Captan | 2 kg/ha</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Glow effect */}
      <div className="absolute -inset-4 bg-emerald-500/5 blur-3xl rounded-full -z-10" />
    </div>
  );
}

export function Hero() {
  const scrollToDemo = () => {
    const demoSection = document.getElementById('platform-overview');
    if (demoSection) {
      demoSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 pb-16 px-4 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-transparent to-transparent" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/5 rounded-full blur-3xl" />

      {/* Grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Copy */}
          <div className="text-center lg:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="font-display text-4xl sm:text-5xl lg:text-6xl text-slate-100 leading-tight"
            >
              Eén platform voor je hele{' '}
              <span className="text-emerald-400">fruitteeltbedrijf</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 text-lg sm:text-xl text-slate-400 max-w-xl mx-auto lg:mx-0"
            >
              Percelen, gewasbescherming, uren en bedrijfsdata — alles op één plek.
              Typ wat je gedaan hebt, CropNode regelt de rest.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Button
                asChild
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-base h-12 px-8 shadow-lg shadow-emerald-900/30"
              >
                <Link href="/login">Gratis beginnen</Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={scrollToDemo}
                className="border-white/10 text-slate-300 hover:bg-white/5 hover:text-white text-base h-12 px-8"
              >
                Ontdek de mogelijkheden
              </Button>
            </motion.div>
          </div>

          {/* Right Column - Demo */}
          <div className="relative">
            <SmartInputDemo />
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden lg:block"
        >
          <motion.button
            onClick={scrollToDemo}
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-slate-500 hover:text-emerald-400 transition-colors"
            aria-label="Scroll naar beneden"
          >
            <ChevronDown className="w-6 h-6" />
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
