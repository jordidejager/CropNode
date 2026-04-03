/**
 * Supabase client that works in both client and server contexts
 * NO 'use client' directive - safe for server-side use
 */

import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { supabaseFetch } from './supabase/fetch';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Create a Supabase client for server-side use
 * Uses anon key - suitable for public data and RLS-protected queries
 */
export function createSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: supabaseFetch,
    },
  });
}

/**
 * Singleton instance for simple cases
 * Note: In server contexts, consider creating a new client per request
 */
export const supabase = createSupabaseClient();

/**
 * Check if we're running on the server
 */
const isServer = typeof window === 'undefined';

/**
 * Create a Supabase client with SERVICE ROLE key for server-side use.
 * This BYPASSES Row Level Security - use only in trusted server contexts!
 *
 * Use cases:
 * - API routes that need to access all users' data
 * - Background jobs
 * - Admin operations
 *
 * NOTE: On client-side, this falls back to anon client silently.
 * Client-side code should work with RLS via user session.
 */
export function createServiceRoleClient() {
  // On client-side, always use anon client (service role key not available)
  if (!isServer) {
    // Silent fallback on client - this is expected behavior
    return createSupabaseClient();
  }

  // Server-side: Check if service role key is available
  const hasServiceKey = !!supabaseServiceRoleKey;

  if (!hasServiceKey) {
    console.warn('[supabase-client] SUPABASE_SERVICE_ROLE_KEY not set on server. Using anon client - RLS may block queries.');
    return createSupabaseClient();
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: supabaseFetch,
    },
  });
}

/**
 * Lazy-initialized service role client for server-side operations
 * BYPASSES RLS - only use in API routes and server actions
 *
 * Uses getter to ensure env vars are available at runtime (not build time)
 * On client-side, silently falls back to anon client.
 */
let _supabaseAdmin: ReturnType<typeof createServiceRoleClient> | null = null;

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createServiceRoleClient();
  }
  return _supabaseAdmin;
}

// Export the actual client getter for direct use
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) {
    return (getSupabaseAdmin() as any)[prop];
  }
});
