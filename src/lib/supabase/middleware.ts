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

  // Use getSession() (reads JWT from cookies, no external fetch) for fast auth check.
  // getUser() makes an external fetch to Supabase which fails with Node.js ECONNRESET bug,
  // causing 120s+ delays (30s timeout × 4 attempts). RLS on the database still protects data.
  let user = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    user = session?.user ?? null
  } catch (error) {
    console.warn('[Middleware] Session check failed:', error instanceof Error ? error.message : 'Unknown')
  }

  // Routes die beschermd moeten worden
  const isProtectedRoute = request.nextUrl.pathname.match(/^\/(app|dashboard|slimme-invoer|gewasbescherming|percelen|oogst|weer|kennisbank|urenregistratie|analytics|wegwijzer|command-center|parcels|crop-care|harvest-hub|research|perceelhistorie|bedrijf-dashboard|team-tasks|weather|profile)/)
  const isAuthPage = request.nextUrl.pathname === '/login'
    || request.nextUrl.pathname === '/forgot-password'
    || request.nextUrl.pathname === '/reset-password'

  // Niet ingelogd en probeert beschermde route te bezoeken
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Ingelogd en probeert auth pagina te bezoeken (behalve reset-password)
  if (user && isAuthPage && request.nextUrl.pathname !== '/reset-password') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Ingelogd en bezoekt landing page (/) -> redirect naar dashboard
  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
