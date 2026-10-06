'use client';

/**
 * Rijenkaart (beta) — Leaflet-kaart met perceelgrens, rijen, labels, notities en bewerkgrepen.
 *
 * Mobiel-first (iPhone in het veld):
 *  - Rijen op een canvas-renderer met ruime tik-tolerantie; een tik kiest de dichtstbijzijnde rij.
 *  - Rijnummers als kleine DOM-labels, alleen vanaf zoom 19 en alleen voor rijen in beeld.
 *  - Knoppen van 44 px; eigen locatie via watchPosition.
 *
 * Laad deze component via next/dynamic met ssr:false (Leaflet heeft `window` nodig).
 *
 * Lagen (panes, van onder naar boven):
 *  rk-onder  (canvas, niet klikbaar)  perceelgrens, donkere rand onder rijen, halo's (gemarkeerd/controleren/selectie)
 *  rk-rijen  (canvas, klikbaar)       de rijen zelf
 *  rk-boven  (canvas, niet klikbaar)  concept-rijen, referentielijn, bewerk-voorbeeld, eigen locatie
 *  rk-labels (DOM, niet klikbaar)     rijnummers
 *  markerPane                          notities
 *  rk-bewerk (DOM, klikbaar)          sleepbare eindpunten
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import { Locate, LocateFixed, Scan } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LngLat, Rij } from '@/lib/rijen/types';
import { PDOK_ATTRIBUTIE, PDOK_LAGEN, PDOK_MAX_NATIVE_ZOOM, pdokWmtsUrl } from '@/lib/rijen/pdok-lagen';
import {
  KLEUR_CONCEPT,
  KLEUR_CONTROLEREN,
  KLEUR_GEMARKEERD,
  KLEUR_GEROOID,
  KLEUR_LOCATIE,
  KLEUR_NOTITIE,
  KLEUR_PERCEEL,
  KLEUR_RAND,
  KLEUR_SELECTIE,
} from './kleuren';

// ---------------------------------------------------------------------------
// Publieke types
// ---------------------------------------------------------------------------

export type KaartModus = 'bekijken' | 'selecteren' | 'referentielijn' | 'positie';
export type Basislaag = 'orthoHR' | 'ortho25';

/** Voorvertoning van een (nog niet opgeslagen) rij */
export interface ConceptRij {
  coordinates: LngLat[];
  controleren: boolean;
}

/** Notitie op een rij, als marker op `punt` */
export interface NotitieMarker {
  id: string;
  rijId: string;
  punt: LngLat;
  tekst: string;
}

export type PerceelGeometrie = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface RijenkaartMapProps {
  perceelGeometrie: PerceelGeometrie | null | undefined;
  rijen: Rij[];
  toonGerooid: boolean;
  kleurVoorRas: (ras: string | null) => string;
  geselecteerd: ReadonlySet<string>;
  /** Extra gemarkeerde rijen (bv. behandeld door een gekozen bespuiting) — duidelijke halo */
  gemarkeerd?: ReadonlySet<string> | null;
  /** Voorvertoning: gestreept geel/wit, niet klikbaar */
  concept?: ConceptRij[] | null;
  notities?: NotitieMarker[];
  modus: KaartModus;
  /** Rij waarvan de eindpunten sleepbaar zijn */
  bewerkRijId?: string | null;
  basislaag: Basislaag;
  /** Verandert deze waarde, dan zoomt de kaart opnieuw naar het perceel */
  fitSleutel?: string;
  /** Tik op (of vlak naast) een rij. `punt` is het exacte tikpunt. */
  onRijKlik?: (rijId: string, punt: LngLat) => void;
  /** Tik naast de rijen */
  onKaartKlik?: (punt: LngLat) => void;
  /** Modus 'referentielijn': twee tikken → lijn a → b */
  onReferentielijn?: (a: LngLat, b: LngLat) => void;
  /**
   * Hints bovenin de kaart in modus 'referentielijn' (voor het eerste en het tweede punt). Zonder
   * deze prop: de standaardteksten voor een referentielijn. Handig als de modus voor iets anders
   * wordt hergebruikt (bv. een nieuwe rij tekenen).
   */
  lijnHints?: { eerste: string; tweede: string } | null;
  /** Na slepen van een eindpunt; alleen dat eindpunt is gewijzigd */
  onEindpuntVerplaatst?: (rijId: string, coordinates: LngLat[]) => void;
  /** Verhogen als een gesleept eindpunt niet opgeslagen kon worden: grepen terug naar de opgeslagen ligging */
  herstelSleutel?: number;
  onNotitieKlik?: (id: string) => void;
  /** Zonder deze callback wordt de luchtfoto-keuze niet getoond */
  onBasislaagChange?: (b: Basislaag) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constanten
// ---------------------------------------------------------------------------

const MAX_ZOOM = 22;
const LABEL_MIN_ZOOM = 19;
const MAX_LABELS = 400;
const TIK_TOLERANTIE_PX = 12;
/** Gerooide rijen tellen bij een tik zoveel pixels verder weg (actieve rij gaat voor) */
const GEROOID_TIK_STRAF_PX = 4;
/** Dekking van niet-geselecteerde rijen zolang er een selectie is */
const SELECTIE_DEMPING = 0.55;
const STANDAARD_CENTRUM: L.LatLngExpression = [52.13, 5.29];
const STANDAARD_ZOOM = 8;
const FIT_MAX_ZOOM = 19;
const FIT_PADDING: L.PointExpression = [28, 28];

const PANE = {
  onder: 'rk-onder',
  rijen: 'rk-rijen',
  boven: 'rk-boven',
  labels: 'rk-labels',
  bewerk: 'rk-bewerk',
} as const;

const BASISLAAG_LABEL: Record<Basislaag, string> = {
  orthoHR: '8 cm voorjaar',
  ortho25: '25 cm zomer',
};

const LETTERTYPE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ---------------------------------------------------------------------------
// Interne staat (buiten React; Leaflet-objecten)
// ---------------------------------------------------------------------------

interface RijLaag {
  rij: Rij;
  latlngs: L.LatLng[];
  lijn: L.Polyline;
  rand: L.Polyline;
}

interface LabelMarker {
  marker: L.Marker;
  html: string;
}

interface KaartStaat {
  map: L.Map;
  tegels: L.TileLayer | null;
  tegelLaag: Basislaag | null;
  onder: L.Canvas;
  rijenRenderer: L.Canvas;
  boven: L.Canvas;
  perceelGroep: L.LayerGroup;
  randGroep: L.LayerGroup;
  haloGroep: L.LayerGroup;
  rijenGroep: L.LayerGroup;
  conceptGroep: L.LayerGroup;
  referentieGroep: L.LayerGroup;
  bewerkGroep: L.LayerGroup;
  notitieGroep: L.LayerGroup;
  labelGroep: L.LayerGroup;
  locatieGroep: L.LayerGroup;
  rijLagen: Map<string, RijLaag>;
  labels: Map<string, LabelMarker>;
  perceelBounds: L.LatLngBounds | null;
  conceptBounds: L.LatLngBounds | null;
  heeftGefit: boolean;
  /** Fit uitgesteld omdat de kaart (nog) geen afmeting had */
  fitNodig: boolean;
  refA: L.LatLng | null;
  refLijn: L.Polyline | null;
  refTimer: number | null;
  locatieWatch: number | null;
  locatieCentreren: boolean;
  locatieStip: L.CircleMarker | null;
  locatieCirkel: L.Circle | null;
  setRefStap: (stap: 0 | 1) => void;
  toonMelding: (tekst: string) => void;
}

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

function naarLatLng(c: LngLat): L.LatLng {
  return L.latLng(c[1], c[0]);
}

function naarLngLat(ll: L.LatLng): LngLat {
  return [ll.lng, ll.lat];
}

function geldigeCoords(coords: LngLat[] | null | undefined): coords is LngLat[] {
  return (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    coords.every(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rond(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Lijndikte (px) van een rij per zoomniveau — rijen liggen ~3 m uit elkaar */
function basisDikte(zoom: number): number {
  if (zoom >= 20) return 5;
  if (zoom >= 19) return 4;
  if (zoom >= 18) return 3;
  if (zoom >= 17) return 2;
  return 1.5;
}

function rijZichtbaar(rij: Rij, toonGerooid: boolean): boolean {
  return geldigeCoords(rij.coordinates) && (rij.status !== 'gerooid' || toonGerooid);
}

function rijTekst(rij: Rij): string {
  const label = rij.label?.trim();
  return label ? label : String(rij.nummer);
}

/** parcels.geometry kan (dubbel) als JSON-string binnenkomen; accepteer beide */
function leesGeometrie(raw: unknown): PerceelGeometrie | null {
  let g: unknown = raw;
  for (let i = 0; i < 2 && typeof g === 'string'; i++) {
    try {
      g = JSON.parse(g);
    } catch {
      return null;
    }
  }
  if (!g || typeof g !== 'object') return null;
  const obj = g as { type?: unknown; coordinates?: unknown };
  if ((obj.type === 'Polygon' || obj.type === 'MultiPolygon') && Array.isArray(obj.coordinates)) {
    return obj as PerceelGeometrie;
  }
  return null;
}

function geometrieNaarLatLngs(geom: PerceelGeometrie): L.LatLng[][][] {
  const polygonen = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polygonen
    .map(poly =>
      poly
        .map(ring =>
          ring
            .filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1]))
            .map(c => L.latLng(c[1], c[0])),
        )
        .filter(ring => ring.length >= 3),
    )
    .filter(poly => poly.length > 0);
}

function lijnStijl(rij: Rij, kleur: string, geselecteerd: boolean, d: number): L.PathOptions {
  const gerooid = rij.status === 'gerooid';
  const w = geselecteerd ? d + 1.5 : d;
  const stijl: L.PathOptions = {
    color: gerooid ? KLEUR_GEROOID : kleur,
    weight: w,
    opacity: gerooid ? 0.75 : 1,
    lineCap: 'round',
    lineJoin: 'round',
    dashArray: undefined,
  };
  if (gerooid) {
    stijl.dashArray = `${rond(w)} ${rond(w * 2.2)}`;
    stijl.lineCap = 'butt';
  } else if (rij.rol === 'bestuiver') {
    stijl.dashArray = `${rond(w * 2.2)} ${rond(w * 1.6)}`;
    stijl.lineCap = 'butt';
  }
  return stijl;
}

function labelHtml(tekst: string, kleur: string, geselecteerd: boolean, gerooid: boolean): string {
  const kleuren = geselecteerd
    ? 'background:#ffffff;color:#0a0a0a;border:1px solid #ffffff;'
    : 'background:rgba(10,10,10,0.78);color:#ffffff;border:1px solid rgba(255,255,255,0.3);';
  return (
    `<div style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;` +
    `pointer-events:none;font:700 11px/14px ${LETTERTYPE};padding:1px 5px;border-radius:6px;` +
    `${kleuren}border-bottom:2px solid ${gerooid ? KLEUR_GEROOID : kleur};` +
    `box-shadow:0 1px 3px rgba(0,0,0,0.5);${gerooid ? 'opacity:0.75;text-decoration:line-through;' : ''}">` +
    `${escapeHtml(tekst)}</div>`
  );
}

function labelIcoon(html: string): L.DivIcon {
  return L.divIcon({ className: 'rk-label', html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function notitieIcoon(): L.DivIcon {
  return L.divIcon({
    className: 'rk-notitie',
    // Tikvlak 44 px (iPhone), de zichtbare stip blijft 16 px
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html:
      `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;">` +
      `<div style="width:16px;height:16px;border-radius:9999px;background:${KLEUR_NOTITIE};` +
      `border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.6);"></div></div>`,
  });
}

function greepIcoon(letter: string, kleur: string): L.DivIcon {
  return L.divIcon({
    className: 'rk-greep',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html:
      `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;touch-action:none;">` +
      `<div style="width:26px;height:26px;border-radius:9999px;background:#ffffff;border:3px solid ${kleur};` +
      `box-shadow:0 0 0 2px rgba(0,0,0,0.55),0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;` +
      `justify-content:center;font:800 11px/1 ${LETTERTYPE};color:#0a0a0a;">${letter}</div></div>`,
  });
}

/** Punt p, `px` pixels verder in de richting van q → p (net voorbij het uiteinde) */
function verleng(p: L.Point, q: L.Point, px: number): L.Point {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return p;
  return L.point(p.x + (dx / len) * px, p.y + (dy / len) * px);
}

type CanvasIntern = { _ctx?: CanvasRenderingContext2D; _redraw: () => void };
let VeiligCanvas: (new (opties: L.RendererOptions) => L.Canvas) | null = null;

/**
 * Canvas-renderer die een geplande redraw na verwijderen negeert. Leaflet 1.9 annuleert bij
 * het opruimen alleen de laatste animation frame; een eerdere (na een synchrone redraw) kan
 * daarna nog vuren op een canvas zonder context ("reading 'clearRect'"). Gebeurt bij snel
 * unmounten, o.a. de dubbele mount van React StrictMode.
 */
function maakCanvas(opties: L.RendererOptions): L.Canvas {
  if (!VeiligCanvas) {
    const origineel = (L.Canvas.prototype as unknown as CanvasIntern)._redraw;
    VeiligCanvas = L.Canvas.extend({
      _redraw(this: CanvasIntern) {
        if (!this._ctx) return;
        origineel.call(this);
      },
    }) as unknown as new (opties: L.RendererOptions) => L.Canvas;
  }
  return new VeiligCanvas(opties);
}

// ---------------------------------------------------------------------------
// Tekenen
// ---------------------------------------------------------------------------

/** Stijl van alle rijen + onderlagen (halo's) opnieuw zetten. Goedkoop: geen nieuwe rij-lagen. */
function stijlAlles(s: KaartStaat, p: RijenkaartMapProps): void {
  const d = basisDikte(s.map.getZoom());
  // Bij een voorvertoning (concept) treden de bestaande rijen terug
  const demping = p.concept && p.concept.length > 0 ? 0.35 : 1;
  // Is er een (zichtbare) selectie, dan treden de overige rijen wat terug. Zo valt de selectie
  // ook op als alle rijen dezelfde lichte kleur hebben (nog geen ras → KLEUR_ONBEKEND).
  let heeftSelectie = false;
  for (const id of s.rijLagen.keys()) {
    if (p.geselecteerd.has(id)) {
      heeftSelectie = true;
      break;
    }
  }
  const geselecteerdeLagen: RijLaag[] = [];

  for (const laag of s.rijLagen.values()) {
    const isSel = p.geselecteerd.has(laag.rij.id);
    const f = demping * (heeftSelectie && !isSel ? SELECTIE_DEMPING : 1);
    const stijl = lijnStijl(laag.rij, p.kleurVoorRas(laag.rij.rasEffectief), isSel, d);
    stijl.opacity = (stijl.opacity ?? 1) * f;
    laag.lijn.setStyle(stijl);
    // Donkere rand voor contrast; bij lage zoom (rijen dicht op elkaar) smaller en lichter
    laag.rand.setStyle({
      weight: (stijl.weight ?? d) + (d >= 3 ? 2.5 : 1.5),
      opacity: (laag.rij.status === 'gerooid' ? 0.2 : d >= 3 ? 0.45 : 0.3) * f,
    });
    if (isSel) geselecteerdeLagen.push(laag);
  }
  for (const laag of geselecteerdeLagen) laag.lijn.bringToFront();

  s.haloGroep.clearLayers();
  const opties = (o: L.PolylineOptions): L.PolylineOptions => ({
    renderer: s.onder,
    interactive: false,
    lineCap: 'round',
    lineJoin: 'round',
    ...o,
  });

  const gemarkeerd = p.gemarkeerd;
  if (gemarkeerd && gemarkeerd.size > 0) {
    for (const laag of s.rijLagen.values()) {
      if (!gemarkeerd.has(laag.rij.id)) continue;
      L.polyline(laag.latlngs, opties({ color: KLEUR_GEMARKEERD, weight: d * 2 + 10, opacity: 0.5 })).addTo(s.haloGroep);
    }
  }
  for (const laag of s.rijLagen.values()) {
    if (!laag.rij.controleren || laag.rij.status === 'gerooid') continue;
    L.polyline(
      laag.latlngs,
      opties({
        color: KLEUR_CONTROLEREN,
        // Bij lage zoom liggen rijen ~8 px uit elkaar: smaller, anders één oranje vlak
        weight: d + (d >= 4 ? 7 : 4),
        opacity: demping,
        dashArray: `${rond(d + 2)} ${rond(d + 3)}`,
        lineCap: 'butt',
      }),
    ).addTo(s.haloGroep);
  }
  // Selectie: witte buitenrand + donkere binnenrand. Ook herkenbaar bij lichte rijen (ras onbekend,
  // KLEUR_ONBEKEND), waar alleen een witte halo opgaat in de rij zelf.
  for (const laag of geselecteerdeLagen) {
    L.polyline(laag.latlngs, opties({ color: KLEUR_SELECTIE, weight: d + 7, opacity: 0.95 })).addTo(s.haloGroep);
    L.polyline(laag.latlngs, opties({ color: KLEUR_RAND, weight: d + 3.5, opacity: 0.9 })).addTo(s.haloGroep);
  }
}

interface LabelKandidaat {
  sleutel: string;
  rijId: string;
  /** Mogelijke posities (schermpixels), in volgorde van voorkeur */
  posities: L.Point[];
  html: string;
  breedte: number;
  prio: number;
  /** Middenlabel: alleen gebruikt als de rij geen label aan een uiteinde kreeg */
  reserve: boolean;
}

const LABEL_HOOGTE = 18;
/** Label-posities voorbij een uiteinde (px); negatief = terug op de rij (als voorbij buiten beeld valt) */
const LABEL_STAPPEN_UITEINDE = [14, 32, 50, -16, -34];

type Vak = [number, number, number, number];

/**
 * Schermvakken (containerpixels) van wat over de kaart ligt: Leaflet-controls (attributie, zoom)
 * en elementen met `data-rk-overlay` (eigen knoppen, de legenda, of overlays van de pagina).
 * Daar komen geen labels onder. Vakken buiten de kaart doen niet mee (labels liggen erbinnen).
 */
function overlayVakken(container: HTMLElement): Vak[] {
  const basis = container.getBoundingClientRect();
  const vakken: Vak[] = [];
  const elementen: Element[] = [
    ...Array.from(container.querySelectorAll('.leaflet-control')),
    ...Array.from(document.querySelectorAll('[data-rk-overlay]')),
  ];
  for (const el of elementen) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right < basis.left || r.left > basis.right || r.bottom < basis.top || r.top > basis.bottom) continue;
    vakken.push([r.left - basis.left - 2, r.top - basis.top - 2, r.right - basis.left + 2, r.bottom - basis.top + 2]);
  }
  return vakken;
}

/**
 * Rijnummers aan begin en eind van rijen in beeld (vanaf zoom 19). Labels mogen elkaar (en de
 * knoppen op de kaart) niet overlappen: per label worden een paar verschoven posities geprobeerd
 * (verspringend). Krijgt een rij in beeld zo geen label, dan één label zo dicht mogelijk bij het
 * midden van het scherm; lukt ook dat niet, dan vervalt het. Markers worden hergebruikt.
 */
function werkLabelsBij(s: KaartStaat, p: RijenkaartMapProps): void {
  const map = s.map;
  const nodig = new Map<string, { ll: L.LatLng; html: string }>();

  if (map.getZoom() >= LABEL_MIN_ZOOM && s.rijLagen.size > 0) {
    const size = map.getSize();
    const marge = 4;
    const binnen = (pt: L.Point) =>
      pt.x >= marge && pt.y >= marge && pt.x <= size.x - marge && pt.y <= size.y - marge;
    const midden = L.point(size.x / 2, size.y / 2);
    const kandidaten: LabelKandidaat[] = [];

    for (const [id, laag] of s.rijLagen) {
      const pts = laag.latlngs.map(ll => map.latLngToContainerPoint(ll));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pt of pts) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
      if (maxX < 0 || maxY < 0 || minX > size.x || minY > size.y) continue;

      const rij = laag.rij;
      const tekst = rijTekst(rij);
      const isSel = p.geselecteerd.has(id);
      const basis = {
        rijId: id,
        html: labelHtml(tekst, p.kleurVoorRas(rij.rasEffectief), isSel, rij.status === 'gerooid'),
        breedte: tekst.length * 7 + 14,
        prio: isSel ? 0 : rij.status === 'gerooid' ? 2 : 1,
      };
      const begin = pts[0];
      const eind = pts[pts.length - 1];
      if (binnen(begin)) {
        kandidaten.push({
          ...basis,
          sleutel: `${id}|b`,
          reserve: false,
          posities: LABEL_STAPPEN_UITEINDE.map(px => verleng(begin, pts[1], px)),
        });
      }
      if (binnen(eind)) {
        const voor = pts[pts.length - 2];
        kandidaten.push({
          ...basis,
          sleutel: `${id}|e`,
          reserve: false,
          posities: LABEL_STAPPEN_UITEINDE.map(px => verleng(eind, voor, px)),
        });
      }
      // Reserve: label op het punt van de rij dat het dichtst bij het midden van het scherm ligt.
      // Nodig als beide uiteinden buiten beeld vallen (je staat midden in het perceel), of als er
      // aan de uiteinden geen plek was (rand van het scherm, knoppen).
      let beste: L.Point | null = null;
      let besteD = Infinity;
      let richting = L.point(0, 0);
      for (let i = 1; i < pts.length; i++) {
        const q = L.LineUtil.closestPointOnSegment(midden, pts[i - 1], pts[i]);
        const dq = q.distanceTo(midden);
        if (dq < besteD) {
          besteD = dq;
          beste = q;
          const len = pts[i].distanceTo(pts[i - 1]);
          richting = len > 0 ? pts[i].subtract(pts[i - 1]).divideBy(len) : L.point(0, 0);
        }
      }
      if (beste) {
        const q = beste;
        const posities = [0, 22, -22, 44, -44].map(px => q.add(richting.multiplyBy(px)));
        kandidaten.push({ ...basis, sleutel: `${id}|m`, reserve: true, posities });
      }
    }

    // Plaatsen zonder overlap: eerst de uiteinden, dan reserves; geselecteerd eerst, gerooid laatst
    kandidaten.sort((a, b) => Number(a.reserve) - Number(b.reserve) || a.prio - b.prio);
    const bezet: Vak[] = kandidaten.length > 0 ? overlayVakken(map.getContainer()) : [];
    const metLabel = new Set<string>();
    for (const k of kandidaten) {
      if (nodig.size >= MAX_LABELS) break;
      if (k.reserve && metLabel.has(k.rijId)) continue;
      for (const pos of k.posities) {
        if (!binnen(pos)) continue;
        const vak: Vak = [
          pos.x - k.breedte / 2 - 1,
          pos.y - LABEL_HOOGTE / 2 - 1,
          pos.x + k.breedte / 2 + 1,
          pos.y + LABEL_HOOGTE / 2 + 1,
        ];
        if (bezet.some(b => vak[0] < b[2] && vak[2] > b[0] && vak[1] < b[3] && vak[3] > b[1])) continue;
        bezet.push(vak);
        nodig.set(k.sleutel, { ll: map.containerPointToLatLng(pos), html: k.html });
        metLabel.add(k.rijId);
        break;
      }
    }
  }

  for (const [sleutel, lm] of s.labels) {
    if (!nodig.has(sleutel)) {
      s.labelGroep.removeLayer(lm.marker);
      s.labels.delete(sleutel);
    }
  }
  for (const [sleutel, n] of nodig) {
    const bestaand = s.labels.get(sleutel);
    if (bestaand) {
      bestaand.marker.setLatLng(n.ll);
      if (bestaand.html !== n.html) {
        bestaand.marker.setIcon(labelIcoon(n.html));
        bestaand.html = n.html;
      }
    } else {
      const marker = L.marker(n.ll, {
        icon: labelIcoon(n.html),
        interactive: false,
        keyboard: false,
        pane: PANE.labels,
      });
      marker.addTo(s.labelGroep);
      s.labels.set(sleutel, { marker, html: n.html });
    }
  }
}

/**
 * Dichtstbijzijnde rij (in schermpixels) binnen de tik-tolerantie; anders `raakId`.
 * Een gerooide rij telt een paar pixels verder weg, zodat een actieve rij op (bijna) dezelfde
 * plek (opnieuw gegenereerd/geplant) voorgaat.
 */
function dichtsbijzijndeRij(s: KaartStaat, latlng: L.LatLng, raakId: string | null): string | null {
  const map = s.map;
  const cp = map.latLngToContainerPoint(latlng);
  let beste: string | null = null;
  let besteD = Infinity;
  for (const [id, laag] of s.rijLagen) {
    const w = laag.lijn.options.weight ?? 3;
    const max = TIK_TOLERANTIE_PX + w / 2 + 2;
    let vorige = map.latLngToContainerPoint(laag.latlngs[0]);
    let d = Infinity;
    for (let i = 1; i < laag.latlngs.length; i++) {
      const pt = map.latLngToContainerPoint(laag.latlngs[i]);
      d = Math.min(d, L.LineUtil.pointToSegmentDistance(cp, vorige, pt));
      vorige = pt;
    }
    if (d > max) continue;
    const score = laag.rij.status === 'gerooid' ? d + GEROOID_TIK_STRAF_PX : d;
    if (score < besteD) {
      besteD = score;
      beste = id;
    }
  }
  return beste ?? raakId;
}

/** Zoom naar perceel (of rijen/concept als er geen perceelgrens is). false = geen data. */
function zoomNaarData(s: KaartStaat, animeer: boolean): boolean {
  let b: L.LatLngBounds | null = null;
  if (s.perceelBounds?.isValid()) {
    b = L.latLngBounds(s.perceelBounds.getSouthWest(), s.perceelBounds.getNorthEast());
  } else {
    const rb = L.latLngBounds([]);
    for (const laag of s.rijLagen.values()) for (const ll of laag.latlngs) rb.extend(ll);
    if (rb.isValid()) b = rb;
    else if (s.conceptBounds?.isValid()) b = s.conceptBounds;
  }
  if (!b) return false;
  s.heeftGefit = true;
  const size = s.map.getSize();
  if (size.x < 10 || size.y < 10) {
    s.fitNodig = true;
    return true;
  }
  s.fitNodig = false;
  s.map.fitBounds(b, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, animate: animeer });
  return true;
}

function resetReferentie(s: KaartStaat): void {
  if (s.refTimer !== null) {
    window.clearTimeout(s.refTimer);
    s.refTimer = null;
  }
  s.refA = null;
  s.refLijn = null;
  s.referentieGroep.clearLayers();
  s.setRefStap(0);
}

function referentiePunt(s: KaartStaat, p: RijenkaartMapProps, latlng: L.LatLng): void {
  if (s.refTimer !== null) {
    window.clearTimeout(s.refTimer);
    s.refTimer = null;
  }
  const opties = { renderer: s.boven, interactive: false } as const;

  if (!s.refA) {
    s.referentieGroep.clearLayers();
    s.refA = latlng;
    s.refLijn = L.polyline([latlng, latlng], {
      ...opties,
      color: KLEUR_CONCEPT,
      weight: 3,
      dashArray: '6 6',
      lineCap: 'butt',
    }).addTo(s.referentieGroep);
    L.circleMarker(latlng, {
      ...opties,
      radius: 7,
      color: '#000000',
      weight: 2,
      fillColor: KLEUR_CONCEPT,
      fillOpacity: 1,
    }).addTo(s.referentieGroep);
    s.setRefStap(1);
    return;
  }

  const a = s.refA;
  if (s.map.distance(a, latlng) < 2) {
    s.toonMelding('Tik het tweede punt verder weg langs dezelfde rij');
    return;
  }
  s.refA = null;
  s.refLijn = null;
  s.referentieGroep.clearLayers();
  L.polyline([a, latlng], { ...opties, color: '#000000', weight: 6, opacity: 0.6 }).addTo(s.referentieGroep);
  L.polyline([a, latlng], { ...opties, color: KLEUR_CONCEPT, weight: 3.5 }).addTo(s.referentieGroep);
  for (const ll of [a, latlng]) {
    L.circleMarker(ll, { ...opties, radius: 6, color: '#000000', weight: 2, fillColor: KLEUR_CONCEPT, fillOpacity: 1 })
      .addTo(s.referentieGroep);
  }
  s.setRefStap(0);
  s.refTimer = window.setTimeout(() => {
    s.referentieGroep.clearLayers();
    s.refTimer = null;
  }, 1500);
  p.onReferentielijn?.(naarLngLat(a), naarLngLat(latlng));
}

function verwerkKlik(s: KaartStaat, p: RijenkaartMapProps, latlng: L.LatLng, raakId: string | null): void {
  if (p.modus === 'referentielijn') {
    referentiePunt(s, p, latlng);
    return;
  }
  const punt = naarLngLat(latlng);
  const rijId = dichtsbijzijndeRij(s, latlng, raakId);
  if (rijId) p.onRijKlik?.(rijId, punt);
  else p.onKaartKlik?.(punt);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function KaartKnop({
  label,
  actief,
  onClick,
  children,
}: {
  label: string;
  actief?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={actief}
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-colors',
        actief
          ? 'border-emerald-400/60 bg-emerald-500 text-black'
          : 'border-white/10 bg-black/70 text-white/80 hover:text-white active:bg-black/80',
      )}
    >
      {children}
    </button>
  );
}

export function RijenkaartMap(props: RijenkaartMapProps) {
  const {
    perceelGeometrie,
    rijen,
    toonGerooid,
    kleurVoorRas,
    geselecteerd,
    gemarkeerd,
    concept,
    notities,
    modus,
    bewerkRijId,
    basislaag,
    fitSleutel,
    onBasislaagChange,
    herstelSleutel,
    className,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const staatRef = useRef<KaartStaat | null>(null);
  // Altijd de laatste props voor Leaflet-handlers (geen verouderde closures)
  const propsRef = useRef(props);
  propsRef.current = props;

  const [refStap, setRefStap] = useState<0 | 1>(0);
  const [locatieActief, setLocatieActief] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const meldingTimer = useRef<number | null>(null);

  const toonMelding = useCallback((tekst: string) => {
    setMelding(tekst);
    if (meldingTimer.current !== null) window.clearTimeout(meldingTimer.current);
    meldingTimer.current = window.setTimeout(() => {
      setMelding(null);
      meldingTimer.current = null;
    }, 4500);
  }, []);

  // ---- Kaart één keer opzetten ------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el || staatRef.current) return;

    const map = L.map(el, {
      center: STANDAARD_CENTRUM,
      zoom: STANDAARD_ZOOM,
      minZoom: 5,
      maxZoom: MAX_ZOOM,
      preferCanvas: true,
      zoomControl: false,
      attributionControl: true,
      bounceAtZoomLimits: false,
    });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    if (!L.Browser.mobile) {
      L.control.zoom({ position: 'bottomright', zoomInTitle: 'Inzoomen', zoomOutTitle: 'Uitzoomen' }).addTo(map);
    }

    const maakPane = (naam: string, z: number, klikbaar: boolean) => {
      const pane = map.createPane(naam);
      pane.style.zIndex = String(z);
      if (!klikbaar) pane.style.pointerEvents = 'none';
    };
    maakPane(PANE.onder, 405, false);
    maakPane(PANE.rijen, 410, true);
    maakPane(PANE.boven, 420, false);
    maakPane(PANE.labels, 450, false);
    maakPane(PANE.bewerk, 640, true);

    const groep = () => L.layerGroup().addTo(map);
    const s: KaartStaat = {
      map,
      tegels: null,
      tegelLaag: null,
      onder: maakCanvas({ pane: PANE.onder }),
      rijenRenderer: maakCanvas({ pane: PANE.rijen, tolerance: TIK_TOLERANTIE_PX }),
      boven: maakCanvas({ pane: PANE.boven }),
      perceelGroep: groep(),
      randGroep: groep(),
      haloGroep: groep(),
      rijenGroep: groep(),
      conceptGroep: groep(),
      referentieGroep: groep(),
      bewerkGroep: groep(),
      notitieGroep: groep(),
      labelGroep: groep(),
      locatieGroep: groep(),
      rijLagen: new Map(),
      labels: new Map(),
      perceelBounds: null,
      conceptBounds: null,
      heeftGefit: false,
      fitNodig: false,
      refA: null,
      refLijn: null,
      refTimer: null,
      locatieWatch: null,
      locatieCentreren: false,
      locatieStip: null,
      locatieCirkel: null,
      setRefStap,
      toonMelding,
    };
    staatRef.current = s;

    map.on('click', (e: L.LeafletMouseEvent) => {
      verwerkKlik(s, propsRef.current, e.latlng, null);
    });
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (s.refA && s.refLijn && propsRef.current.modus === 'referentielijn') {
        s.refLijn.setLatLngs([s.refA, e.latlng]);
      }
    });
    map.on('zoomend', () => stijlAlles(s, propsRef.current));
    map.on('moveend', () => werkLabelsBij(s, propsRef.current));

    // Afmeting kan na mount nog veranderen (sheet/tab/rotatie)
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ debounceMoveend: true });
      if (s.fitNodig) zoomNaarData(s, false);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (s.locatieWatch !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(s.locatieWatch);
      }
      s.locatieWatch = null;
      // Bij een remount (StrictMode/Fast Refresh) blijft React-state staan: knop niet 'aan' laten
      // terwijl de watch al gestopt is.
      setLocatieActief(false);
      if (s.refTimer !== null) window.clearTimeout(s.refTimer);
      if (meldingTimer.current !== null) window.clearTimeout(meldingTimer.current);
      meldingTimer.current = null;
      map.remove();
      staatRef.current = null;
    };
  }, [toonMelding]);

  // ---- Basislaag (PDOK luchtfoto) ----------------------------------------
  useEffect(() => {
    const s = staatRef.current;
    if (!s || (s.tegels && s.tegelLaag === basislaag)) return;
    const nieuw = L.tileLayer(pdokWmtsUrl(PDOK_LAGEN[basislaag]), {
      maxZoom: MAX_ZOOM,
      maxNativeZoom: PDOK_MAX_NATIVE_ZOOM,
      attribution: PDOK_ATTRIBUTIE,
      keepBuffer: 3,
    });
    const oud = s.tegels;
    nieuw.addTo(s.map);
    s.tegels = nieuw;
    s.tegelLaag = basislaag;
    if (oud) {
      // Oude laag pas weghalen als de nieuwe geladen is (geen zwart scherm op trage 4G)
      const weg = () => {
        if (s.map.hasLayer(oud)) s.map.removeLayer(oud);
      };
      nieuw.once('load', weg);
      window.setTimeout(weg, 5000);
    }
  }, [basislaag]);

  // ---- Perceelgrens -------------------------------------------------------
  useEffect(() => {
    const s = staatRef.current;
    if (!s) return;
    s.perceelGroep.clearLayers();
    const vorige = s.perceelBounds;
    s.perceelBounds = null;

    const geom = leesGeometrie(perceelGeometrie);
    const latlngs = geom ? geometrieNaarLatLngs(geom) : [];
    if (latlngs.length > 0) {
      const basis = { renderer: s.onder, interactive: false, fill: false, lineJoin: 'round' } as const;
      L.polygon(latlngs, { ...basis, color: KLEUR_PERCEEL, weight: 4, opacity: 0.55 }).addTo(s.perceelGroep);
      const wit = L.polygon(latlngs, { ...basis, color: '#ffffff', weight: 1.5, opacity: 0.95 }).addTo(s.perceelGroep);
      s.perceelBounds = wit.getBounds();
    }

    // Eerste data, of een ander perceel (andere grens) → passend inzoomen
    const anders = s.perceelBounds !== null && (vorige === null || !vorige.equals(s.perceelBounds, 1e-7));
    if (!s.heeftGefit || anders) zoomNaarData(s, s.heeftGefit);
  }, [perceelGeometrie]);

  // ---- Rijen (opnieuw opbouwen bij nieuwe data) ---------------------------
  useEffect(() => {
    const s = staatRef.current;
    if (!s) return;
    s.rijenGroep.clearLayers();
    s.randGroep.clearLayers();
    s.rijLagen.clear();

    // gerooide rijen eerst, zodat actieve rijen erboven liggen
    const zichtbaar = rijen
      .filter(r => rijZichtbaar(r, toonGerooid))
      .sort((a, b) => (a.status === 'gerooid' ? 0 : 1) - (b.status === 'gerooid' ? 0 : 1));

    for (const rij of zichtbaar) {
      const latlngs = rij.coordinates.map(naarLatLng);
      const rand = L.polyline(latlngs, {
        renderer: s.onder,
        interactive: false,
        color: KLEUR_RAND,
        lineCap: 'round',
        lineJoin: 'round',
      });
      const lijn = L.polyline(latlngs, {
        renderer: s.rijenRenderer,
        interactive: true,
        bubblingMouseEvents: false,
      });
      const rijId = rij.id;
      lijn.on('click', (e: L.LeafletMouseEvent) => verwerkKlik(s, propsRef.current, e.latlng, rijId));
      rand.addTo(s.randGroep);
      lijn.addTo(s.rijenGroep);
      s.rijLagen.set(rij.id, { rij, latlngs, lijn, rand });
    }

    stijlAlles(s, propsRef.current);
    werkLabelsBij(s, propsRef.current);
    if (!s.heeftGefit) zoomNaarData(s, false);
  }, [rijen, toonGerooid]);

  // ---- Selectie / markering / kleuren (alleen stijl) ----------------------
  useEffect(() => {
    const s = staatRef.current;
    if (!s) return;
    stijlAlles(s, propsRef.current);
    werkLabelsBij(s, propsRef.current);
  }, [geselecteerd, gemarkeerd, kleurVoorRas]);

  // ---- Concept-rijen (voorvertoning) --------------------------------------
  useEffect(() => {
    const s = staatRef.current;
    if (!s) return;
    s.conceptGroep.clearLayers();
    const b = L.latLngBounds([]);
    for (const c of concept ?? []) {
      if (!geldigeCoords(c.coordinates)) continue;
      const latlngs = c.coordinates.map(naarLatLng);
      const basis = { renderer: s.boven, interactive: false, weight: 3.5, lineCap: 'butt', lineJoin: 'round' } as const;
      L.polyline(latlngs, { ...basis, color: '#ffffff', opacity: 0.95 }).addTo(s.conceptGroep);
      L.polyline(latlngs, {
        ...basis,
        color: c.controleren ? KLEUR_CONTROLEREN : KLEUR_CONCEPT,
        opacity: 1,
        dashArray: '7 7',
      }).addTo(s.conceptGroep);
      for (const ll of latlngs) b.extend(ll);
    }
    s.conceptBounds = b.isValid() ? b : null;
    stijlAlles(s, propsRef.current);
    if (!s.heeftGefit && s.conceptBounds) zoomNaarData(s, false);
  }, [concept]);

  // ---- Notities -----------------------------------------------------------
  useEffect(() => {
    const s = staatRef.current;
    if (!s) return;
    s.notitieGroep.clearLayers();
    const icoon = notitieIcoon();
    for (const n of notities ?? []) {
      if (!n.punt || !Number.isFinite(n.punt[0]) || !Number.isFinite(n.punt[1])) continue;
      const marker = L.marker(naarLatLng(n.punt), {
        icon: icoon,
        keyboard: false,
        riseOnHover: true,
        title: n.tekst.length > 120 ? `${n.tekst.slice(0, 117)}…` : n.tekst,
      });
      const id = n.id;
      marker.on('click', (e: L.LeafletMouseEvent) => {
        const p = propsRef.current;
        if (p.modus === 'referentielijn') verwerkKlik(s, p, e.latlng, null);
        else p.onNotitieKlik?.(id);
      });
      marker.addTo(s.notitieGroep);
    }
  }, [notities]);

  // ---- Bewerken: sleepbare eindpunten -------------------------------------
  const bewerkSleutel = useMemo(() => {
    if (!bewerkRijId) return '';
    const rij = rijen.find(r => r.id === bewerkRijId);
    return rij ? JSON.stringify(rij.coordinates) : '';
  }, [rijen, bewerkRijId]);

  useEffect(() => {
    const s = staatRef.current;
    if (!s) return;
    s.bewerkGroep.clearLayers();
    if (!bewerkRijId) return;
    const rij = propsRef.current.rijen.find(r => r.id === bewerkRijId);
    if (!rij || !geldigeCoords(rij.coordinates)) return;

    const rijId = rij.id;
    const coords: LngLat[] = rij.coordinates.map(c => [c[0], c[1]]);
    const kleur = propsRef.current.kleurVoorRas(rij.rasEffectief);
    const voorbeeld = L.polyline(coords.map(naarLatLng), {
      renderer: s.boven,
      interactive: false,
      color: KLEUR_SELECTIE,
      weight: 2.5,
      dashArray: '6 6',
      lineCap: 'butt',
    }).addTo(s.bewerkGroep);

    const maakGreep = (idx: number, letter: string) => {
      const greep = L.marker(naarLatLng(coords[idx]), {
        draggable: true,
        autoPan: true,
        keyboard: false,
        pane: PANE.bewerk,
        icon: greepIcoon(letter, kleur),
        title: letter === 'B' ? 'Begin van de rij — sleep om te verplaatsen' : 'Eind van de rij — sleep om te verplaatsen',
      });
      const nieuweCoords = (): LngLat[] => {
        const n = coords.slice();
        n[idx] = naarLngLat(greep.getLatLng());
        return n;
      };
      greep.on('drag', () => {
        // Rij zelf live meeschuiven; de pagina levert na dragend de opgeslagen geometrie
        const latlngs = nieuweCoords().map(naarLatLng);
        voorbeeld.setLatLngs(latlngs);
        const laag = s.rijLagen.get(rijId);
        if (laag) {
          laag.latlngs = latlngs;
          laag.lijn.setLatLngs(latlngs);
          laag.rand.setLatLngs(latlngs);
        }
      });
      greep.on('dragend', () => {
        const n = nieuweCoords();
        coords[idx] = n[idx];
        // halo's (selectie/markering) en labels volgen de nieuwe ligging
        stijlAlles(s, propsRef.current);
        werkLabelsBij(s, propsRef.current);
        propsRef.current.onEindpuntVerplaatst?.(rijId, n);
      });
      greep.addTo(s.bewerkGroep);
    };
    maakGreep(0, 'B');
    maakGreep(coords.length - 1, 'E');
  }, [bewerkRijId, bewerkSleutel, herstelSleutel]);

  // ---- Modus --------------------------------------------------------------
  useEffect(() => {
    const s = staatRef.current;
    if (!s) return;
    resetReferentie(s);
    // Melding van de vorige modus (bv. 'tik verder weg') hoort niet bij de nieuwe
    if (meldingTimer.current !== null) {
      window.clearTimeout(meldingTimer.current);
      meldingTimer.current = null;
    }
    setMelding(null);
    // Dubbeltik-zoom zit snelle tikken (selecteren, twee referentiepunten) in de weg
    if (modus === 'bekijken') s.map.doubleClickZoom.enable();
    else s.map.doubleClickZoom.disable();
    s.map.getContainer().style.cursor = modus === 'referentielijn' || modus === 'positie' ? 'crosshair' : '';
  }, [modus]);

  // ---- Opnieuw inzoomen op verzoek ---------------------------------------
  const vorigeFitSleutel = useRef(fitSleutel);
  useEffect(() => {
    if (vorigeFitSleutel.current === fitSleutel) return;
    vorigeFitSleutel.current = fitSleutel;
    const s = staatRef.current;
    if (s) zoomNaarData(s, true);
  }, [fitSleutel]);

  // ---- Knoppen ------------------------------------------------------------
  const zoomNaarPerceel = useCallback(() => {
    const s = staatRef.current;
    if (s && !zoomNaarData(s, true)) toonMelding('Geen perceelgrens of rijen om naar te zoomen');
  }, [toonMelding]);

  const stopLocatie = useCallback(() => {
    const s = staatRef.current;
    if (s && s.locatieWatch !== null) navigator.geolocation.clearWatch(s.locatieWatch);
    if (s) {
      s.locatieWatch = null;
      s.locatieGroep.clearLayers();
      s.locatieStip = null;
      s.locatieCirkel = null;
    }
    setLocatieActief(false);
  }, []);

  const toonLocatie = useCallback((pos: GeolocationPosition) => {
    const s = staatRef.current;
    if (!s || s.locatieWatch === null) return;
    const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
    const nauwkeurigheid = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 0;
    if (!s.locatieCirkel) {
      s.locatieCirkel = L.circle(ll, {
        renderer: s.boven,
        interactive: false,
        radius: nauwkeurigheid,
        color: KLEUR_LOCATIE,
        weight: 1,
        opacity: 0.6,
        fillColor: KLEUR_LOCATIE,
        fillOpacity: 0.12,
      }).addTo(s.locatieGroep);
    } else {
      s.locatieCirkel.setLatLng(ll);
      s.locatieCirkel.setRadius(nauwkeurigheid);
    }
    if (!s.locatieStip) {
      s.locatieStip = L.circleMarker(ll, {
        renderer: s.boven,
        interactive: false,
        radius: 7,
        color: '#ffffff',
        weight: 2.5,
        fillColor: KLEUR_LOCATIE,
        fillOpacity: 1,
      }).addTo(s.locatieGroep);
    } else {
      s.locatieStip.setLatLng(ll);
    }
    if (s.locatieCentreren) {
      s.locatieCentreren = false;
      s.map.setView(ll, Math.max(s.map.getZoom(), 18), { animate: true });
    }
  }, []);

  const wisselLocatie = useCallback(() => {
    const s = staatRef.current;
    if (!s) return;
    if (s.locatieWatch !== null) {
      // Aan: stip buiten beeld → terug naar je locatie; anders uitzetten
      const stip = s.locatieStip?.getLatLng();
      if (stip && !s.map.getBounds().pad(-0.15).contains(stip)) {
        s.map.setView(stip, Math.max(s.map.getZoom(), 18), { animate: true });
      } else {
        stopLocatie();
      }
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toonMelding('Locatie wordt op dit apparaat niet ondersteund');
      return;
    }
    if (window.isSecureContext === false) {
      // bv. dev-server via http://192.168.x.x op de telefoon: de browser weigert dan altijd
      toonMelding('Locatie werkt alleen via een beveiligde verbinding (https)');
      return;
    }
    s.locatieCentreren = true;
    setLocatieActief(true);
    s.locatieWatch = navigator.geolocation.watchPosition(
      toonLocatie,
      fout => {
        const huidig = staatRef.current;
        if (!huidig || huidig.locatieWatch === null) return;
        if (fout.code === fout.PERMISSION_DENIED) {
          stopLocatie();
          toonMelding('Geen toegang tot je locatie. Sta locatie toe voor deze site in de instellingen.');
        } else if (!huidig.locatieStip) {
          toonMelding(fout.code === fout.TIMEOUT ? 'Locatie zoeken duurt lang…' : 'Locatie niet beschikbaar');
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }, [stopLocatie, toonLocatie, toonMelding]);

  const lijnHints = props.lijnHints;
  const hint =
    modus === 'referentielijn'
      ? refStap === 0
        ? lijnHints?.eerste ?? 'Referentielijn: tik op een rij (punt 1)'
        : lijnHints?.tweede ?? 'Tik een tweede punt verderop langs dezelfde rij'
      : null;

  return (
    <div className={cn('relative isolate h-full w-full overflow-hidden', className)}>
      <div ref={containerRef} className="absolute inset-0" style={{ background: '#0b0f0d' }} />

      {onBasislaagChange && (
        <div
          role="group"
          aria-label="Luchtfoto"
          data-rk-overlay=""
          className="absolute right-3 top-3 z-[1000] flex rounded-full border border-white/10 bg-black/70 p-0.5 shadow-lg backdrop-blur-md"
        >
          {(['orthoHR', 'ortho25'] as const).map(b => (
            <button
              key={b}
              type="button"
              aria-pressed={basislaag === b}
              onClick={() => onBasislaagChange(b)}
              className={cn(
                'min-h-[44px] whitespace-nowrap rounded-full px-3 text-[11px] font-semibold transition-colors',
                basislaag === b ? 'bg-emerald-500 text-black' : 'text-white/70 hover:text-white',
              )}
            >
              {BASISLAAG_LABEL[b]}
            </button>
          ))}
        </div>
      )}

      <div
        data-rk-overlay=""
        className={cn('absolute right-3 z-[1000] flex flex-col gap-2', onBasislaagChange ? 'top-[64px]' : 'top-3')}
      >
        <KaartKnop label="Zoom naar perceel" onClick={zoomNaarPerceel}>
          <Scan className="h-5 w-5" />
        </KaartKnop>
        <KaartKnop label={locatieActief ? 'Mijn locatie (aan)' : 'Mijn locatie'} actief={locatieActief} onClick={wisselLocatie}>
          {locatieActief ? <LocateFixed className="h-5 w-5" /> : <Locate className="h-5 w-5" />}
        </KaartKnop>
      </div>

      {(hint || melding) && (
        <div
          className={cn(
            'pointer-events-none absolute left-3 right-[64px] z-[1000] flex flex-col items-center gap-2',
            onBasislaagChange ? 'top-[64px]' : 'top-3',
          )}
        >
          {hint && (
            <div className="rounded-full border border-yellow-300/40 bg-black/75 px-3 py-1.5 text-center text-[12px] font-medium text-yellow-100 shadow-lg backdrop-blur-md">
              {hint}
            </div>
          )}
          {melding && (
            <div
              role="status"
              className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-center text-[12px] text-white/90 shadow-lg backdrop-blur-md"
            >
              {melding}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
