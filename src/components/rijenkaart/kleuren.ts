/**
 * Rijenkaart — kleuren voor rassen en kaartmarkeringen.
 *
 * Gekozen voor contrast op de PDOK-luchtfoto (groen/bruin): heldere, verzadigde 300/400-tinten.
 * Een aantal tinten is gereserveerd voor markeringen en komt daarom niet in het raspalet voor:
 *  - geel/wit  → concept-rijen (voorvertoning)
 *  - cyaan     → gemarkeerd (bv. behandeld door de gekozen bespuiting)
 *  - oranje    → 'controleren'
 *  - amber     → notities
 *  - grijs     → gerooid
 *  - wit       → selectie-omranding
 */

export const KLEUR_GEROOID = '#a8a29e';
export const KLEUR_ONBEKEND = '#e2e8f0';
export const KLEUR_SELECTIE = '#ffffff';
export const KLEUR_GEMARKEERD = '#22d3ee';
export const KLEUR_CONTROLEREN = '#f97316';
export const KLEUR_CONCEPT = '#fde047';
export const KLEUR_NOTITIE = '#f59e0b';
export const KLEUR_PERCEEL = '#10b981';
export const KLEUR_LOCATIE = '#3b82f6';
/** Donkere rand onder elke rij, voor contrast op de luchtfoto */
export const KLEUR_RAND = '#000000';

interface VasteRasKleur {
  ras: string;
  kleur: string;
  /** Extra schrijfwijzen (worden genormaliseerd zoals rasSleutel) */
  aliassen?: string[];
}

/**
 * Vaste kleuren voor bekende rassen. De eerste twaalf (de rassen die nu in gebruik zijn)
 * hebben onderling verschillende kleuren; de rest kan een tint delen — bij een botsing
 * binnen één perceel krijgt het latere ras een vrije paletkleur (zie maakKleurVoorRas).
 */
export const VASTE_RASKLEUREN: readonly VasteRasKleur[] = [
  // Peren
  { ras: 'Conference', kleur: '#60a5fa' },
  { ras: 'Doyenné du Comice', kleur: '#f472b6', aliassen: ['Comice', 'Doyenne'] },
  { ras: 'Beurré Alexandre Lucas', kleur: '#a78bfa', aliassen: ['Alexandre Lucas', 'Alexander Lucas', 'Lucas'] },
  { ras: 'Migo', kleur: '#a3e635' },
  // Appels
  { ras: 'Tessa', kleur: '#f87171' },
  { ras: 'Jonagold', kleur: '#e879f9', aliassen: ['Jonagored', 'Red Jonaprince', 'Jonaprince'] },
  { ras: 'Elstar', kleur: '#2dd4bf' },
  { ras: 'Kanzi', kleur: '#818cf8' },
  { ras: 'Greenstar', kleur: '#4ade80' },
  { ras: 'Cox’s Orange Pippin', kleur: '#fda4af', aliassen: ['Cox Orange Pippin', 'Cox Orange', 'Cox'] },
  { ras: 'Rode Boskoop', kleur: '#93c5fd', aliassen: ['Boskoop', 'Goudreinet', 'Schone van Boskoop'] },
  { ras: 'Golden Delicious', kleur: '#d9f99d', aliassen: ['Golden'] },
  // Overige gangbare rassen
  { ras: 'Gieser Wildeman', kleur: '#5eead4', aliassen: ['Gieser'] },
  { ras: 'Xenia', kleur: '#c4b5fd' },
  { ras: 'Sweet Sensation', kleur: '#f9a8d4' },
  { ras: 'QTee', kleur: '#a5b4fc' },
  { ras: 'Braeburn', kleur: '#fb7185' },
  { ras: 'Wellant', kleur: '#86efac' },
  { ras: 'Junami', kleur: '#f0abfc' },
  { ras: 'Rubens', kleur: '#fca5a5' },
  { ras: 'Santana', kleur: '#bef264' },
];

/** Deterministisch palet voor rassen zonder vaste kleur */
export const RAS_PALET: readonly string[] = [
  '#38bdf8', // sky
  '#c084fc', // purple
  '#fb7185', // rose
  '#34d399', // emerald
  '#f0abfc', // fuchsia-300
  '#93c5fd', // blue-300
  '#bef264', // lime-300
  '#c4b5fd', // violet-300
  '#5eead4', // teal-300
  '#fca5a5', // red-300
  '#a5b4fc', // indigo-300
  '#86efac', // green-300
];

/** Normaliseer een rasnaam: kleine letters, zonder accenten/leestekens. '' = geen ras. */
export function rasSleutel(ras: string | null | undefined): string {
  if (!ras) return '';
  return ras
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Weergavenaam van een ras ('Onbekend ras' bij leeg). */
export function rasNaam(ras: string | null | undefined): string {
  const t = ras?.trim();
  return t ? t : 'Onbekend ras';
}

interface VastIndexItem {
  sleutel: string;
  kleur: string;
  index: number;
}

/** Alle sleutels (naam + aliassen), langste eerst voor de prefix-match */
const VAST_INDEX: VastIndexItem[] = VASTE_RASKLEUREN.flatMap((v, index) =>
  [v.ras, ...(v.aliassen ?? [])].map(naam => ({ sleutel: rasSleutel(naam), kleur: v.kleur, index }))
).sort((a, b) => b.sleutel.length - a.sleutel.length);

/**
 * Zoek de vaste kleur van een (genormaliseerde) rasnaam: exacte match, anders een
 * match op woordgrens aan het begin (bv. 'rode boskoop goudreinet' → Rode Boskoop).
 */
function zoekVast(sleutel: string): VastIndexItem | null {
  if (!sleutel) return null;
  for (const v of VAST_INDEX) if (v.sleutel === sleutel) return v;
  for (const v of VAST_INDEX) if (sleutel.startsWith(v.sleutel + ' ')) return v;
  return null;
}

/** Vaste kleur van een bekend ras, of null. */
export function vasteKleurVoorRas(ras: string | null | undefined): string | null {
  return zoekVast(rasSleutel(ras))?.kleur ?? null;
}

/** FNV-1a (32 bit) — stabiele hash voor de paletkeuze */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function vrijeKleur(sleutel: string, gebruikt: ReadonlySet<string>): string {
  const start = hash(sleutel) % RAS_PALET.length;
  for (let i = 0; i < RAS_PALET.length; i++) {
    const kleur = RAS_PALET[(start + i) % RAS_PALET.length];
    if (!gebruikt.has(kleur)) return kleur;
  }
  for (const v of VASTE_RASKLEUREN) if (!gebruikt.has(v.kleur)) return v.kleur;
  return RAS_PALET[start];
}

/**
 * Maak een kleurfunctie voor de rassen op een perceel.
 *
 * - Bekende rassen krijgen hun vaste kleur (zelfde ras = overal dezelfde kleur).
 * - Overige rassen (en bekende rassen waarvan de kleur al door een ander ras op dit
 *   perceel gebruikt wordt) krijgen een vrije kleur uit RAS_PALET, deterministisch
 *   (alfabetisch verdeeld, start op een hash van de naam).
 * - Leeg/null → KLEUR_ONBEKEND. Een ras dat niet in `rassen` stond krijgt toch een
 *   stabiele kleur (vast of hash).
 */
export function maakKleurVoorRas(
  rassen: ReadonlyArray<string | null | undefined>,
): (ras: string | null | undefined) => string {
  const toegewezen = new Map<string, string>();
  const gebruikt = new Set<string>();
  const sleutels = Array.from(new Set(rassen.map(rasSleutel).filter(s => s !== '')));

  const bekend = sleutels
    .map(sleutel => ({ sleutel, vast: zoekVast(sleutel) }))
    .filter((x): x is { sleutel: string; vast: VastIndexItem } => x.vast !== null)
    .sort((a, b) => a.vast.index - b.vast.index || a.sleutel.localeCompare(b.sleutel));
  for (const { sleutel, vast } of bekend) {
    if (!gebruikt.has(vast.kleur)) {
      toegewezen.set(sleutel, vast.kleur);
      gebruikt.add(vast.kleur);
    }
  }

  const rest = sleutels.filter(s => !toegewezen.has(s)).sort();
  for (const sleutel of rest) {
    const kleur = vrijeKleur(sleutel, gebruikt);
    toegewezen.set(sleutel, kleur);
    gebruikt.add(kleur);
  }

  return (ras: string | null | undefined): string => {
    const sleutel = rasSleutel(ras);
    if (!sleutel) return KLEUR_ONBEKEND;
    return toegewezen.get(sleutel) ?? zoekVast(sleutel)?.kleur ?? RAS_PALET[hash(sleutel) % RAS_PALET.length];
  };
}
