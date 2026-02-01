import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
}

/**
 * Custom fetch with timeout and retry for unstable networks (5G hotspot, etc.)
 */
const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const maxRetries = 3;
  const timeout = 30000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        keepalive: true,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      const delay = Math.min(100 * Math.pow(2, attempt), 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
};

/**
 * Singleton Supabase client voor data operations
 * Gebruikt dezelfde @supabase/ssr client als auth zodat RLS correct werkt
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

/**
 * Retry utility for transient network failures
 * Uses fast-first retry strategy: immediate retry, then exponential backoff
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
    initialDelayMs = 200, // Faster initial retry
    maxDelayMs = 3000,
    operationName = 'Database operation',
    shouldRetry = (error) => {
      // Retry on network errors
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

      // First retry is immediate (50ms), then exponential backoff
      const delay = attempt === 0
        ? 50 + Math.random() * 50  // 50-100ms for first retry
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

/**
 * Warmup the Supabase connection
 * Call this early in app lifecycle to establish connection
 */
export async function warmupConnection(): Promise<boolean> {
  try {
    // Simple query to establish connection
    await supabase.from('parcels').select('id').limit(1).single();
    console.log('[Supabase] Connection warmed up');
    return true;
  } catch {
    console.warn('[Supabase] Warmup failed, will retry on first real request');
    return false;
  }
}
