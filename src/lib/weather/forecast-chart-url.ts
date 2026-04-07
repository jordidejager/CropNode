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
 * - CropNode emerald (#10b981) primary color
 * - Slate-900 background to match the dark UI
 * - Multiline x-axis labels include wind speed (Beaufort) + compass direction
 * - Title acts as the brand mark; subtitle carries station + 14-daagse label
 */
function buildChartConfig(stationName: string, days: DailyForecastPoint[]) {
  if (days.length === 0) {
    throw new Error('buildForecastChartUrl: days is empty');
  }

  // Multiline labels: ['di 7/4', '4 Bft', 'ZW']
  const labels: string[][] = days.map((d) => [
    dayLabel(d.date),
    `${msToBeaufort(d.windSpeedMs)} Bft`,
    compassFromDeg(d.windDirectionDeg),
  ]);

  const tmin = days.map((d) => Math.round(d.tmin * 10) / 10);
  const tmax = days.map((d) => Math.round(d.tmax * 10) / 10);
  const precip = days.map((d) => Math.round(d.precipMm * 10) / 10);

  // CropNode brand colors
  const EMERALD = '#10b981';
  const EMERALD_SOFT = 'rgba(16, 185, 129, 0.18)';
  const EMERALD_LIGHT = '#34d399';
  const ORANGE = '#fb923c'; // tmax (warm)
  const SKY = '#60a5fa';    // tmin (cool)
  const TEXT_PRIMARY = '#e2e8f0';
  const TEXT_MUTED = '#94a3b8';
  const GRID = 'rgba(148, 163, 184, 0.1)';

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Neerslag (mm)',
          data: precip,
          backgroundColor: EMERALD_SOFT,
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
        padding: { top: 8, right: 28, bottom: 16, left: 16 },
      },
      plugins: {
        title: {
          display: true,
          text: '🌱 CROPNODE',
          color: EMERALD,
          font: { size: 22, weight: 'bold', family: 'sans-serif' },
          align: 'start',
          padding: { top: 10, bottom: 0 },
        },
        subtitle: {
          display: true,
          text: `14-daagse weersverwachting · ${stationName}`,
          color: TEXT_PRIMARY,
          font: { size: 15, weight: 'normal' },
          align: 'start',
          padding: { top: 4, bottom: 18 },
        },
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            color: TEXT_MUTED,
            font: { size: 12 },
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            boxWidth: 8,
            boxHeight: 8,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: TEXT_PRIMARY,
            font: { size: 11 },
            padding: 6,
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
    width: 1100,
    height: 600,
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
