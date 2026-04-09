/**
 * Validation pipeline — second-pass quality check by Gemini
 *
 * Catches:
 *  - Onrealistische doseringen
 *  - Verkeerde productnamen
 *  - Inconsistenties / tegenspraak
 *  - Ontbrekende essentiële info
 *  - Stukken die nog te dicht bij brontekst staan (kopieer-detectie)
 *  - Seizoenslogica fouten (bv winterbespuiting in juli)
 *
 * Output → ValidationResult. Bij blocker → article moet als 'needs_review' worden opgeslagen.
 */

import { ai } from '@/ai/genkit';
import {
  ValidationResultSchema,
  type KnowledgeArticleDraft,
  type ValidationResult,
} from './types';

const VALIDATE_MODEL = 'googleai/gemini-2.5-flash-lite';

const VALIDATION_SYSTEM_PROMPT = `Je bent een kwaliteitscontroleur voor CropNode kennisartikelen over fruitteelt.

Controleer het aangeleverde artikel op zes punten:

1. DOSERINGEN — kloppen de genoemde doseringen met gangbare praktijk in de Nederlandse fruitteelt?
   Flag alles dat onrealistisch lijkt (bv 50 kg/ha captan = veel te hoog).
2. PRODUCTNAMEN — zijn de productnamen correct gespeld? Klinken het bestaande middelen?
3. CONSISTENTIE — spreekt het artikel zichzelf tegen? (bv "preventief" en "curatief" door elkaar)
4. VOLLEDIGHEID — mist er essentiële informatie? (dosering genoemd maar geen gewas, timing zonder fase)
5. HERFORMULERING — bevat het artikel passages die klinken als direct gekopieerd uit een advies?
   Te specifieke formuleringen, onnatuurlijke zinsconstructies, of marketingtaal zijn red flags.
6. SEIZOENSLOGICA — klopt de timing met de fenologische fase?
   (bv winterbespuiting in juli is fout, oogstadvies in februari is fout)

Issue-niveaus:
- "blocker": fout die publicatie tegenhoudt (verkeerde dosering, onmogelijke timing)
- "warning": serieus aandachtspunt maar publiceerbaar (twijfel over productnaam, summier)
- "info": kleine notitie (typo, stijl)

Wees streng maar realistisch — als alles in orde is: approved=true, issues=[].

OUTPUT: JSON object met velden:
- approved (boolean)
- issues (array van { message, severity })
- suggested_fixes (array van strings)`;

export async function validateArticle(
  draft: KnowledgeArticleDraft,
): Promise<ValidationResult> {
  const userPrompt = buildPrompt(draft);

  try {
    const result = await callWithRetry(async () => {
      return ai.generate({
        model: VALIDATE_MODEL,
        system: VALIDATION_SYSTEM_PROMPT,
        prompt: userPrompt,
        output: {
          schema: ValidationResultSchema,
          format: 'json',
        },
        config: {
          temperature: 0.1,
        },
      });
    });

    const output = (result as { output?: unknown }).output;
    if (!output) {
      // If validation itself fails, default to "needs review with warning"
      return {
        approved: false,
        issues: [
          { severity: 'warning', message: 'Validator gaf geen output, handmatige check vereist' },
        ],
        suggested_fixes: [],
      };
    }
    return ValidationResultSchema.parse(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[validate] Validator faalde: ${message}`);
    return {
      approved: false,
      issues: [
        { severity: 'warning', message: `Validator-fout: ${message}` },
      ],
      suggested_fixes: [],
    };
  }
}

export function hasBlockers(result: ValidationResult): boolean {
  return result.issues.some((issue) => issue.severity === 'blocker');
}

// ============================================
// Helpers
// ============================================

function buildPrompt(draft: KnowledgeArticleDraft): string {
  return [
    'Beoordeel dit kennisartikel:',
    '',
    `Titel: ${draft.title}`,
    `Categorie: ${draft.category}${draft.subcategory ? ' / ' + draft.subcategory : ''}`,
    `Type: ${draft.knowledge_type}`,
    `Gewassen: ${draft.crops.join(', ') || '(geen)'}`,
    `Seizoensfasen: ${draft.season_phases.join(', ') || '(geen)'}`,
    `Relevante maanden: ${draft.relevant_months.join(', ') || '(geen)'}`,
    `Producten: ${draft.products_mentioned.join(', ') || '(geen)'}`,
    '',
    'Samenvatting:',
    draft.summary,
    '',
    'Volledige tekst:',
    draft.content,
  ].join('\n');
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit = /429|rate|quota|RESOURCE_EXHAUSTED/i.test(message);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[validate] ${isRateLimit ? 'Rate limited' : 'Fout'} (poging ${attempt}/${maxAttempts}), wacht ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
