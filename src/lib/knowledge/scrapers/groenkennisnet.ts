/**
 * Groen Kennisnet Scraper — Confluence REST API
 *
 * Scrapes the WUR Groen Kennisnet wiki (Beeldenbank gewasbescherming —
 * beeldenbankgewasbescherming.nl) for structured disease/pest knowledge.
 *
 * The Beeldenbank-website is a Refined-Sites frontend bovenop deze
 * Atlassian Confluence (BEEL space). De /space/BEEL2/<id>/Peer en /Appel
 * indexen worden opgebouwd uit `contentbylabel`-macros met label="peer"
 * resp. "appel". We doen exact hetzelfde via CQL — 100% trefzeker en
 * geen onderhoud meer aan title-keyword lijsten.
 *
 * Dit is een PUBLIEKE bron (WUR) → is_public_source: true, met bronvermelding.
 *
 * API: Confluence Cloud REST at wiki-groenkennisnet.atlassian.net
 * Space: BEEL (Beeldenbank)
 */

import * as cheerio from 'cheerio';
import type { Scraper, ScrapedContent, ScrapeOptions } from './types';

const CONFLUENCE_BASE = 'https://wiki-groenkennisnet.atlassian.net/wiki';
const SPACE_KEY = 'BEEL';
const CONTENT_URL = `${CONFLUENCE_BASE}/rest/api/content`;
const SEARCH_URL = `${CONFLUENCE_BASE}/rest/api/content/search`;
const RATE_LIMIT_MS = 1500;

const USER_AGENT =
  'CropNode-KennisBot/1.0 (Agricultural Knowledge Platform; contact: info@cropnode.nl)';

/**
 * Fruit crops to scrape — one CQL query per label, all results deduped by
 * page-id. Mirrors the labels used on the Beeldenbank /Peer, /Appel etc.
 * index pages.
 */
const FRUIT_LABELS = ['appel', 'peer', 'kers', 'pruim'] as const;
type FruitLabel = (typeof FRUIT_LABELS)[number];

/** Map Confluence labels → canonical CropNode crop names */
const LABEL_TO_CROP: Record<string, string> = {
  appel: 'appel',
  peer: 'peer',
  kers: 'kers',
  pruim: 'pruim',
  'blauwe-bes': 'blauwe_bes',
  blauwebes: 'blauwe_bes',
};

/**
 * Final safety net — even though we filter by fruit-labels, some pages get
 * tagged broadly (e.g. "boomteelt"). Skip titles that are clearly about
 * non-fruit crops or that are space-navigation overviews.
 */
const TITLE_EXCLUDE = [
  'examenlijst', 'fruitteelt', 'houtig klein fruit', 'overige fruitsoorten',
  'glastuinbouw', 'akkerbouw', 'sierteelt',
];

interface WikiPage {
  id: string;
  title: string;
  labels: string[];
}

export class GroenKennisnetScraper implements Scraper {
  readonly code = 'gkn';
  readonly name = 'Groen Kennisnet (WUR Beeldenbank)';

  private knownIds: Set<string>;

  constructor(options: { knownIds?: Set<string> } = {}) {
    this.knownIds = options.knownIds ?? new Set();
  }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedContent[]> {
    // 1. List all fruit-labeled pages via CQL (per label, deduped by id)
    console.log('[gkn] Ophalen paginalijst via CQL labels:', FRUIT_LABELS.join(', '));
    const allPages = await this.fetchPagesByLabels(FRUIT_LABELS);
    console.log(`[gkn] ${allPages.length} unieke pagina's met fruit-labels in BEEL`);

    // 2. Lichte title-exclusie (overzichts- en niet-fruit pagina's)
    const fruitPages = allPages.filter((p) => {
      const lower = p.title.toLowerCase();
      return !TITLE_EXCLUDE.some((kw) => lower.includes(kw));
    });
    if (fruitPages.length < allPages.length) {
      console.log(`[gkn] ${allPages.length - fruitPages.length} overzichts-pagina's overgeslagen`);
    }

    // 3. Filter out already-known IDs (incremental scrape)
    let newPages = options.fullRescan
      ? fruitPages
      : fruitPages.filter((p) => !this.knownIds.has(`gkn-${p.id}`));

    if (options.limit && newPages.length > options.limit) {
      newPages = newPages.slice(0, options.limit);
    }
    console.log(`[gkn] ${newPages.length} nieuwe pagina's te scrapen`);

    // 4. Fetch content for each page (skip in list-only mode)
    const results: ScrapedContent[] = [];
    for (const [i, page] of newPages.entries()) {
      console.log(`[gkn] ${i + 1}/${newPages.length}: ${page.title}  [${page.labels.join(', ')}]`);
      const crops = this.cropsFromLabels(page.labels);

      if (options.listOnly) {
        results.push({
          rawText: '',
          scrapedAt: new Date(),
          sourceType: 'research',
          internalSourceCode: this.code,
          sourceIdentifier: `gkn-${page.id}`,
          metadata: {
            title: page.title,
            date: new Date().toISOString().slice(0, 10),
            crops,
            topics: [this.inferCategory(page.title, page.labels)].filter(Boolean),
            isPublicSource: true,
            publicSourceRef: `WUR Groen Kennisnet — ${page.title}`,
            pageId: page.id,
            labels: page.labels,
            imageUrls: [],
            imageCount: 0,
          },
        });
        continue;
      }

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
            crops,
            topics: [this.inferCategory(page.title, page.labels)].filter(Boolean),
            // PUBLIC source — bronvermelding toegestaan
            isPublicSource: true,
            publicSourceRef: `WUR Groen Kennisnet — ${page.title}`,
            pageId: page.id,
            labels: page.labels,
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

    console.log(`[gkn] ${results.length} pagina's verwerkt (listOnly=${!!options.listOnly})`);
    return results;
  }

  // ============================================
  // Page listing via CQL (one query per fruit label, deduped)
  // ============================================

  /**
   * Fetch all pages tagged with at least one of `labels` in the BEEL space.
   * Uses Confluence CQL — exactly mirrors what the Beeldenbank index pages
   * do via the `contentbylabel` macro.
   *
   * Pagination: `start` parameter, `limit=50` per page (Confluence Cloud cap).
   */
  private async fetchPagesByLabels(labels: readonly string[]): Promise<WikiPage[]> {
    const byId = new Map<string, WikiPage>();

    for (const label of labels) {
      const cql = `label = "${label}" AND space = "${SPACE_KEY}"`;
      let start = 0;
      let page = 0;
      while (true) {
        const url = `${SEARCH_URL}?cql=${encodeURIComponent(cql)}&limit=50&start=${start}&expand=metadata.labels`;
        const res = await this.fetchJson(url);
        const pages = (res?.results ?? []) as Array<{
          id: string;
          title: string;
          metadata?: { labels?: { results?: Array<{ name: string }> } };
        }>;
        for (const p of pages) {
          const labelNames = (p.metadata?.labels?.results ?? []).map((l) => l.name);
          // Merge labels if we've seen this page before (it can match multiple)
          const existing = byId.get(p.id);
          if (existing) {
            existing.labels = Array.from(new Set([...existing.labels, ...labelNames]));
          } else {
            byId.set(p.id, { id: p.id, title: p.title, labels: labelNames });
          }
        }
        const next = res?._links?.next;
        page += 1;
        console.log(`[gkn]   label=${label} pagina ${page}: +${pages.length} (totaal uniek: ${byId.size})`);
        if (!next || pages.length === 0) break;
        start += pages.length;
        await this.wait();
      }
    }

    return Array.from(byId.values());
  }

  /** Extract canonical crop names from Confluence labels */
  private cropsFromLabels(labels: string[]): string[] {
    const found = new Set<string>();
    for (const l of labels) {
      const mapped = LABEL_TO_CROP[l.toLowerCase()];
      if (mapped) found.add(mapped);
    }
    return Array.from(found);
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

  private inferCategory(title: string, labels: string[] = []): string {
    // Labels are most authoritative — Beeldenbank tags every page with one of
    // {ziekten, insecten, aantastingen, plantengallen, ...}.
    const labelSet = new Set(labels.map((l) => l.toLowerCase()));
    if (labelSet.has('ziekten') || labelSet.has('schimmels') || labelSet.has('bacterien')) {
      return 'ziekte';
    }
    if (labelSet.has('insecten') || labelSet.has('mijten') || labelSet.has('plagen')
        || labelSet.has('aantastingen') || labelSet.has('plantengallen')) {
      return 'plaag';
    }

    // Fall back on title keywords
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
