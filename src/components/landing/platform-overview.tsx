'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  MessageSquareText,
  MapPin,
  Shield,
  Clock,
  BookOpen,
  ChevronRight,
} from 'lucide-react';

const features = [
  {
    id: 'smart-input',
    icon: MessageSquareText,
    title: 'Slim registreren',
    description:
      'Typ een spuitregistratie zoals je het tegen een collega zou zeggen. CropNode herkent je percelen, producten en doseringen — en controleert het direct.',
    visual: SmartInputVisual,
  },
  {
    id: 'parcels',
    icon: MapPin,
    title: 'Perceelbeheer',
    description:
      'Je percelen op de kaart, tot op blokniveau. Importeer vanuit RVO of teken zelf. Met ras, onderstam, plantjaar en plantafstand erbij.',
    visual: ParcelsVisual,
  },
  {
    id: 'crop-protection',
    icon: Shield,
    title: 'Gewasbescherming',
    description:
      'Doorzoek de complete CTGB-database. Check toelatingen, bekijk veiligheidstermijnen en houd je middelenvoorraad bij.',
    visual: CropProtectionVisual,
  },
  {
    id: 'time-tracking',
    icon: Clock,
    title: 'Urenregistratie',
    description:
      'Wie werkt waar, en hoe lang? Van snoeien tot plukken — registreer uren per taak, per perceel, per persoon.',
    visual: TimeTrackingVisual,
  },
  {
    id: 'research',
    icon: BookOpen,
    title: 'Research Hub',
    description:
      'Alles over ziekten en plagen in appel en peer. Herken schurft, fruitmot of bacterievuur en vind direct de juiste aanpak.',
    visual: ResearchVisual,
  },
];

function SmartInputVisual() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-800/50 border border-white/10 p-3">
        <span className="text-slate-400 text-sm">vandaag captan 2kg elstar</span>
      </div>
      <div className="flex items-center gap-2 text-emerald-400 text-xs">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-emerald-400"
        />
        <span>Herkend: Captan, 2 kg/ha, Elstar</span>
      </div>
    </div>
  );
}

function ParcelsVisual() {
  return (
    <div className="relative h-32 rounded-lg bg-slate-800/50 border border-white/10 overflow-hidden">
      {/* Simplified map visualization */}
      <div className="absolute inset-0 opacity-30">
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <path
            d="M20,80 L40,40 L80,50 L100,20 L140,40 L160,30 L180,60 L160,80 Z"
            fill="none"
            stroke="rgb(52, 211, 153)"
            strokeWidth="2"
          />
          <path
            d="M50,70 L70,60 L90,65 L80,80 Z"
            fill="rgb(52, 211, 153)"
            fillOpacity="0.3"
            stroke="rgb(52, 211, 153)"
            strokeWidth="1"
          />
          <path
            d="M100,50 L130,45 L140,60 L120,70 L100,65 Z"
            fill="rgb(52, 211, 153)"
            fillOpacity="0.3"
            stroke="rgb(52, 211, 153)"
            strokeWidth="1"
          />
        </svg>
      </div>
      <div className="absolute bottom-2 left-2 flex gap-2">
        <span className="px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-xs">
          Elstar
        </span>
        <span className="px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-xs">
          Conference
        </span>
      </div>
    </div>
  );
}

function CropProtectionVisual() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border border-white/10">
        <span className="text-slate-300 text-sm">Captan WG</span>
        <span className="text-emerald-400 text-xs px-2 py-0.5 rounded bg-emerald-600/20">
          Toegelaten
        </span>
      </div>
      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border border-white/10">
        <span className="text-slate-300 text-sm">Delan WG</span>
        <span className="text-emerald-400 text-xs px-2 py-0.5 rounded bg-emerald-600/20">
          Toegelaten
        </span>
      </div>
    </div>
  );
}

function TimeTrackingVisual() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 border border-white/10">
        <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
          <span className="text-emerald-400 text-xs font-medium">JD</span>
        </div>
        <div className="flex-1">
          <p className="text-slate-300 text-sm">Snoeien</p>
          <p className="text-slate-500 text-xs">Elstar • 4.5 uur</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 border border-white/10">
        <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
          <span className="text-emerald-400 text-xs font-medium">MK</span>
        </div>
        <div className="flex-1">
          <p className="text-slate-300 text-sm">Plukken</p>
          <p className="text-slate-500 text-xs">Conference • 6 uur</p>
        </div>
      </div>
    </div>
  );
}

function ResearchVisual() {
  return (
    <div className="space-y-2">
      <div className="p-3 rounded-lg bg-slate-800/50 border border-white/10">
        <div className="flex items-start gap-2">
          <div className="w-10 h-10 rounded bg-amber-600/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-amber-400 text-lg">🍂</span>
          </div>
          <div>
            <p className="text-slate-200 text-sm font-medium">Schurft</p>
            <p className="text-slate-500 text-xs">Venturia inaequalis</p>
          </div>
        </div>
      </div>
      <div className="p-3 rounded-lg bg-slate-800/50 border border-white/10">
        <div className="flex items-start gap-2">
          <div className="w-10 h-10 rounded bg-red-600/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-red-400 text-lg">🦋</span>
          </div>
          <div>
            <p className="text-slate-200 text-sm font-medium">Fruitmot</p>
            <p className="text-slate-500 text-xs">Cydia pomonella</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlatformOverview() {
  const [activeFeature, setActiveFeature] = useState(features[0].id);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const activeData = features.find((f) => f.id === activeFeature)!;
  const VisualComponent = activeData.visual;

  return (
    <section
      id="platform-overview"
      className="relative py-24 sm:py-32 px-4 overflow-hidden"
    >
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
            Je hele bedrijf, overzichtelijk
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Van het veld tot het kantoor — CropNode groeit mee met je bedrijf.
          </p>
        </motion.div>

        {/* Feature Showcase */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-start">
          {/* Feature List */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-2"
          >
            {features.map((feature) => {
              const Icon = feature.icon;
              const isActive = activeFeature === feature.id;

              return (
                <button
                  key={feature.id}
                  onClick={() => setActiveFeature(feature.id)}
                  className={`w-full text-left p-4 sm:p-5 rounded-xl transition-all duration-300 group ${
                    isActive
                      ? 'bg-slate-900/70 border border-emerald-500/30'
                      : 'bg-transparent border border-transparent hover:bg-slate-900/30 hover:border-white/5'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        isActive
                          ? 'bg-emerald-600/20 border border-emerald-500/30'
                          : 'bg-slate-800/50 border border-white/10 group-hover:border-white/20'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 ${
                          isActive ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3
                          className={`font-medium ${
                            isActive ? 'text-emerald-400' : 'text-slate-200'
                          }`}
                        >
                          {feature.title}
                        </h3>
                        <ChevronRight
                          className={`w-5 h-5 transition-transform ${
                            isActive
                              ? 'text-emerald-400 rotate-90'
                              : 'text-slate-600'
                          }`}
                        />
                      </div>
                      <p
                        className={`text-sm mt-1 transition-colors ${
                          isActive ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </motion.div>

          {/* Feature Visual */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="lg:sticky lg:top-24"
          >
            <div className="rounded-2xl bg-slate-900/50 border border-white/10 p-6 sm:p-8 min-h-[300px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFeature}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <VisualComponent />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
