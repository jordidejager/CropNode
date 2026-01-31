'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Custom fetch with timeout and retry for unstable networks (5G hotspot, etc.)
 */
const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const maxRetries = 3
  const timeout = 30000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        keepalive: true,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)

      if (attempt === maxRetries) {
        throw error
      }

      // Wait before retry (exponential backoff)
      const delay = Math.min(100 * Math.pow(2, attempt), 2000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new Error('Max retries exceeded')
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: customFetch,
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Sessie blijft bewaard in localStorage
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    }
  )
}
