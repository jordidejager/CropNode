/**
 * Perceelprofiel — Enum opties voor keuzemenu's
 * Gedefinieerd als frontend constanten (niet database enums — flexibeler bij uitbreiding)
 */

// ============================================
// Gewas & Ras suggesties
// ============================================

export const GEWAS_OPTIES = ['Appel', 'Peer', 'Kers', 'Pruim', 'Overig'] as const;

export const RAS_SUGGESTIES: Record<string, string[]> = {
  Appel: [
    'Elstar', 'Jonagold', 'Jonagored', 'Kanzi', 'Junami', 'Wellant', 'Topaz',
    'Boskoop', 'Cox Orange', 'Delbar', 'Fuji', 'Gala', 'Golden Delicious',
    'Granny Smith', 'Greenstar', 'Natyra', 'Pinova', 'Red Prince', 'Rubens',
    'Smitten', 'SweeTango', 'Braeburn', 'Magic Star', 'Evelina', 'Freya',
  ],
  Peer: [
    'Conference', 'Doyenné du Comice', 'Beurré Alexandre Lucas',
    'Gieser Wildeman', 'Triomf de Vienne', 'Migo', 'Cepuna',
    'Xenia', 'Sweet Sensation', 'Forelle', 'QTee',
  ],
  Kers: ['Kordia', 'Regina', 'Lapins', 'Samba', 'Sweetheart', 'Penny', 'Tamara'],
  Pruim: ['Opal', 'Valor', 'Reine Claude', 'Victoria', 'Hauszwetsche'],
};

export const ONDERSTAM_SUGGESTIES: Record<string, string[]> = {
  Appel: ['M9', 'M9 T337', 'M9 EMLA', 'M9 Pajam 2', 'M26', 'M7', 'M106', 'MM111', 'B9', 'Geneva 41'],
  Peer: ['Kwee MC', 'Kwee Adams', 'Kwee BA29', 'Kwee Sydo', 'Kwee Eline', 'Pyrodwarf', 'OHF 333', 'OHF 87', 'OHF 69'],
  Kers: ['Gisela 5', 'Gisela 6', 'Gisela 12', 'Colt', 'MaxMa 14'],
  Pruim: ['St. Julien A', 'Pixy', 'Wavit', 'GF 655/2'],
};

// ============================================
// Teeltsysteem
// ============================================

export const TEELTSYSTEEM_OPTIES = [
  'Slanke spil', 'Spindel', 'V-haag', 'Bi-baum', 'Twee-etage',
  'Fruitwand', 'Tall Spindle', 'Solaxe', 'Overig',
] as const;

export const RIJRICHTING_OPTIES = [
  { value: 'N-Z', label: 'Noord \u2013 Zuid' },
  { value: 'O-W', label: 'Oost \u2013 West' },
  { value: 'NO-ZW', label: 'Noordoost \u2013 Zuidwest' },
  { value: 'NW-ZO', label: 'Noordwest \u2013 Zuidoost' },
] as const;

// ============================================
// Infrastructuur
// ============================================

export const HAGELNET_OPTIES = [
  'Geen', 'Wit hagelnet', 'Zwart hagelnet', 'Kristalnet', 'Combinatienet (hagel + insect)',
] as const;

export const REGENKAP_OPTIES = [
  'Geen', 'Vast systeem', 'Opvouwbaar systeem',
] as const;

export const INSECTENNET_OPTIES = [
  'Geen', 'Volledig gesloten systeem', 'Bovenafdekking', 'Zijwanden',
] as const;

export const WINDSCHERM_OPTIES = [
  'Geen', 'Natuurlijk (houtwal/haag)', 'Kunstmatig (windbreekgaas)', 'Combinatie', 'Deels windscherm, deels geen',
] as const;

export const STEUNCONSTRUCTIE_OPTIES = [
  'Palen + draad (beton)', 'Palen + draad (hout)', 'Palen + draad (staal)', 'Bamboe', 'Geen',
] as const;

// ============================================
// Waterhuishouding
// ============================================

export const IRRIGATIE_OPTIES = [
  'Geen', 'Druppelirrigatie', 'Micro-sprinkler', 'Sproeier onderbegroeiing', 'Overig',
] as const;

export const FERTIGATIE_OPTIES = [
  { value: 'ja', label: 'Ja' },
  { value: 'nee', label: 'Nee' },
  { value: 'voorbereid', label: 'Voorbereid (leidingwerk aanwezig)' },
] as const;

export const NACHTVORSTBEREGENING_OPTIES = [
  'Geen', 'Bovenberegening', 'Onderberegening', 'Combinatie',
] as const;

export const KOELBEREGENING_OPTIES = [
  'Geen', 'Bovenberegening', 'Verdampingskoeling',
] as const;

export const WATERBRON_OPTIES = [
  'Slootwater', 'Grondwater (bronboring)', 'Leidingwater', 'Regenwater (bassin)', 'Combinatie',
] as const;

export const DRAINAGE_OPTIES = [
  'Geen', 'Buisdrainage', 'Greppels/sloten', 'Moldrains', 'Onbekend',
] as const;

// ============================================
// Bodemkenmerken
// ============================================

export const GRONDSOORT_OPTIES = [
  'Zeeklei', 'Rivierklei', 'Zavel', 'Zand', 'Lichte zand', 'L\u00f6ss', 'Veen', 'Klei op veen', 'Overig',
] as const;

export const GRONDWATERNIVEAU_OPTIES = [
  { value: 'hoog', label: 'Hoog (< 60 cm -mv)' },
  { value: 'gemiddeld', label: 'Gemiddeld (60 \u2013 120 cm -mv)' },
  { value: 'laag', label: 'Laag (> 120 cm -mv)' },
  { value: 'onbekend', label: 'Onbekend' },
] as const;

// ============================================
// Certificering (multi-select)
// ============================================

export const CERTIFICERING_OPTIES = [
  'PlanetProof (MPS-GAP)', 'GlobalG.A.P.', 'Biologisch (SKAL)', 'Demeter', 'Geen certificering',
] as const;

export const DUURZAAMHEIDSPROGRAMMA_OPTIES = [
  'Beter voor Natuur & Boer (AH)', 'PLUS Duurzaam', 'Milieukeur', 'Geen',
] as const;

// ============================================
// Perceelhistorie
// ============================================

export const VOORGAAND_GEWAS_OPTIES = [
  'Appel', 'Peer', 'Grasland', 'Akkerbouw', 'Braak', 'Overig',
] as const;

export const HERINPLANT_OPTIES = [
  { value: 'ja_met_ontsmetting', label: 'Ja \u2014 met grondontsmetting' },
  { value: 'ja_zonder_ontsmetting', label: 'Ja \u2014 zonder grondontsmetting' },
  { value: 'nee', label: 'Nee (nieuwe aanplant)' },
] as const;

// ============================================
// Waardering kleuren (voor UI badges)
// ============================================

export const WAARDERING_KLEUREN: Record<string, { bg: string; text: string; label: string }> = {
  laag: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Laag' },
  vrij_laag: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'Vrij laag' },
  goed: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Goed' },
  vrij_hoog: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Vrij hoog' },
  hoog: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Hoog' },
};
