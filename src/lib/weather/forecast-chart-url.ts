/**
 * Forecast Chart Image Builder.
 *
 * Generates a CropNode-branded 14-day forecast chart as a PNG:
 *   1. QuickChart.io renders the Chart.js config as a PNG buffer
 *   2. `sharp` composites the CropNode wordmark (from public/logo) on top
 *   3. The final PNG is uploaded to Supabase Storage
 *   4. Returns the public URL so WhatsApp (Meta) can fetch it
 *
 * We moved away from QuickChart's annotation plugin for the logo — it
 * reproducibly stretches SVG path strokes across the whole canvas which
 * looked like a stray diagonal line in the chart.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

export interface DailyForecastPoint {
  date: string;            // YYYY-MM-DD
  tmin: number;            // °C, model average
  tmax: number;            // °C, model average
  precipMm: number;        // mm/day, model average
  windSpeedMs: number;     // m/s, daily mean
  windDirectionDeg: number;// degrees (0-360), daily circular mean
}

const QUICKCHART_URL = 'https://quickchart.io/chart';
const STORAGE_BUCKET = 'field-note-photos'; // reuse existing public bucket

const DAY_NAMES_NL = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const COMPASS_NL = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];

// ============================================================================
// Label helpers
// ============================================================================

function dayLabel(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00');
  return `${DAY_NAMES_NL[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function compassFromDeg(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return COMPASS_NL[idx];
}

function msToBeaufort(ms: number): number {
  const thresholds = [0.3, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6];
  for (let i = 0; i < thresholds.length; i++) {
    if (ms < thresholds[i]) return i;
  }
  return 12;
}

// ============================================================================
// Chart.js config
// ============================================================================

/**
 * Build a modern, CropNode-branded Chart.js v4 config.
 *
 * Branding / visual decisions:
 * - Background: slate-950 (#020617) to match the darkest CropNode panels
 * - Emerald (#10b981) on bars + right axis as the primary accent
 * - Vivid orange / sky lines for tmax / tmin
 * - Multiline x-axis labels: date / Beaufort / compass direction
 *   (no annotation plugin on this chart anymore, so multiline works again)
 * - Big top padding so the composited logo has room to breathe
 */
function buildChartConfig(stationName: string, days: DailyForecastPoint[]) {
  if (days.length === 0) {
    throw new Error('buildChartConfig: days is empty');
  }

  const labels: string[][] = days.map((d) => [
    dayLabel(d.date),
    `${msToBeaufort(d.windSpeedMs)} Bft`,
    compassFromDeg(d.windDirectionDeg),
  ]);

  const tmin = days.map((d) => Math.round(d.tmin * 10) / 10);
  const tmax = days.map((d) => Math.round(d.tmax * 10) / 10);
  const precip = days.map((d) => Math.round(d.precipMm * 10) / 10);

  // Brand colors
  const EMERALD = '#10b981';
  const EMERALD_FILL = 'rgba(16, 185, 129, 0.7)';
  const EMERALD_LIGHT = '#34d399';
  const ORANGE = '#fb923c';
  const SKY = '#60a5fa';
  const TEXT_PRIMARY = '#f1f5f9';
  const TEXT_MUTED = '#94a3b8';
  const GRID = 'rgba(148, 163, 184, 0.08)';

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Neerslag (mm)',
          data: precip,
          backgroundColor: EMERALD_FILL,
          borderColor: EMERALD,
          borderWidth: 1.5,
          borderRadius: 8,
          yAxisID: 'yPrecip',
          order: 3,
        },
        {
          type: 'line',
          label: 'Max temp (°C)',
          data: tmax,
          borderColor: ORANGE,
          backgroundColor: ORANGE,
          borderWidth: 3.5,
          pointRadius: 5,
          pointBorderColor: '#020617',
          pointBorderWidth: 2,
          tension: 0.45,
          fill: false,
          yAxisID: 'yTemp',
          order: 1,
        },
        {
          type: 'line',
          label: 'Min temp (°C)',
          data: tmin,
          borderColor: SKY,
          backgroundColor: SKY,
          borderWidth: 3.5,
          pointRadius: 5,
          pointBorderColor: '#020617',
          pointBorderWidth: 2,
          tension: 0.45,
          fill: false,
          yAxisID: 'yTemp',
          order: 2,
        },
      ],
    },
    options: {
      responsive: false,
      layout: {
        padding: { top: 110, right: 36, bottom: 18, left: 20 },
      },
      plugins: {
        title: {
          display: true,
          text: `14-daagse weersverwachting · ${stationName}`,
          color: TEXT_PRIMARY,
          font: { size: 18, weight: 'normal', family: 'sans-serif' },
          align: 'start',
          padding: { top: 0, bottom: 24 },
        },
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            color: TEXT_MUTED,
            font: { size: 13 },
            padding: 18,
            boxWidth: 16,
            boxHeight: 16,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: TEXT_PRIMARY,
            font: { size: 12 },
            padding: 8,
          },
          grid: { color: GRID, drawTicks: false },
          border: { display: false },
        },
        yTemp: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Temperatuur (°C)',
            color: TEXT_MUTED,
            font: { size: 12 },
          },
          ticks: { color: TEXT_MUTED, font: { size: 12 } },
          grid: { color: GRID },
          border: { display: false },
        },
        yPrecip: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Neerslag (mm)',
            color: EMERALD_LIGHT,
            font: { size: 12 },
          },
          ticks: { color: EMERALD_LIGHT, font: { size: 12 } },
          grid: { display: false },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  };
}

// ============================================================================
// QuickChart → PNG buffer
// ============================================================================

async function fetchChartPng(
  stationName: string,
  days: DailyForecastPoint[]
): Promise<Buffer> {
  const chart = buildChartConfig(stationName, days);

  const body = {
    chart,
    width: 1200,
    height: 700,
    backgroundColor: '#020617', // slate-950
    format: 'png',
    version: '4',
  };

  const MAX_ATTEMPTS = 2;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);

      // POST directly to /chart (not /chart/create) — we want the PNG bytes,
      // not a short URL, so we can composite server-side.
      const response = await fetch(QUICKCHART_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '<no body>');
        throw new Error(`QuickChart render failed (${response.status}): ${errBody}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[fetchChartPng] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastErr.message}`
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastErr ?? new Error('fetchChartPng: unknown failure');
}

// ============================================================================
// Logo compositing
// ============================================================================

let cachedLogoPng: Buffer | null = null;

/**
 * Read the CropNode wordmark SVG from public/logo and rasterize it to PNG
 * at a target width with sharp. Result is cached for the process lifetime.
 */
async function getLogoPng(targetWidth: number): Promise<Buffer> {
  if (cachedLogoPng) return cachedLogoPng;

  // Resolve from the Next.js project root — this works on Vercel because
  // the `public` directory is packaged into the serverless function bundle.
  const logoPath = path.join(process.cwd(), 'public', 'logo', 'cropnode-h-mono-white.svg');
  const svgBuffer = await readFile(logoPath);

  cachedLogoPng = await sharp(svgBuffer, { density: 300 })
    .resize({ width: targetWidth })
    .png()
    .toBuffer();

  return cachedLogoPng;
}

/**
 * Composite the CropNode logo on top of the chart PNG in the top-left corner.
 */
async function overlayLogo(chartPng: Buffer): Promise<Buffer> {
  const LOGO_WIDTH = 260;
  const LOGO_OFFSET_LEFT = 36;
  const LOGO_OFFSET_TOP = 34;

  const logoPng = await getLogoPng(LOGO_WIDTH);

  return sharp(chartPng)
    .composite([
      {
        input: logoPng,
        top: LOGO_OFFSET_TOP,
        left: LOGO_OFFSET_LEFT,
      },
    ])
    .png()
    .toBuffer();
}

// ============================================================================
// Supabase upload
// ============================================================================

async function uploadToSupabase(png: Buffer, stationId: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase configuratie ontbreekt voor chart upload');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Path: weather-charts/<stationId>/<timestamp>.png
  const path = `weather-charts/${stationId}/${Date.now()}.png`;

  const { error } = await admin.storage.from(STORAGE_BUCKET).upload(path, png, {
    contentType: 'image/png',
    upsert: false,
  });

  if (error) {
    throw new Error(`Chart upload mislukt: ${error.message}`);
  }

  const { data: urlData } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build the full branded 14-day forecast chart and return a public URL that
 * Meta can fetch when delivering the WhatsApp image message.
 */
export async function createForecastChartUrl(
  stationName: string,
  stationId: string,
  days: DailyForecastPoint[]
): Promise<string> {
  if (days.length === 0) {
    throw new Error('createForecastChartUrl: days is empty');
  }

  const chartPng = await fetchChartPng(stationName, days);
  const composited = await overlayLogo(chartPng);
  return uploadToSupabase(composited, stationId);
}
