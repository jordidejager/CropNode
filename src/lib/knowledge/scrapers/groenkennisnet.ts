/**
 * Groen Kennisnet Scraper — Confluence REST API
 *
 * Scrapes the WUR Groen Kennisnet wiki (Beeldenbank gewasbescherming)
 * for structured disease/pest knowledge relevant to fruit cultivation.
 *
 * This is a PUBLIC source (WUR) → is_public_source: true, with bronvermelding.
 *
 * API: Confluence Cloud REST at wiki-groenkennisnet.atlassian.net
 * Space: BEEL (Beeldenbank)
 */

import * as cheerio from 'cheerio';
import type { Scraper, ScrapedContent, ScrapeOptions } from './types';

const CONFLUENCE_BASE = 'https://wiki-groenkennisnet.atlassian.net/wiki';
const SPACE_KEY = 'BEEL';
const LIST_URL = `https://wiki.groenkennisnet.nl/rest/api/space/${SPACE_KEY}/content/page`;
const CONTENT_URL = `${CONFLUENCE_BASE}/rest/api/content`;
const RATE_LIMIT_MS = 1500;

const USER_AGENT =
  'CropNode-KennisBot/1.0 (Agricultural Knowledge Platform; contact: info@cropnode.nl)';

/**
 * Fruit-relevant keywords for filtering the BEEL space.
 * Only pages whose title matches at least one keyword are scraped.
 */
const FRUIT_TITLE_KEYWORDS = [
  'appel', 'peer', 'pruim', 'kers', 'fruit',
  'schurft', 'meeldauw', 'monilia', 'stemphylium', 'bacterievuur',
  'vruchtrot', 'vruchtboom', 'zwartvrucht', 'gloeosporium', 'lenticelrot',
  'fruitmot', 'bladvlo', 'bloedluis', 'bloesemkever', 'zaagwesp',
  'spint', 'wants', 'bladroller', 'cicade', 'roestmijt',
  'appelglas', 'appelgras', 'appelhoekmijn', 'appelvouw', 'appelbladmin',
  'perenknop', 'roofwants', 'suzuki', 'kersenvlieg', 'pruimenmot',
  'pruimenzaag', 'pruimenschors',
];

/**
 * Exclude pages about non-fruit crops that happen to match keywords
 */
const EXCLUDE_KEYWORDS = [
  'aardappel', 'tomaat', 'glastuinbouw', 'buxus', 'gladiool',
  'tabaksratel', 'doornappel', 'aardbei', 'toprol', 'tobr',
  'mais', 'zantedeschia', 'hyacint', 'lelie', 'tulp',
  'peen', 'slakvormig', 'sparappel', 'destructora', 'stengel',
  'vrijlevend', 'sclerotien',
  // Skip overzichtspagina's
  'examenlijst', 'fruitteelt', 'houtig klein fruit', 'overige fruitsoorten',
  // Skip niet-hardfruit gewas-specifieke pagina's
  'valse meeldauw', 'kleine veldkers', 'akkerkers', 'koolbladroller',
  'eikenbladroller', 'zilverschurft', 'dahlia', 'bromelia', 'snijbonen',
  'speerdistel', 'pruimenmot', 'pruimenzaagwesp', 'pruimenschorsmijt',
  'pruimensharka', 'loodglans', 'melige pruimenluis', 'komkommer',
  'kool', 'roos', 'sla', 'ui', 'aardappel', 'tulp', 'lelie', 'tomaat',
  'chrysant', 'gerbera', 'aster', 'cyclaam',
];

interface WikiPage {
  id: string;
  title: string;
}

export class GroenKennisnetScraper implements Scraper {
  readonly code = 'gkn';
  readonly name = 'Groen Kennisnet (WUR Beeldenbank)';

  private knownIds: Set<string>;

  constructor(options: { knownIds?: Set<string> } = {}) {
    this.knownIds = options.knownIds ?? new Set();
  }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedContent[]> {
    // 1. List all pages in the BEEL space
    console.log('[gkn] Ophalen paginalijst...');
    const allPages = await this.fetchAllPages();
    console.log(`[gkn] ${allPages.length} paginas in BEEL space`);

    // 2. Filter for fruit-relevant pages
    const fruitPages = allPages.filter((p) => {
      const lower = p.title.toLowerCase();
      const isRelevant = FRUIT_TITLE_KEYWORDS.some((kw) => lower.includes(kw));
      const isExcluded = EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw));
      return isRelevant && !isExcluded;
    });
    console.log(`[gkn] ${fruitPages.length} fruit-relevant paginas`);

    // 3. Filter out already-known IDs
    let newPages = options.fullRescan
      ? fruitPages
      : fruitPages.filter((p) => !this.knownIds.has(`gkn-${p.id}`));

    if (options.limit && newPages.length > options.limit) {
      newPages = newPages.slice(0, options.limit);
    }
    console.log(`[gkn] ${newPages.length} nieuwe paginas te scrapen`);

    // 4. Fetch content for each page
    const results: ScrapedContent[] = [];
    for (const [i, page] of newPages.entries()) {
      console.log(`[gkn] ${i + 1}/${newPages.length}: ${page.title}`);
      try {
        const text = await this.fetchPageContent(page.id);
        if (!text || text.length < 50) {
          console.warn(`[gkn]   → te weinig content, skip`);
          continue;
        }

        // Fetch attachment images (disease/pest photos)
        let imageUrls: string[] = [];
        try {
          imageUrls = await this.fetchAttachmentImageUrls(page.id);
        } catch {
          // Non-fatal — images are a bonus
        }

        results.push({
          rawText: text,
          scrapedAt: new Date(),
          sourceType: 'research',
          internalSourceCode: this.code,
          sourceIdentifier: `gkn-${page.id}`,
          metadata: {
            title: page.title,
            date: new Date().toISOString().slice(0, 10),
            topics: [this.inferCategory(page.title)].filter(Boolean),
            // PUBLIC source — bronvermelding toegestaan
            isPublicSource: true,
            publicSourceRef: `WUR Groen Kennisnet — ${page.title}`,
            pageId: page.id,
            imageUrls,
            imageCount: imageUrls.length,
          },
        });

        await this.wait();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[gkn]   ❌ ${msg}`);
      }
    }

    console.log(`[gkn] ${results.length} paginas succesvol gescraped`);
    return results;
  }

  // ============================================
  // Page listing (via proxy domain — allows pagination)
  // ============================================

  private async fetchAllPages(): Promise<WikiPage[]> {
    const all: WikiPage[] = [];
    let url = `${LIST_URL}?limit=250`;

    while (url) {
      const res = await this.fetchJson(url);
      // The response structure varies: results can be top-level or under .page
      const pages = res.results ?? res.page?.results ?? [];
      for (const p of pages) {
        all.push({ id: p.id, title: p.title });
      }
      const nextLink = res._links?.next ?? res.page?._links?.next ?? '';
      url = nextLink ? `https://wiki.groenkennisnet.nl${nextLink}` : '';
      if (url) await this.wait();
    }

    return all;
  }

  // ============================================
  // Content fetching (via Atlassian domain — returns body.view)
  // ============================================

  private async fetchPageContent(pageId: string): Promise<string> {
    const url = `${CONTENT_URL}/${pageId}?expand=body.view`;
    const data = await this.fetchJson(url);
    const bodyHtml = data?.body?.view?.value ?? '';
    if (!bodyHtml) return '';

    // Parse HTML → clean text
    const $ = cheerio.load(bodyHtml);
    $('script, style, .confluence-information-macro').remove();

    // Extract text, preserving some structure
    const text = $.root().text();
    return this.cleanText(text);
  }

  private cleanText(text: string): string {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Drop consecutive duplicates
    const cleaned: string[] = [];
    let prev = '';
    for (const line of lines) {
      if (line !== prev) cleaned.push(line);
      prev = line;
    }
    return cleaned.join('\n');
  }

  // ============================================
  // Category inference from title
  // ============================================

  private inferCategory(title: string): string {
    const lower = title.toLowerCase();
    const diseaseKw = ['schurft', 'meeldauw', 'monilia', 'stemphylium', 'vruchtrot',
      'kanker', 'bacterievuur', 'zwartvrucht', 'gloeosporium', 'lenticelrot', 'roest'];
    const pestKw = ['mot', 'vlieg', 'luis', 'bladvlo', 'spint', 'wants', 'kever',
      'zaagwesp', 'roller', 'cicade', 'mijt', 'mineermot', 'schildluis', 'trips'];

    if (diseaseKw.some((kw) => lower.includes(kw))) return 'ziekte';
    if (pestKw.some((kw) => lower.includes(kw))) return 'plaag';
    return 'algemeen';
  }

  // ============================================
  // Attachment images (disease/pest photos from WUR)
  // ============================================

  private async fetchAttachmentImageUrls(pageId: string): Promise<string[]> {
    const url = `${CONTENT_URL}/${pageId}/child/attachment?limit=20`;
    const data = await this.fetchJson(url);
    const results = data?.results ?? [];

    const imageUrls: string[] = [];
    for (const att of results) {
      const mediaType = att?.metadata?.mediaType ?? '';
      if (!mediaType.startsWith('image/')) continue;

      const downloadPath = att?._links?.download ?? '';
      if (!downloadPath) continue;

      // Build full URL
      const fullUrl = `${CONFLUENCE_BASE}${downloadPath}`;
      imageUrls.push(fullUrl);
    }

    return imageUrls;
  }

  // ============================================
  // HTTP helpers
  // ============================================

  private async wait(): Promise<void> {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  private async fetchJson(url: string, retries = 8): Promise<any> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
          },
        });
        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && attempt < retries) {
            const wait = 3000 * attempt;
            console.warn(`[gkn] HTTP ${res.status}, retry ${attempt}/${retries} in ${wait}ms`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          throw new Error(`HTTP ${res.status} for ${url.slice(0, 80)}`);
        }
        return await res.json();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = /fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|socket hang up/i.test(msg);
        if (attempt < retries && isTransient) {
          const wait = 2000 * attempt;
          console.warn(`[gkn] Transient (${attempt}/${retries}): ${msg.slice(0, 50)}. Retry in ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }
}
