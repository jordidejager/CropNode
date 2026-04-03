'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseFetch } from './supabase/fetch';

// Re-export withRetry from server-compatible module for backwards compatibility
export { withRetry } from './retry-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
}

/**
 * Singleton Supabase client - lazy initialized
 * Ensures only ONE client instance exists for both auth and data
 */
let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: supabaseFetch,
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
