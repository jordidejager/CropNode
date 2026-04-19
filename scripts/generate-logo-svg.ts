/**
 * Generate the master SVG for the app icon with procedurally-placed
 * background data-dots. Gaussian distribution centered on the logo
 * so dots are dense behind the branches and sparse toward the edges.
 *
 * Run: npx tsx scripts/generate-logo-svg.ts
 */

import { writeFile } from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'public/logo/cropnode-app-icon.svg');

// Seeded PRNG — deterministic output across runs
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller for gaussian samples
function gaussian(rng: () => number, mean: number, std: number) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

// === Config ===
const SIZE = 1024;
const CENTER = SIZE / 2;
const TOTAL_DOTS = 500;
const GAUSSIAN_STD = 240; // spread — smaller = more concentrated in center
const SEED = 0xc00c0de;

const COLORS = ['#6ee7b7', '#34d399', '#10b981'];

type Dot = { x: number; y: number; r: number; color: string; opacity: number };

function generateDots(): Dot[] {
  const rng = mulberry32(SEED);
  const dots: Dot[] = [];

  for (let i = 0; i < TOTAL_DOTS; i++) {
    // Gaussian around center
    let x = gaussian(rng, CENTER, GAUSSIAN_STD);
    let y = gaussian(rng, CENTER, GAUSSIAN_STD);
    // Keep within canvas
    x = Math.max(8, Math.min(SIZE - 8, x));
    y = Math.max(8, Math.min(SIZE - 8, y));

    // Size distribution — skewed toward tiny
    const sizeRoll = rng();
    let r: number;
    if (sizeRoll < 0.55) r = 0.5 + rng() * 0.6;      // 0.5–1.1 (tiny, 55%)
    else if (sizeRoll < 0.85) r = 1.1 + rng() * 0.9; // 1.1–2.0 (small, 30%)
    else if (sizeRoll < 0.97) r = 2.0 + rng() * 1.2; // 2.0–3.2 (medium, 12%)
    else r = 3.2 + rng() * 1.0;                      // 3.2–4.2 (rare big, 3%)

    // Opacity — lower for tiny dots
    const opacity =
      r < 1.1 ? 0.18 + rng() * 0.17 :       // 0.18–0.35
      r < 2.0 ? 0.25 + rng() * 0.2 :        // 0.25–0.45
      r < 3.2 ? 0.35 + rng() * 0.2 :        // 0.35–0.55
      0.4 + rng() * 0.2;                    // 0.4–0.6

    // Color weighted: mostly emerald, some mint, some light
    const colorRoll = rng();
    const color =
      colorRoll < 0.5 ? '#10b981' :
      colorRoll < 0.85 ? '#34d399' :
      '#6ee7b7';

    dots.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(r * 10) / 10, color, opacity: Math.round(opacity * 100) / 100 });
  }

  // Sort by size asc so big dots render on top
  dots.sort((a, b) => a.r - b.r);
  return dots;
}

function buildSvg(dots: Dot[]): string {
  const dotsMarkup = dots
    .map((d) => `    <circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${d.color}" opacity="${d.opacity}"/>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#0f2318"/>
      <stop offset="55%" stop-color="#081611"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>

    <radialGradient id="glowHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.32"/>
      <stop offset="45%" stop-color="#10b981" stop-opacity="0.10"/>
      <stop offset="75%" stop-color="#10b981" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="lineGradApp" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6ee7b7"/>
      <stop offset="35%" stop-color="#34d399"/>
      <stop offset="70%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>

    <radialGradient id="coreDotApp" cx="35%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#a7f3d0"/>
      <stop offset="45%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#059669"/>
    </radialGradient>

    <filter id="softGlowApp" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Full-bleed background -->
  <rect width="1024" height="1024" fill="url(#bgGrad)"/>

  <!-- Ambient halo -->
  <circle cx="512" cy="512" r="340" fill="url(#glowHalo)"/>

  <!-- Procedurally-placed data dots (${dots.length} total, gaussian around center) -->
  <g>
${dotsMarkup}
  </g>

  <!-- Main logo: branches + subtle central hub -->
  <g transform="translate(176, 176) scale(14)">
    <path d="M 22.0 44.0 L 26.0 4.0
             M 23.2 32.0 L 6.0 24.0
             M 23.8 26.0 L 41.0 18.0
             M 24.6 18.0 L 10.0 11.0
             M 25.2 12.0 L 36.0 7.0"
          stroke="url(#lineGradApp)" stroke-width="2.3" stroke-linecap="round" fill="none"/>

    <path d="M 22.0 44.0 L 26.0 4.0
             M 23.2 32.0 L 6.0 24.0
             M 23.8 26.0 L 41.0 18.0
             M 24.6 18.0 L 10.0 11.0
             M 25.2 12.0 L 36.0 7.0"
          stroke="#d1fae5" stroke-width="0.5" stroke-linecap="round" fill="none" opacity="0.5"/>

    <g filter="url(#softGlowApp)" opacity="0.35">
      <circle cx="22.0" cy="44.0" r="3.5" fill="#10b981"/>
    </g>
    <circle cx="22.0" cy="44.0" r="2.4" fill="url(#coreDotApp)"/>
    <circle cx="21.4" cy="43.4" r="0.6" fill="#ecfdf5" opacity="0.75"/>
  </g>
</svg>
`;
}

async function main() {
  const dots = generateDots();
  const svg = buildSvg(dots);
  await writeFile(OUTPUT, svg);
  console.log(`✓ Wrote ${OUTPUT}`);
  console.log(`  ${dots.length} dots generated (gaussian σ=${GAUSSIAN_STD} around center)`);
  console.log(`  Tiny (<1.1px): ${dots.filter(d => d.r < 1.1).length}`);
  console.log(`  Small (1.1–2.0px): ${dots.filter(d => d.r >= 1.1 && d.r < 2.0).length}`);
  console.log(`  Medium (2.0–3.2px): ${dots.filter(d => d.r >= 2.0 && d.r < 3.2).length}`);
  console.log(`  Big (>=3.2px): ${dots.filter(d => d.r >= 3.2).length}`);
}

main().catch(console.error);
