/**
 * FruitConsult Scraper — TypeScript port of scraper.py
 *
 * Authenticates against ASP.NET Identity, paginates the typh list,
 * and downloads each typh's HTML body from Azure Blob Storage.
 *
 * Returns ScrapedContent[] for the pipeline orchestrator.
 *
 * IMPORTANT: This scraper produces operational data only. The internalSourceCode
 * "fc" and any URL/title metadata MUST NOT be propagated into knowledge_articles
 * rows downstream.
 */

import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

import type { Scraper, ScrapedContent, ScrapeOptions } from './types';

const BASE_URL = 'https://app.fruitconsult.com';
const LOGIN_URL = `${BASE_URL}/Identity/Account/Login`;
const SET_LANGUAGE_URL = `${BASE_URL}/FruitWeb/Home/SetLanguage`;
const INDEX_PARTIAL_URL = `${BASE_URL}/FruitWeb/TyphVisitor/IndexPartial`;
const PAGE_SIZE = 50;
const DEFAULT_RATE_LIMIT_MS = 1500;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36';

interface TyphMetadata {
  typh_id: string;
  title: string;
  publication_date: string;
  original_category: string;
  content_url: string;
  url: string;
}

export interface FruitConsultScraperOptions {
  /** Pause between HTTP requests in ms (default 1500) */
  rateLimitMs?: number;
  /** Set of typh_ids to skip (already processed) */
  knownIds?: Set<string>;
}

export class FruitConsultScraper implements Scraper {
  readonly code = 'fc';
  readonly name = 'FruitConsult Wekelijkse Adviezen';

  private jar: CookieJar;
  private rateLimitMs: number;
  private knownIds: Set<string>;
  private loggedIn = false;

  constructor(options: FruitConsultScraperOptions = {}) {
    this.jar = new CookieJar();
    this.rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
    this.knownIds = options.knownIds ?? new Set();
  }

  // ============================================
  // Public API
  // ============================================

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedContent[]> {
    if (!this.loggedIn) {
      const ok = await this.login();
      if (!ok) {
        throw new Error('FruitConsult login mislukt — controleer credentials');
      }
    }

    const allTyphs = await this.fetchAllTyphLists();
    let newTyphs = options.fullRescan
      ? allTyphs
      : allTyphs.filter((t) => !this.knownIds.has(t.typh_id));

    if (options.limit && newTyphs.length > options.limit) {
      newTyphs = newTyphs.slice(0, options.limit);
    }

    console.log(
      `[fc] ${allTyphs.length} typhs gevonden, ${newTyphs.length} nieuw te verwerken`,
    );

    const results: ScrapedContent[] = [];
    for (const [i, typh] of newTyphs.entries()) {
      console.log(
        `[fc] Scrapen ${i + 1}/${newTyphs.length}: ${typh.title.slice(0, 60)}...`,
      );
      try {
        const fullText = await this.fetchTyphContent(typh.content_url);
        if (!fullText) {
          console.warn(`[fc] Geen content gevonden voor: ${typh.title}`);
          continue;
        }

        results.push({
          rawText: fullText,
          scrapedAt: new Date(),
          sourceType: 'weekly_advice',
          internalSourceCode: this.code,
          sourceIdentifier: typh.typh_id,
          metadata: {
            title: typh.title,
            date: typh.publication_date,
            topics: [typh.original_category].filter(Boolean),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[fc] Fout bij ${typh.title}: ${message}`);
      }
    }

    return results;
  }

  // ============================================
  // Login flow (ASP.NET Identity)
  // ============================================

  async login(): Promise<boolean> {
    const username = process.env.FRUITCONSULT_USER;
    const password = process.env.FRUITCONSULT_PASS;
    if (!username || !password) {
      console.error(
        '[fc] FRUITCONSULT_USER/FRUITCONSULT_PASS niet gezet in environment',
      );
      return false;
    }

    console.log(`[fc] Inloggen als ${username}...`);

    // Stap 1: GET login pagina voor anti-forgery token
    const loginPageRes = await this.get(LOGIN_URL);
    const html = await loginPageRes.text();
    const $ = cheerio.load(html);
    const token = $('input[name="__RequestVerificationToken"]').attr('value') ?? '';
    if (!token) {
      console.error('[fc] Anti-forgery token niet gevonden op login pagina');
      return false;
    }

    // Stap 2: POST login
    const formBody = new URLSearchParams({
      'Input.Email': username,
      'Input.Password': password,
      'Input.RememberMe': 'false',
      __RequestVerificationToken: token,
    }).toString();

    await this.wait();
    const loginRes = await this.fetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
      redirect: 'follow',
    });

    const finalUrl = loginRes.url || LOGIN_URL;
    if (finalUrl.includes('/Identity/Account/Login')) {
      console.error('[fc] Login mislukt — credentials foutief?');
      return false;
    }

    console.log('[fc] Login geslaagd');
    this.loggedIn = true;

    // Zet taal naar Nederlands
    try {
      await this.get(
        `${SET_LANGUAGE_URL}?returnUrl=~%2FFruitWeb%2FTyphVisitor&culture=nl`,
      );
    } catch (err) {
      // Niet kritiek
      console.warn('[fc] Kon taal niet instellen op Nederlands:', err);
    }

    return true;
  }

  // ============================================
  // Typh list (paginated)
  // ============================================

  async fetchTyphList(skip = 0): Promise<TyphMetadata[]> {
    const url =
      `${INDEX_PARTIAL_URL}` +
      `?displayDeleted=False` +
      `&skip=${skip}` +
      `&query=` +
      `&country=-1` +
      `&language=-1`;

    const res = await this.get(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const typhs: TyphMetadata[] = [];
    $('.typhSelection').each((_, el) => {
      const $el = $(el);
      const typh_id = $el.attr('data-id') ?? '';
      const title = $el.attr('data-title') ?? '';
      const publication_date = $el.attr('data-date') ?? '';
      const content_url = $el.attr('data-url') ?? '';

      let category = '';
      const leafIcon = $el.find('i.fa-leaf').first();
      if (leafIcon.length > 0) {
        const parent = leafIcon.parent();
        category = parent.text().trim();
      }

      if (typh_id) {
        typhs.push({
          typh_id,
          title,
          publication_date,
          original_category: category,
          content_url,
          url: `${BASE_URL}/FruitWeb/TyphVisitor#typh-${typh_id}`,
        });
      }
    });

    return typhs;
  }

  async fetchAllTyphLists(): Promise<TyphMetadata[]> {
    const all: TyphMetadata[] = [];
    let skip = 0;
    while (true) {
      console.log(`[fc] Ophalen typh-lijst (skip=${skip})...`);
      const batch = await this.fetchTyphList(skip);
      if (batch.length === 0) break;
      all.push(...batch);
      console.log(`[fc]   -> ${batch.length} typhs (totaal: ${all.length})`);
      if (batch.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }
    return all;
  }

  // ============================================
  // Typh content (Azure Blob)
  // ============================================

  async fetchTyphContent(contentUrl: string): Promise<string> {
    if (!contentUrl) return '';
    const res = await this.get(contentUrl);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Strip script & style
    $('script, style').remove();

    const text = $.root().text();
    return this.cleanText(text);
  }

  private cleanText(text: string): string {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Drop consecutive duplicates
    const cleaned: string[] = [];
    let prev = '';
    for (const line of lines) {
      if (line !== prev) {
        cleaned.push(line);
      }
      prev = line;
    }
    return cleaned.join('\n');
  }

  // ============================================
  // HTTP helpers (cookie jar + rate limiting + retry)
  // ============================================

  private async wait(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.rateLimitMs));
  }

  private async get(url: string, maxRetries = 3): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await this.wait();
      try {
        const res = await this.fetch(url, {
          method: 'GET',
          redirect: 'follow',
        });
        if (!res.ok && res.status >= 500) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const wait = attempt * 5000;
          console.warn(
            `[fc] GET ${url.slice(0, 80)} mislukt (poging ${attempt}): ${err}. Retry over ${wait}ms...`,
          );
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Wrapper around fetch that maintains the cookie jar manually. */
  private async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('User-Agent', USER_AGENT);
    if (!headers.has('Accept')) {
      headers.set(
        'Accept',
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      );
    }

    const cookieHeader = await this.jar.getCookieString(url);
    if (cookieHeader) headers.set('Cookie', cookieHeader);

    const res = await fetch(url, {
      ...init,
      headers,
      redirect: 'manual',
    });

    // Save Set-Cookie headers from this response
    await this.storeSetCookies(res, url);

    // Handle redirects manually so we can keep cookies in sync
    if (
      init.redirect !== 'manual' &&
      res.status >= 300 &&
      res.status < 400
    ) {
      const location = res.headers.get('location');
      if (location) {
        const nextUrl = new URL(location, url).toString();
        // For POST -> GET on 302/303, follow with GET
        const nextInit: RequestInit = {
          ...init,
          method: res.status === 303 || (res.status === 302 && init.method === 'POST') ? 'GET' : init.method,
          body:
            res.status === 303 || (res.status === 302 && init.method === 'POST')
              ? undefined
              : init.body,
        };
        return this.fetch(nextUrl, nextInit);
      }
    }

    // Mimic the Python `resp.url` behaviour by stamping the final URL
    Object.defineProperty(res, 'url', { value: url, configurable: true });
    return res;
  }

  private async storeSetCookies(res: Response, url: string): Promise<void> {
    // Node fetch returns multiple Set-Cookie headers via getSetCookie() (Node 20+)
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const cookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (() => {
          const single = res.headers.get('set-cookie');
          return single ? [single] : [];
        })();

    for (const cookie of cookies) {
      try {
        await this.jar.setCookie(cookie, url);
      } catch (err) {
        console.warn(`[fc] Kan cookie niet opslaan: ${err}`);
      }
    }
  }
}
