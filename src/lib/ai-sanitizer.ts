/**
 * AI Input Sanitizer — Prompt Injection Mitigation
 *
 * Sanitizes user input before it's included in LLM prompts.
 * Removes common prompt injection patterns while preserving
 * legitimate agricultural terms.
 */

const INJECTION_PATTERNS = [
    /\b(ignore previous|disregard above|new instructions?|system prompt|you are now)\b/gi,
    /\b(forget everything|override|bypass|jailbreak|DAN mode)\b/gi,
    /\b(pretend you are|act as if|roleplay as)\b/gi,
];

const MAX_PROMPT_INPUT_LENGTH = 2000;

/**
 * Sanitize user input before inclusion in LLM prompts.
 * Strips patterns that could manipulate LLM behavior.
 */
export function sanitizeForPrompt(input: string): string {
    let sanitized = input;

    for (const pattern of INJECTION_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[...]');
    }

    // Limit length to prevent prompt stuffing
    if (sanitized.length > MAX_PROMPT_INPUT_LENGTH) {
        sanitized = sanitized.substring(0, MAX_PROMPT_INPUT_LENGTH);
    }

    return sanitized;
}
