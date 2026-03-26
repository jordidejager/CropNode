/**
 * Meta Cloud API client for sending WhatsApp messages.
 * Uses the WhatsApp Business Platform (not Twilio).
 */

import type { WhatsAppButton } from './types';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp configuratie ontbreekt: WHATSAPP_PHONE_NUMBER_ID en WHATSAPP_ACCESS_TOKEN moeten ingesteld zijn.');
  }

  return { phoneNumberId, accessToken };
}

async function sendRequest(body: Record<string, unknown>): Promise<string> {
  const { phoneNumberId, accessToken } = getConfig();
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[WhatsApp Client] API error ${response.status}:`, errorBody);
    throw new Error(`WhatsApp API fout: ${response.status} — ${errorBody}`);
  }

  const data = await response.json();
  const messageId = data.messages?.[0]?.id;
  return messageId || '';
}

/**
 * Send a plain text message.
 * @param to Phone number in E.164 format without + (e.g., "31612345678")
 * @param text Message body (max 4096 chars)
 * @returns WhatsApp message ID
 */
export async function sendTextMessage(to: string, text: string): Promise<string> {
  console.log(`[WhatsApp Client] Sending text to ${to}: "${text.substring(0, 80)}..."`);

  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}

/**
 * Send an interactive button message.
 * @param to Phone number without +
 * @param bodyText Message body text
 * @param buttons Array of buttons (max 3, title max 20 chars each)
 * @returns WhatsApp message ID
 */
export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: WhatsAppButton[]
): Promise<string> {
  if (buttons.length > 3) {
    throw new Error('WhatsApp ondersteunt maximaal 3 buttons per bericht.');
  }

  console.log(`[WhatsApp Client] Sending interactive to ${to} with ${buttons.length} buttons`);

  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.substring(0, 20) },
        })),
      },
    },
  });
}

/**
 * Mark a message as read (sends blue checkmarks).
 * @param messageId The WhatsApp message ID (wamid.xxx)
 */
export async function markAsRead(messageId: string): Promise<void> {
  const { phoneNumberId, accessToken } = getConfig();
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch (error) {
    // Non-critical — don't throw, just log
    console.warn(`[WhatsApp Client] Failed to mark as read:`, error);
  }
}
