import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static image assets
     * - api/whatsapp/webhook (HMAC-authed, no user session)
     * - api/weather/cron (CRON_SECRET-authed, no user session)
     * - api/knowledge/scrape (CRON_SECRET-authed, no user session)
     *
     * API routes with user auth (like /api/afzetstromen/*) ARE included so
     * Supabase can refresh the session cookie before getUser() runs in the route.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/whatsapp/webhook|api/weather/cron|api/knowledge/scrape).*)',
  ],
}
