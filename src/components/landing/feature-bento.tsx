'use client';

import { useRef, useState, useCallback } from 'react';
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
  BarChart3,
  TrendingUp,
  Euro,
  MessageCircle,
  Phone,
  Check,
  Send,
  FileText,
  Truck,
  Camera,
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
        <svg viewBox="0 0 400 130" className="w-full h-24">
          {/* Grid */}
          {[30, 60, 90, 120].map((y) => (
            <line key={y} x1="24" y1={y} x2="400" y2={y} stroke="rgba(255,255,255,0.03)" />
          ))}
          {/* Y labels */}
          <text x="20" y="34" fill="rgba(148,163,184,0.5)" fontSize="9" textAnchor="end" fontFamily="monospace">20°</text>
          <text x="20" y="64" fill="rgba(148,163,184,0.5)" fontSize="9" textAnchor="end" fontFamily="monospace">15°</text>
          <text x="20" y="94" fill="rgba(148,163,184,0.5)" fontSize="9" textAnchor="end" fontFamily="monospace">10°</text>

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
          <text x="30" y="128" fill="rgba(148,163,184,0.4)" fontSize="9" textAnchor="middle">0h</text>
          <text x="120" y="128" fill="rgba(148,163,184,0.4)" fontSize="9" textAnchor="middle">12h</text>
          <text x="210" y="128" fill="rgba(148,163,184,0.4)" fontSize="9" textAnchor="middle">24h</text>
          <text x="300" y="128" fill="rgba(148,163,184,0.4)" fontSize="9" textAnchor="middle">36h</text>
          <text x="390" y="128" fill="rgba(148,163,184,0.4)" fontSize="9" textAnchor="middle">48h</text>
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
  // Traced from real Dutch orchard aerial — irregular L-shapes, notches, concave edges
  const parcels = [
    // Bottom-left: large L-shaped parcel (biggest — complex concave shape)
    {
      d: 'M14,58 L38,52 L62,48 L80,46 L94,50 L96,62 L88,68 L90,78 L84,88 L70,96 L48,100 L28,102 L14,96 L8,80 Z',
      verts: [[14,58],[38,52],[62,48],[80,46],[94,50],[96,62],[88,68],[90,78],[84,88],[70,96],[48,100],[28,102],[14,96],[8,80]],
      label: 'Rivierzicht', ras: 'Cox Orange', ha: '5,80', cx: 52, cy: 74, selected: true,
    },
    // Center-left: narrow vertical strip 1
    {
      d: 'M118,38 L136,34 L142,46 L146,64 L148,82 L144,96 L132,100 L124,88 L120,68 L116,50 Z',
      label: 'Kerkpad', ras: 'Conference', ha: '2,40', cx: 134, cy: 66,
    },
    // Center: narrow vertical strip 2
    {
      d: 'M150,34 L166,30 L172,40 L176,58 L178,76 L174,88 L162,92 L154,80 L148,58 L146,44 Z',
      label: 'Zandweg', ras: 'Jonagold', ha: '1,80', cx: 163, cy: 60,
    },
    // Center: narrow vertical strip 3 (with notch)
    {
      d: 'M180,28 L194,25 L198,36 L196,48 L200,52 L198,66 L194,78 L186,82 L180,70 L178,52 L176,38 Z',
      label: 'Molenweg', ras: 'Elstar', ha: '1,60', cx: 189, cy: 52,
    },
    // Top-center: medium tilted parcel
    {
      d: 'M202,6 L234,2 L252,6 L258,16 L254,30 L240,36 L218,34 L204,28 L198,18 Z',
      label: 'Hoogveld', ras: 'Boskoop', ha: '3,20', cx: 228, cy: 18,
    },
    // Top-right: large complex L-shaped parcel
    {
      d: 'M268,4 L308,2 L338,6 L354,14 L358,30 L352,42 L336,46 L318,40 L304,36 L292,40 L278,38 L266,28 L262,16 Z',
      verts: [[268,4],[308,2],[338,6],[354,14],[358,30],[352,42],[336,46],[318,40],[304,36],[292,40],[278,38],[266,28],[262,16]],
      label: 'Betuwe Noord', ras: 'Elstar', ha: '5,20', cx: 310, cy: 22,
    },
    // Right: medium irregular parcel
    {
      d: 'M340,48 L366,42 L384,48 L390,62 L386,78 L374,86 L354,84 L338,76 L332,62 Z',
      label: 'De Hoek', ras: 'Conference', ha: '4,80', cx: 362, cy: 64,
    },
    // Bottom-center: wider irregular parcel
    {
      d: 'M200,56 L228,50 L258,52 L272,60 L276,76 L268,90 L244,98 L216,100 L198,92 L192,76 Z',
      label: 'Langgaard', ras: 'Elstar', ha: '3,40', cx: 236, cy: 74,
    },
    // Far bottom-right: small pentagon
    {
      d: 'M348,88 L372,84 L386,90 L388,104 L380,112 L360,114 L344,108 L340,96 Z',
      label: 'Nieuwe Weg', ras: 'Conference', ha: '3,35', cx: 364, cy: 99,
    },
  ];

  return (
    <div className="mt-4">
      <div className="relative rounded-xl border border-amber-500/10 overflow-hidden h-[170px]">
        {/* Composite PDOK Aerial — 2×2 tile grid for wider landscape view */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2" style={{ filter: 'brightness(0.45) saturate(1.3) contrast(1.1)' }}>
          <div className="bg-cover bg-center" style={{ backgroundImage: `url(https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/14/8439/5425.jpeg)` }} />
          <div className="bg-cover bg-center" style={{ backgroundImage: `url(https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/14/8440/5425.jpeg)` }} />
          <div className="bg-cover bg-center" style={{ backgroundImage: `url(https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/14/8439/5426.jpeg)` }} />
          <div className="bg-cover bg-center" style={{ backgroundImage: `url(https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/14/8440/5426.jpeg)` }} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-slate-900/10" />

        <svg viewBox="0 0 390 115" className="relative w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="scanGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(249,115,22,0)" />
              <stop offset="35%" stopColor="rgba(249,115,22,0.25)" />
              <stop offset="50%" stopColor="rgba(249,115,22,0.5)" />
              <stop offset="65%" stopColor="rgba(249,115,22,0.25)" />
              <stop offset="100%" stopColor="rgba(249,115,22,0)" />
            </linearGradient>
          </defs>

          {/* Animated scan line */}
          <motion.rect
            x="0" width="390" height="1.5" rx="0.5"
            fill="url(#scanGrad)"
            initial={{ y: -2 }}
            animate={isInView ? { y: [0, 115] } : {}}
            transition={{ duration: 3.5, delay: 1.6, repeat: Infinity, ease: 'linear', repeatDelay: 1.5 }}
          />

          {parcels.map((p, i) => {
            const sel = 'selected' in p;
            return (
              <g key={i}>
                {/* Outer glow */}
                <motion.path
                  d={p.d}
                  fill={sel ? 'rgba(249,115,22,0.10)' : 'rgba(249,115,22,0.05)'}
                  stroke="rgba(249,115,22,0.18)"
                  strokeWidth={sel ? '7' : '4'}
                  strokeLinejoin="round"
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : {}}
                  transition={{ duration: 0.4, delay: 0.4 + i * 0.08 }}
                />
                {/* Fill + outline */}
                <motion.path
                  d={p.d}
                  fill={sel ? 'rgba(249,115,22,0.22)' : 'rgba(249,115,22,0.14)'}
                  stroke="rgba(249,115,22,0.9)"
                  strokeWidth={sel ? '2' : '1.5'}
                  strokeLinejoin="round"
                  initial={{ opacity: 0, pathLength: 0 }}
                  animate={isInView ? { opacity: 1, pathLength: 1 } : {}}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.08 }}
                />
                {/* Selected: pulsing glow */}
                {sel && (
                  <motion.path
                    d={p.d}
                    fill="none"
                    stroke="rgba(249,115,22,0.4)"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    initial={{ opacity: 0 }}
                    animate={isInView ? { opacity: [0, 0.6, 0], strokeWidth: [2, 4, 2] } : {}}
                    transition={{ duration: 2.5, delay: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                {/* Selected: vertex handles */}
                {sel && p.verts?.map((v, j) => (
                  <motion.circle
                    key={j}
                    cx={v[0]} cy={v[1]} r="1.8"
                    fill="rgba(249,115,22,0.85)"
                    stroke="rgba(255,255,255,0.7)"
                    strokeWidth="0.6"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={isInView ? { scale: 1, opacity: 1 } : {}}
                    transition={{ delay: 0.9 + j * 0.04, type: 'spring', stiffness: 200 }}
                  />
                ))}
                {/* Label */}
                <motion.text
                  x={p.cx} y={p.cy - 1}
                  textAnchor="middle" fontSize="6.5" fill="rgba(255,255,255,0.95)" fontWeight="600"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.6 + i * 0.08 }}
                >
                  {p.label}
                </motion.text>
                <motion.text
                  x={p.cx} y={p.cy + 7}
                  textAnchor="middle" fontSize="5" fill="rgba(249,115,22,0.80)" fontWeight="500"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.7 + i * 0.08 }}
                >
                  {p.ras} · {p.ha} ha
                </motion.text>
              </g>
            );
          })}
        </svg>

        {/* Search bar mock */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.2 }}
          className="absolute top-2 left-2 flex items-center gap-1.5"
        >
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/70 backdrop-blur-sm border border-white/10">
            <MapPin className="w-2.5 h-2.5 text-slate-500" />
            <span className="text-[8px] text-slate-500">Zoek adres of plaats...</span>
          </div>
        </motion.div>

        {/* Zoom controls */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.3 }}
          className="absolute top-2 left-[155px] flex gap-0.5"
        >
          <div className="w-4 h-4 rounded bg-slate-900/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-[8px] text-white/40">+</div>
          <div className="w-4 h-4 rounded bg-slate-900/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-[8px] text-white/40">−</div>
        </motion.div>

        {/* Total area badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 1.1 }}
          className="absolute top-2 right-2 px-2 py-1.5 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-orange-500/20"
        >
          <div className="text-[7px] text-slate-500 uppercase tracking-wider">Totaal</div>
          <span className="text-[11px] text-orange-400 font-bold">31,55 ha</span>
        </motion.div>

        {/* Selected parcel detail popup */}
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ delay: 1.3, type: 'spring', stiffness: 150 }}
          className="absolute bottom-[38px] left-[12px] px-2.5 py-1.5 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-orange-500/25 shadow-lg shadow-orange-500/5"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-orange-400"
              animate={isInView ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[8px] text-orange-300 font-bold">Rivierzicht</span>
          </div>
          <div className="flex items-center gap-3 text-[7px]">
            <div><span className="text-slate-500">Ras</span><div className="text-white/80 font-medium">Cox Orange</div></div>
            <div><span className="text-slate-500">Opp.</span><div className="text-white/80 font-medium">5,80 ha</div></div>
            <div><span className="text-slate-500">Blokken</span><div className="text-white/80 font-medium">A — E</div></div>
          </div>
        </motion.div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.4 }}
          className="absolute bottom-0 inset-x-0 flex items-center justify-between px-3 py-1.5 bg-slate-900/70 backdrop-blur-sm border-t border-white/[0.06]"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm border border-orange-400/60 bg-orange-500/20" />
              <span className="text-[8px] text-slate-400">Mijn percelen</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm border border-blue-400/60 bg-blue-500/20" />
              <span className="text-[8px] text-slate-400">RVO</span>
            </div>
          </div>
          <span className="text-[7px] text-white/20">Luchtfoto © PDOK</span>
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
    { label: 'Spuitinterval', icon: '✓' },
    { label: 'Max. seizoenstoepassingen', icon: '✓' },
    { label: 'Werkzame stof som', icon: '✓' },
    { label: 'Veiligheidstermijn', icon: '✓' },
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
  const cells = [
    { name: 'CEL 5', status: 'active', fill: 269, max: 269, variety: 'Elstar', pct: 100 },
    { name: 'CEL 4', status: 'active', fill: 380, max: 380, variety: 'Conference', pct: 100 },
    { name: 'CEL 3', status: 'cooling', fill: 214, max: 380, variety: 'Jonagold', pct: 56 },
    { name: 'CEL 2', status: 'active', fill: 380, max: 380, variety: 'Conference', pct: 100 },
    { name: 'CEL 1', status: 'active', fill: 269, max: 269, variety: 'Elstar', pct: 100 },
  ];

  const statusCfg: Record<string, { color: string; bg: string; border: string; badge: string; text: string }> = {
    active: { color: 'text-emerald-400', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', text: 'Actief' },
    cooling: { color: 'text-amber-400', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.3)', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25', text: 'Inkoelen' },
  };

  const totalFill = cells.reduce((a, c) => a + c.fill, 0);
  const totalMax = cells.reduce((a, c) => a + c.max, 0);

  return (
    <div className="mt-4">
      <div className="rounded-xl bg-slate-800/30 border border-orange-500/10 p-3">
        {/* Header with stats */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Hoofdlocatie</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-slate-300 font-medium">{cells.length} cellen</span>
              <span className="text-[8px] text-slate-600">•</span>
              <span className="text-[10px] text-emerald-400/80 font-medium">{totalFill}/{totalMax} posities</span>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 1.2, type: 'spring' }}
            className="text-right"
          >
            <div className="text-[8px] text-slate-600">Capaciteit</div>
            <span className="text-[11px] text-white font-bold">{Math.round(totalFill / totalMax * 100)}%</span>
          </motion.div>
        </div>

        {/* Stacked cell layout — like real app */}
        <div className="space-y-1">
          {cells.map((cell, i) => {
            const cfg = statusCfg[cell.status];
            return (
              <motion.div
                key={cell.name}
                initial={{ opacity: 0, x: -10 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.3 + i * 0.1, type: 'spring', stiffness: 120 }}
                className="relative rounded-lg border overflow-hidden"
                style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
              >
                {/* Fill progress background */}
                <motion.div
                  className="absolute inset-y-0 left-0"
                  style={{ backgroundColor: cell.status === 'cooling' ? 'rgba(251,191,36,0.06)' : 'rgba(16,185,129,0.06)' }}
                  initial={{ width: 0 }}
                  animate={isInView ? { width: `${cell.pct}%` } : {}}
                  transition={{ duration: 0.8, delay: 0.5 + i * 0.1 }}
                />
                <div className="relative flex items-center justify-between px-2.5 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white font-bold">{cell.name}</span>
                    <span className={`text-[7px] font-medium px-1 py-0.5 rounded border ${cfg.badge}`}>{cfg.text}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[8px] text-slate-500">{cell.variety}</span>
                    <span className={`text-[10px] font-semibold font-mono ${cfg.color}`}>{cell.fill}/{cell.max}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.5 }}
          className="flex items-center gap-3 mt-2.5 pt-2 border-t border-white/[0.04]"
        >
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[8px] text-slate-500">Actief</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[8px] text-slate-500">Inkoelen</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[8px] text-slate-600">Vulgraad:</span>
            <div className="flex gap-0.5">
              <div className="w-2 h-2 rounded-sm bg-emerald-500/60" />
              <div className="w-2 h-2 rounded-sm bg-emerald-500/35" />
              <div className="w-2 h-2 rounded-sm bg-emerald-500/15" />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Team & Tasks Visual ─── */
function TeamVisual({ isInView }: { isInView: boolean }) {
  const tasks = [
    { task: 'Snoeien', hours: '32,5', parcels: 4, cost: '€1.625', color: 'bg-blue-400' },
    { task: 'Spuiten', hours: '8,0', parcels: 6, cost: '€400', color: 'bg-sky-400' },
    { task: 'Dunnen', hours: '18,5', parcels: 3, cost: '€925', color: 'bg-indigo-400' },
  ];

  return (
    <div className="mt-4">
      <div className="rounded-xl bg-slate-800/30 border border-blue-500/10 p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Takenoverzicht</span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 1.2 }}
            className="text-[10px] text-blue-400/80 font-medium"
          >
            59,0 uur totaal
          </motion.span>
        </div>

        {/* Task rows */}
        <div className="space-y-2">
          {tasks.map((t, i) => (
            <motion.div
              key={t.task}
              initial={{ opacity: 0, x: -8 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.4 + i * 0.15 }}
              className="flex items-center gap-2.5"
            >
              <div className={`w-1.5 h-6 rounded-full ${t.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-200 font-medium">{t.task}</span>
                  <span className="text-[11px] text-white font-semibold font-mono">{t.hours} uur</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[9px] text-slate-500">{t.parcels} percelen</span>
                  <span className="text-[9px] text-slate-500">{t.cost}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Active timer indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1 }}
          className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center gap-2"
        >
          <motion.div
            animate={isInView ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-blue-400"
          />
          <span className="text-[9px] text-blue-400/70">Live timer actief</span>
          <span className="text-[10px] text-slate-300 font-mono ml-auto">02:34:17</span>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Inventory Visual ─── */
function InventoryVisual({ isInView }: { isInView: boolean }) {
  const items = [
    { name: 'Merpan Spuitkorrel', amount: '12.500', unit: 'kg', packaging: '20 × 25 kg', level: 85, color: 'bg-emerald-500/50' },
    { name: 'Delan Pro', amount: '8.750', unit: 'L', packaging: '35 × 5 L', level: 58, color: 'bg-emerald-500/50' },
    { name: 'Coragen', amount: '0,450', unit: 'L', packaging: '3 × 0,15 L', level: 12, color: 'bg-red-500/50' },
  ];

  return (
    <div className="mt-4">
      <div className="rounded-xl bg-slate-800/30 border border-teal-500/10 p-3 space-y-2.5">
        {items.map((item, i) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, x: -5 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.4 + i * 0.15 }}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-slate-300 font-medium">{item.name}</span>
              <span className={`text-[11px] font-bold ${item.level < 20 ? 'text-red-400' : 'text-teal-400'}`}>
                {item.amount} {item.unit}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[8px] text-slate-600">{item.packaging}</span>
              <div className="h-1 w-16 rounded-full bg-slate-800/60 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${item.color}`}
                  initial={{ width: 0 }}
                  animate={isInView ? { width: `${item.level}%` } : {}}
                  transition={{ duration: 0.8, delay: 0.5 + i * 0.15 }}
                />
              </div>
            </div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.2 }}
          className="flex items-center gap-1 pt-1 border-t border-white/[0.04]"
        >
          <TrendingDown className="w-2.5 h-2.5 text-red-400/60" />
          <span className="text-[8px] text-red-400/60">Coragen bijbestellen — voorraad laag</span>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Feature Data ─── */
/* ─── Analytics Visual ─── */
function AnalyticsVisual({ isInView }: { isInView: boolean }) {
  const months = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun'];
  const costs = [320, 580, 890, 1240, 680, 420]; // €/ha
  const maxCost = Math.max(...costs);
  const kpis = [
    { label: 'Inputkosten', value: '€4.130', trend: '+12%', up: true },
    { label: 'Kosten/ha', value: '€89', trend: '-8%', up: false },
    { label: 'Behandelingen', value: '24', trend: '+3', up: true },
  ];

  return (
    <div className="mt-4 space-y-3">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
            className="rounded-lg bg-slate-800/40 border border-white/[0.04] p-2 text-center"
          >
            <div className="text-xs font-bold text-white">{kpi.value}</div>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <TrendingUp className={`w-2 h-2 ${kpi.up ? 'text-emerald-400' : 'text-red-400 rotate-180'}`} />
              <span className={`text-[9px] ${kpi.up ? 'text-emerald-400/70' : 'text-red-400/70'}`}>{kpi.trend}</span>
            </div>
            <div className="text-[8px] text-slate-600 mt-0.5">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="rounded-xl bg-slate-800/40 border border-teal-500/10 p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Euro className="w-3 h-3 text-teal-400/60" />
            <span className="text-[10px] text-teal-400/80 font-medium uppercase tracking-wider">Kostenverdeling</span>
          </div>
          <span className="text-[9px] text-slate-600">Oogst 2026</span>
        </div>

        <div className="flex items-end gap-1.5 h-16">
          {months.map((month, i) => {
            const height = (costs[i] / maxCost) * 100;
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={isInView ? { height: `${height}%` } : {}}
                  transition={{ duration: 0.6, delay: 0.5 + i * 0.08, ease: 'easeOut' }}
                  className="w-full rounded-sm bg-gradient-to-t from-teal-500/40 to-teal-400/20 border border-teal-500/20"
                  style={{ minHeight: 2 }}
                />
                <span className="text-[8px] text-slate-600">{month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ziektedruk mini card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, delay: 1.2 }}
        className="flex items-center gap-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/10 px-2.5 py-1.5"
      >
        <AlertTriangle className="w-3 h-3 text-amber-400/70 shrink-0" />
        <span className="text-[9px] text-amber-400/70">Ziektedruk schurft: <span className="text-amber-300 font-medium">Hoog</span> — 42 infectieperioden dit seizoen</span>
      </motion.div>
    </div>
  );
}

/* ─── WhatsApp Bot Visual ─── */
function WhatsAppVisual({ isInView }: { isInView: boolean }) {
  return (
    <div className="mt-4 space-y-2.5">
      {/* Chat window */}
      <div className="rounded-xl bg-[#0b141a] border border-green-500/10 overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#1f2c34] border-b border-white/[0.05]">
          {/* CropNode leaf logo avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-[#0d1a0d] border border-green-500/25 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <path d="M16 4 C21 4, 28 9, 28 17 C28 24, 22 29, 16 28 C10 27, 4 23, 4 16 C4 9, 10 4, 16 4 Z" stroke="#22c55e" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(34,197,94,0.06)" />
                <path d="M16 6.5 L15.5 26.5" stroke="#22c55e" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
                <path d="M15.5 12 L21.5 15.5" stroke="#22c55e" strokeWidth="0.9" strokeLinecap="round" opacity="0.4" />
                <path d="M15.5 17 L21.5 20" stroke="#22c55e" strokeWidth="0.9" strokeLinecap="round" opacity="0.4" />
                <path d="M15.5 12 L9.5 15.5" stroke="#22c55e" strokeWidth="0.9" strokeLinecap="round" opacity="0.4" />
                <path d="M15.5 17 L9.5 20" stroke="#22c55e" strokeWidth="0.9" strokeLinecap="round" opacity="0.4" />
              </svg>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-[1.5px] border-[#1f2c34]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-white/92 leading-none mb-0.5">CropNode Assistent</p>
            <p className="text-[9px] text-green-400/60">online · Meta WhatsApp</p>
          </div>
          <Phone className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
        </div>

        {/* Messages area */}
        <div className="px-2.5 pt-2.5 pb-1.5 space-y-2 min-h-[200px]">

          {/* User bubble */}
          <motion.div
            initial={{ opacity: 0, x: 18, scale: 0.96 }}
            animate={isInView ? { opacity: 1, x: 0, scale: 1 } : {}}
            transition={{ duration: 0.35, delay: 0.3, ease: 'easeOut' }}
            className="flex justify-end"
          >
            <div className="max-w-[84%] rounded-lg rounded-tr-sm bg-[#005c4b] px-2.5 py-1.5 shadow-sm">
              <p className="text-[10.5px] text-white/90 leading-relaxed">
                Gisteren alle appels met 1,7 syllit flow gespoten
              </p>
              <div className="flex items-center justify-end gap-0.5 mt-0.5">
                <span className="text-[8px] text-white/35">14:32</span>
                <Check className="w-2.5 h-2.5 text-sky-400/70" />
                <Check className="w-2.5 h-2.5 text-sky-400/70 -ml-1.5" />
              </div>
            </div>
          </motion.div>

          {/* Typing indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: [0, 0, 1, 1, 1, 0] } : {}}
            transition={{ duration: 2.4, delay: 0.7, times: [0, 0.04, 0.15, 0.65, 0.82, 1], ease: 'easeInOut' }}
            className="flex justify-start"
          >
            <div className="flex items-center gap-1 px-3 py-2.5 rounded-lg rounded-tl-sm bg-[#1f2c34]">
              {[0, 0.2, 0.4].map((offset, i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-white/35"
                  animate={isInView ? { y: [0, -4, 0] } : {}}
                  transition={{ duration: 0.65, delay: 1.0 + offset, repeat: 3, ease: 'easeInOut' }}
                />
              ))}
            </div>
          </motion.div>

          {/* Bot response bubble */}
          <motion.div
            initial={{ opacity: 0, x: -14, scale: 0.97 }}
            animate={isInView ? { opacity: 1, x: 0, scale: 1 } : {}}
            transition={{ duration: 0.4, delay: 1.9, ease: 'easeOut' }}
            className="flex justify-start"
          >
            <div className="max-w-[93%] rounded-lg rounded-tl-sm bg-[#1f2c34] px-2.5 py-2 border border-white/[0.04]">
              <div className="text-[10px] text-white/80 leading-[1.75] space-y-0.5">
                <div>🌿 <span className="font-semibold text-white/92">Syllit Flow 400 SC</span> <span className="text-green-400/80">(CTGB ✓)</span></div>
                <div><span className="text-white/45">💧 Dosering:</span> <span className="text-white/75">1,7 L/ha</span></div>
                <div className="pt-0.5">📍 <span className="font-semibold text-white/90">Percelen:</span></div>
                <div className="pl-3 text-white/50">· Betuwe Noord (Elstar) — 5,20 ha</div>
                <div className="pl-3 text-white/50">· Zandweg (Jonagold) — 3,80 ha</div>
                <div className="pl-3 text-white/50">· Langgaard (Elstar) — 3,40 ha</div>
                <div className="pt-0.5"><span className="text-white/45">📅 Datum:</span> <span className="text-white/75">28 mrt 2026</span></div>
              </div>
              <span className="text-[8px] text-white/25 block text-right mt-1.5">14:33</span>
            </div>
          </motion.div>

          {/* "Klopt dit?" bubble */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.3, delay: 2.3 }}
            className="flex justify-start"
          >
            <div className="rounded-lg rounded-tl-sm bg-[#1f2c34] px-2.5 py-1.5 border border-white/[0.04]">
              <p className="text-[10px] text-white/85">Klopt dit?</p>
            </div>
          </motion.div>

          {/* Quick reply buttons */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.35, delay: 2.55 }}
            className="flex gap-1.5"
          >
            {[
              { label: '✓ Bevestig', cls: 'bg-green-500/15 border-green-500/25 text-green-400' },
              { label: '🖊 Wijzig', cls: 'bg-white/[0.04] border-white/[0.08] text-white/40' },
              { label: '✗ Annuleer', cls: 'bg-white/[0.04] border-white/[0.08] text-white/40' },
            ].map((btn) => (
              <div key={btn.label} className={`px-2 py-1 rounded text-[9px] font-medium border ${btn.cls}`}>
                {btn.label}
              </div>
            ))}
          </motion.div>
        </div>

        {/* Input bar */}
        <div className="flex items-center gap-2 px-2.5 py-2 bg-[#1f2c34] border-t border-white/[0.04]">
          <div className="flex-1 px-3 py-1.5 rounded-full bg-[#2a3942] text-[10px] text-white/25 truncate">
            Typ een bericht...
          </div>
          <div className="w-7 h-7 rounded-full bg-green-500/70 flex items-center justify-center flex-shrink-0">
            <Send className="w-3 h-3 text-white" />
          </div>
        </div>
      </div>

      {/* Feature pills */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, delay: 1.6 }}
        className="flex flex-wrap gap-1.5"
      >
        {['Registratie via chat', 'Veldnotities', 'CTGB validatie', 'Gratis'].map((label) => (
          <span key={label} className="px-2 py-0.5 rounded-full bg-green-500/[0.08] border border-green-500/15 text-[9px] text-green-400/70">
            {label}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── Veldnotities Visual ─── */
function FieldNotesVisual({ isInView }: { isInView: boolean }) {
  const notes = [
    { text: 'Verdachte schurftplekken op bladeren blok A-C', tag: 'Schimmel', tagColor: 'bg-amber-500/15 text-amber-400 border-amber-500/20', parcel: 'Betuwe Noord', time: '14:22', photo: true, gps: true },
    { text: 'Perenbladvlo waargenomen, lichte aantasting', tag: 'Insect', tagColor: 'bg-red-500/15 text-red-400 border-red-500/20', parcel: 'Kerkpad', time: '11:05', photo: false, gps: true },
  ];

  return (
    <div className="mt-4 space-y-2">
      {notes.map((note, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: 0.3 + i * 0.2, ease: 'easeOut' }}
          className="rounded-xl bg-slate-800/30 border border-lime-500/10 p-3"
        >
          <div className="flex items-start gap-2.5">
            {note.photo && (
              <motion.div
                initial={{ scale: 0 }}
                animate={isInView ? { scale: 1 } : {}}
                transition={{ delay: 0.5 + i * 0.2, type: 'spring' }}
                className="w-10 h-10 rounded-lg bg-lime-500/10 border border-lime-500/15 flex items-center justify-center flex-shrink-0"
              >
                <Camera className="w-4 h-4 text-lime-400/60" />
              </motion.div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-200 leading-relaxed">{note.text}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium border ${note.tagColor}`}>{note.tag}</span>
                <span className="text-[8px] text-slate-500">{note.parcel}</span>
                {note.gps && <MapPin className="w-2.5 h-2.5 text-lime-400/50" />}
                <span className="text-[8px] text-slate-600 ml-auto">{note.time}</span>
              </div>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Task preview */}
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ delay: 0.7 }}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800/20 border border-white/[0.04]"
      >
        <motion.div
          animate={isInView ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-lime-400 flex-shrink-0"
        />
        <span className="text-[9px] text-slate-400">Taak: Dunnen Kerkpad — <span className="text-lime-400/80">15 apr</span></span>
      </motion.div>

      {/* Transfer action */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.9 }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15"
      >
        <Send className="w-3 h-3 text-emerald-400/70" />
        <span className="text-[9px] text-emerald-400/70">Verwerk bespuiting via Slimme Invoer →</span>
      </motion.div>
    </div>
  );
}

/* ─── Afzetstromen Visual ─── */
function SalesVisual({ isInView }: { isInView: boolean }) {
  const sizes = [
    { label: '60-65', pct: 12 },
    { label: '65-70', pct: 28 },
    { label: '70-75', pct: 35 },
    { label: '75-80', pct: 18 },
    { label: '80+', pct: 7 },
  ];

  return (
    <div className="mt-4 space-y-2.5">
      {/* Batch card */}
      <div className="rounded-xl bg-slate-800/30 border border-indigo-500/10 p-3">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <span className="text-[11px] text-slate-200 font-medium">Elstar Klasse I</span>
            <div className="text-[9px] text-slate-500">Van der Berg Fruit · 12.450 kg</div>
          </div>
          <motion.div
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : {}}
            transition={{ delay: 0.6, type: 'spring' }}
            className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold"
          >
            +€9.250
          </motion.div>
        </div>

        {/* Size distribution */}
        <div>
          <span className="text-[8px] text-slate-500 uppercase tracking-wider font-medium">Sorteerverdeling (mm)</span>
          <div className="flex items-end gap-1.5 h-10 mt-1.5">
            {sizes.map((s, i) => (
              <div key={s.label} className="flex-1 flex flex-col items-center gap-0.5">
                <motion.div
                  className="w-full rounded-t-sm bg-gradient-to-t from-indigo-500/40 to-indigo-400/20 border border-indigo-500/20"
                  initial={{ height: 0 }}
                  animate={isInView ? { height: `${(s.pct / 35) * 100}%` } : {}}
                  transition={{ duration: 0.6, delay: 0.8 + i * 0.08, ease: 'easeOut' }}
                  style={{ minHeight: 2 }}
                />
                <span className="text-[7px] text-slate-600">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'Opbrengst', value: '€12.450', cls: 'text-white' },
          { label: 'Kosten', value: '€3.200', cls: 'text-slate-400' },
          { label: 'Marge', value: '74%', cls: 'text-emerald-400' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 6 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.2 + i * 0.1 }}
            className="text-center py-2 rounded-lg bg-slate-800/30 border border-white/[0.04]"
          >
            <div className={`text-[11px] font-bold ${kpi.cls}`}>{kpi.value}</div>
            <div className="text-[8px] text-slate-600 mt-0.5">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Document inbox hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 1.5 }}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-500/[0.05] border border-indigo-500/10"
      >
        <FileText className="w-3 h-3 text-indigo-400/60 flex-shrink-0" />
        <span className="text-[9px] text-indigo-400/60">Inbox: 3 sorteerrapportjes wachten op verwerking</span>
      </motion.div>
    </div>
  );
}

// Order optimized for 3-column grid: Large(2)+Medium(1) per row, no gaps
const features = [
  {
    id: 'whatsapp',
    icon: MessageCircle,
    title: 'CropNode Assistent',
    description: 'Registreer bespuitingen, veldnotities en productinfo direct via WhatsApp. AI herkent middelen en percelen, valideert CTGB, en bevestig met één tap. Gratis via Meta Cloud API.',
    size: 'large' as const,
    color: 'green',
    Visual: WhatsAppVisual,
  },
  {
    id: 'parcels',
    icon: MapPin,
    title: 'Perceelbeheer',
    description: 'Percelen op luchtfoto met blokindeling, ras, onderstam, plantjaar, grondmonsteranalyse en directe RVO-import. 10-secties perceelprofiel.',
    size: 'medium' as const,
    color: 'amber',
    Visual: ParcelMapVisual,
  },
  {
    id: 'weather',
    icon: Cloud,
    title: 'Weather Hub',
    description: '5-model ensemble (GFS, ECMWF, ICON, Harmonie, KNMI) met 48-uurs Expert Forecast, spuitvenster-advies, Delta-T, Buienradar radar en GDD seizoenstracking.',
    size: 'large' as const,
    color: 'sky',
    Visual: WeatherVisual,
  },
  {
    id: 'ctgb',
    icon: Shield,
    title: 'CTGB Validatie',
    description: 'Deterministische 6-staps validatie — geen AI, pure logica. Toelating, dosering, spuitinterval, seizoensmaximum, werkzame stof som en veiligheidstermijn.',
    size: 'medium' as const,
    color: 'emerald',
    Visual: ValidationVisual,
  },
  {
    id: 'research',
    icon: BookOpen,
    title: 'Kennisbank',
    description: '20+ ziekten & plagen encyclopedie met lifecycle, risiconiveau en seizoenskalender. RAG-powered artikelen en wetenschappelijke papers met AI-samenvattingen.',
    size: 'large' as const,
    color: 'purple',
    Visual: ResearchVisual,
  },
  {
    id: 'fieldnotes',
    icon: FileText,
    title: 'Veldnotities',
    description: 'Waarnemingen met foto, GPS-locatie en AI-classificatie. Taken met deadlines en herinneringen. Eén tap om een bespuitingsnotitie door te zetten naar Slimme Invoer.',
    size: 'medium' as const,
    color: 'lime',
    Visual: FieldNotesVisual,
  },
  {
    id: 'harvest',
    icon: Apple,
    title: 'Oogst & Opslag',
    description: 'Plukregistratie met kwaliteitsklassen, visueel koelcelbeheer met kistposities en meerjarige productiegeschiedenis per perceel.',
    size: 'small' as const,
    color: 'orange',
    Visual: HarvestVisual,
  },
  {
    id: 'sales',
    icon: Truck,
    title: 'Afzetstromen',
    description: 'Partijbeheer van pluk tot aflevering. Sorteerverdelingen, kosten-batenanalyse per partij, document-inbox en marge-berekening per koper.',
    size: 'small' as const,
    color: 'indigo',
    Visual: SalesVisual,
  },
  {
    id: 'team',
    icon: Users,
    title: 'Urenregistratie',
    description: 'Live timer met taaktypen, perceelkoppeling, netto werkuren op basis van werkschema en kostenanalyse per activiteit.',
    size: 'small' as const,
    color: 'blue',
    Visual: TeamVisual,
  },
  {
    id: 'inventory',
    icon: Package,
    title: 'Voorraad',
    description: 'Automatische voorraadverwerking na elke bevestigde registratie. Lage-voorraad alerts en verpakkingsoverzicht.',
    size: 'small' as const,
    color: 'teal',
    Visual: InventoryVisual,
  },
  {
    id: 'analytics',
    icon: BarChart3,
    title: 'Analytics & AI Inzichten',
    description: 'Seizoensdashboard, kosten/ha, productietrends, bodemkwaliteit uit grondmonsters, ziektedrukmodellering en AI-correlatie-engine die verbanden vindt in al je bedrijfsdata.',
    size: 'large' as const,
    color: 'cyan',
    Visual: AnalyticsVisual,
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
  cyan: 'text-cyan-400',
  green: 'text-green-400',
  lime: 'text-lime-400',
  indigo: 'text-indigo-400',
};

const bgColors: Record<string, string> = {
  sky: 'bg-sky-500/10 border-sky-500/15',
  amber: 'bg-amber-500/10 border-amber-500/15',
  emerald: 'bg-emerald-500/10 border-emerald-500/15',
  purple: 'bg-purple-500/10 border-purple-500/15',
  orange: 'bg-orange-500/10 border-orange-500/15',
  blue: 'bg-blue-500/10 border-blue-500/15',
  teal: 'bg-teal-500/10 border-teal-500/15',
  cyan: 'bg-cyan-500/10 border-cyan-500/15',
  green: 'bg-green-500/10 border-green-500/15',
  lime: 'bg-lime-500/10 border-lime-500/15',
  indigo: 'bg-indigo-500/10 border-indigo-500/15',
};

const hoverBorders: Record<string, string> = {
  sky: 'hover:border-sky-500/25',
  amber: 'hover:border-amber-500/25',
  emerald: 'hover:border-emerald-500/25',
  purple: 'hover:border-purple-500/25',
  orange: 'hover:border-orange-500/25',
  blue: 'hover:border-blue-500/25',
  teal: 'hover:border-teal-500/25',
  cyan: 'hover:border-cyan-500/25',
  green: 'hover:border-green-500/25',
  lime: 'hover:border-lime-500/25',
  indigo: 'hover:border-indigo-500/25',
};

/* ─── Glow color lookup ─── */
const glowColors: Record<string, string> = {
  sky: 'rgba(56,189,248,0.12)',
  amber: 'rgba(245,158,11,0.12)',
  emerald: 'rgba(16,185,129,0.12)',
  purple: 'rgba(168,85,247,0.12)',
  orange: 'rgba(249,115,22,0.12)',
  blue: 'rgba(96,165,250,0.12)',
  teal: 'rgba(45,212,191,0.12)',
  cyan: 'rgba(34,211,238,0.12)',
  green: 'rgba(74,222,128,0.12)',
  lime: 'rgba(163,230,53,0.12)',
  indigo: 'rgba(129,140,248,0.12)',
};

const glowColorsSolid: Record<string, string> = {
  sky: 'bg-sky-400',
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  purple: 'bg-purple-400',
  orange: 'bg-orange-400',
  blue: 'bg-blue-400',
  teal: 'bg-teal-400',
  cyan: 'bg-cyan-400',
  green: 'bg-green-400',
  lime: 'bg-lime-400',
  indigo: 'bg-indigo-400',
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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const isLarge = feature.size === 'large';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className={isLarge ? 'md:col-span-2' : ''}
    >
      {/* Outer wrapper for gradient border + spotlight */}
      <div
        className="group relative h-full rounded-2xl p-px overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        {/* Animated gradient border — hidden until hover */}
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"
          style={{
            background: `linear-gradient(135deg, ${glowColors[feature.color]}, transparent 40%, transparent 60%, ${glowColors[feature.color]})`,
          }}
        />

        {/* Inner card */}
        <div
          className="relative h-full rounded-2xl bg-[#0a0f1a]/80 border border-white/[0.06] p-5 sm:p-6 overflow-hidden transition-all duration-500 group-hover:border-transparent group-hover:bg-[#0a0f1a]/90"
        >
          {/* Mouse-following spotlight */}
          <div
            className="pointer-events-none absolute inset-0 z-[5] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, ${glowColors[feature.color]}, transparent 40%)`,
            }}
          />

          {/* Top-right glow orb */}
          <div
            className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] translate-x-24 -translate-y-24 opacity-[0.04] group-hover:opacity-[0.10] transition-opacity duration-700 ${glowColorsSolid[feature.color]}`}
          />

          {/* Noise texture overlay */}
          <div className="absolute inset-0 opacity-[0.015] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")' }} />

          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center ${bgColors[feature.color]} group-hover:scale-110 transition-transform duration-300`}
              >
                <feature.icon className={`w-4.5 h-4.5 ${iconColors[feature.color]}`} />
              </div>
              <h3 className="text-base font-semibold text-slate-100 group-hover:text-white transition-colors duration-300">
                {feature.title}
              </h3>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors duration-500">{feature.description}</p>

            {/* Visual */}
            <feature.Visual isInView={isInView} />
          </div>
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
    <section id="features" className="relative py-24 sm:py-36 px-4 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/[0.04] to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-emerald-500/[0.02] blur-[120px]" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 mb-6"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs font-medium tracking-widest uppercase">Platform</span>
          </motion.div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl xl:text-6xl text-white mb-5 tracking-tight">
            Alles wat je nodig hebt.{' '}
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-slate-400 to-slate-500 bg-clip-text text-transparent">Niets dat je niet nodig hebt.</span>
          </h2>
          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
            11 geïntegreerde modules die naadloos samenwerken — van WhatsApp-registratie tot AI-inzichten.
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
