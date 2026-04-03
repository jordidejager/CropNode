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
 * Returns a compact summary (< 1024 chars for interactive buttons).
 * Use formatRegistrationDetail() for the full breakdown.
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
  const isSpray = group.registrationType !== 'spreading';

  // Compact header
  const allProducts = group.units.flatMap(u => u.products);
  const allPlots = group.units.flatMap(u => u.plots);
  const totalArea = allPlots.reduce((sum, id) => sum + (parcelNameMap.get(id)?.area || 0), 0);
  const dateStr = formatDate(group.date);

  lines.push(isSpray ? '📋 *Bespuiting*' : '📋 *Bemesting*');
  lines.push('');

  // Products — compact: "Product (dosering)" per line
  for (const prod of allProducts) {
    const ctgb = prod.resolved !== false ? ' ✓' : ' ⚠️';
    const dose = prod.dosage > 0 ? ` — ${prod.dosage} ${prod.unit}/ha` : '';
    lines.push(`🌿 *${prod.product}*${ctgb}${dose}`);
  }

  // Parcels — compact summary
  lines.push('');
  const parcelNames = allPlots.map(id => parcelNameMap.get(id)?.name).filter(Boolean);
  if (parcelNames.length <= 3) {
    lines.push(`📍 ${parcelNames.join(', ')}`);
  } else {
    lines.push(`📍 ${parcelNames.slice(0, 2).join(', ')} _+${parcelNames.length - 2} andere_`);
  }
  if (totalArea > 0) {
    lines.push(`   Totaal: ${totalArea.toFixed(2)} ha`);
  }

  // Date
  lines.push('');
  lines.push(`📅 ${dateStr}`);

  // Blocking errors only
  const blockingErrors = (result.validationFlags || []).filter(f => f.type === 'error');
  if (blockingErrors.length > 0) {
    lines.push('');
    for (const flag of blockingErrors) {
      lines.push(`❌ ${flag.message}`);
    }
  }

  lines.push('');
  lines.push('Klopt dit?');

  let text = lines.join('\n');
  if (text.length > MAX_INTERACTIVE_BODY_LENGTH) {
    text = text.substring(0, MAX_INTERACTIVE_BODY_LENGTH - 20) + '\n\n_...ingekort_';
  }
  return text;
}

/**
 * Format the full detailed breakdown (sent as separate text message).
 * No length limit — regular text messages support 4096 chars.
 */
export function formatRegistrationDetail(
  result: AnalysisResult,
  parcelNameMap: Map<string, { name: string; area?: number; crop?: string; variety?: string }>
): string | null {
  if (!result.registration) return null;

  const group = result.registration;
  const allProducts = group.units.flatMap(u => u.products);
  const allPlots = group.units.flatMap(u => u.plots);

  // Only generate detail if the summary would be significantly shortened
  // (4+ products or 4+ parcels)
  if (allProducts.length < 4 && allPlots.length < 4) return null;

  const lines: string[] = [];
  const isSpray = group.registrationType !== 'spreading';
  lines.push(isSpray ? '📋 *Details bespuiting*' : '📋 *Details bemesting*');
  lines.push('');

  // Full product list
  lines.push('*Middelen:*');
  for (const prod of allProducts) {
    const ctgb = prod.resolved !== false ? ' (CTGB ✓)' : ' ⚠️';
    lines.push(`🌿 *${prod.product}*${ctgb}`);
    if (prod.dosage > 0) {
      lines.push(`   Dosering: ${prod.dosage} ${prod.unit}/ha`);
    }
  }

  // Full parcel list
  lines.push('');
  lines.push('*Percelen:*');
  let totalArea = 0;
  for (const plotId of allPlots) {
    const parcel = parcelNameMap.get(plotId);
    if (parcel) {
      const areaStr = parcel.area ? ` — ${parcel.area.toFixed(2)} ha` : '';
      const variety = parcel.variety ? ` (${parcel.variety})` : '';
      lines.push(`• ${parcel.name}${variety}${areaStr}`);
      totalArea += parcel.area || 0;
    }
  }
  if (totalArea > 0) {
    lines.push(`Totaal: ${totalArea.toFixed(2)} ha`);
  }

  // Date
  lines.push('');
  lines.push(`📅 Datum: ${formatDate(group.date)}`);

  let text = lines.join('\n');
  if (text.length > MAX_WHATSAPP_LENGTH) {
    text = text.substring(0, MAX_WHATSAPP_LENGTH - 20) + '\n\n_...ingekort_';
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
