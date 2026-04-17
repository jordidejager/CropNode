'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ArrowRight,
  Shield,
  Cloud,
  Cpu,
  Zap,
} from 'lucide-react';

const DEMO_TEXTS = [
  'Vandaag merpan spuitkorrel 0,71 kg/ha alle elstar',
  'Alle conference zonder Rivierzicht 0,71 merpan en 1 kg ureum en 2 kg bitterzout',
  'Delan Pro 2,5 L/ha alle peren behalve de Lucas',
  'Alleen Molenweg jonagold 0,71 merpan spuitkorrel en 0,175 l coragen',
  '0,71 merpan spuitkorrel op elstar en conference',
];

interface DemoState {
  phase: 'typing' | 'processing' | 'result' | 'pause';
  typedText: string;
  charIndex: number;
  textIndex: number;
}

const RESULT_DATA = [
  {
    totalHa: '12,50',
    parcels: [
      { name: 'Hoogveld Elstar', ha: '4,20' },
      { name: 'Boomgaard Zuid Elstar', ha: '3,80' },
      { name: 'Kerkpad Elstar', ha: '4,50' },
    ],
    products: [{ name: 'Merpan Spuitkorrel', dosage: '0,71 kg/ha', total: '8,88 kg' }],
  },
  {
    totalHa: '4,80',
    parcels: [
      { name: 'Dijk Noord Conference', ha: '4,80' },
    ],
    products: [
      { name: 'Merpan Spuitkorrel', dosage: '0,71 kg/ha', total: '3,41 kg' },
      { name: 'Ureum', dosage: '1 kg/ha', total: '4,80 kg' },
      { name: 'Bitterzout', dosage: '2 kg/ha', total: '9,60 kg' },
    ],
  },
  {
    totalHa: '12,60',
    parcels: [
      { name: 'Rivierzicht Conference', ha: '3,50' },
      { name: 'Dijk Noord Conference', ha: '4,80' },
      { name: 'Weiland Gieser Wildeman', ha: '2,10' },
      { name: 'Bosrand Doyenné', ha: '2,20' },
    ],
    products: [{ name: 'Delan Pro', dosage: '2,5 L/ha', total: '31,50 L' }],
  },
  {
    totalHa: '3,40',
    parcels: [
      { name: 'Molenweg Jonagold', ha: '3,40' },
    ],
    products: [
      { name: 'Merpan Spuitkorrel', dosage: '0,71 kg/ha', total: '2,41 kg' },
      { name: 'Coragen', dosage: '0,175 L/ha', total: '0,60 L' },
    ],
  },
  {
    totalHa: '20,80',
    parcels: [
      { name: 'Hoogveld Elstar', ha: '4,20' },
      { name: 'Boomgaard Zuid Elstar', ha: '3,80' },
      { name: 'Kerkpad Elstar', ha: '4,50' },
      { name: 'Rivierzicht Conference', ha: '3,50' },
      { name: 'Dijk Noord Conference', ha: '4,80' },
    ],
    products: [{ name: 'Merpan Spuitkorrel', dosage: '0,71 kg/ha', total: '14,77 kg' }],
  },
];

function SmartInputDemo() {
  const [state, setState] = useState<DemoState>({
    phase: 'typing',
    typedText: '',
    charIndex: 0,
    textIndex: 0,
  });
  const inputRef = useRef<HTMLDivElement>(null);
  const currentText = DEMO_TEXTS[state.textIndex];
  const currentResult = RESULT_DATA[state.textIndex];

  useEffect(() => {
    if (state.phase === 'typing' && state.charIndex < currentText.length) {
      const timeout = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          typedText: currentText.slice(0, prev.charIndex + 1),
          charIndex: prev.charIndex + 1,
        }));
      }, 40 + Math.random() * 25);
      return () => clearTimeout(timeout);
    } else if (state.phase === 'typing' && state.charIndex >= currentText.length) {
      const timeout = setTimeout(() => {
        setState((prev) => ({ ...prev, phase: 'processing' }));
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [state.phase, state.charIndex, currentText]);

  useEffect(() => {
    if (state.phase === 'processing') {
      const timeout = setTimeout(() => {
        setState((prev) => ({ ...prev, phase: 'result' }));
      }, 1200);
      return () => clearTimeout(timeout);
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'result') {
      const timeout = setTimeout(() => {
        setState((prev) => ({ ...prev, phase: 'pause' }));
      }, 3500);
      return () => clearTimeout(timeout);
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'pause') {
      const timeout = setTimeout(() => {
        setState((prev) => ({
          phase: 'typing',
          typedText: '',
          charIndex: 0,
          textIndex: (prev.textIndex + 1) % DEMO_TEXTS.length,
        }));
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [state.phase]);

  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="w-full max-w-lg mx-auto"
    >
      <div className="relative">
        {/* Outer glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-teal-500/20 rounded-3xl blur-xl" />

        {/* Demo Container */}
        <div className="relative rounded-2xl bg-slate-900/80 border border-white/10 backdrop-blur-2xl overflow-hidden shadow-2xl shadow-emerald-950/30">
          {/* Header bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/60">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-800/50">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px] text-slate-400 font-medium tracking-wide">
                  SLIMME INVOER
                </span>
              </div>
            </div>
            <div className="w-[52px]" />
          </div>

          {/* Input Area */}
          <div className="p-4 pb-2">
            <div
              ref={inputRef}
              className="min-h-[52px] px-4 py-3 rounded-xl bg-slate-800/40 border border-white/[0.06] text-slate-100 text-sm flex items-center"
            >
              {state.typedText ? (
                <span className="text-slate-200">{state.typedText}</span>
              ) : (
                <span className="text-slate-500">Typ wat je gedaan hebt...</span>
              )}
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
                <div className="flex items-center gap-3 py-3">
                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"
                    >
                      <Cpu className="w-4 h-4 text-emerald-400" />
                    </motion.div>
                  </div>
                  <div>
                    <p className="text-emerald-400 text-sm font-medium">AI analyseert...</p>
                    <div className="flex gap-4 mt-1">
                      {['Percelen', 'Product', 'CTGB'].map((step, i) => (
                        <motion.span
                          key={step}
                          initial={{ opacity: 0.3 }}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            delay: i * 0.3,
                          }}
                          className="text-slate-500 text-xs"
                        >
                          {step}
                        </motion.span>
                      ))}
                    </div>
                  </div>
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
                <div className="rounded-xl bg-slate-800/30 border border-emerald-500/20 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-3.5 py-2 bg-emerald-500/[0.08] border-b border-emerald-500/10">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-medium">
                        CTGB Gevalideerd
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[10px]">{today}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-medium">
                        Concept
                      </span>
                    </div>
                  </div>

                  {/* Registratie summary */}
                  <div className="px-3.5 py-2 border-b border-white/[0.04]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 text-xs font-medium">Registratie</span>
                      <span className="text-slate-500 text-[10px]">
                        {currentResult.totalHa} ha &middot; {currentResult.products.length} {currentResult.products.length === 1 ? 'middel' : 'middelen'}
                      </span>
                    </div>
                  </div>

                  {/* Middelen */}
                  <div className="px-3.5 py-2 border-b border-white/[0.04]">
                    <span className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">
                      Middelen ({currentResult.products.length})
                    </span>
                    <div className="mt-1.5 space-y-1">
                      {currentResult.products.map((prod) => (
                        <div key={prod.name} className="flex items-center justify-between">
                          <span className="text-slate-200 text-xs">{prod.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 text-[11px] font-medium">{prod.dosage}</span>
                            <span className="text-slate-500 text-[10px]">Totaal: {prod.total}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Percelen */}
                  <div className="px-3.5 py-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">
                        Percelen ({currentResult.parcels.length})
                      </span>
                      <span className="text-slate-500 text-[10px]">{currentResult.totalHa} ha</span>
                    </div>
                    <div className="space-y-0.5 max-h-[72px] overflow-hidden">
                      {currentResult.parcels.slice(0, 3).map((p) => (
                        <div key={p.name} className="flex items-center justify-between">
                          <span className="text-slate-300 text-[11px]">{p.name}</span>
                          <span className="text-emerald-400/70 text-[10px]">{p.ha} ha</span>
                        </div>
                      ))}
                      {currentResult.parcels.length > 3 && (
                        <span className="text-slate-600 text-[10px]">
                          +{currentResult.parcels.length - 3} meer
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

const stats = [
  { icon: Shield, value: '2.900+', label: 'Producten in database' },
  { icon: Cloud, value: '5', label: 'Weermodellen' },
  { icon: Zap, value: '<3s', label: 'AI registratie' },
  { icon: Cpu, value: '11', label: 'Modules' },
];

export function Hero() {
  const scrollToFeatures = () => {
    const el = document.getElementById('features');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 px-4 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
          }}
        />
        {/* Radial glow center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-emerald-500/[0.07] rounded-full blur-[128px]" />
        {/* Top-right glow */}
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-emerald-400/[0.04] rounded-full blur-[100px]" />
        {/* Bottom-left glow */}
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-teal-500/[0.04] rounded-full blur-[100px]" />

        {/* Floating particles */}
        {[
          { x: '15%', y: '20%', size: 3, delay: 0, duration: 6 },
          { x: '85%', y: '30%', size: 2, delay: 1, duration: 8 },
          { x: '70%', y: '70%', size: 4, delay: 2, duration: 7 },
          { x: '25%', y: '80%', size: 2, delay: 0.5, duration: 9 },
          { x: '50%', y: '15%', size: 3, delay: 3, duration: 6 },
          { x: '90%', y: '60%', size: 2, delay: 1.5, duration: 8 },
        ].map((p, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-emerald-400"
            style={{ left: p.x, top: p.y, width: p.size, height: p.size }}
            animate={{ y: [-10, 10, -10], opacity: [0.15, 0.4, 0.15] }}
            transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
          />
        ))}

        {/* Grain texture */}
        <div
          className="absolute inset-0 opacity-[0.012]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left Column */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-emerald-400 text-sm font-medium">
                Nu beschikbaar voor fruitteelt
              </span>
            </motion.div>

            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl text-white leading-[1.1] tracking-tight">
                Crop
                <span className="text-emerald-400">Node</span>
              </h1>
              <p className="mt-2 text-sm sm:text-base font-medium tracking-[0.2em] uppercase text-slate-400">
                Agriculture Intelligence Platform
              </p>
            </motion.div>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-8 text-lg sm:text-xl text-slate-400 max-w-xl mx-auto lg:mx-0 leading-relaxed"
            >
              Van WhatsApp-registraties tot AI-ziektedrukmodellen.
              Het complete platform voor de moderne{' '}
              <span className="text-slate-200">fruitteelt</span>.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-10 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Button
                asChild
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-base h-13 px-8 shadow-lg shadow-emerald-900/40 group transition-all duration-300 hover:shadow-emerald-800/50 hover:shadow-xl"
              >
                <Link href="/login" className="flex items-center gap-2">
                  Gratis beginnen
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={scrollToFeatures}
                className="border-white/10 text-slate-300 hover:bg-white/5 hover:text-white hover:border-white/20 text-base h-13 px-8 transition-all duration-300"
              >
                Ontdek de mogelijkheden
              </Button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6"
            >
              {stats.map((stat, i) => (
                <div key={i} className="text-center lg:text-left">
                  <div className="flex items-center gap-2 justify-center lg:justify-start mb-1">
                    <stat.icon className="w-4 h-4 text-emerald-500/70" />
                    <span className="text-xl font-bold text-white">{stat.value}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{stat.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right Column - Demo */}
          <div className="relative">
            <SmartInputDemo />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.button
          onClick={scrollToFeatures}
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-slate-500 hover:text-emerald-400 transition-colors"
          aria-label="Scroll naar beneden"
        >
          <ChevronDown className="w-6 h-6" />
        </motion.button>
      </motion.div>
    </section>
  );
}
