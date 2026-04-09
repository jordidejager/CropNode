/**
 * Re-export of Scraper interface from the parent types module.
 *
 * This file exists so scraper implementations can `import { Scraper, ScrapedContent }
 * from './types'` without reaching into the parent directory, keeping the
 * scrapers/ folder a self-contained module.
 */

export type { Scraper, ScrapedContent, ScrapeOptions, ScrapeType } from '../types';
