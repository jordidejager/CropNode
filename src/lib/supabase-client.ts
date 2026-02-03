/**
 * Supabase client that works in both client and server contexts
 * NO 'use client' directive - safe for server-side use
 */

import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Custom fetch with timeout and retry for unstable networks
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
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(100 * Math.pow(2, attempt), 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
};

/**
 * Create a Supabase client for server-side use
 * Uses anon key - suitable for public data and RLS-protected queries
 */
export function createSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: customFetch,
    },
  });
}

/**
 * Singleton instance for simple cases
 * Note: In server contexts, consider creating a new client per request
 */
export const supabase = createSupabaseClient();

/**
 * Create a Supabase client with SERVICE ROLE key for server-side use.
 * This BYPASSES Row Level Security - use only in trusted server contexts!
 *
 * Use cases:
 * - API routes that need to access all users' data
 * - Background jobs
 * - Admin operations
 */
export function createServiceRoleClient() {
  if (!supabaseServiceRoleKey) {
    console.warn('[supabase-client] SUPABASE_SERVICE_ROLE_KEY not set, falling back to anon client');
    return createSupabaseClient();
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: customFetch,
    },
  });
}

/**
 * Singleton service role client for server-side operations
 * BYPASSES RLS - only use in API routes and server actions
 */
export const supabaseAdmin = createServiceRoleClient();
