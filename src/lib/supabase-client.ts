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

  console.log('[supabase-client] Service role client created - RLS will be bypassed');
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
 * Lazy-initialized service role client for server-side operations
 * BYPASSES RLS - only use in API routes and server actions
 *
 * Uses getter to ensure env vars are available at runtime (not build time)
 * On client-side, silently falls back to anon client.
 */
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    if (isServer) {
      console.log('[supabase-client] Lazy-initializing supabaseAdmin (server)...');
    }
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

/**
 * Debug function to test database connectivity and RLS bypass
 * Call this to verify the service role client is working
 * Only works on server-side
 */
export async function testDatabaseConnection(): Promise<{
  success: boolean;
  hasServiceKey: boolean;
  subParcelsCount: number;
  viewCount: number;
  error?: string;
}> {
  if (!isServer) {
    return { success: false, hasServiceKey: false, subParcelsCount: 0, viewCount: 0, error: 'testDatabaseConnection only works on server' };
  }

  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(`[testDatabaseConnection] Service key available: ${hasServiceKey}`);

  const client = getSupabaseAdmin();

  try {
    // Test 1: Direct sub_parcels query
    const { data: subData, error: subError, count: subCount } = await client
      .from('sub_parcels')
      .select('id', { count: 'exact', head: true });

    if (subError) {
      return { success: false, hasServiceKey, subParcelsCount: 0, viewCount: 0, error: `sub_parcels error: ${subError.message}` };
    }

    // Test 2: View query
    const { data: viewData, error: viewError, count: viewCount } = await client
      .from('v_sprayable_parcels')
      .select('id', { count: 'exact', head: true });

    if (viewError) {
      return { success: false, hasServiceKey, subParcelsCount: subCount || 0, viewCount: 0, error: `view error: ${viewError.message}` };
    }

    console.log(`[testDatabaseConnection] SUCCESS: sub_parcels=${subCount}, view=${viewCount}`);
    return { success: true, hasServiceKey, subParcelsCount: subCount || 0, viewCount: viewCount || 0 };
  } catch (err: any) {
    return { success: false, hasServiceKey, subParcelsCount: 0, viewCount: 0, error: err.message };
  }
}
