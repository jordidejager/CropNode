/**
 * Knowledge Base RAG Pipeline — Shared Types
 *
 * Used across scrapers, transform, validate, embed, fuse, pipeline, and search modules.
 * The Knowledge Base stores hergeformuleerde CropNode-content, NEVER direct source content.
 */

import { z } from 'zod';

// ============================================
// Categorisering enums
// ============================================

export const KNOWLEDGE_CATEGORIES = [
  'ziekte',
  'plaag',
  'abiotisch',        // vorst, hagel, droogte, zonnebrand, zoutschade, etc.
  'bemesting',
  'snoei',
  'dunning',
  'bewaring',
  'certificering',
  'algemeen',
  'rassenkeuze',
  'bodem',
  'watermanagement',
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const KNOWLEDGE_TYPES = [
  'strategie',
  'middel_advies',
  'timing',
  'techniek',
  'regelgeving',
  'waarneming',
  'biologisch',
] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export const SEASON_PHASES = [
  'rust',
  'knopstadium',
  'bloei',
  'vruchtzetting',
  'groei',
  'oogst',
  'nabloei',
] as const;
export type SeasonPhase = (typeof SEASON_PHASES)[number];

export const CROPS = ['appel', 'peer', 'kers', 'pruim', 'blauwe_bes'] as const;
export type Crop = (typeof CROPS)[number];

export const ARTICLE_STATUSES = ['draft', 'published', 'archived', 'needs_review'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const SCRAPE_TYPES = [
  'weekly_advice',
  'research',
  'regulation',
  'product_update',
] as const;
export type ScrapeType = (typeof SCRAPE_TYPES)[number];

// ============================================
// Scraper interface (extensible)
// ============================================

/**
 * Output format that all scrapers MUST produce.
 *
 * NOTE: `internalSourceCode` is for operational logging only.
 * It must NEVER be passed through to knowledge_articles rows.
 * Source URLs/organization names are also NEVER stored in articles.
 */
export interface ScrapedContent {
  rawText: string;
  rawHtml?: string;
  scrapedAt: Date;
  sourceType: ScrapeType;
  /** Internal short code: "fc", "dlv", "wur", "ctgb", etc. — operational use only */
  internalSourceCode: string;
  /** Identifier within the source (e.g. typh_id for FruitConsult) */
  sourceIdentifier: string;
  metadata: {
    title?: string;
    /** ISO date string (YYYY-MM-DD) */
    date?: string;
    crops?: string[];
    topics?: string[];
    [key: string]: unknown;
  };
}

export interface Scraper {
  /** Internal short code, must be unique in the scraper registry */
  readonly code: string;
  /** Human-friendly name for logs (still operational, never user-facing) */
  readonly name: string;
  scrape(options?: ScrapeOptions): Promise<ScrapedContent[]>;
}

export interface ScrapeOptions {
  /** Maximum number of new items to fetch this run */
  limit?: number;
  /** Skip incremental check and re-fetch everything */
  fullRescan?: boolean;
}

// ============================================
// Knowledge Article shape (matches DB schema)
// ============================================

/**
 * Draft article produced by the transform pipeline.
 * Embedding and content_hash are added later in the pipeline.
 */
export const KnowledgeArticleDraftSchema = z.object({
  title: z.string().min(5).max(300),
  content: z.string().min(50),
  summary: z.string().min(10).max(500),

  category: z.enum(KNOWLEDGE_CATEGORIES),
  subcategory: z.string().nullable().optional(),
  knowledge_type: z.enum(KNOWLEDGE_TYPES),

  crops: z.array(z.string()).default([]),
  varieties: z.array(z.string()).default([]),
  season_phases: z.array(z.string()).default([]),
  relevant_months: z.array(z.number().int().min(1).max(12)).default([]),

  products_mentioned: z.array(z.string()).default([]),

  is_public_source: z.boolean().default(false),
  public_source_ref: z.string().nullable().optional(),

  confidence_level: z.enum(['hoog', 'gemiddeld', 'laag']).default('hoog'),
  harvest_year: z.number().int().min(2020).max(2100),
  valid_from: z.string().nullable().optional(), // YYYY-MM-DD
  valid_until: z.string().nullable().optional(),
  is_evergreen: z.boolean().default(false),
});

export type KnowledgeArticleDraft = z.infer<typeof KnowledgeArticleDraftSchema>;

export const KnowledgeArticleDraftArraySchema = z.object({
  articles: z.array(KnowledgeArticleDraftSchema),
});

/** Stored article (after embed + insert) — superset of draft */
export interface KnowledgeArticle extends KnowledgeArticleDraft {
  id: string;
  content_hash: string;
  fusion_sources: number;
  status: ArticleStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

// ============================================
// Validation result
// ============================================

export const ValidationIssueSchema = z.object({
  message: z.string(),
  severity: z.enum(['blocker', 'warning', 'info']),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationResultSchema = z.object({
  approved: z.boolean(),
  issues: z.array(ValidationIssueSchema).default([]),
  suggested_fixes: z.array(z.string()).default([]),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// ============================================
// Search types (Fase 2 voorbereiding)
// ============================================

export interface KnowledgeSearchParams {
  query: string;
  crops?: Crop[];
  category?: KnowledgeCategory;
  subcategory?: string;
  seasonPhase?: SeasonPhase;
  currentMonth?: number;
  harvestYear?: number;
  limit?: number;
  similarityThreshold?: number;
}

export interface KnowledgeSearchResult {
  id: string;
  title: string;
  content: string;
  summary: string;
  category: string;
  subcategory: string | null;
  knowledge_type: string;
  crops: string[];
  season_phases: string[];
  relevant_months: number[];
  products_mentioned: string[];
  is_public_source: boolean;
  public_source_ref: string | null;
  similarity: number;
}

// ============================================
// Pipeline result
// ============================================

export interface PipelineRunResult {
  source: string;
  scrapedItems: number;
  itemsSkipped: number;
  articlesCreated: number;
  articlesUpdated: number;
  articlesFused: number;
  articlesNeedingReview: number;
  errors: Array<{ identifier?: string; message: string }>;
  startedAt: string;
  completedAt: string;
}
