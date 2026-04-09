/**
 * WUR eDepot Scraper — PDF research documents
 *
 * Downloads PDFs from Wageningen University's eDepot repository
 * and extracts text content for the knowledge pipeline.
 *
 * PUBLIC source → is_public_source: true, bronvermelding met eDepot URL.
 *
 * Unlike the other scrapers, this one works from a curated list of
 * known-relevant document IDs rather than crawling. The eDepot has
 * thousands of documents; only fruit-relevant ones are scraped.
 */

import pdf from 'pdf-parse';
import type { Scraper, ScrapedContent, ScrapeOptions } from './types';

const EDEPOT_BASE = 'https://edepot.wur.nl';
const RATE_LIMIT_MS = 2000;
const USER_AGENT = 'CropNode-KennisBot/1.0 (Agricultural Knowledge Platform)';

/**
 * Curated list of fruit-relevant WUR eDepot documents.
 * Each entry: [id, title, topics[]]
 * Add new IDs here as we discover them.
 */
const CURATED_DOCUMENTS: Array<[string, string, string[]]> = [
  // Schurft
  ['642529', 'Schurftbeheersing in appel en peer', ['schurft']],
  ['420106', 'De schurftziekte bij appel en peer', ['schurft']],
  ['120490', 'Geïntegreerde bestrijding schurft', ['schurft']],
  ['166754', 'Stopspray tegen schurft', ['schurft', 'resistentie']],

  // Vruchtrot
  ['254626', 'Onderzoek naar de veroorzakers van vruchtrot bij peren', ['vruchtrot', 'peer']],
  ['328412', 'Bestrijding van Phytophthora-vruchtrot bij peer (Conference)', ['vruchtrot', 'phytophthora']],
  ['328410', 'Vruchtrot bij Conference peren', ['vruchtrot']],

  // Perenbladvlo
  ['446506', 'Geïntegreerde bestrijding van perenbladvlo', ['perenbladvlo']],

  // Biologische bestrijding
  ['450017', 'Gewasbescherming in de biologische fruitteelt', ['biologisch', 'gewasbescherming']],
  ['534151', 'Natuurvriendelijke bestrijding van bladluizen', ['luis', 'biologisch']],

  // Bladrollers / insecten
  ['345730', 'Bladrollers in fruitteelt', ['bladroller', 'insecten']],

  // Algemeen gewasbescherming
  ['412312', 'Biologische vs geïntegreerde fruitteelt', ['gewasbescherming', 'biologisch']],
];

export class WurEdepotScraper implements Scraper {
  readonly code = 'wur-edepot';
  readonly name = 'WUR eDepot (Onderzoeksrapporten)';

  private knownIds: Set<string>;

  constructor(options: { knownIds?: Set<string> } = {}) {
    this.knownIds = options.knownIds ?? new Set();
  }

  async scrape(options: ScrapeOptions = {}): Promise<ScrapedContent[]> {
    let docs = CURATED_DOCUMENTS.filter(
      ([id]) => !this.knownIds.has(`wur-${id}`),
    );

    if (options.limit && docs.length > options.limit) {
      docs = docs.slice(0, options.limit);
    }

    console.log(`[wur-edepot] ${docs.length} documenten te verwerken`);

    const results: ScrapedContent[] = [];
    for (const [i, [id, title, topics]] of docs.entries()) {
      console.log(`[wur-edepot] ${i + 1}/${docs.length}: ${title}`);
      try {
        const text = await this.downloadAndParsePdf(id);
        if (!text || text.length < 100) {
          console.warn(`[wur-edepot]   → te weinig tekst (${text?.length ?? 0} chars), skip`);
          continue;
        }

        // Fix common PDF extraction issues: missing spaces between words
        const cleanedText = this.fixPdfSpacing(text);

        results.push({
          rawText: cleanedText,
          scrapedAt: new Date(),
          sourceType: 'research',
          internalSourceCode: this.code,
          sourceIdentifier: `wur-${id}`,
          metadata: {
            title,
            date: new Date().toISOString().slice(0, 10),
            topics,
            isPublicSource: true,
            publicSourceRef: `WUR eDepot — ${title} (${EDEPOT_BASE}/${id})`,
            edepotId: id,
            edepotUrl: `${EDEPOT_BASE}/${id}`,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[wur-edepot]   ❌ ${msg}`);
      }

      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    console.log(`[wur-edepot] ${results.length} documenten succesvol verwerkt`);
    return results;
  }

  private async downloadAndParsePdf(id: string): Promise<string> {
    const url = `${EDEPOT_BASE}/${id}`;

    // Download PDF with retries
    let buffer: ArrayBuffer | null = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buffer = await res.arrayBuffer();
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < 5) {
          console.warn(`[wur-edepot]   retry ${attempt}/5: ${msg.slice(0, 50)}`);
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw err;
      }
    }

    if (!buffer) throw new Error('Download failed');

    // Parse PDF
    const data = await pdf(Buffer.from(buffer));
    console.log(`[wur-edepot]   ${data.numpages} pagina's, ${data.text.length} chars`);
    return data.text;
  }

  /**
   * Fix common PDF text extraction issues where spaces between words
   * are lost during extraction. Uses heuristics:
   * - Insert space between lowercase→uppercase transitions
   * - Insert space before common Dutch words that are stuck to previous word
   */
  private fixPdfSpacing(text: string): string {
    let fixed = text;

    // Insert space between lowercase letter followed by uppercase letter
    // (except for known abbreviations)
    fixed = fixed.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Insert space between letter and digit transitions
    fixed = fixed.replace(/([a-zA-Z])(\d)/g, '$1 $2');
    fixed = fixed.replace(/(\d)([a-zA-Z])/g, '$1 $2');

    // Fix common stuck-together Dutch words
    const commonWords = [
      'de ', 'het ', 'een ', 'van ', 'in ', 'op ', 'bij ', 'met ', 'voor ',
      'door ', 'aan ', 'om ', 'uit ', 'over ', 'naar ', 'als ', 'tot ', 'worden ',
      'zijn ', 'kan ', 'moet ', 'wordt ', 'heeft ', 'niet ', 'ook ', 'meer ',
      'zeer ', 'veel ', 'dan ', 'maar ', 'deze ', 'dit ', 'die ', 'dat ',
    ];
    for (const word of commonWords) {
      // Only fix if the word is stuck to a previous word (lowercase + word)
      const pattern = new RegExp(`([a-z])(${word.trim()})\\b`, 'gi');
      fixed = fixed.replace(pattern, `$1 $2`);
    }

    // Clean up multiple spaces
    fixed = fixed.replace(/ {2,}/g, ' ');

    return fixed;
  }
}
