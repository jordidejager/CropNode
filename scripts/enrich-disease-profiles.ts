#!/usr/bin/env npx tsx
/**
 * Enrich disease profiles — fill empty fields using Gemini + knowledge articles.
 *
 * For each profile with empty fields, fetches related knowledge_articles,
 * sends them to Gemini, and extracts structured encyclopedia content.
 *
 * Usage:
 *   npm run knowledge:enrich                          # all profiles
 *   npm run knowledge:enrich -- --limit 5             # test with 5
 *   npm run knowledge:enrich -- --only schurft        # specific profile
 *   npm run knowledge:enrich -- --dry-run             # preview only
 */
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 }, headersTimeout: 120_000, bodyTimeout: 120_000 }));

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ai } from '../src/ai/genkit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : undefined;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const dryRun = args.includes('--dry-run');

const ENRICH_MODEL = 'googleai/gemini-2.5-flash-lite';

// Schema for the enrichment output
const EnrichmentSchema = z.object({
  description: z.string().min(20).describe('2-4 zinnen: wat is het, waarom is het belangrijk voor fruittelers'),
  symptoms: z.string().nullable().describe('Hoe herken je het: visuele kenmerken, schadebeeld. Null als niet relevant (bv bij bemesting)'),
  lifecycle_notes: z.string().nullable().describe('Levenscyclus voor ziekten/plagen: stadia, overwintering, generaties. Null bij teelttechniek/bemesting'),
  prevention_strategy: z.string().nullable().describe('Preventieve aanpak: wat moet de teler doen om het te voorkomen'),
  curative_strategy: z.string().nullable().describe('Curatieve aanpak: wat doen als het al aanwezig is'),
  biological_options: z.string().nullable().describe('Biologische/natuurlijke alternatieven, natuurlijke vijanden, IPM'),
  resistance_management: z.string().nullable().describe('Resistentiemanagement: afwisseling middelen, FRAC/IRAC groepen'),
  monitoring_advice: z.string().nullable().describe('Hoe monitoren/waarnemen: klopmonsters, vallen, visuele controle, schadedrempels'),
  latin_name: z.string().nullable().describe('Wetenschappelijke naam (Latijn). Null als onbekend of niet van toepassing'),
});

const ENRICH_SYSTEM_PROMPT = `Je bent een kennisredacteur voor een fruitteelt-encyclopedie. Je schrijft gestructureerde, feitelijke artikelen over ziekten, plagen en teelttechnieken voor Nederlandse appel- en perentelers.

REGELS:
1. Baseer je ALLEEN op de aangeleverde bronartikelen. Verzin NIETS.
2. Schrijf in het Nederlands, helder en praktisch.
3. Per veld: 2-5 zinnen, bondig maar volledig.
4. Bij levenscyclus van insecten: noem de stadia correct (ei → nimf/larve → volwassen/imago). Noem overwintering.
5. Bij schimmels: noem de sporenvorming, infectiecyclus, verspreidingswijze.
6. Als de bronartikelen geen info bevatten over een veld, zet het op null.
7. Productnamen en doseringen EXACT overnemen uit de bronnen.
8. Vermeld NOOIT bronorganisaties of adviseursnamen.

OUTPUT: JSON met alle velden. Lege velden als null.`;

async function main() {
  console.log(`=== Enrich Disease Profiles (${dryRun ? 'DRY-RUN' : 'LIVE'}) ===`);

  // Fetch profiles
  let profiles: any[] = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      let q = supabase.from('knowledge_disease_profile').select('*').order('source_article_count', { ascending: false });
      if (only) q = q.ilike('name', `%${only}%`);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      profiles = data ?? [];
      break;
    } catch (err: any) {
      console.warn(`  Fetch ${attempt}/10: ${(err.message ?? '').slice(0, 40)}`);
      await new Promise(r => setTimeout(r, 2000 * Math.min(attempt, 5)));
    }
  }

  // Filter to profiles that need enrichment (have empty key fields)
  const needsEnrichment = profiles.filter((p) => {
    const fields = ['description', 'symptoms', 'lifecycle_notes', 'prevention_strategy', 'curative_strategy', 'monitoring_advice'];
    const emptyCount = fields.filter((f) => !p[f]).length;
    return emptyCount >= 3; // At least 3 empty fields
  });

  console.log(`${profiles.length} profielen geladen, ${needsEnrichment.length} nodig verrijking`);
  if (dryRun) {
    for (const p of needsEnrichment.slice(0, 10)) console.log(`  ${p.name}`);
    return;
  }

  let enriched = 0;
  let errors = 0;
  const startTime = Date.now();

  for (const [i, profile] of needsEnrichment.entries()) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[${i + 1}/${needsEnrichment.length}] ${elapsed}s — ${profile.name}`);

    try {
      // Fetch related articles for context
      let articles: any[] = [];
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const { data } = await supabase
            .from('knowledge_articles')
            .select('title, content')
            .eq('status', 'published')
            .ilike('subcategory', `%${profile.name}%`)
            .order('fusion_sources', { ascending: false })
            .limit(8);
          articles = data ?? [];
          break;
        } catch {
          await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }

      // If no articles by subcategory, try by title
      if (articles.length < 3) {
        try {
          const { data } = await supabase
            .from('knowledge_articles')
            .select('title, content')
            .eq('status', 'published')
            .ilike('title', `%${profile.name}%`)
            .order('fusion_sources', { ascending: false })
            .limit(5);
          const existingTitles = new Set(articles.map((a: any) => a.title));
          for (const a of data ?? []) {
            if (!existingTitles.has(a.title)) articles.push(a);
          }
        } catch { /* ignore */ }
      }

      if (articles.length === 0) {
        console.log(`  → geen bronartikelen, skip`);
        continue;
      }

      // Build context from articles (max 12000 chars)
      const context = articles
        .map((a: any) => `--- ${a.title} ---\n${(a.content ?? '').slice(0, 2000)}`)
        .join('\n\n')
        .slice(0, 12000);

      // Call Gemini
      const result = await callWithRetry(async () => {
        return ai.generate({
          model: ENRICH_MODEL,
          system: ENRICH_SYSTEM_PROMPT,
          prompt: `Schrijf een encyclopedie-artikel over "${profile.name}" (${profile.profile_type}) voor de fruitteelt.\n\nGewassen: ${(profile.crops ?? []).join(', ')}\nBestaande producten (preventief): ${(profile.key_preventive_products ?? []).join(', ')}\nBestaande producten (curatief): ${(profile.key_curative_products ?? []).join(', ')}\n\nBRONARTIKELEN:\n${context}`,
          output: { schema: EnrichmentSchema, format: 'json' },
          config: { temperature: 0.2 },
        });
      });

      const output = (result as any).output;
      if (!output) {
        console.log(`  → geen output van Gemini`);
        errors++;
        continue;
      }

      // Update profile (only fill empty fields, don't overwrite existing)
      const updates: Record<string, any> = {};
      for (const [field, value] of Object.entries(output)) {
        if (value && !profile[field]) {
          updates[field] = value;
        }
      }

      if (Object.keys(updates).length > 0) {
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const { error: updateErr } = await supabase
              .from('knowledge_disease_profile')
              .update(updates)
              .eq('id', profile.id);
            if (updateErr) throw new Error(updateErr.message);
            break;
          } catch (err: any) {
            if (attempt < 5) { await new Promise(r => setTimeout(r, 1500 * attempt)); continue; }
            throw err;
          }
        }
        console.log(`  ✓ ${Object.keys(updates).length} velden aangevuld: ${Object.keys(updates).join(', ')}`);
        enriched++;
      } else {
        console.log(`  → al compleet of geen nieuwe data`);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 300));

    } catch (err: any) {
      console.error(`  ✗ ${err.message?.slice(0, 80)}`);
      errors++;
    }
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  console.log();
  console.log(`=== Klaar in ${Math.floor(totalTime / 60)}m ${totalTime % 60}s ===`);
  console.log(`Verrijkt: ${enriched}, Fouten: ${errors}`);
}

async function callWithRetry<T>(fn: () => Promise<T>, maxAttempts = 4, baseDelayMs = 2000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`  retry ${attempt}/${maxAttempts}: ${message.slice(0, 50)}. Wacht ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
