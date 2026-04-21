/**
 * Auth helper voor analytics API routes.
 *
 * getUser() kan onbetrouwbaar zijn in SSR-context als de cookie-refresh
 * nog niet heeft plaatsgevonden. We doen eerst getUser(), en vallen
 * terug op getSession() als dat faalt. Dit pattern wordt elders in de
 * codebase ook gebruikt (bijv. parcel profile route).
 */

export async function resolveUser(supabase: any): Promise<{ id: string; email?: string } | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user;
  } catch {
    // fallthrough
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData?.session?.user;
    if (sessionUser) return sessionUser;
  } catch {
    // fallthrough
  }

  return null;
}
