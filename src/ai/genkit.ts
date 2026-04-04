import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const DEFAULT_MODEL = process.env.GOOGLE_AI_MODEL || 'googleai/gemini-2.5-flash-lite';

export const ai = genkit({
  plugins: [googleAI()],
  model: DEFAULT_MODEL,
});

/**
 * Wraps a promise with a timeout. Rejects with a clear error if the promise
 * doesn't resolve within the given milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'AI call'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/** Default timeout for AI generate calls (15 seconds) */
export const AI_TIMEOUT_MS = 15_000;

/** Default timeout for AI agent/multi-turn calls (30 seconds) */
export const AI_AGENT_TIMEOUT_MS = 30_000;
