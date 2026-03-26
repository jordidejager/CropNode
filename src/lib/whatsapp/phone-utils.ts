/**
 * Phone number utilities for WhatsApp integration.
 * All storage uses E.164 format: +31612345678
 * Meta sends numbers without + prefix: 31612345678
 */

/**
 * Normalize a Dutch phone number to E.164 format (+31612345678).
 * Handles: 06xxxxxxxx, 316xxxxxxxx, 0031xxxxxxxx, +316xxxxxxxx
 * @throws Error if the number is invalid
 */
export function normalizeToE164(input: string): string {
  // Strip spaces, dashes, parentheses, dots
  let cleaned = input.replace(/[\s\-().]/g, '');

  // Handle Dutch formats
  if (cleaned.startsWith('06')) {
    cleaned = '+31' + cleaned.slice(1); // 06xxx → +316xxx
  } else if (cleaned.startsWith('0031')) {
    cleaned = '+31' + cleaned.slice(4); // 0031xxx → +31xxx
  } else if (cleaned.startsWith('31') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned; // 31xxx → +31xxx (Meta format)
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned; // add + if missing
  }

  // Validate E.164 format
  if (!/^\+\d{10,15}$/.test(cleaned)) {
    throw new Error(`Ongeldig telefoonnummer: "${input}". Verwacht formaat: +31612345678`);
  }

  return cleaned;
}

/**
 * Format E.164 number for display: +31612345678 → +31 6 1234 5678
 */
export function formatPhoneDisplay(e164: string): string {
  if (e164.startsWith('+316') && e164.length === 12) {
    // Dutch mobile: +31 6 1234 5678
    return `+31 6 ${e164.slice(4, 8)} ${e164.slice(8)}`;
  }
  // Generic: just add spaces every 4 digits after country code
  return e164;
}

/**
 * Strip + prefix for Meta API (they use 31612345678 format).
 */
export function stripPlus(e164: string): string {
  return e164.replace(/^\+/, '');
}

/**
 * Add + prefix to Meta format number (31612345678 → +31612345678).
 */
export function addPlus(metaFormat: string): string {
  return metaFormat.startsWith('+') ? metaFormat : `+${metaFormat}`;
}

/**
 * Validate if a string is valid E.164 format.
 */
export function isValidE164(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone);
}
