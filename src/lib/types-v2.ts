/**
 * Slimme Invoer 2.0 Types
 *
 * Hybride architectuur types:
 * - Bericht 1: Pipeline (classify + parse)
 * - Bericht 2+: AI Agent met tools
 */

import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry } from './types';
import type { ValidationFlag } from './validation-service';

// ============================================
// Processing Phases
// ============================================

export type ProcessingPhaseV2 =
  | 'idle'
  | 'processing'
  | 'waiting_for_input'
  | 'complete'
  | 'error';

// ============================================
// Conversation Types
// ============================================

export interface ClarificationRequest {
  question: string;
  options?: string[];
  field: string; // Which field is being clarified (for tracking)
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  registration?: SprayRegistrationGroup;
  clarification?: ClarificationRequest;
  validationFlags?: ValidationFlag[];
  toolsCalled?: string[];
}

// ============================================
// State Management
// ============================================

export interface SmartInputV2State {
  // Conversation
  messages: ConversationMessage[];

  // Draft registration (null = no active session)
  draft: SprayRegistrationGroup | null;

  // Processing
  phase: ProcessingPhaseV2;
  isAgentMode: boolean; // false at message 1, true at message 2+

  // Undo
  draftHistory: SprayRegistrationGroup[]; // Stack for undo (max 20)
}

// ============================================
// User Context (loaded once, sent with each request)
// ============================================

export interface CtgbProductSlim {
  id: string;
  naam: string;
  toelatingsnummer: string;
  categorie: string | null;
  werkzameStoffen: string[];
  gebruiksvoorschriften: Array<{
    gewas: string;
    doelorganisme?: string;
    dosering?: string;
    maxToepassingen?: number;
  }>;
}

export interface ParcelHistorySlim {
  parcelId: string;
  parcelName: string;
  product: string;
  dosage: number;
  unit: string;
  date: string;
}

export interface ProductAlias {
  alias: string;
  officialName: string;
  productId?: string;
}

export interface SmartInputUserContext {
  parcels: Array<{
    id: string;
    name: string;
    crop: string;
    variety: string | null;
    area: number | null;
  }>;
  products: CtgbProductSlim[];
  recentHistory: ParcelHistorySlim[];
  productAliases: ProductAlias[];
  loadedAt: string;
}

// ============================================
// API Request/Response
// ============================================

export interface SmartInputV2Request {
  message: string;
  conversationHistory: ConversationMessage[];
  currentDraft: SprayRegistrationGroup | null;
  userContext?: SmartInputUserContext; // Client-loaded context
}

export type SmartInputV2Action =
  | 'new_draft'
  | 'update_draft'
  | 'clarification_needed'
  | 'confirm_and_save'
  | 'cancel'
  | 'answer_query'
  | 'error';

export interface SmartInputV2Response {
  // Always present
  action: SmartInputV2Action;

  // Human summary (always present except on error)
  humanSummary?: string;

  // Registration data (for new_draft, update_draft, confirm_and_save)
  registration?: SprayRegistrationGroup;

  // Clarification (for clarification_needed)
  clarification?: ClarificationRequest;

  // Query answer (for answer_query - when user asks a question instead of registering)
  queryAnswer?: string;

  // Validation results
  validationFlags?: ValidationFlag[];

  // Error
  error?: string;

  // Processing metadata
  processingTimeMs?: number;
  tokensUsed?: number;
  toolsCalled?: string[];
}

// ============================================
// Streaming Types
// ============================================

export type StreamMessageV2 =
  | { type: 'processing'; phase: string }
  | { type: 'tool_call'; tool: string; input?: unknown }
  | { type: 'tool_result'; tool: string; success: boolean }
  | { type: 'complete'; response: SmartInputV2Response }
  | { type: 'error'; message: string };

// ============================================
// Agent Tool Types
// ============================================

export interface ParcelInfo {
  id: string;
  name: string;
  crop: string;
  variety: string;
  area: number;
}

export interface ProductMatch {
  officialName: string;
  toelatingsnummer?: string;
  confidence: number;
  werkzameStoffen?: string[];
  alternatives?: Array<{
    name: string;
    confidence: number;
  }>;
}

export interface SprayHistoryEntry {
  date: string;
  parcels: string[];
  products: Array<{
    name: string;
    dosage?: number;
    unit?: string;
  }>;
}

export interface SaveResult {
  success: boolean;
  spuitschriftId?: string;
  error?: string;
}

// ============================================
// Re-exports for convenience
// ============================================

export type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry, ValidationFlag };
