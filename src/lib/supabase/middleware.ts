import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Custom fetch with timeout and retry for unstable networks
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
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)

      if (attempt === maxRetries) {
        throw error
      }

      const delay = Math.min(100 * Math.pow(2, attempt), 2000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new Error('Max retries exceeded')
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: customFetch,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Probeer user op te halen, maar bij netwerk fouten: laat door
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    // Bij netwerk fouten: check of er een session cookie is
    // Als die er is, laat de gebruiker door (optimistic)
    const hasSessionCookie = request.cookies.getAll().some(
      cookie => cookie.name.includes('auth-token') || cookie.name.includes('sb-')
    )

    if (hasSessionCookie) {
      // Netwerk fout maar session cookie aanwezig: laat door
      console.warn('[Middleware] Network error but session cookie present, allowing through')
      return supabaseResponse
    }
  }

  // Routes die beschermd moeten worden
  const isProtectedRoute = request.nextUrl.pathname.match(/^\/(app|command-center|parcels|crop-care|research|perceelhistorie|bedrijf-dashboard|team-tasks)/)
  const isLoginPage = request.nextUrl.pathname === '/login'

  // Niet ingelogd en probeert beschermde route te bezoeken
  if (!user && isProtectedRoute) {
    // Extra check: als er session cookies zijn, laat door (optimistic)
    const hasSessionCookie = request.cookies.getAll().some(
      cookie => cookie.name.includes('auth-token') || cookie.name.includes('sb-')
    )

    if (hasSessionCookie) {
      return supabaseResponse
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Ingelogd en probeert login pagina te bezoeken
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/command-center'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
