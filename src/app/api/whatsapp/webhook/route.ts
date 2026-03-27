/**
 * WhatsApp Webhook API Route.
 * GET: Meta webhook verification (required during setup).
 * POST: Incoming messages from WhatsApp users.
 *
 * IMPORTANT: Meta expects a 200 response within 20 seconds.
 * Processing is done asynchronously after returning 200.
 */

import { createHmac } from 'crypto';
import { handleIncomingMessage } from '@/lib/whatsapp/message-handler';
import { markAsRead } from '@/lib/whatsapp/client';
import type { WhatsAppWebhookPayload, WhatsAppInboundMessage } from '@/lib/whatsapp/types';

// ============================================================================
// GET — Webhook Verification
// ============================================================================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verification successful');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Verification failed');
  return new Response('Forbidden', { status: 403 });
}

// ============================================================================
// POST — Incoming Messages
// ============================================================================

export async function POST(request: Request) {
  try {
    // 1. Read raw body for signature verification
    const rawBody = await request.text();

    // 2. Verify signature (MANDATORY for security)
    const signature = request.headers.get('x-hub-signature-256');
    if (!verifySignature(rawBody, signature)) {
      console.error('[WhatsApp Webhook] Invalid signature');
      return new Response('Unauthorized', { status: 401 });
    }

    // 3. Parse payload
    let payload: WhatsAppWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error('[WhatsApp Webhook] Invalid JSON');
      return new Response('Bad Request', { status: 400 });
    }

    // 4. Extract messages
    const messages = extractMessages(payload);
    if (messages.length === 0) {
      // Status update or other non-message event — acknowledge
      return new Response('OK', { status: 200 });
    }

    // 5. Process messages synchronously before returning
    // Vercel serverless has up to 60s (Pro) or 10s (Hobby) timeout.
    // Meta allows up to 20s before retry. This approach is simpler and
    // more reliable than after()/waitUntil() which can silently fail.
    for (const msg of messages) {
      try {
        // Mark as read (non-blocking)
        markAsRead(msg.id).catch(() => {});

        // Extract message content
        const messageText = msg.text?.body || null;
        const buttonReplyId = msg.interactive?.button_reply?.id || null;

        console.log(`[WhatsApp Webhook] Processing message from ${msg.from}: "${messageText?.substring(0, 50) || buttonReplyId || msg.type}"`);

        // Route to message handler
        await handleIncomingMessage(
          msg.from,
          messageText,
          buttonReplyId,
          msg.id,
          msg.type
        );

        console.log(`[WhatsApp Webhook] Message ${msg.id} processed successfully`);
      } catch (error) {
        console.error(`[WhatsApp Webhook] Error processing message ${msg.id}:`, error);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[WhatsApp Webhook] Top-level error:', error);
    // Still return 200 to prevent Meta from retrying
    return new Response('OK', { status: 200 });
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Verify the X-Hub-Signature-256 header using HMAC-SHA256.
 */
function verifySignature(body: string, signature: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    console.error('[WhatsApp Webhook] WHATSAPP_APP_SECRET not configured');
    return false;
  }

  if (!signature) {
    console.error('[WhatsApp Webhook] No signature header');
    return false;
  }

  const expectedSignature = 'sha256=' + createHmac('sha256', appSecret)
    .update(body)
    .digest('hex');

  // Constant-time comparison
  if (signature.length !== expectedSignature.length) return false;

  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Extract messages from the nested Meta webhook payload structure.
 */
function extractMessages(payload: WhatsAppWebhookPayload): WhatsAppInboundMessage[] {
  const messages: WhatsAppInboundMessage[] = [];

  if (payload.object !== 'whatsapp_business_account') return messages;

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (value.messages) {
        messages.push(...value.messages);
      }
    }
  }

  return messages;
}
