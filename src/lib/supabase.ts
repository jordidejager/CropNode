'use client';

import { createBrowserClient, type SupabaseClient } from '@supabase/ssr';

// Re-export withRetry from server-compatible module for backwards compatibility
export { withRetry } from './retry-utils';

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
 * Singleton Supabase client - lazy initialized
 * Ensures only ONE client instance exists for both auth and data
 */
let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: customFetch,
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseInstance;
}

// Export as 'supabase' for backward compatibility
export const supabase = typeof window !== 'undefined'
  ? getSupabase()
  : createBrowserClient(supabaseUrl, supabaseAnonKey); // Server-side fallback

// withRetry is now exported from ./retry-utils (see re-export at top of file)
