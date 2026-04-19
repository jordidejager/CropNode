/**
 * Deterministic data-dot generator shared between:
 * - Static app icon SVG (scripts/generate-logo-svg.ts, 1024×1024)
 * - Animated React logo (components/ui/animated-logo.tsx, 48×48)
 *
 * Same algorithm → same visual distribution, just scaled.
 */

export interface Dot {
  x: number;       // position (viewBox units)
  y: number;
  r: number;       // radius (viewBox units)
  color: string;   // emerald/mint variants
  opacity: number;
  twinkleDelay: number;   // seconds
  twinkleDuration: number;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, std: number) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

export interface GenerateDotsOptions {
  count: number;
  size: number;         // canvas size (square)
  std: number;          // gaussian spread (smaller = more centered)
  seed: number;
  minRadius: number;    // radius scale min
  maxRadius: number;    // radius scale max
}

export function generateDots(opts: GenerateDotsOptions): Dot[] {
  const { count, size, std, seed, minRadius, maxRadius } = opts;
  const rng = mulberry32(seed);
  const dots: Dot[] = [];
  const center = size / 2;

  for (let i = 0; i < count; i++) {
    let x = gaussian(rng, center, std);
    let y = gaussian(rng, center, std);
    x = Math.max(minRadius, Math.min(size - minRadius, x));
    y = Math.max(minRadius, Math.min(size - minRadius, y));

    // Radius distribution: skewed toward small
    const rRange = maxRadius - minRadius;
    const sizeRoll = rng();
    let r: number;
    if (sizeRoll < 0.55)      r = minRadius + rRange * (0.00 + rng() * 0.20);  // tiny
    else if (sizeRoll < 0.85) r = minRadius + rRange * (0.20 + rng() * 0.25);  // small
    else if (sizeRoll < 0.97) r = minRadius + rRange * (0.45 + rng() * 0.30);  // medium
    else                      r = minRadius + rRange * (0.75 + rng() * 0.25);  // big (rare)

    // Opacity — lower for tiny, higher for big
    const opacity =
      r < minRadius + rRange * 0.2 ? 0.18 + rng() * 0.17 :
      r < minRadius + rRange * 0.45 ? 0.25 + rng() * 0.20 :
      r < minRadius + rRange * 0.75 ? 0.35 + rng() * 0.20 :
      0.40 + rng() * 0.20;

    // Color — weighted mostly emerald
    const colorRoll = rng();
    const color =
      colorRoll < 0.50 ? '#10b981' :
      colorRoll < 0.85 ? '#34d399' :
      '#6ee7b7';

    dots.push({
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      r: Math.round(r * 100) / 100,
      color,
      opacity: Math.round(opacity * 100) / 100,
      twinkleDelay: Math.round(rng() * 8 * 10) / 10,
      twinkleDuration: Math.round((3 + rng() * 4) * 10) / 10,
    });
  }

  // Render biggest last (on top)
  dots.sort((a, b) => a.r - b.r);
  return dots;
}

// Default seed used across the project so static icon and animated version match
export const LOGO_DOTS_SEED = 0xc00c0de;
