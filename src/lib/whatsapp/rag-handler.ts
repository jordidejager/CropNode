/**
 * WhatsApp RAG Handler — teeltkennis chatbot via WhatsApp.
 *
 * Detects knowledge-seeking questions and routes them through the
 * same RAG pipeline used by the web chat. Formats the response for
 * WhatsApp (max 4096 chars, *bold* instead of **bold**, emoji structure).
 *
 * Integration: called from message-handler.ts between product query
 * and spray registration intents.
 */

import { createServiceRoleClient } from '@/lib/supabase-client';
import { runChatPipeline } from '@/lib/knowledge/rag/pipeline';
import { sendTextMessage } from './client';
import { logMessage } from './store';

import type { RagEvent, CtgbAnnotation } from '@/lib/knowledge/rag/types';

// ============================================
// Intent detection
// ============================================

/**
 * Patterns that indicate a knowledge/encyclopedic question
 * (NOT a spray registration, product lookup, or field note)
 */
const RAG_PATTERNS = [
  // Direct questions
  /\b(hoe|wat|wanneer|waarom|welke?|hoeveel|hoelang|kan ik|mag ik|moet ik)\b/i,
  // Disease/pest related
  /\b(schurft|meeldauw|vruchtrot|kanker|bacterievuur|perenbladvlo|fruitmot|spint|bloedluis|luis|wants|rupsen|monilia|stemphylium)\b/i,
  // Growth management
  /\b(dunnen|dunning|vruchtzetting|zetting|groeiregulatie|snoei|snoeien|bewaring|bewaren)\b/i,
  // General knowledge
  /\b(levenscyclus|bestrijding|behandeling|preventief|curatief|resistentie|resistentiemanagement)\b/i,
  // Timing
  /\b(nu doen|nu spuiten|dit moment|deze periode|deze fase|volle bloei|bloei)\b/i,
  // Encyclopedic
  /\b(informatie|info over|uitleg|vertel|beschrijf|herken)\b/i,
];

/**
 * Patterns that should NOT trigger RAG (more specific intents take priority)
 */
const NOT_RAG_PATTERNS = [
  // Explicit spray registrations (contains dosage/product/parcel combos)
  /\d+[.,]?\d*\s*(l|ltr|liter|kg|ml|gr|gram)\s*\/?\s*(ha|hectare)?/i,
  // Field notes
  /^(notitie|onthoud|memo)\s*:/i,
  // Weather
  /\b(weer|weersverwachting|14.?daagse?|regen.?verwacht)\b/i,
  // Greetings / meta
  /^(hoi|hallo|hey|goedemorgen|goedemiddag|bedankt|dankje|oke|ok|ja|nee|top)$/i,
];

/**
 * Detect if a message is a knowledge query suitable for the RAG pipeline.
 * Returns true if it matches RAG patterns and doesn't match exclusion patterns.
 */
export function isRagQueryIntent(text: string): boolean {
  const trimmed = text.trim();

  // Too short for a meaningful question
  if (trimmed.length < 8) return false;

  // Exclude explicit non-RAG intents
  if (NOT_RAG_PATTERNS.some((p) => p.test(trimmed))) return false;

  // Check if it matches any RAG pattern
  return RAG_PATTERNS.some((p) => p.test(trimmed));
}

// ============================================
// Main handler
// ============================================

/**
 * Handle a knowledge query via WhatsApp.
 * Runs the full RAG pipeline and formats the response for WhatsApp.
 */
export async function handleRagQuery(
  userId: string,
  phoneNumber: string,
  queryText: string,
  _waMessageId: string,
): Promise<void> {
  const supabase = createServiceRoleClient();

  try {
    // Collect all events from the RAG pipeline
    let answer = '';
    let annotations: CtgbAnnotation[] = [];
    let sources: Array<{ title: string; category: string; subcategory: string | null }> = [];
    let hasError = false;

    for await (const event of runChatPipeline({ supabase, query: queryText })) {
      switch (event.type) {
        case 'answer_chunk':
          answer += event.text;
          break;
        case 'ctgb_annotation':
          annotations = event.annotations ?? [];
          break;
        case 'sources':
          sources = (event.chunks ?? []).map((c: any) => ({
            title: c.title,
            category: c.category,
            subcategory: c.subcategory,
          }));
          break;
        case 'error':
          hasError = true;
          answer = 'Er is een tijdelijk probleem opgetreden. Probeer het later opnieuw.';
          break;
        case 'done':
          break;
      }
    }

    if (!answer && !hasError) {
      answer = 'Ik heb hier geen informatie over gevonden. Stel je vraag iets anders, of raadpleeg een teeltadviseur.';
    }

    // Format for WhatsApp
    const formatted = formatWhatsAppResponse(answer, annotations, sources);

    // Send response
    await sendTextMessage(phoneNumber, formatted);

    // Log
    await logMessage({
      phoneNumber,
      direction: 'outbound',
      messageText: formatted.slice(0, 500),
      metadata: { type: 'rag_response', query: queryText.slice(0, 200) },
    });

  } catch (err) {
    const errorMsg = '⚠️ Er ging iets mis bij het zoeken in de kennisbank. Probeer het later opnieuw.';
    try {
      await sendTextMessage(phoneNumber, errorMsg);
    } catch {
      // If sending also fails, just log
    }
    console.error('[whatsapp-rag] Error:', err instanceof Error ? err.message : err);
  }
}

// ============================================
// WhatsApp formatting
// ============================================

/**
 * Format a RAG response for WhatsApp.
 * - Converts **bold** to *bold* (WhatsApp format)
 * - Adds CTGB annotations as emoji badges
 * - Adds source references
 * - Truncates to 4096 chars max
 */
function formatWhatsAppResponse(
  answer: string,
  annotations: CtgbAnnotation[],
  sources: Array<{ title: string; category: string; subcategory: string | null }>,
): string {
  const parts: string[] = [];

  // 1. Answer (convert markdown to WhatsApp format)
  let formatted = answer
    // **bold** → *bold* (WhatsApp uses single asterisks)
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    // Remove markdown headers (## etc)
    .replace(/^#{1,3}\s+/gm, '*')
    // Clean up excessive newlines
    .replace(/\n{3,}/g, '\n\n');

  parts.push('🌿 ' + formatted);

  // 2. CTGB annotations (if any products were checked)
  if (annotations.length > 0) {
    const ctgbLines: string[] = [];
    const relevant = annotations.filter((a) =>
      a.status === 'toegelaten' || a.status === 'vervallen',
    );

    if (relevant.length > 0) {
      ctgbLines.push('');
      ctgbLines.push('🧪 _CTGB Toelatingscheck:_');
      for (const ann of relevant) {
        const icon = ann.status === 'toegelaten' ? '✅' : '❌';
        const statusText = ann.status === 'toegelaten' ? 'toegelaten' : 'VERVALLEN';
        const nr = ann.toelatingsnummer ? ` (${ann.toelatingsnummer})` : '';
        ctgbLines.push(`${icon} ${ann.product}${nr} — ${statusText}`);
      }
      parts.push(ctgbLines.join('\n'));
    }
  }

  // 3. Sources (compact, max 3)
  if (sources.length > 0) {
    const sourceLines = ['', '📚 _Bronnen:_'];
    for (const source of sources.slice(0, 3)) {
      const cat = source.subcategory
        ? `${source.category}/${source.subcategory}`
        : source.category;
      sourceLines.push(`• ${source.title} _(${cat})_`);
    }
    if (sources.length > 3) {
      sourceLines.push(`_...en ${sources.length - 3} meer_`);
    }
    parts.push(sourceLines.join('\n'));
  }

  // 4. Disclaimer
  parts.push('\n_Controleer altijd het actuele CTGB-etiket._');

  // Join and truncate
  let result = parts.join('\n');
  if (result.length > 4000) {
    result = result.slice(0, 3950) + '\n\n_...antwoord ingekort_';
  }

  return result;
}
