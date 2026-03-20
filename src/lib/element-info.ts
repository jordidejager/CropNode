/**
 * Element Informatie Utility
 *
 * Vertaalt chemische symbolen naar Nederlandse namen en biedt
 * zoekondersteuning voor elementen in de meststoffen database.
 *
 * Elke element entry bevat:
 * - symbol: Chemisch symbool (Fe, Cu, etc.)
 * - nameDutch: Volledige Nederlandse naam
 * - nameEnglish: Engelse naam (voor referentie)
 * - searchTerms: Alle zoektermen waarmee gebruikers dit element kunnen vinden
 */

export interface ElementInfo {
  symbol: string;
  nameDutch: string;
  nameEnglish: string;
  /** Extra zoektermen (bijv. "boor" voor B, "ijzer" voor Fe) */
  searchTerms: string[];
}

/**
 * Complete mapping van chemische symbolen naar element-informatie.
 * Bevat alle elementen die in meststoffen voorkomen.
 */
export const ELEMENT_MAP: Record<string, ElementInfo> = {
  N:   { symbol: 'N',   nameDutch: 'Stikstof',  nameEnglish: 'Nitrogen',   searchTerms: ['stikstof', 'nitrogen', 'nitraat', 'ammonium', 'ureum'] },
  P:   { symbol: 'P',   nameDutch: 'Fosfor',    nameEnglish: 'Phosphorus', searchTerms: ['fosfor', 'fosfaat', 'phosphorus', 'fosforzuur'] },
  K:   { symbol: 'K',   nameDutch: 'Kalium',    nameEnglish: 'Potassium',  searchTerms: ['kalium', 'potassium', 'kali'] },
  Ca:  { symbol: 'Ca',  nameDutch: 'Calcium',   nameEnglish: 'Calcium',    searchTerms: ['calcium', 'kalk', 'stip'] },
  Mg:  { symbol: 'Mg',  nameDutch: 'Magnesium', nameEnglish: 'Magnesium',  searchTerms: ['magnesium', 'bitterzout'] },
  S:   { symbol: 'S',   nameDutch: 'Zwavel',    nameEnglish: 'Sulfur',     searchTerms: ['zwavel', 'sulfur', 'sulfo', 'zwavel'] },
  Fe:  { symbol: 'Fe',  nameDutch: 'IJzer',     nameEnglish: 'Iron',       searchTerms: ['ijzer', 'iron', 'ferro', 'ijzerchelaat'] },
  Mn:  { symbol: 'Mn',  nameDutch: 'Mangaan',   nameEnglish: 'Manganese',  searchTerms: ['mangaan', 'manganese'] },
  Zn:  { symbol: 'Zn',  nameDutch: 'Zink',      nameEnglish: 'Zinc',       searchTerms: ['zink', 'zinc'] },
  Cu:  { symbol: 'Cu',  nameDutch: 'Koper',     nameEnglish: 'Copper',     searchTerms: ['koper', 'copper', 'kopersulfaat', 'koperoxychloride'] },
  B:   { symbol: 'B',   nameDutch: 'Borium',    nameEnglish: 'Boron',      searchTerms: ['borium', 'boron', 'boor', 'borax', 'boorzuur'] },
  Mo:  { symbol: 'Mo',  nameDutch: 'Molybdeen', nameEnglish: 'Molybdenum', searchTerms: ['molybdeen', 'molybdenum', 'moly'] },
  // Oxide-vormen (worden in composition JSONB opgeslagen als CaO, MgO, etc.)
  CaO: { symbol: 'CaO', nameDutch: 'Calcium',   nameEnglish: 'Calcium oxide', searchTerms: ['calcium', 'kalk', 'calciumoxide', 'stip'] },
  MgO: { symbol: 'MgO', nameDutch: 'Magnesium', nameEnglish: 'Magnesium oxide', searchTerms: ['magnesium', 'magnesiumoxide', 'bitterzout'] },
  SO3: { symbol: 'SO3', nameDutch: 'Zwavel',    nameEnglish: 'Sulfur trioxide', searchTerms: ['zwavel', 'sulfaat', 'zwavelzuur'] },
  // Extra oxide-vormen uit sommige producten
  P2O5: { symbol: 'P2O5', nameDutch: 'Fosfor', nameEnglish: 'Phosphorus pentoxide', searchTerms: ['fosfor', 'fosfaat', 'fosforzuur'] },
  K2O:  { symbol: 'K2O',  nameDutch: 'Kalium', nameEnglish: 'Potassium oxide',   searchTerms: ['kalium', 'kali'] },
};

/**
 * Geeft de volledige Nederlandse weergave van een element terug.
 * Bijv: "Cu" → "Koper (Cu)", "CaO" → "Calcium (CaO)"
 */
export function getElementDisplayName(symbol: string): string {
  const info = ELEMENT_MAP[symbol];
  if (!info) return symbol;
  return `${info.nameDutch} (${symbol})`;
}

/**
 * Geeft alleen de Nederlandse naam terug.
 * Bijv: "Cu" → "Koper", "Fe" → "IJzer"
 */
export function getElementDutchName(symbol: string): string {
  return ELEMENT_MAP[symbol]?.nameDutch ?? symbol;
}

/**
 * Checkt of een zoekterm matcht met een element.
 * Gebruikt voor de zoekfunctie in de meststoffen database.
 *
 * @param searchTerm - De zoekterm van de gebruiker (bijv. "koper", "ijzer", "borium")
 * @returns Array van element-symbolen die matchen
 */
export function findMatchingElements(searchTerm: string): string[] {
  const lower = searchTerm.toLowerCase().trim();
  if (!lower) return [];

  const matches: string[] = [];

  for (const [symbol, info] of Object.entries(ELEMENT_MAP)) {
    // Match op symbool zelf
    if (symbol.toLowerCase() === lower) {
      matches.push(symbol);
      continue;
    }
    // Match op Nederlandse naam
    if (info.nameDutch.toLowerCase().includes(lower)) {
      matches.push(symbol);
      continue;
    }
    // Match op zoektermen
    if (info.searchTerms.some(term => term.includes(lower) || lower.includes(term))) {
      matches.push(symbol);
    }
  }

  return matches;
}

/**
 * Checkt of een meststof-composition een bepaalde zoekterm bevat.
 * Gebruikt voor element-zoek in de database pagina.
 */
export function compositionMatchesSearch(
  composition: Record<string, number | undefined> | null | undefined,
  searchTerm: string
): boolean {
  if (!composition) return false;

  const matchingElements = findMatchingElements(searchTerm);
  if (matchingElements.length === 0) return false;

  // Check of één van de matchende elementen in de composition zit
  return matchingElements.some(symbol =>
    composition[symbol] !== undefined && composition[symbol] !== null
  );
}
