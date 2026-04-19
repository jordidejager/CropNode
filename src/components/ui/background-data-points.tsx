'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface BackgroundDataPointsProps {
  /** Aantal dots (default: 60) */
  count?: number;
  /** CSS class voor positionering (default: fixed fullscreen) */
  className?: string;
  /** Seed voor deterministic placement (voorkomt hydration mismatch) */
  seed?: number;
}

// Simple deterministic PRNG (mulberry32)
function makeRandom(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Subtiele ambient achtergrond met data-dots.
 * - Kleine groene dots random geplaatst over het scherm
 * - Elk dot pulseert zachtjes op zijn eigen tempo
 * - Een grote radial glow-puls loopt langzaam over de achtergrond
 *   en licht de dots die hij passeert extra op
 *
 * Bedoeld als ambient laag — pointer-events-none, z-index 0, non-intrusief.
 */
export function BackgroundDataPoints({
  count = 60,
  className = 'fixed inset-0 pointer-events-none overflow-hidden',
  seed = 42,
}: BackgroundDataPointsProps) {
  // Generate dots with deterministic positions (avoids SSR hydration mismatch)
  const dots = useMemo(() => {
    const rand = makeRandom(seed);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: rand() * 100, // percentage across viewport
      y: rand() * 100,
      size: 0.8 + rand() * 2.2, // 0.8 – 3 px radius
      baseOpacity: 0.15 + rand() * 0.35, // 0.15 – 0.5
      pulseDuration: 2.5 + rand() * 3, // 2.5 – 5.5s
      pulseDelay: rand() * 4,
      hue: rand() > 0.6 ? '#6ee7b7' : '#10b981', // mostly emerald, some lighter
    }));
  }, [count, seed]);

  // Container size — for travelling glow coordinates
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const updateSize = () => {
      setSize({ w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return (
    <div ref={containerRef} className={className} aria-hidden>
      {/* Travelling glow — a large soft circle that drifts diagonally */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: Math.max(size.w, size.h) * 0.55,
          height: Math.max(size.w, size.h) * 0.55,
          background:
            'radial-gradient(circle, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.04) 40%, transparent 70%)',
          filter: 'blur(20px)',
          left: '-20%',
          top: '-20%',
        }}
        animate={{
          x: [0, size.w * 0.7, size.w * 0.3, size.w * 0.9, 0],
          y: [0, size.h * 0.5, size.h * 0.9, size.h * 0.2, 0],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Second slower, softer glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: Math.max(size.w, size.h) * 0.45,
          height: Math.max(size.w, size.h) * 0.45,
          background:
            'radial-gradient(circle, rgba(52,211,153,0.08) 0%, rgba(52,211,153,0.02) 50%, transparent 70%)',
          filter: 'blur(30px)',
          right: '-15%',
          bottom: '-15%',
        }}
        animate={{
          x: [0, -size.w * 0.5, -size.w * 0.2, -size.w * 0.7, 0],
          y: [0, -size.h * 0.6, -size.h * 0.3, -size.h * 0.8, 0],
        }}
        transition={{
          duration: 36,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Data dots */}
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        style={{ pointerEvents: 'none' }}
      >
        {dots.map((d) => (
          <motion.circle
            key={d.id}
            cx={`${d.x}%`}
            cy={`${d.y}%`}
            r={d.size}
            fill={d.hue}
            initial={{ opacity: d.baseOpacity }}
            animate={{
              opacity: [
                d.baseOpacity * 0.4,
                d.baseOpacity,
                d.baseOpacity * 0.4,
              ],
              scale: [0.85, 1.15, 0.85],
            }}
            transition={{
              duration: d.pulseDuration,
              delay: d.pulseDelay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              transformOrigin: `${d.x}% ${d.y}%`,
              filter: 'drop-shadow(0 0 3px rgba(16,185,129,0.4))',
            }}
          />
        ))}
      </svg>
    </div>
  );
}
