/**
 * Claude (Anthropic) helper voor structured text generation.
 *
 * Gebruikt door eenmalige extract- en transform-taken die kwaliteit boven
 * snelheid stellen. Voor real-time chat blijven we bij Gemini via Genkit
 * (lagere latency en kosten).
 *
 * Default model: claude-sonnet-4-5 (kies hier later 4-6 wanneer beschikbaar
 * op de gewenste API-tier). Past goed bij Nederlandse content en strict
 * JSON-schema invullen.
 *
 * Vereist `ANTHROPIC_API_KEY` in environment.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z, type ZodTypeAny } from 'zod';

export type ClaudeModel =
  | 'claude-sonnet-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'
  | 'claude-haiku-4-5';

export const DEFAULT_CLAUDE_MODEL: ClaudeModel = 'claude-sonnet-4-5';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY ontbreekt in environment. Zet deze in .env.local of via secret-manager.',
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface ClaudeGenerateOptions<S extends ZodTypeAny> {
  system: string;
  prompt: string;
  schema?: S;
  model?: ClaudeModel;
  maxTokens?: number;
  temperature?: number;
  /** Cache the system prompt across calls (Anthropic prompt caching) */
  cacheSystem?: boolean;
}

export interface ClaudeGenerateResult<T> {
  output: T;
  rawText: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model: string;
}

/**
 * Structured text generation via Claude. If `schema` is provided, the output
 * is parsed and validated via Zod; otherwise the raw text is returned.
 *
 * The model is prompted to emit JSON; we strip ```json fences if present.
 */
export async function generateClaudeStructured<S extends ZodTypeAny>(
  options: ClaudeGenerateOptions<S>,
): Promise<ClaudeGenerateResult<z.infer<S>>> {
  const {
    system,
    prompt,
    schema,
    model = DEFAULT_CLAUDE_MODEL,
    maxTokens = 4096,
    temperature = 0.1,
    cacheSystem = false,
  } = options;

  const client = getClient();
  const MAX_RETRIES = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: cacheSystem
          ? [
              {
                type: 'text',
                text: system,
                cache_control: { type: 'ephemeral' },
              },
            ]
          : system,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Geen text block in Claude response');
      }
      const rawText = textBlock.text;

      let parsed: z.infer<S>;
      if (schema) {
        const cleaned = stripJsonFences(rawText);
        let json: unknown;
        try {
          json = JSON.parse(cleaned);
        } catch (err) {
          throw new Error(
            `Claude output is geen valide JSON: ${(err as Error).message}. First 200 chars: ${cleaned.slice(0, 200)}`,
          );
        }
        const result = schema.safeParse(json);
        if (!result.success) {
          const issues = result.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
          throw new Error(`Schema validatie faalde: ${issues}`);
        }
        parsed = result.data;
      } else {
        parsed = rawText as z.infer<S>;
      }

      return {
        output: parsed,
        rawText,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_read_input_tokens: response.usage.cache_read_input_tokens ?? undefined,
          cache_creation_input_tokens:
            response.usage.cache_creation_input_tokens ?? undefined,
        },
        model: response.model,
      };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|UND_ERR|503|overloaded|rate.?limit/i.test(
          msg,
        );
      if (attempt < MAX_RETRIES && isTransient) {
        const wait = 2000 * attempt;
        console.warn(
          `[claude] Transient (${attempt}/${MAX_RETRIES}): ${msg.slice(0, 80)}. Retry over ${wait}ms`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Strip optional ```json … ``` fences and surrounding whitespace.
 * Claude sometimes wraps JSON in fences even when asked not to.
 */
function stripJsonFences(text: string): string {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  return s.trim();
}

/**
 * Pretty-print Anthropic usage as Dutch cost summary.
 */
export function formatUsageDutch(usage: ClaudeGenerateResult<unknown>['usage']): string {
  const parts: string[] = [`in:${usage.input_tokens}`, `out:${usage.output_tokens}`];
  if (usage.cache_read_input_tokens) parts.push(`cache_hit:${usage.cache_read_input_tokens}`);
  if (usage.cache_creation_input_tokens)
    parts.push(`cache_write:${usage.cache_creation_input_tokens}`);
  return parts.join(' · ');
}
