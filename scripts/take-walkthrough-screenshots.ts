/**
 * Takes screenshots of app pages for the Wegwijzer walkthroughs.
 * Uses puppeteer-core with the system Chrome installation.
 *
 * Usage: npx tsx scripts/take-walkthrough-screenshots.ts
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const BASE_URL = 'http://localhost:3005';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface ScreenshotTask {
  url: string;
  output: string;
  /** Optional: wait for a specific selector before taking the screenshot */
  waitFor?: string;
  /** Optional: click a selector before taking the screenshot */
  click?: string;
  /** Optional: delay in ms after page load or click */
  delay?: number;
  /** Optional: type text into a selector */
  type?: { selector: string; text: string };
  /** Optional: scroll to a selector */
  scrollTo?: string;
}

const tasks: ScreenshotTask[] = [
  // === Slimme Invoer ===
  {
    url: '/command-center/smart-input-v2',
    output: 'public/wegwijzer/slimme-invoer/stap-1-open-invoer.webp',
    delay: 2000,
  },
  {
    url: '/command-center/smart-input-v2',
    output: 'public/wegwijzer/slimme-invoer/stap-2-typ-registratie.webp',
    delay: 2000,
    // Focus on the input area
    click: 'textarea, input[type="text"], [contenteditable="true"]',
  },
  {
    url: '/command-center/smart-input-v2',
    output: 'public/wegwijzer/slimme-invoer/stap-3-ai-parsing.webp',
    delay: 2000,
  },
  {
    url: '/command-center/smart-input-v2',
    output: 'public/wegwijzer/slimme-invoer/stap-4-bevestiging.webp',
    delay: 2000,
  },

  // === Perceel toevoegen ===
  {
    url: '/parcels/list',
    output: 'public/wegwijzer/perceel-toevoegen/stap-1-navigeer.webp',
    delay: 2000,
  },
  {
    url: '/parcels/list',
    output: 'public/wegwijzer/perceel-toevoegen/stap-2-perceel-toevoegen.webp',
    delay: 2000,
  },
  {
    url: '/parcels/list',
    output: 'public/wegwijzer/perceel-toevoegen/stap-3-gegevens-invullen.webp',
    delay: 2000,
  },
  {
    url: '/parcels/list',
    output: 'public/wegwijzer/perceel-toevoegen/stap-4-opgeslagen.webp',
    delay: 2000,
  },

  // === Spuitschrift ===
  {
    url: '/crop-care/logs',
    output: 'public/wegwijzer/spuitschrift/stap-1-open-spuitschrift.webp',
    delay: 2000,
  },
  {
    url: '/crop-care/logs',
    output: 'public/wegwijzer/spuitschrift/stap-2-filter.webp',
    delay: 2000,
  },
  {
    url: '/crop-care/logs',
    output: 'public/wegwijzer/spuitschrift/stap-3-details.webp',
    delay: 2000,
  },
];

async function main() {
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // First, navigate to the app to establish any session/cookies
  await page.goto(`${BASE_URL}/wegwijzer`, { waitUntil: 'networkidle2', timeout: 30000 });
  console.log('App loaded successfully');

  for (const task of tasks) {
    try {
      console.log(`Navigating to ${task.url}...`);
      await page.goto(`${BASE_URL}${task.url}`, { waitUntil: 'networkidle2', timeout: 30000 });

      if (task.waitFor) {
        await page.waitForSelector(task.waitFor, { timeout: 10000 });
      }

      if (task.click) {
        try {
          await page.waitForSelector(task.click, { timeout: 5000 });
          await page.click(task.click);
        } catch {
          console.log(`  Could not click ${task.click}, continuing...`);
        }
      }

      if (task.type) {
        try {
          await page.waitForSelector(task.type.selector, { timeout: 5000 });
          await page.type(task.type.selector, task.type.text);
        } catch {
          console.log(`  Could not type into ${task.type.selector}, continuing...`);
        }
      }

      if (task.scrollTo) {
        await page.evaluate((sel) => {
          document.querySelector(sel)?.scrollIntoView({ block: 'center' });
        }, task.scrollTo);
      }

      if (task.delay) {
        await new Promise((r) => setTimeout(r, task.delay));
      }

      // Ensure output directory exists
      mkdirSync(dirname(task.output), { recursive: true });

      // Take screenshot
      await page.screenshot({
        path: task.output,
        type: 'webp',
        quality: 85,
      });

      console.log(`  Saved: ${task.output}`);
    } catch (err) {
      console.error(`  Error for ${task.url}: ${err}`);
    }
  }

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);
