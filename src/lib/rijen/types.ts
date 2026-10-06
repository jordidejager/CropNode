/**
 * Rijenkaart (beta) — gedeelde types.
 *
 * Conventies (zie docs/rijenkaart/PLAN.md):
 *  - LngLat = WGS84 [lng, lat] (zoals GeoJSON); XY = RD New [x, y] in meters.
 *  - Richtingen zijn kompasgraden in het RD-grid: 0 = noord, 90 = oost, met de klok mee.
 *  - rijrichting θ ∈ [0, 180): richting van de rij-as. d = (sin θ, cos θ).
 *  - normaal n = (cos θ, −sin θ) (rechts van d). offset(p) = (p − zwaartepunt) · n.
 *  - Rijen liggen op offset faseM + k · rijafstandM (faseM ∈ [0, rijafstandM)).
 *  - beginkantGraden = kompasrichting vanaf het midden van een rij naar het begin.
 */

export type LngLat = [number, number];
export type XY = [number, number];

export type RijRol = 'hoofd' | 'bestuiver';
export type RijStatus = 'actief' | 'gerooid';
export type GeomBron = 'gegenereerd' | 'getekend' | 'gemeten';
export type DetectieMethode = 'auto' | 'handmatig';

/** Rij zoals gelezen uit v_rijen (camelCase). */
export interface Rij {
  id: string;
  perceelId: string;
  blokId: string | null;
  blokNaam: string | null;
  nummer: number;
  label: string | null;
  rol: RijRol;
  /** Override op de rij zelf */
  ras: string | null;
  /** coalesce(rij.ras, blok.ras) */
  rasEffectief: string | null;
  plantjaar: number | null;
  plantjaarEffectief: number | null;
  onderstam: string | null;
  /** coalesce(blok.rijafstand_m, instellingen.rijafstand_m) */
  rijafstandM: number | null;
  /** coalesce(blok.boomafstand_m, instellingen.boomafstand_m) */
  boomafstandM: number | null;
  lengteM: number;
  aantalBomen: number | null;
  aantalBomenEffectief: number | null;
  geomBron: GeomBron;
  nauwkeurigheidM: number | null;
  controleren: boolean;
  status: RijStatus;
  geplantOp: string | null;
  gerooidOp: string | null;
  opmerking: string | null;
  /** LineString-coördinaten begin → eind (WGS84) */
  coordinates: LngLat[];
  /** Subperceel voor spuitschrift-koppeling (null = niet eenduidig) */
  subParcelId: string | null;
}

export interface Blok {
  id: string;
  perceelId: string;
  subParcelId: string | null;
  naam: string | null;
  ras: string | null;
  plantjaar: number | null;
  onderstam: string | null;
  rijafstandM: number | null;
  boomafstandM: number | null;
  teeltsysteem: string | null;
  opmerking: string | null;
  geometry: GeoJSON.Polygon | null;
}

/** Invoer om een blok aan te maken/bij te werken (alle velden optioneel). */
export interface BlokInvoer {
  id?: string;
  naam?: string | null;
  subParcelId?: string | null;
  ras?: string | null;
  plantjaar?: number | null;
  onderstam?: string | null;
  rijafstandM?: number | null;
  boomafstandM?: number | null;
  teeltsysteem?: string | null;
  opmerking?: string | null;
}

export interface RijInstellingen {
  perceelId: string;
  rijrichtingGraden: number | null;
  rijafstandM: number | null;
  boomafstandM: number | null;
  faseM: number | null;
  kopakkerBeginM: number;
  kopakkerEindM: number;
  beginkantGraden: number | null;
  nummeringStartzijdeGraden: number | null;
  nummeringStartRijId: string | null;
  startnummer: number;
  bronBeeld: string | null;
  detectieMethode: DetectieMethode | null;
  detectieConfidence: number | null;
  laatstGegenereerdOp: string | null;
}

/** Gedeeltelijke update van de instellingen (alleen meegegeven sleutels worden gezet). */
export type RijInstellingenUpdate = Partial<Omit<RijInstellingen, 'perceelId' | 'nummeringStartRijId'>>;

/** Per rij: laatste bespuiting en aantal notities (rpc rijen_status). */
export interface RijStatusInfo {
  rijId: string;
  laatsteBespuitingId: string | null;
  laatsteBespuitingDatum: string | null;
  laatsteBespuitingMiddelen: string | null;
  /** true = de bespuiting was expliciet aan rijen gekoppeld */
  laatsteBespuitingViaRijen: boolean | null;
  aantalBespuitingen: number;
  aantalNotities: number;
}

/** Notitie gekoppeld aan een rij (marker op de kaart). */
export interface RijNotitie {
  veldnotitieId: string;
  rijId: string;
  positieM: number | null;
  tekst: string;
  status: string;
  createdAt: string;
}

export interface RijenkaartSubperceel {
  id: string;
  naam: string | null;
  ras: string | null;
  oppervlakHa: number;
  /** Uit sub_parcels.planting_distances (gewogen), als suggestie */
  rijafstandM: number | null;
  boomafstandM: number | null;
}

/** Recente bespuiting op dit perceel, om behandelde rijen op de kaart te markeren. */
export interface RijenkaartBespuiting {
  id: string;
  datum: string;
  middelen: string;
  registrationType: string | null;
  /** Expliciet gekoppelde rijen; null = geen rijkoppeling (geldt voor de subpercelen in plots) */
  rijIds: string[] | null;
  /** sub_parcel-id's van dit perceel die in spuitschrift.plots staan */
  subParcelIds: string[];
}

export interface RijenkaartPerceel {
  id: string;
  naam: string;
  /** RVO-perceeloppervlak (incl. kopakkers) */
  oppervlakHa: number;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  subpercelen: RijenkaartSubperceel[];
}

/** Alles wat de perceelpagina "Rijen" nodig heeft, in één keer geladen. */
export interface Rijenkaart {
  perceel: RijenkaartPerceel;
  instellingen: RijInstellingen | null;
  blokken: Blok[];
  /** Alle rijen, inclusief gerooide */
  rijen: Rij[];
  status: Record<string, RijStatusInfo>;
  notities: RijNotitie[];
  /** Laatste ~25 bespuitingen die dit perceel raakten (nieuwste eerst) */
  bespuitingen: RijenkaartBespuiting[];
}

/** Regel uit v_rijen_per_perceel + perceelinfo (overzichtspagina). */
export interface RijenSamenvatting {
  perceelId: string;
  perceelNaam: string;
  oppervlakHa: number;
  heeftGeometrie: boolean;
  aantalActief: number;
  aantalGerooid: number;
  aantalBestuivers: number;
  aantalControleren: number;
  minNummer: number | null;
  maxNummer: number | null;
  totaleLengteM: number;
  rijOppervlakHa: number;
  aantalBlokken: number;
  detectieConfidence: number | null;
  detectieMethode: DetectieMethode | null;
  laatstGegenereerdOp: string | null;
}

/** Wijziging voor rpc rijen_toepassen. Zonder id = nieuwe rij (nummer + coordinates verplicht). */
export interface RijWijziging {
  id?: string;
  /** Client-sleutel om ingevoegde id's terug te koppelen */
  sleutel?: string;
  nummer?: number;
  coordinates?: LngLat[];
  geomBron?: GeomBron;
  nauwkeurigheidM?: number | null;
  controleren?: boolean;
  blokId?: string | null;
  rol?: RijRol;
  ras?: string | null;
}

export interface RijenToepassenResultaat {
  ingevoegd: { id: string; nummer: number; sleutel: string | null }[];
  bijgewerkt: number;
  verwijderd: number;
  gerooid: number;
}

/** Attributen die per rij (of selectie) gezet kunnen worden. */
export interface RijAttributen {
  label?: string | null;
  rol?: RijRol;
  ras?: string | null;
  plantjaar?: number | null;
  aantalBomen?: number | null;
  status?: RijStatus;
  gerooidOp?: string | null;
  geplantOp?: string | null;
  blokId?: string | null;
  opmerking?: string | null;
}

// ---------------------------------------------------------------------------
// Geometrie / generatie
// ---------------------------------------------------------------------------

/** Perceelgeometrie omgerekend naar RD New. */
export interface PerceelRD {
  /** MultiPolygon-structuur: polygonen → ringen → punten. Ring 0 = buitenrand. */
  polygonen: XY[][][];
  /** Oppervlakte-gewogen zwaartepunt */
  zwaartepunt: XY;
  /** [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number];
  oppervlakM2: number;
}

export interface RijParameters {
  /** Rijrichting θ ∈ [0, 180) */
  richtingGraden: number;
  rijafstandM: number;
  /** Offset van het patroon t.o.v. het zwaartepunt, langs de normaal */
  faseM: number;
  kopakkerBeginM: number;
  kopakkerEindM: number;
  /** null = standaard: begin ligt in de richting θ */
  beginkantGraden?: number | null;
}

export interface GegenereerdeRij {
  /** Loodrechte offset t.o.v. het zwaartepunt (langs de normaal) */
  offsetM: number;
  /** begin → eind in RD */
  coordsRD: XY[];
  /** begin → eind in WGS84 */
  coordinates: LngLat[];
  lengteM: number;
  /** true als de lijn het perceel meerdere keren doorsnijdt (langste stuk gekozen) */
  controleren: boolean;
}

// ---------------------------------------------------------------------------
// Detectie
// ---------------------------------------------------------------------------

export interface DetectieResultaat {
  richtingGraden: number;
  rijafstandM: number;
  /** Offset van een rij (boomstrook) t.o.v. het zwaartepunt, ∈ [0, rijafstandM) */
  faseM: number;
  /** 0..1 — piekscherpte van de autocorrelatie op de gevonden rijafstand */
  confidence: number;
  /** Onder deze drempel: melding + handmatige modus */
  drempel: number;
  voldoende: boolean;
  bronBeeld: string;
  duurMs: number;
  diagnostiek?: Record<string, number | string | boolean | null>;
}
