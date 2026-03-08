'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Cloud,
  MapPin,
  Shield,
  BookOpen,
  Apple,
  Users,
  Package,
  Wind,
  Thermometer,
  Droplets,
  AlertTriangle,
  Timer,
  TrendingDown,
} from 'lucide-react';

/* ─── Weather Hub Visual ─── */
function WeatherVisual({ isInView }: { isInView: boolean }) {
  const models = [
    { name: 'GFS', color: '#34d399', d: 'M0,95 C40,90 80,72 120,68 C160,64 200,75 240,70 C280,65 320,60 360,58 C380,56 400,54 400,54' },
    { name: 'ECMWF', color: '#38bdf8', d: 'M0,100 C40,94 80,78 120,72 C160,68 200,78 240,72 C280,67 320,62 360,56 C380,54 400,52' },
    { name: 'ICON', color: '#fbbf24', d: 'M0,92 C40,86 80,68 120,62 C160,58 200,70 240,64 C280,60 320,55 360,50 C380,48 400,46' },
    { name: 'Harmonie', color: '#a78bfa', d: 'M0,98 C40,92 80,74 120,70 C160,66 200,80 240,74 C280,69 320,64 360,60 C380,58 400,56' },
    { name: 'KNMI', color: '#2dd4bf', d: 'M0,104 C40,96 80,82 120,74 C160,70 200,78 240,72 C280,66 320,60 360,55 C380,52 400,50' },
  ];

  const days = [
    { day: 'Ma', temp: '14°', rain: 0 },
    { day: 'Di', temp: '16°', rain: 10 },
    { day: 'Wo', temp: '15°', rain: 70 },
    { day: 'Do', temp: '12°', rain: 20 },
    { day: 'Vr', temp: '17°', rain: 5 },
    { day: 'Za', temp: '18°', rain: 0 },
    { day: 'Zo', temp: '16°', rain: 15 },
  ];

  const spuitvenster = [1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1];

  return (
    <div className="mt-4 space-y-3">
      {/* Multi-model chart */}
      <div className="relative rounded-xl bg-slate-800/40 border border-sky-500/10 p-3 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Thermometer className="w-3 h-3 text-sky-400/60" />
            <span className="text-[10px] text-sky-400/80 font-medium uppercase tracking-wider">Expert Forecast</span>
          </div>
          <div className="flex items-center gap-2.5">
            {models.map((m) => (
              <div key={m.name} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color, opacity: 0.7 }} />
                <span className="text-[8px] text-slate-600">{m.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <svg viewBox="0 0 400 130" className="w-full h-24" preserveAspectRatio="none">
          {/* Grid */}
          {[30, 60, 90, 120].map((y) => (
            <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="rgba(255,255,255,0.03)" />
          ))}
          {/* Y labels */}
          <text x="4" y="34" fill="rgba(148,163,184,0.3)" fontSize="8">20°</text>
          <text x="4" y="64" fill="rgba(148,163,184,0.3)" fontSize="8">15°</text>
          <text x="4" y="94" fill="rgba(148,163,184,0.3)" fontSize="8">10°</text>

          {/* Gradient fill under ensemble */}
          <motion.path
            d="M0,98 C40,92 80,74 120,69 C160,65 200,76 240,70 C280,66 320,60 360,56 C380,54 400,52 L400,130 L0,130 Z"
            fill="url(#ensembleGradient)"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 1.2, delay: 0.8 }}
          />
          <defs>
            <linearGradient id="ensembleGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Model lines */}
          {models.map((model, i) => (
            <motion.path
              key={model.name}
              d={model.d}
              fill="none"
              stroke={model.color}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.7"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={isInView ? { pathLength: 1, opacity: 0.7 } : {}}
              transition={{ duration: 1.8, delay: 0.2 + i * 0.12, ease: 'easeOut' }}
            />
          ))}

          {/* X labels */}
          <text x="0" y="128" fill="rgba(148,163,184,0.3)" fontSize="8">00:00</text>
          <text x="95" y="128" fill="rgba(148,163,184,0.3)" fontSize="8">12:00</text>
          <text x="195" y="128" fill="rgba(148,163,184,0.3)" fontSize="8">24:00</text>
          <text x="295" y="128" fill="rgba(148,163,184,0.3)" fontSize="8">36:00</text>
          <text x="380" y="128" fill="rgba(148,163,184,0.3)" fontSize="8">48h</text>
        </svg>
      </div>

      {/* Spuitvenster bar */}
      <div className="flex items-center gap-2 px-1">
        <Wind className="w-3 h-3 text-sky-400/50 flex-shrink-0" />
        <span className="text-[9px] text-slate-500 font-medium flex-shrink-0">Spuitvenster</span>
        <div className="flex-1 flex gap-[2px]">
          {spuitvenster.map((ok, i) => (
            <motion.div
              key={i}
              initial={{ scaleY: 0 }}
              animate={isInView ? { scaleY: 1 } : {}}
              transition={{ delay: 1.5 + i * 0.04 }}
              className={`flex-1 h-2.5 rounded-[2px] ${ok ? 'bg-emerald-500/40' : 'bg-red-500/20'}`}
            />
          ))}
        </div>
      </div>

      {/* 7-day forecast */}
      <div className="flex gap-1">
        {days.map((d, i) => (
          <motion.div
            key={d.day}
            initial={{ opacity: 0, y: 8 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.8 + i * 0.06 }}
            className="flex-1 text-center py-2 rounded-lg bg-slate-800/30 border border-white/[0.03]"
          >
            <div className="text-[9px] text-slate-600 mb-1">{d.day}</div>
            <div className="text-xs text-slate-200 font-medium">{d.temp}</div>
            <div className="mt-1 mx-auto w-6 h-1 rounded-full bg-slate-800/60 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-sky-400/50"
                initial={{ width: 0 }}
                animate={isInView ? { width: `${d.rain}%` } : {}}
                transition={{ delay: 2 + i * 0.06, duration: 0.5 }}
              />
            </div>
            <div className="text-[8px] text-slate-600 mt-0.5">
              <Droplets className="w-2 h-2 inline text-sky-400/40" /> {d.rain}%
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Research Hub / Kennisbank Visual ─── */
function ResearchVisual({ isInView }: { isInView: boolean }) {
  const lifecycleStages = [
    { label: 'Sporen', active: true },
    { label: 'Infectie', active: true },
    { label: 'Symptomen', active: true },
    { label: 'Verspreiding', active: false },
  ];

  const activeMonths = [0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0]; // J-D
  const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  return (
    <div className="mt-4 space-y-3">
      {/* Disease Card */}
      <div className="rounded-xl bg-slate-800/40 border border-purple-500/10 p-3.5 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-sm text-slate-100 font-medium">Appelschurft</span>
            </div>
            <span className="text-[10px] text-slate-500 italic">Venturia inaequalis</span>
          </div>
          <motion.div
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : {}}
            transition={{ delay: 0.6, type: 'spring' }}
            className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-semibold"
          >
            Hoog risico
          </motion.div>
        </div>

        {/* Risk bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Risiconiveau</span>
            <span className="text-[10px] text-amber-400 font-medium">78%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500"
              initial={{ width: 0 }}
              animate={isInView ? { width: '78%' } : {}}
              transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Lifecycle */}
        <div className="mb-3">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Lifecycle</span>
          <div className="flex items-center mt-2 gap-1">
            {lifecycleStages.map((stage, i) => (
              <div key={stage.label} className="flex-1 flex items-center">
                <div className="flex flex-col items-center flex-1">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={isInView ? { scale: 1 } : {}}
                    transition={{ delay: 0.8 + i * 0.15, type: 'spring' }}
                    className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      stage.active
                        ? 'bg-purple-500/20 border-purple-400/40'
                        : 'bg-slate-800/40 border-slate-700/40'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${stage.active ? 'bg-purple-400' : 'bg-slate-600'}`} />
                  </motion.div>
                  <span className={`text-[8px] mt-1 ${stage.active ? 'text-purple-400' : 'text-slate-600'}`}>
                    {stage.label}
                  </span>
                </div>
                {i < lifecycleStages.length - 1 && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={isInView ? { scaleX: 1 } : {}}
                    transition={{ delay: 0.9 + i * 0.15 }}
                    className={`h-px flex-1 mx-0.5 origin-left ${
                      stage.active ? 'bg-purple-500/30' : 'bg-slate-700/30'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Seasonal calendar */}
        <div>
          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Seizoensactiviteit</span>
          <div className="flex gap-[3px] mt-1.5">
            {activeMonths.map((active, i) => (
              <motion.div key={i} className="flex-1 flex flex-col items-center gap-1">
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={isInView ? { scaleY: 1 } : {}}
                  transition={{ delay: 1.2 + i * 0.05 }}
                  className={`w-full h-3 rounded-[2px] ${
                    active ? 'bg-purple-500/30' : 'bg-slate-800/30'
                  }`}
                />
                <span className="text-[7px] text-slate-600">{monthLabels[i]}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Related diseases preview */}
      <div className="flex gap-2">
        {[
          { name: 'Meeldauw', risk: 'Laag', color: 'text-emerald-400 bg-emerald-500/10' },
          { name: 'Vruchtrot', risk: 'Matig', color: 'text-amber-400 bg-amber-500/10' },
          { name: 'Perenbladvlo', risk: 'Laag', color: 'text-emerald-400 bg-emerald-500/10' },
        ].map((d, i) => (
          <motion.div
            key={d.name}
            initial={{ opacity: 0, x: -10 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 1.5 + i * 0.1 }}
            className="flex-1 px-2.5 py-2 rounded-lg bg-slate-800/30 border border-white/[0.04]"
          >
            <div className="text-[10px] text-slate-300 font-medium">{d.name}</div>
            <span className={`text-[8px] font-medium px-1 py-0.5 rounded ${d.color}`}>{d.risk}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Perceelbeheer Map Visual ─── */
function ParcelMapVisual({ isInView }: { isInView: boolean }) {
  const parcels = [
    { d: 'M30,55 L60,20 L130,25 L150,50 L120,70 L50,68 Z', fill: 'rgba(52,211,153,0.2)', stroke: 'rgba(52,211,153,0.5)', label: 'Elstar', lx: 85, ly: 45 },
    { d: 'M155,30 L220,15 L260,35 L240,65 L170,60 Z', fill: 'rgba(56,189,248,0.2)', stroke: 'rgba(56,189,248,0.5)', label: 'Conference', lx: 205, ly: 42 },
    { d: 'M50,72 L120,74 L145,55 L170,64 L165,95 L90,100 L40,90 Z', fill: 'rgba(251,191,36,0.2)', stroke: 'rgba(251,191,36,0.5)', label: 'Jonagold', lx: 105, ly: 84 },
    { d: 'M245,40 L310,22 L340,45 L330,75 L270,70 Z', fill: 'rgba(52,211,153,0.15)', stroke: 'rgba(52,211,153,0.4)', label: 'Elstar', lx: 290, ly: 48 },
  ];

  return (
    <div className="mt-4">
      <div className="relative rounded-xl bg-slate-800/30 border border-amber-500/10 overflow-hidden h-[140px]">
        {/* Background map grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }}
        />

        <svg viewBox="0 0 370 110" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {parcels.map((p, i) => (
            <g key={i}>
              <motion.path
                d={p.d}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth="1.5"
                initial={{ opacity: 0, pathLength: 0 }}
                animate={isInView ? { opacity: 1, pathLength: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.15 }}
              />
              <motion.text
                x={p.lx}
                y={p.ly}
                textAnchor="middle"
                fontSize="8"
                fill="rgba(255,255,255,0.6)"
                fontWeight="500"
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ delay: 0.8 + i * 0.15 }}
              >
                {p.label}
              </motion.text>
            </g>
          ))}
        </svg>

        {/* Legend */}
        <div className="absolute bottom-2 left-2 flex gap-2">
          {[
            { color: 'bg-emerald-400/60', label: 'Elstar', ha: '8,70' },
            { color: 'bg-sky-400/60', label: 'Conference', ha: '8,30' },
            { color: 'bg-amber-400/60', label: 'Jonagold', ha: '3,40' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/70 backdrop-blur-sm">
              <div className={`w-1.5 h-1.5 rounded-full ${l.color}`} />
              <span className="text-[8px] text-slate-400">{l.label}</span>
              <span className="text-[8px] text-slate-600">{l.ha}ha</span>
            </div>
          ))}
        </div>

        {/* Total badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 1.2 }}
          className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-amber-500/15"
        >
          <span className="text-[10px] text-amber-400 font-semibold">20,40 ha</span>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Validation Pipeline Visual ─── */
function ValidationVisual({ isInView }: { isInView: boolean }) {
  const steps = [
    { label: 'Toelating', icon: '✓' },
    { label: 'Dosering', icon: '✓' },
    { label: 'Interval', icon: '✓' },
    { label: 'Seizoen', icon: '✓' },
    { label: 'Stofgroep', icon: '✓' },
    { label: 'VT', icon: '✓' },
  ];

  return (
    <div className="mt-4">
      <div className="rounded-xl bg-slate-800/30 border border-emerald-500/10 p-3">
        {/* Pipeline header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">6-staps validatie</span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 2.2 }}
            className="text-[10px] text-emerald-400 font-semibold"
          >
            6/6 Goedgekeurd
          </motion.span>
        </div>

        {/* Steps */}
        <div className="space-y-1.5">
          {steps.map((step, i) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0.3, x: -5 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.8 + i * 0.2 }}
              className="flex items-center gap-2"
            >
              <motion.div
                initial={{ scale: 0, backgroundColor: 'rgba(30,41,59,0.8)' }}
                animate={isInView ? { scale: 1, backgroundColor: 'rgba(16,185,129,0.15)' } : {}}
                transition={{ delay: 0.9 + i * 0.2, type: 'spring' }}
                className="w-5 h-5 rounded-md flex items-center justify-center border border-emerald-500/20"
              >
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : {}}
                  transition={{ delay: 1.0 + i * 0.2 }}
                  className="text-emerald-400 text-[10px] font-bold"
                >
                  ✓
                </motion.span>
              </motion.div>
              <span className="text-[11px] text-slate-300 flex-1">{step.label}</span>
              <motion.div
                initial={{ width: 0 }}
                animate={isInView ? { width: '100%' } : {}}
                transition={{ delay: 0.9 + i * 0.2, duration: 0.4 }}
                className="h-px flex-1 bg-emerald-500/15 max-w-[60px]"
              />
              <motion.span
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ delay: 1.1 + i * 0.2 }}
                className="text-[9px] text-emerald-400/60"
              >
                Pass
              </motion.span>
            </motion.div>
          ))}
        </div>

        {/* Product being validated */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 2.4 }}
          className="mt-3 pt-2 border-t border-white/[0.04] flex items-center justify-between"
        >
          <div>
            <span className="text-[10px] text-slate-400">Product: </span>
            <span className="text-[10px] text-slate-200 font-medium">Merpan Spuitkorrel</span>
          </div>
          <span className="text-[9px] text-emerald-400/80 px-1.5 py-0.5 rounded bg-emerald-500/10">0,71 kg/ha</span>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Harvest Hub Visual ─── */
function HarvestVisual({ isInView }: { isInView: boolean }) {
  // Koelcel grid - 4 cols x 3 rows
  const grid = [
    ['elstar', 'elstar', 'conf', 'empty'],
    ['elstar', 'jona', 'conf', 'conf'],
    ['jona', 'jona', 'empty', 'conf'],
  ];
  const colorMap: Record<string, string> = {
    elstar: 'bg-emerald-500/30 border-emerald-500/20',
    conf: 'bg-sky-500/30 border-sky-500/20',
    jona: 'bg-amber-500/30 border-amber-500/20',
    empty: 'bg-slate-800/20 border-slate-700/10',
  };

  return (
    <div className="mt-4">
      <div className="rounded-xl bg-slate-800/30 border border-orange-500/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Koelcel A1</span>
          <div className="flex items-center gap-1">
            <Thermometer className="w-2.5 h-2.5 text-sky-400/60" />
            <span className="text-[10px] text-sky-400/80 font-medium">2.1°C</span>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-4 gap-1 mb-2">
          {grid.flat().map((cell, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.4 + i * 0.04, type: 'spring' }}
              className={`aspect-square rounded-md border ${colorMap[cell]} flex items-center justify-center`}
            >
              {cell !== 'empty' && (
                <span className="text-[7px] text-white/40 font-medium">
                  {cell === 'elstar' ? 'E' : cell === 'conf' ? 'C' : 'J'}
                </span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Capacity bar */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500">Capaciteit</span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-orange-500/60 to-amber-400/60"
              initial={{ width: 0 }}
              animate={isInView ? { width: '75%' } : {}}
              transition={{ duration: 0.8, delay: 0.8 }}
            />
          </div>
          <span className="text-[10px] text-orange-400 font-medium">75%</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Team Timer Visual ─── */
function TeamVisual({ isInView }: { isInView: boolean }) {
  return (
    <div className="mt-4">
      <div className="rounded-xl bg-slate-800/30 border border-blue-500/10 p-3">
        {/* Active timer */}
        <div className="flex items-center gap-2 mb-2.5">
          <motion.div
            animate={isInView ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-blue-400"
          />
          <span className="text-[10px] text-blue-400 font-medium">Timer actief</span>
          <span className="text-xs text-slate-200 font-mono ml-auto">02:34:17</span>
        </div>

        {/* Team members */}
        {[
          { name: 'Jan V.', task: 'Spuiten - Elstar', hours: '6:12' },
          { name: 'Pieter K.', task: 'Snoeien - Conf.', hours: '4:45' },
        ].map((m, i) => (
          <motion.div
            key={m.name}
            initial={{ opacity: 0, x: -5 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.5 + i * 0.15 }}
            className="flex items-center gap-2 py-1.5 border-t border-white/[0.03]"
          >
            <div className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
              <span className="text-[8px] text-blue-400 font-medium">{m.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-slate-300 truncate">{m.name}</div>
              <div className="text-[8px] text-slate-600 truncate">{m.task}</div>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">{m.hours}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Inventory Visual ─── */
function InventoryVisual({ isInView }: { isInView: boolean }) {
  const items = [
    { name: 'Merpan', level: 85, color: 'bg-emerald-500/50' },
    { name: 'Delan Pro', level: 32, color: 'bg-amber-500/50' },
    { name: 'Coragen', level: 12, color: 'bg-red-500/50' },
  ];

  return (
    <div className="mt-4">
      <div className="rounded-xl bg-slate-800/30 border border-teal-500/10 p-3 space-y-2">
        {items.map((item, i) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.4 + i * 0.15 }}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-slate-400">{item.name}</span>
              <span className={`text-[9px] font-medium ${item.level < 20 ? 'text-red-400' : item.level < 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {item.level}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${item.color}`}
                initial={{ width: 0 }}
                animate={isInView ? { width: `${item.level}%` } : {}}
                transition={{ duration: 0.8, delay: 0.5 + i * 0.15 }}
              />
            </div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.2 }}
          className="flex items-center gap-1 pt-1"
        >
          <TrendingDown className="w-2.5 h-2.5 text-red-400/60" />
          <span className="text-[8px] text-red-400/60">Coragen bijbestellen</span>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Feature Data ─── */
const features = [
  {
    id: 'weather',
    icon: Cloud,
    title: 'Weather Hub',
    description: '5-model ensemble vergelijking met 48-uurs Expert Forecast, spuitvenster-advies, Delta-T, bladnat-uren en GDD tracking.',
    size: 'large' as const,
    color: 'sky',
    Visual: WeatherVisual,
  },
  {
    id: 'parcels',
    icon: MapPin,
    title: 'Perceelbeheer',
    description: 'Percelen op de kaart met blokindeling, ras, onderstam, plantjaar en RVO-import.',
    size: 'medium' as const,
    color: 'amber',
    Visual: ParcelMapVisual,
  },
  {
    id: 'ctgb',
    icon: Shield,
    title: 'CTGB Validatie',
    description: '6-staps validatie: toelating, dosering, interval, seizoensmax, stofcumulatie en veiligheidstermijn.',
    size: 'medium' as const,
    color: 'emerald',
    Visual: ValidationVisual,
  },
  {
    id: 'research',
    icon: BookOpen,
    title: 'Kennisbank',
    description: '20+ ziekten & plagen encyclopedie met lifecycle-timeline, risiconiveau, seizoensactiviteit en CTGB-aanbevelingen.',
    size: 'large' as const,
    color: 'purple',
    Visual: ResearchVisual,
  },
  {
    id: 'harvest',
    icon: Apple,
    title: 'Harvest Hub',
    description: 'Plukregistratie met kwaliteitsklassen en koelcel-visualisatie. Track kistposities per cel.',
    size: 'small' as const,
    color: 'orange',
    Visual: HarvestVisual,
  },
  {
    id: 'team',
    icon: Users,
    title: 'Uren & Teams',
    description: 'Live timer, urenregistratie per taak, per perceel, per persoon met kostenberekening.',
    size: 'small' as const,
    color: 'blue',
    Visual: TeamVisual,
  },
  {
    id: 'inventory',
    icon: Package,
    title: 'Voorraad',
    description: 'Automatische voorraadverwerking bij bevestigde registraties met alerting.',
    size: 'small' as const,
    color: 'teal',
    Visual: InventoryVisual,
  },
];

/* ─── Color Maps ─── */
const iconColors: Record<string, string> = {
  sky: 'text-sky-400',
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  blue: 'text-blue-400',
  teal: 'text-teal-400',
};

const bgColors: Record<string, string> = {
  sky: 'bg-sky-500/10 border-sky-500/15',
  amber: 'bg-amber-500/10 border-amber-500/15',
  emerald: 'bg-emerald-500/10 border-emerald-500/15',
  purple: 'bg-purple-500/10 border-purple-500/15',
  orange: 'bg-orange-500/10 border-orange-500/15',
  blue: 'bg-blue-500/10 border-blue-500/15',
  teal: 'bg-teal-500/10 border-teal-500/15',
};

const hoverBorders: Record<string, string> = {
  sky: 'hover:border-sky-500/25',
  amber: 'hover:border-amber-500/25',
  emerald: 'hover:border-emerald-500/25',
  purple: 'hover:border-purple-500/25',
  orange: 'hover:border-orange-500/25',
  blue: 'hover:border-blue-500/25',
  teal: 'hover:border-teal-500/25',
};

/* ─── Feature Card ─── */
function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[number];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  const isLarge = feature.size === 'large';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className={isLarge ? 'md:col-span-2' : ''}
    >
      <div
        className={`group relative h-full rounded-2xl bg-slate-900/40 border border-white/[0.06] p-5 sm:p-6 overflow-hidden transition-all duration-500 hover:bg-slate-900/60 ${hoverBorders[feature.color]}`}
      >
        {/* Hover gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Corner accent */}
        <div className={`absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl translate-x-20 -translate-y-20 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500 ${feature.color === 'sky' ? 'bg-sky-400' : feature.color === 'amber' ? 'bg-amber-400' : feature.color === 'emerald' ? 'bg-emerald-400' : feature.color === 'purple' ? 'bg-purple-400' : feature.color === 'orange' ? 'bg-orange-400' : feature.color === 'blue' ? 'bg-blue-400' : 'bg-teal-400'}`} />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${bgColors[feature.color]} group-hover:scale-105 transition-transform duration-300`}
            >
              <feature.icon className={`w-4.5 h-4.5 ${iconColors[feature.color]}`} />
            </div>
            <h3 className="text-base font-semibold text-slate-100 group-hover:text-white transition-colors">
              {feature.title}
            </h3>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>

          {/* Visual */}
          <feature.Visual isInView={isInView} />
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Feature Bento Section ─── */
export function FeatureBento() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="features" className="relative py-24 sm:py-32 px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/[0.05] to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section Header */}
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
            Platform
          </motion.span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white mb-4">
            Alles wat je nodig hebt.{' '}
            <span className="text-slate-400">Niets dat je niet nodig hebt.</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            7 geïntegreerde modules die naadloos samenwerken — van het veld tot het kantoor.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
