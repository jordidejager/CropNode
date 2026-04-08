/**
 * Forecast Chart URL Builder.
 *
 * Generates a QuickChart.io URL that returns a PNG of a 14-day forecast chart
 * styled to match the CropNode dark/emerald brand. Used by the WhatsApp
 * weather query handler to deliver a visual forecast.
 *
 * Why QuickChart:
 * - No install / no native deps / no rendering setup on Vercel
 * - POST /chart/create returns a short permanent PNG URL that Meta can fetch
 * - Free tier is plenty for our usage
 */

export interface DailyForecastPoint {
  date: string;            // YYYY-MM-DD
  tmin: number;            // °C, model average
  tmax: number;            // °C, model average
  precipMm: number;        // mm/day, model average
  windSpeedMs: number;     // m/s, daily mean
  windDirectionDeg: number;// degrees (0-360), daily circular mean
}

const QUICKCHART_BASE = 'https://quickchart.io/chart';

// CropNode logo as a PNG (weserv.nl converts the SVG hosted on Vercel to PNG).
// Used as an annotation overlay in the chart's top-left corner.
const LOGO_URL =
  'https://images.weserv.nl/?url=cropnode.vercel.app/logo/cropnode-h-mono-white.svg&w=400&output=png';

const DAY_NAMES_NL = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const COMPASS_NL = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];

function dayLabel(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00');
  return `${DAY_NAMES_NL[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function compassFromDeg(deg: number): string {
  // 0=N, 45=NE, ... 315=NW
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return COMPASS_NL[idx];
}

function msToBeaufort(ms: number): number {
  // Standard Beaufort thresholds
  const thresholds = [0.3, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6];
  for (let i = 0; i < thresholds.length; i++) {
    if (ms < thresholds[i]) return i;
  }
  return 12;
}

/**
 * Build a Chart.js v4 config object for a 14-day forecast.
 * Posted to QuickChart's /chart/create endpoint to get a short URL.
 *
 * Branding & style:
 * - CropNode logo (PNG via weserv.nl proxy) overlaid as image annotation
 *   (note: annotation plugin doesn't play well with multiline array labels
 *   on QuickChart, so we use single-line compact labels and rotate them)
 * - Slate-900 background to match the dashboard dark theme
 * - Emerald accent on bars + right Y-axis
 * - X-axis labels: "di 7/4 · 2Bft ZW" — one line per day, rotated 35°
 * - Default legend (no usePointStyle) so colored markers render reliably
 */
function buildChartConfig(stationName: string, days: DailyForecastPoint[]) {
  if (days.length === 0) {
    throw new Error('buildForecastChartUrl: days is empty');
  }

  // Single-line compact labels so the annotation plugin (for the logo) works:
  // "di 7/4 · 2Bft ZW"
  const labels: string[] = days.map(
    (d) =>
      `${dayLabel(d.date)}  ·  ${msToBeaufort(d.windSpeedMs)}Bft ${compassFromDeg(d.windDirectionDeg)}`
  );

  const tmin = days.map((d) => Math.round(d.tmin * 10) / 10);
  const tmax = days.map((d) => Math.round(d.tmax * 10) / 10);
  const precip = days.map((d) => Math.round(d.precipMm * 10) / 10);

  // CropNode brand colors
  const EMERALD = '#10b981';
  const EMERALD_VIVID = 'rgba(16, 185, 129, 0.55)';
  const EMERALD_LIGHT = '#34d399';
  const ORANGE = '#fb923c'; // tmax (warm)
  const SKY = '#60a5fa';    // tmin (cool)
  const TEXT_PRIMARY = '#e2e8f0';
  const TEXT_MUTED = '#94a3b8';
  const GRID = 'rgba(148, 163, 184, 0.1)';

  // Anchor point for the logo annotation. Annotation plugin positions
  // by data coordinates, so we anchor at the first label.
  const firstLabel = labels[0];

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Neerslag (mm)',
          data: precip,
          backgroundColor: EMERALD_VIVID,
          borderColor: EMERALD,
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'yPrecip',
          order: 3,
        },
        {
          type: 'line',
          label: 'Max temp (°C)',
          data: tmax,
          borderColor: ORANGE,
          backgroundColor: ORANGE, // legend fill (since we don't usePointStyle)
          borderWidth: 3,
          pointRadius: 4,
          pointBorderColor: '#0f172a',
          pointBorderWidth: 1.5,
          tension: 0.4,
          fill: false,
          yAxisID: 'yTemp',
          order: 1,
        },
        {
          type: 'line',
          label: 'Min temp (°C)',
          data: tmin,
          borderColor: SKY,
          backgroundColor: SKY, // legend fill
          borderWidth: 3,
          pointRadius: 4,
          pointBorderColor: '#0f172a',
          pointBorderWidth: 1.5,
          tension: 0.4,
          fill: false,
          yAxisID: 'yTemp',
          order: 2,
        },
      ],
    },
    options: {
      responsive: false,
      layout: {
        // Top padding leaves room for the logo overlay
        padding: { top: 70, right: 28, bottom: 16, left: 16 },
      },
      plugins: {
        title: {
          display: true,
          text: `14-daagse weersverwachting · ${stationName}`,
          color: TEXT_PRIMARY,
          font: { size: 16, weight: 'normal', family: 'sans-serif' },
          align: 'start',
          padding: { top: 0, bottom: 18 },
        },
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            color: TEXT_MUTED,
            font: { size: 12 },
            padding: 16,
            boxWidth: 14,
            boxHeight: 14,
          },
        },
        annotation: {
          annotations: {
            cropnodeLogo: {
              type: 'image',
              xValue: firstLabel,
              yValue: 18, // top of yTemp scale (our Y goes ~0-20)
              yScaleID: 'yTemp',
              xAdjust: -20,
              yAdjust: -50,
              src: LOGO_URL,
              width: 180,
              height: 48,
              position: { x: 'start', y: 'center' },
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: TEXT_PRIMARY,
            font: { size: 11 },
            padding: 6,
            maxRotation: 35,
            minRotation: 35,
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
            font: { size: 11 },
          },
          ticks: { color: TEXT_MUTED, font: { size: 11 } },
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
            font: { size: 11 },
          },
          ticks: { color: EMERALD_LIGHT, font: { size: 11 } },
          grid: { display: false },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  };
}

/**
 * Create a short, public chart URL via QuickChart's /chart/create endpoint.
 * Returns a permanent URL like https://quickchart.io/chart/render/zf-abc123
 * which Meta fetches when delivering the WhatsApp image message.
 *
 * QuickChart's free tier is occasionally flaky on larger payloads — we retry
 * once on timeout or non-200 to make the WhatsApp UX more reliable.
 */
export async function createForecastChartUrl(
  stationName: string,
  days: DailyForecastPoint[]
): Promise<string> {
  if (days.length === 0) {
    throw new Error('createForecastChartUrl: days is empty');
  }

  const chart = buildChartConfig(stationName, days);

  const body = {
    chart,
    width: 1200,
    height: 660,
    backgroundColor: '#0f172a', // slate-900 — matches CropNode dark theme
    format: 'png',
    version: '4',
  };

  const MAX_ATTEMPTS = 2;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);

      const response = await fetch(`${QUICKCHART_BASE}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '<no body>');
        throw new Error(`QuickChart create failed (${response.status}): ${errBody}`);
      }

      const data = (await response.json()) as { success?: boolean; url?: string };
      if (!data.success || !data.url) {
        throw new Error(`QuickChart returned unexpected payload: ${JSON.stringify(data)}`);
      }
      return data.url;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[createForecastChartUrl] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastErr.message}`
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw lastErr ?? new Error('createForecastChartUrl: unknown failure');
}
