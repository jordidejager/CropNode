/**
 * Retry utilities for transient failures
 * This file is server-compatible (no 'use client' directive)
 */

/**
 * Retry utility for transient network failures
 * Works in both client and server contexts
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: any) => boolean;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = 4,
    initialDelayMs = 200,
    maxDelayMs = 3000,
    operationName = 'Database operation',
    shouldRetry = (error) => {
      const message = error?.message?.toLowerCase() || '';
      return (
        message.includes('fetch failed') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('aborted') ||
        message.includes('socket')
      );
    },
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = attempt === 0
        ? 50 + Math.random() * 50
        : Math.min(
            initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100,
            maxDelayMs
          );

      console.log(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms...`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
