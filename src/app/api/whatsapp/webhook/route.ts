/**
 * WhatsApp Webhook API Route.
 * GET: Meta webhook verification (required during setup).
 * POST: Incoming messages from WhatsApp users.
 *
 * Processes messages synchronously. The AI pipeline takes ~5-8s.
 * Meta allows up to 20s before retrying, Vercel Pro allows 60s per function.
 * Synchronous is simpler and more reliable than async patterns.
 */

import { createHmac } from 'crypto';
import { handleIncomingMessage } from '@/lib/whatsapp/message-handler';
import { markAsRead } from '@/lib/whatsapp/client';
import type { WhatsAppWebhookPayload, WhatsAppInboundMessage } from '@/lib/whatsapp/types';

export const maxDuration = 60;

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
      return new Response('OK', { status: 200 });
    }

    // 5. Process messages synchronously
    for (const msg of messages) {
      try {
        markAsRead(msg.id).catch(() => {});

        const messageText = msg.text?.body || null;
        const buttonReplyId = msg.interactive?.button_reply?.id
          || msg.interactive?.list_reply?.id
          || null;

        console.log(`[WhatsApp Webhook] Processing message from ${msg.from}: "${messageText?.substring(0, 50) || buttonReplyId || msg.type}"`);

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
    return new Response('OK', { status: 200 });
  }
}

// ============================================================================
// Helpers
// ============================================================================

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

  if (signature.length !== expectedSignature.length) return false;

  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return mismatch === 0;
}

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
