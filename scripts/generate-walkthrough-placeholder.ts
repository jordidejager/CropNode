/**
 * Placeholder SVG generator for walkthrough screenshots.
 *
 * Usage:
 *   npx tsx scripts/generate-walkthrough-placeholder.ts "Stap titel" "output/path.svg"
 *
 * Or import and use programmatically:
 *   import { generatePlaceholderSVG } from './generate-walkthrough-placeholder';
 *   const svg = generatePlaceholderSVG('Open Slimme Invoer');
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function generatePlaceholderSVG(
  title: string,
  options?: {
    width?: number;
    height?: number;
    subtitle?: string;
  }
): string {
  const width = options?.width ?? 1280;
  const height = options?.height ?? 720;
  const subtitle = options?.subtitle ?? 'Screenshot volgt';

  // Escape XML special characters
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#1e293b"/>
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="16" fill="#0f172a" stroke="#334155" stroke-width="1"/>
  <text x="${width / 2}" y="${height / 2 - 20}" text-anchor="middle" fill="#f1f5f9" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700">${esc(title)}</text>
  <text x="${width / 2}" y="${height / 2 + 24}" text-anchor="middle" fill="#64748b" font-family="system-ui, -apple-system, sans-serif" font-size="18">${esc(subtitle)}</text>
  <circle cx="${width / 2}" cy="${height / 2 + 70}" r="4" fill="#10b981" opacity="0.5"/>
</svg>`;
}

// CLI usage
if (require.main === module) {
  const [, , title, outputPath] = process.argv;

  if (!title || !outputPath) {
    console.log('Usage: npx tsx scripts/generate-walkthrough-placeholder.ts "Title" "path/to/output.svg"');
    process.exit(1);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, generatePlaceholderSVG(title));
  console.log(`Generated: ${outputPath}`);
}
