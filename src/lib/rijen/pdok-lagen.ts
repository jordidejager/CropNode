/**
 * PDOK luchtfoto — open data (CC-BY), geen sleutel of kosten.
 * WMTS (web mercator) voor de basemap; WMS (RD New) voor detectie.
 * Tegels bestaan tot en met zoom 21 (≈ 7,5 cm/px op 52° NB).
 */

export const PDOK_LAGEN = {
  /** 8 cm, voorjaarsopname (bladloos — rijen het scherpst) */
  orthoHR: 'Actueel_orthoHR',
  /** 25 cm, zomeropname */
  ortho25: 'Actueel_ortho25',
} as const;

export type PdokLaag = (typeof PDOK_LAGEN)[keyof typeof PDOK_LAGEN];

export const PDOK_WMTS_BASIS = 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0';
export const PDOK_WMS_URL = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0';

/** Hoogste zoomniveau waarvoor PDOK tegels levert */
export const PDOK_MAX_NATIVE_ZOOM = 21;

export const PDOK_ATTRIBUTIE =
  'Luchtfoto &copy; <a href="https://www.pdok.nl" target="_blank" rel="noopener">PDOK</a> / Beeldmateriaal Nederland (CC-BY)';

/** Leaflet-tegeltemplate voor een PDOK-luchtfotolaag (tilematrixset EPSG:3857) */
export function pdokWmtsUrl(laag: PdokLaag): string {
  return `${PDOK_WMTS_BASIS}/${laag}/EPSG:3857/{z}/{x}/{y}.jpeg`;
}
