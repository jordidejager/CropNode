'use client';

/**
 * Zone 3 — Categorie Constellatie
 *
 * Orbital picker: 12 category "planets" arranged around a central "all" hub.
 * Each planet size scales with article count. Click to filter the atlas below.
 * Planets float slowly with independent animation loops.
 */

import { motion } from 'framer-motion';
import {
  Biohazard, Bug, Snowflake, TestTubeDiagonal, Scissors, GitFork, Warehouse,
  ShieldCheck, BookOpen, Sparkles, Layers, Droplets, Orbit,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';

import { useCategoryCounts } from '@/hooks/use-knowledge';
import { CATEGORY_CONFIG, CATEGORY_ORDER } from '@/lib/knowledge/ui-tokens';
import type { KnowledgeCategory } from '@/lib/knowledge/types';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, LucideIcon> = {
  Biohazard, Bug, Snowflake, TestTubeDiagonal, Scissors, GitFork, Warehouse,
  ShieldCheck, BookOpen, Sparkles, Layers, Droplets,
};

interface CategoryConstellationProps {
  selected: KnowledgeCategory | null;
  onSelect: (category: KnowledgeCategory | null) => void;
}

export function CategoryConstellation({ selected, onSelect }: CategoryConstellationProps) {
  const { data: counts = {} } = useCategoryCounts();

  const totalArticles = useMemo(
    () => Object.values(counts).reduce((sum, c) => sum + c, 0),
    [counts],
  );

  // Compute planet positions on a circle
  const size = 560;
  const center = size / 2;
  const orbitRadius = 200;

  const planets = useMemo(() => {
    return CATEGORY_ORDER.map((key, i) => {
      const angle = (i / CATEGORY_ORDER.length) * Math.PI * 2 - Math.PI / 2;
      const x = center + orbitRadius * Math.cos(angle);
      const y = center + orbitRadius * Math.sin(angle);
      const count = counts[key] ?? 0;
      const maxCount = Math.max(...Object.values(counts), 1);
      // Planet size scales 52-84 based on count
      const planetSize = 52 + Math.round((count / maxCount) * 32);
      return { key, x, y, count, planetSize, angle };
    });
  }, [counts, center, orbitRadius]);

  return (
    <section className="relative flex flex-col items-center">
      <div className="mb-4 flex flex-col items-center text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/70">
          Verken per categorie
        </p>
        <h2 className="mt-1 text-2xl font-light text-white">Constellatie</h2>
        <p className="mt-1 text-xs text-white/50">
          {totalArticles} artikelen verdeeld over 12 categorieën
        </p>
      </div>

      <div className="relative" style={{ width: size, height: size }}>
        {/* Orbit paths */}
        <svg
          width={size}
          height={size}
          className="absolute inset-0 pointer-events-none"
        >
          <motion.circle
            cx={center}
            cy={center}
            r={orbitRadius}
            stroke="rgba(16,185,129,0.08)"
            strokeWidth={1}
            strokeDasharray="2 8"
            fill="none"
            animate={{ rotate: 360 }}
            transition={{ duration: 240, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: `${center}px ${center}px` }}
          />
          <circle
            cx={center}
            cy={center}
            r={orbitRadius - 40}
            stroke="rgba(16,185,129,0.04)"
            strokeWidth={1}
            fill="none"
          />
        </svg>

        {/* Central "all" hub */}
        <motion.button
          type="button"
          onClick={() => onSelect(null)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'group absolute flex h-28 w-28 flex-col items-center justify-center rounded-full border backdrop-blur-xl transition-all',
            selected === null
              ? 'border-emerald-400/40 bg-emerald-500/10 shadow-[0_0_40px_rgba(16,185,129,0.3)]'
              : 'border-white/10 bg-white/[0.04] hover:border-white/20',
          )}
          style={{
            left: center - 56,
            top: center - 56,
          }}
        >
          <Orbit
            className={cn(
              'h-6 w-6 transition-colors',
              selected === null ? 'text-emerald-300' : 'text-white/60',
            )}
          />
          <span className="mt-1 text-xs font-semibold text-white">Alles</span>
          <span className="font-mono text-[10px] tabular-nums text-white/50">
            {totalArticles}
          </span>
        </motion.button>

        {/* Category planets */}
        {planets.map(({ key, x, y, count, planetSize }, i) => {
          const cfg = CATEGORY_CONFIG[key];
          const Icon = ICON_MAP[cfg.icon] ?? BookOpen;
          const isActive = selected === key;
          const isDimmed = selected !== null && selected !== key;

          return (
            <motion.button
              type="button"
              key={key}
              onClick={() => onSelect(isActive ? null : key)}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: isDimmed ? 0.35 : 1,
                scale: 1,
                x: [0, Math.cos(i) * 4, 0],
                y: [0, Math.sin(i) * 4, 0],
              }}
              transition={{
                opacity: { duration: 0.4 },
                scale: { duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] },
                x: { duration: 6 + i * 0.3, repeat: Infinity, ease: 'easeInOut' },
                y: { duration: 7 + i * 0.3, repeat: Infinity, ease: 'easeInOut' },
              }}
              whileHover={{ scale: 1.1, transition: { duration: 0.2 } }}
              className={cn(
                'group absolute flex flex-col items-center justify-center rounded-full border backdrop-blur-xl transition-all',
                isActive
                  ? 'z-10 border-white/30'
                  : 'border-white/10 hover:border-white/25',
              )}
              style={{
                left: `${x - planetSize / 2}px`,
                top: `${y - planetSize / 2}px`,
                width: `${planetSize}px`,
                height: `${planetSize}px`,
                background: isActive
                  ? `radial-gradient(circle at 30% 30%, ${cfg.hex}40, ${cfg.hex}10)`
                  : `radial-gradient(circle at 30% 30%, ${cfg.hex}20, ${cfg.hex}05)`,
                boxShadow: isActive ? `0 0 32px ${cfg.hex}60` : 'none',
              }}
            >
              <Icon
                className="h-5 w-5 transition-colors"
                style={{ color: isActive ? cfg.hex : 'rgba(255,255,255,0.7)' }}
              />
              <span className="mt-0.5 text-[10px] font-semibold leading-none text-white">
                {cfg.label}
              </span>
              <span className="mt-0.5 font-mono text-[9px] tabular-nums text-white/50">
                {count}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
