/**
 * TypeScript types for the WhatsApp Bot integration.
 */

import type { SprayRegistrationGroup } from '@/lib/types';

// ============================================================================
// Database types
// ============================================================================

export interface WhatsAppLinkedNumber {
  id: string;
  userId: string;
  phoneNumber: string;
  phoneLabel: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationState =
  | 'idle'
  | 'awaiting_product_selection'
  | 'awaiting_confirmation'
  | 'awaiting_edit_choice'
  | 'awaiting_edit_input'
  | 'confirmed'
  | 'cancelled'
  | 'expired';

/**
 * Stored inside pending_registration JSONB when we need the user to
 * pick the correct product name from a list of CTGB suggestions.
 */
export interface ProductSelectionContext {
  unitIndex: number;
  productIndex: number;
  originalName: string;
  options: string[]; // CTGB product names (max 3)
}

export interface WhatsAppConversation {
  id: string;
  userId: string;
  phoneNumber: string;
  waMessageId: string | null;
  state: ConversationState;
  pendingRegistration: SprayRegistrationGroup | null;
  lastInput: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhatsAppMessageLog {
  id: string;
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  messageText: string | null;
  waMessageId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ============================================================================
// Meta Cloud API types (webhook payloads)
// ============================================================================

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: WhatsAppWebhookValue;
      field: string;
    }>;
  }>;
}

export interface WhatsAppWebhookValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: { name: string };
    wa_id: string;
  }>;
  messages?: Array<WhatsAppInboundMessage>;
  statuses?: Array<{
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
  }>;
}

export interface WhatsAppInboundMessage {
  from: string; // Phone number without +
  id: string;   // WhatsApp message ID (wamid.xxx)
  timestamp: string;
  type: 'text' | 'interactive' | 'image' | 'audio' | 'document' | 'video' | 'location' | 'sticker' | 'contacts';
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

// ============================================================================
// WhatsApp client config
// ============================================================================

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret: string;
}

export interface WhatsAppButton {
  id: string;
  title: string; // max 20 chars
}
