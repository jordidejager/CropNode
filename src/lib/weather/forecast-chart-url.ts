/**
 * Forecast Chart URL Builder.
 *
 * Generates a QuickChart.io URL that returns a PNG of a 14-day forecast chart.
 * Used by the WhatsApp weather query handler to deliver a visual forecast.
 *
 * Why QuickChart:
 * - No install / no native deps / no rendering setup on Vercel
 * - Returns a public PNG URL that Meta can fetch directly via sendImageMessage
 * - Free tier is plenty for our usage
 *
 * Input: per-day aggregated multi-model forecast data
 * Output: a public chart URL (≤ 4000 chars) usable as { link } for WhatsApp images
 */

export interface DailyForecastPoint {
  date: string;       // YYYY-MM-DD
  tmin: number;       // °C, model average
  tmax: number;       // °C, model average
  precipMm: number;   // mm/day, model average
}

const QUICKCHART_BASE = 'https://quickchart.io/chart';

function dayLabel(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00');
  // "wo 9/4"
  const weekday = d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${weekday} ${day}/${month}`;
}

/**
 * Build a Chart.js v4 config object for a 14-day forecast.
 * Exposed separately so we can POST it to QuickChart's /chart/create endpoint
 * and get back a short URL (the GET-with-embedded-JSON approach risks
 * exceeding practical URL length limits).
 */
function buildChartConfig(stationName: string, days: DailyForecastPoint[]) {
  if (days.length === 0) {
    throw new Error('buildForecastChartUrl: days is empty');
  }

  const labels = days.map(d => dayLabel(d.date));
  const tmin = days.map(d => Math.round(d.tmin * 10) / 10);
  const tmax = days.map(d => Math.round(d.tmax * 10) / 10);
  const precip = days.map(d => Math.round(d.precipMm * 10) / 10);

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Neerslag (mm)',
          data: precip,
          backgroundColor: 'rgba(56, 189, 248, 0.55)', // sky-400
          borderColor: 'rgba(56, 189, 248, 1)',
          borderWidth: 1,
          yAxisID: 'yPrecip',
          order: 3,
        },
        {
          type: 'line',
          label: 'Max temp (°C)',
          data: tmax,
          borderColor: 'rgba(251, 146, 60, 1)', // orange-400
          backgroundColor: 'rgba(251, 146, 60, 0.2)',
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(251, 146, 60, 1)',
          tension: 0.35,
          yAxisID: 'yTemp',
          order: 1,
        },
        {
          type: 'line',
          label: 'Min temp (°C)',
          data: tmin,
          borderColor: 'rgba(96, 165, 250, 1)', // blue-400
          backgroundColor: 'rgba(96, 165, 250, 0.2)',
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(96, 165, 250, 1)',
          tension: 0.35,
          yAxisID: 'yTemp',
          order: 2,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `14-daagse weersverwachting · ${stationName}`,
          color: '#f1f5f9',
          font: { size: 18, weight: 'bold' },
          padding: { top: 12, bottom: 16 },
        },
        legend: {
          position: 'bottom',
          labels: { color: '#cbd5e1', font: { size: 12 } },
        },
      },
      scales: {
        x: {
          ticks: { color: '#cbd5e1', font: { size: 11 } },
          grid: { color: 'rgba(148, 163, 184, 0.12)' },
        },
        yTemp: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Temperatuur (°C)',
            color: '#cbd5e1',
            font: { size: 12 },
          },
          ticks: { color: '#cbd5e1', font: { size: 11 } },
          grid: { color: 'rgba(148, 163, 184, 0.12)' },
        },
        yPrecip: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Neerslag (mm)',
            color: '#cbd5e1',
            font: { size: 12 },
          },
          ticks: { color: '#cbd5e1', font: { size: 11 } },
          grid: { display: false },
          beginAtZero: true,
        },
      },
    },
  };
}

/**
 * Create a short, public chart URL via QuickChart's /chart/create endpoint.
 * Returns a permanent URL like https://quickchart.io/chart/render/sf-abc123
 *
 * We POST the config so we don't hit URL length limits, then hand the
 * resulting short URL to WhatsApp's image API. Meta fetches it once.
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
    width: 900,
    height: 500,
    devicePixelRatio: 2,
    backgroundColor: '#0f172a', // slate-900 — matches app dark theme
    format: 'png',
    version: '4',
  };

  const response = await fetch(`${QUICKCHART_BASE}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`QuickChart create failed (${response.status}): ${errBody}`);
  }

  const data = (await response.json()) as { success?: boolean; url?: string };
  if (!data.success || !data.url) {
    throw new Error(`QuickChart returned unexpected payload: ${JSON.stringify(data)}`);
  }

  return data.url;
}
