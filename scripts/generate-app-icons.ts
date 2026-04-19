/**
 * Generate app icons (PNG) from the master SVG.
 *
 * iOS Safari's "Add to Home Screen" requires PNG for apple-touch-icon —
 * SVG is NOT supported and results in the fallback "C" black circle.
 *
 * Generates:
 *   - src/app/apple-icon.png     (180x180) — Next.js App Router convention
 *   - src/app/icon.png           (512x512) — favicon / Android
 *   - public/icon-192.png        (192x192) — PWA manifest
 *   - public/icon-512.png        (512x512) — PWA manifest
 *   - public/logo/cropnode-app-icon-180.png  (180x180) — manual reference
 *   - public/logo/cropnode-app-icon-1024.png (1024x1024) — App Store ready
 *
 * Run: npx tsx scripts/generate-app-icons.ts
 */

import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'public/logo/cropnode-app-icon.svg');

type Target = { out: string; size: number };

const TARGETS: Target[] = [
  { out: 'src/app/apple-icon.png', size: 180 },
  { out: 'src/app/icon.png', size: 512 },
  { out: 'public/icon-192.png', size: 192 },
  { out: 'public/icon-512.png', size: 512 },
  { out: 'public/logo/cropnode-app-icon-180.png', size: 180 },
  { out: 'public/logo/cropnode-app-icon-1024.png', size: 1024 },
];

async function main() {
  const svgBuffer = await readFile(SOURCE);
  console.log(`Source: ${SOURCE} (${svgBuffer.length} bytes)`);

  for (const t of TARGETS) {
    const outPath = path.join(ROOT, t.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    const png = await sharp(svgBuffer)
      .resize(t.size, t.size, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9, quality: 95 })
      .toBuffer();
    await writeFile(outPath, png);
    console.log(`  ✓ ${t.out.padEnd(46)} ${t.size}x${t.size}  (${png.length} bytes)`);
  }
  console.log('\nDone. Restart dev server or redeploy to pick up new icons.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
