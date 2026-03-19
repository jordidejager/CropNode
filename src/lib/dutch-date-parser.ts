/**
 * Deterministic Dutch Date Parser
 *
 * Parses Dutch date expressions without AI.
 * Handles relative dates (vandaag, gisteren), day names (maandag-zondag),
 * "vorige week" patterns, and absolute dates (12 maart, 12-3-2024).
 */

const DAY_NAMES: Record<string, number> = {
  zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3,
  donderdag: 4, vrijdag: 5, zaterdag: 6,
};

const MONTH_NAMES: Record<string, number> = {
  januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5,
  juli: 6, augustus: 7, september: 8, oktober: 9, november: 10, december: 11,
  // Abbreviations
  jan: 0, feb: 1, mrt: 2, apr: 3, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
};

/**
 * Extracts and parses a Dutch date expression from text.
 * Returns the parsed Date or null if no date found.
 *
 * @param input - Raw Dutch text that may contain a date expression
 * @param referenceDate - Reference date for relative calculations (defaults to now)
 */
export function parseDutchDate(input: string, referenceDate?: Date): Date | null {
  const ref = referenceDate ?? new Date();
  const today = stripTime(ref);
  const lower = input.toLowerCase().trim();

  // 1. Relative dates
  if (/\bvandaag\b/.test(lower)) return today;
  if (/\bgisteren\b/.test(lower)) return addDays(today, -1);
  if (/\beergisteren\b/.test(lower)) return addDays(today, -2);

  // 2. "vorige week [dag]" / "afgelopen [dag]"
  const vorigeWeekMatch = lower.match(
    /\b(?:vorige\s+week|afgelopen\s+week)\s+(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/
  );
  if (vorigeWeekMatch) {
    const targetDay = DAY_NAMES[vorigeWeekMatch[1]];
    return getMostRecentDayOfWeek(today, targetDay, true);
  }

  // 3. "afgelopen [dag]" (without "week") - most recent past occurrence
  const afgelopenMatch = lower.match(
    /\b(?:afgelopen|vorige)\s+(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/
  );
  if (afgelopenMatch) {
    const targetDay = DAY_NAMES[afgelopenMatch[1]];
    return getMostRecentDayOfWeek(today, targetDay, false);
  }

  // 4. Day name with optional time-of-day: "woensdag avond", "woensdagavond" (compound), "dinsdag ochtend"
  for (const [dayName, dayNum] of Object.entries(DAY_NAMES)) {
    // Match compound forms ("woensdagavond") AND spaced forms ("woensdag avond", "woensdag 's avonds")
    const pattern = new RegExp(
      `\\b${dayName}(?:(?:avonds?|ochtends?|middags?|nachts?|morgens?)\\b|\\s+(?:'s\\s+)?(?:avonds?|ochtends?|middags?|nachts?|morgens?)\\b|\\b)`,
    );
    if (pattern.test(lower)) {
      return getMostRecentDayOfWeek(today, dayNum, false);
    }
  }

  // 5. "DD maand" or "DD maand YYYY" (e.g., "12 maart", "12 maart 2024")
  const dutchDateMatch = lower.match(
    /\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec)(?:\s+(\d{4}))?\b/
  );
  if (dutchDateMatch) {
    const day = parseInt(dutchDateMatch[1], 10);
    const month = MONTH_NAMES[dutchDateMatch[2]];
    const year = dutchDateMatch[3] ? parseInt(dutchDateMatch[3], 10) : ref.getFullYear();
    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // 6. Numeric formats: DD-MM-YYYY, DD/MM/YYYY, DD-MM
  const numericMatch = lower.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/);
  if (numericMatch) {
    const day = parseInt(numericMatch[1], 10);
    const month = parseInt(numericMatch[2], 10) - 1; // 0-indexed
    let year = numericMatch[3]
      ? parseInt(numericMatch[3], 10)
      : ref.getFullYear();
    // Handle 2-digit year
    if (year < 100) year += 2000;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // 7. ISO format: YYYY-MM-DD
  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  return null;
}

/**
 * Extracts the date expression from text and returns the remaining text without it.
 * Useful for parsing "gisteren alle peren met Merpan" → { date, rest: "alle peren met Merpan" }
 */
export function extractDateFromText(input: string, referenceDate?: Date): {
  date: Date | null;
  textWithoutDate: string;
} {
  const date = parseDutchDate(input, referenceDate);
  if (!date) return { date: null, textWithoutDate: input };

  // Remove the matched date expression from the text
  let cleaned = input;
  const patterns = [
    /\b(?:vorige\s+week|afgelopen\s+week)\s+(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)(?:\s+(?:'s\s+)?(?:avonds?|ochtends?|middags?|nachts?))?\b/gi,
    /\b(?:afgelopen|vorige)\s+(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)(?:\s+(?:'s\s+)?(?:avonds?|ochtends?|middags?|nachts?))?\b/gi,
    /\b(?:vandaag|gisteren|eergisteren)(?:\s+(?:'s\s+)?(?:avonds?|ochtends?|middags?|nachts?))?\b/gi,
    /\b(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)(?:(?:avonds?|ochtends?|middags?|nachts?|morgens?)|(?:\s+(?:'s\s+)?(?:avonds?|ochtends?|middags?|nachts?|morgens?)))?\b/gi,
    // Standalone time-of-day words (when used after date context already matched)
    /\b(?:'s\s+)?(?:avonds?|ochtends?|middags?|nachts?)\b/gi,
    /\b\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec)(?:\s+\d{4})?\b/gi,
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/g,
  ];

  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return {
    date,
    textWithoutDate: cleaned.replace(/\s+/g, ' ').trim(),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Gets the most recent occurrence of a specific day of the week.
 * If forceLastWeek is true, always goes back to last week.
 * Otherwise, finds the most recent past occurrence (could be this week).
 */
function getMostRecentDayOfWeek(today: Date, targetDay: number, forceLastWeek: boolean): Date {
  const currentDay = today.getDay();
  let diff = currentDay - targetDay;

  if (forceLastWeek) {
    // Always go to previous week
    if (diff <= 0) diff += 7;
    diff += 7; // ensure we're in the previous week
    // But cap: if diff > 13, we went too far
    if (diff > 13) diff -= 7;
  } else {
    // Most recent occurrence: if today IS the target day, return today (diff=0)
    if (diff < 0) diff += 7;
    // diff === 0 means today, which is correct
  }

  return addDays(today, -diff);
}
