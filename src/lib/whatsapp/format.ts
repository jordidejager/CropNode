/**
 * WhatsApp message formatting for registration summaries.
 * Uses WhatsApp-supported formatting: *bold*, _italic_, ~strikethrough~
 * No markdown headers or lists — use emoji for visual structure.
 */

import type { AnalysisResult } from '@/lib/spray-pipeline';
import type { SprayRegistrationGroup, SprayRegistrationUnit } from '@/lib/types';

const MAX_WHATSAPP_LENGTH = 4096;
// Interactive messages (with buttons) have a stricter body limit
const MAX_INTERACTIVE_BODY_LENGTH = 1020;

/**
 * Format a registration analysis result for WhatsApp display.
 */
export function formatRegistrationSummary(
  result: AnalysisResult,
  parcelNameMap: Map<string, { name: string; area?: number; crop?: string; variety?: string }>
): string {
  if (!result.registration) {
    return result.humanSummary || 'Geen registratie herkend.';
  }

  const group = result.registration;
  const lines: string[] = [];

  // Title
  const isSpray = group.registrationType !== 'spreading';
  lines.push(isSpray ? '📋 *Bespuiting*' : '📋 *Bemesting*');
  lines.push('');

  // Format each unit
  for (let i = 0; i < group.units.length; i++) {
    const unit = group.units[i];

    // Unit label for multi-unit registrations
    if (group.units.length > 1 && unit.label) {
      lines.push(`*${unit.label}*`);
    }

    // Products
    for (const prod of unit.products) {
      const ctgbMark = prod.source === 'fertilizer' ? '' : ' (CTGB ✓)';
      const resolved = prod.resolved !== false ? ctgbMark : ' ⚠️';
      lines.push(`🌿 *${prod.product}*${resolved}`);
      if (prod.dosage > 0) {
        lines.push(`   Dosering: ${prod.dosage} ${prod.unit}/ha`);
      } else {
        lines.push(`   Dosering: _nog invullen_`);
      }
    }

    // Parcels
    const parcelNames: string[] = [];
    let totalArea = 0;
    for (const plotId of unit.plots) {
      const parcel = parcelNameMap.get(plotId);
      if (parcel) {
        parcelNames.push(parcel.name);
        totalArea += parcel.area || 0;
      }
    }

    if (parcelNames.length > 0) {
      lines.push('');
      lines.push('📍 *Percelen:*');
      // Show up to 8 parcels, then summarize
      const showCount = Math.min(parcelNames.length, 8);
      for (let j = 0; j < showCount; j++) {
        const plotId = unit.plots[j];
        const parcel = parcelNameMap.get(plotId);
        const areaStr = parcel?.area ? ` — ${parcel.area.toFixed(2)} ha` : '';
        lines.push(`• ${parcelNames[j]}${areaStr}`);
      }
      if (parcelNames.length > 8) {
        lines.push(`• _en ${parcelNames.length - 8} andere..._`);
      }
      if (totalArea > 0) {
        lines.push(`Totaal: ${totalArea.toFixed(2)} ha`);
      }
    }

    // Separator between units
    if (i < group.units.length - 1) {
      lines.push('');
      lines.push('─────────────');
    }
  }

  // Date
  lines.push('');
  const dateStr = formatDate(group.date);
  lines.push(`📅 Datum: ${dateStr}`);

  // Only show blocking errors (not interval warnings or info)
  const blockingErrors = (result.validationFlags || []).filter(f => f.type === 'error');
  if (blockingErrors.length > 0) {
    lines.push('');
    for (const flag of blockingErrors) {
      lines.push(`❌ ${flag.message}`);
    }
  }

  // Call to action
  lines.push('');
  lines.push('Klopt dit? _(Annuleren? Stuur een nieuw bericht.)_');

  let text = lines.join('\n');

  // Interactive button messages are limited to 1024 chars — truncate firmly
  if (text.length > MAX_INTERACTIVE_BODY_LENGTH) {
    text = text.substring(0, MAX_INTERACTIVE_BODY_LENGTH - 20) + '\n\n_...ingekort_';
  }

  return text;
}

/**
 * Format the confirmation success message.
 */
export function formatConfirmationMessage(): string {
  return '✅ Opgeslagen! Je registratie is zichtbaar in je Spuitschrift.';
}

/**
 * Format the cancellation message.
 */
export function formatCancellationMessage(): string {
  return '❌ Geannuleerd. Je registratie is niet opgeslagen.';
}

/**
 * Format the "expired" message.
 */
export function formatExpiredMessage(): string {
  return '⏱️ Je registratie is verlopen. Stuur je bericht opnieuw.';
}

/**
 * Format the "unknown number" message.
 */
export function formatUnknownNumberMessage(): string {
  return [
    '👋 Dit nummer is niet gekoppeld aan een CropNode account.',
    '',
    'Koppel je nummer via *Instellingen > WhatsApp* in de CropNode app.',
  ].join('\n');
}

/**
 * Format the "unsupported media" message.
 */
export function formatUnsupportedMediaMessage(): string {
  return '📝 Ik kan alleen tekstberichten verwerken. Typ je registratie als tekst, bijv. "alle appels met Captan 2L/ha"';
}

/**
 * Format the "not recognized as registration" message.
 */
export function formatNotRecognizedMessage(): string {
  return [
    '🤔 Ik herkende geen registratie in je bericht.',
    '',
    '*Bespuiting of bemesting:*',
    '• "Alle appels gespoten met Captan 2L/ha"',
    '• "Conference bemest met MKP 3 kg/ha"',
    '• "Gisteren Elstar en Jonagold met Score 0.3L"',
    '',
    '*Veldnotitie:*',
    '• "Notitie: veel bladluis gezien op Elstar"',
    '• "Noteer: hagelschade blok 2"',
  ].join('\n');
}

/**
 * Format an error message.
 */
export function formatErrorMessage(): string {
  return '❗ Sorry, er ging iets mis bij het verwerken. Probeer het opnieuw of gebruik de CropNode app.';
}

/**
 * Format "edit choice" body — shown as body of the edit-choice interactive message.
 */
export function formatEditChoiceBody(): string {
  return 'Wat wil je aanpassen?';
}

/**
 * Format the prompt for each edit field.
 */
export function formatEditInputPrompt(field: 'date' | 'products' | 'parcels'): string {
  if (field === 'date') return '📅 Typ de nieuwe datum, bijv. _"gisteren"_, _"28 maart"_ of _"zaterdag"_:';
  if (field === 'products') return '🌿 Typ de *volledige nieuwe lijst* van middelen en doseringen (niet wat je wil verwijderen), bijv:\n_"0,5 kg delan en 0,75 L pyrus"_';
  return '📍 Typ de percelen opnieuw, bijv. _"zuidhoek, busje en conference murre"_:';
}

/**
 * Format "edit" instruction message (legacy fallback).
 */
export function formatEditMessage(): string {
  return '✏️ Stuur je registratie opnieuw met de aanpassing.';
}

/**
 * Format the product selection prompt.
 * Shown when the pipeline finds an unrecognized product with CTGB suggestions.
 */
export function formatProductSelectionMessage(originalName: string, options: string[]): string {
  return [
    `🔍 *"${originalName}"* niet herkend in CTGB.`,
    '',
    'Welk middel bedoel je?',
  ].join('\n');
}

/**
 * Format rate limit message.
 */
export function formatRateLimitMessage(): string {
  return '⏳ Je stuurt te veel berichten. Probeer het over een paar minuten opnieuw.';
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();

  // Check if today
  if (d.toDateString() === now.toDateString()) {
    return `vandaag (${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })})`;
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `gisteren (${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })})`;
  }

  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}
