/**
 * Shared custom fetch with timeout and retry for unstable networks (5G hotspot, etc.)
 * Used by ALL Supabase client instances (browser, server, middleware)
 */
export const SUPABASE_FETCH_TIMEOUT = 30000
export const SUPABASE_FETCH_MAX_RETRIES = 3

export async function supabaseFetch(
  url: RequestInfo | URL,
  options?: RequestInit
): Promise<Response> {
  for (let attempt = 0; attempt <= SUPABASE_FETCH_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)

      if (attempt === SUPABASE_FETCH_MAX_RETRIES) {
        throw error
      }

      // Exponential backoff: 100ms, 200ms, 400ms (capped at 2s)
      const delay = Math.min(100 * Math.pow(2, attempt), 2000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new Error('Max retries exceeded')
}
