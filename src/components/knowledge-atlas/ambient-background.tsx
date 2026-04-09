'use client';

/**
 * Ambient Background — the cinematic backdrop for the Knowledge Atlas.
 *
 * Three elements:
 *   1. Animated gradient mesh — three colored blobs that float slowly
 *   2. SVG grain overlay — subtle noise texture for depth
 *   3. Optional floating particles — bloesem / bladeren / sneeuw afhankelijk van seizoen
 *
 * The color of the gradient blobs shifts based on the current phenological phase:
 * winter = cool blues, bloei = pink/emerald, zomer = emerald/amber, herfst = amber/rust.
 */

import { motion } from 'framer-motion';
import { useMemo } from 'react';

import { getPhaseForMonth, PHENOLOGICAL_PHASES } from '@/lib/knowledge/ui-tokens';

interface SeasonalPalette {
  blobs: [string, string, string];
  particleType: 'sneeuw' | 'bloesem' | 'blad' | 'stof';
  particleColor: string;
}

function getSeasonalPalette(month: number): SeasonalPalette {
  if (month === 12 || month <= 2) {
    return {
      blobs: ['#1e3a8a', '#0c4a6e', '#0f172a'],
      particleType: 'sneeuw',
      particleColor: '#e0f2fe',
    };
  }
  if (month === 3) {
    return {
      blobs: ['#065f46', '#1e40af', '#0f172a'],
      particleType: 'stof',
      particleColor: '#6ee7b7',
    };
  }
  if (month === 4 || month === 5) {
    return {
      blobs: ['#9d174d', '#065f46', '#1e1b4b'],
      particleType: 'bloesem',
      particleColor: '#fbcfe8',
    };
  }
  if (month >= 6 && month <= 8) {
    return {
      blobs: ['#065f46', '#854d0e', '#0f172a'],
      particleType: 'stof',
      particleColor: '#34d399',
    };
  }
  if (month === 9 || month === 10) {
    return {
      blobs: ['#854d0e', '#7c2d12', '#0f172a'],
      particleType: 'blad',
      particleColor: '#fb923c',
    };
  }
  // Nov
  return {
    blobs: ['#78350f', '#134e4a', '#0f172a'],
    particleType: 'blad',
    particleColor: '#d97706',
  };
}

export function AmbientBackground({ month }: { month?: number }) {
  const currentMonth = month ?? new Date().getUTCMonth() + 1;
  const palette = useMemo(() => getSeasonalPalette(currentMonth), [currentMonth]);

  // Fixed seed so particles have a stable but varied distribution
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: (i * 37) % 100,
        delay: (i * 0.7) % 12,
        duration: 20 + (i % 7) * 3,
        size: 2 + ((i * 3) % 5),
        opacity: 0.12 + ((i % 4) * 0.08),
      })),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050918]">
      {/* Gradient mesh — three floating blobs */}
      <motion.div
        aria-hidden
        className="absolute -top-40 -left-40 h-[640px] w-[640px] rounded-full opacity-40 blur-[140px]"
        style={{ backgroundColor: palette.blobs[0] }}
        animate={{
          x: [0, 80, -40, 0],
          y: [0, 50, 100, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        aria-hidden
        className="absolute top-1/3 right-[-10%] h-[560px] w-[560px] rounded-full opacity-35 blur-[140px]"
        style={{ backgroundColor: palette.blobs[1] }}
        animate={{
          x: [0, -60, 40, 0],
          y: [0, 80, -40, 0],
          scale: [1, 0.9, 1.15, 1],
        }}
        transition={{
          duration: 34,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-[-20%] left-1/3 h-[700px] w-[700px] rounded-full opacity-30 blur-[160px]"
        style={{ backgroundColor: palette.blobs[2] }}
        animate={{
          x: [0, 40, -60, 0],
          y: [0, -40, 60, 0],
          scale: [1, 1.05, 0.95, 1],
        }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: '-10px',
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: palette.particleColor,
              opacity: p.opacity,
              filter: 'blur(0.5px)',
            }}
            animate={{
              y: ['0vh', '110vh'],
              x: [0, (p.id % 2 === 0 ? 40 : -40)],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}
      </div>

      {/* SVG grain overlay */}
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full opacity-[0.04] mix-blend-overlay"
      >
        <filter id="atlas-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#atlas-grain)" />
      </svg>

      {/* Vignette */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(5,9,24,0.7) 100%)',
        }}
      />
    </div>
  );
}

// Export palette helper for downstream consumers who need the same seasonal color
export { getSeasonalPalette };
