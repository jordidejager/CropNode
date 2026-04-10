/**
 * Scraper registry — extensible across knowledge sources.
 *
 * Adding a new scraper:
 *   1. Create `lib/knowledge/scrapers/<name>.ts` implementing the Scraper interface
 *   2. Import it here
 *   3. Register a factory in SCRAPER_REGISTRY
 *
 * The pipeline orchestrator looks up scrapers by their internal code ("fc", "wur", etc).
 */

import type { Scraper } from './types';
import { FruitConsultScraper } from './fruitconsult';
import { GroenKennisnetScraper } from './groenkennisnet';
import { WurEdepotScraper } from './wur-edepot';

type ScraperFactory = (knownIds?: Set<string>) => Scraper;

const SCRAPER_REGISTRY: Record<string, ScraperFactory> = {
  fc: (knownIds) => new FruitConsultScraper({ knownIds }),
  gkn: (knownIds) => new GroenKennisnetScraper({ knownIds }),
  'wur-edepot': (knownIds) => new WurEdepotScraper({ knownIds }),
  // Toekomstig:
  // dlv: (knownIds) => new DlvScraper({ knownIds }),
  // ctgb: (knownIds) => new CtgbScraper({ knownIds }),
};

export function getScraper(code: string, knownIds?: Set<string>): Scraper {
  const factory = SCRAPER_REGISTRY[code];
  if (!factory) {
    const available = Object.keys(SCRAPER_REGISTRY).join(', ');
    throw new Error(
      `Onbekende scraper-code: "${code}". Beschikbare bronnen: ${available}`,
    );
  }
  return factory(knownIds);
}

export function listScrapers(): string[] {
  return Object.keys(SCRAPER_REGISTRY);
}

export type { Scraper, ScrapedContent, ScrapeOptions } from './types';
