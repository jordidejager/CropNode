import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseFetch } from './fetch'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: supabaseFetch,
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
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // Sessie cookies 30 dagen geldig houden
              maxAge: options?.maxAge ?? 60 * 60 * 24 * 30, // 30 dagen
            })
          )
        },
      },
    }
  )

  // Probeer user op te halen
  let user = null
  let networkError = false
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    networkError = true
    console.warn('[Middleware] Network error during auth check:', error instanceof Error ? error.message : 'Unknown')
  }

  // Routes die beschermd moeten worden
  const isProtectedRoute = request.nextUrl.pathname.match(/^\/(app|command-center|parcels|crop-care|harvest-hub|research|perceelhistorie|bedrijf-dashboard|team-tasks|profile)/)
  const isAuthPage = request.nextUrl.pathname === '/login'
    || request.nextUrl.pathname === '/forgot-password'
    || request.nextUrl.pathname === '/reset-password'

  // Niet ingelogd en probeert beschermde route te bezoeken
  if (!user && isProtectedRoute) {
    // Bij netwerk error: laat door als session cookie aanwezig (optimistic)
    // RLS op de database zorgt alsnog voor data-bescherming
    if (networkError) {
      const hasSessionCookie = request.cookies.getAll().some(
        cookie => cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')
      )
      if (hasSessionCookie) {
        console.warn('[Middleware] Network error but valid session cookie pattern found, allowing through')
        return supabaseResponse
      }
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Ingelogd en probeert auth pagina te bezoeken (behalve reset-password)
  if (user && isAuthPage && request.nextUrl.pathname !== '/reset-password') {
    const url = request.nextUrl.clone()
    url.pathname = '/command-center'
    return NextResponse.redirect(url)
  }

  // Ingelogd en bezoekt landing page (/) -> redirect naar command-center
  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/command-center'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
