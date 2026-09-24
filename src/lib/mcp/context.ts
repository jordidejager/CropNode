import { getOrLoadContext, type CachedContext } from '@/lib/registration-pipeline';
import { getParcelGroupsForUser } from '@/lib/whatsapp/store';

export interface McpContext extends CachedContext {
  userId: string;
  groups: Array<{ id: string; name: string; subParcelIds: string[] }>;
}

/** Parcels, CTGB products, fertilizers, groups and 90-day history for one user (cached 5 min). */
export async function laadContext(userId: string): Promise<McpContext> {
  const [ctx, groups] = await Promise.all([getOrLoadContext(userId), getParcelGroupsForUser(userId)]);
  return { ...ctx, userId, groups };
}
