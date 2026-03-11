/**
 * Request Context — Secure userId propagation via AsyncLocalStorage
 *
 * Used to pass the server-verified userId to AI tool handlers without
 * exposing it as an AI-controllable input parameter (prevents prompt injection
 * from manipulating the userId).
 *
 * Usage:
 *   // In API route (set):
 *   requestContext.run({ userId }, async () => { ... });
 *
 *   // In AI tool handler (get):
 *   const userId = getVerifiedUserId();
 */

import { AsyncLocalStorage } from 'async_hooks';

interface RequestStore {
    userId: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

/**
 * Get the verified userId from the current request context.
 * Throws if no authenticated user context is available.
 */
export function getVerifiedUserId(): string {
    const ctx = requestContext.getStore();
    if (!ctx?.userId) {
        throw new Error('No authenticated user in request context');
    }
    return ctx.userId;
}
