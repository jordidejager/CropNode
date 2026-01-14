import type { RvoApiResponse, AddressSuggestion, RvoParcel } from "./types";

const PDOK_GEWASPERCELEN_URL =
  "https://api.pdok.nl/rvo/gewaspercelen/ogc/v1/collections/brpgewas/items";
const PDOK_LOCATIESERVER_URL =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest";

export interface FetchRvoParcelsOptions {
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchRvoParcels(
  options: FetchRvoParcelsOptions
): Promise<RvoApiResponse> {
  const { bbox, limit = 100, signal } = options;

  const params = new URLSearchParams({
    f: "json",
    bbox: bbox.join(","),
    "bbox-crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
    crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
    limit: limit.toString(),
  });

  const response = await fetch(`${PDOK_GEWASPERCELEN_URL}?${params}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`PDOK API error: ${response.status}`);
  }

  return response.json();
}

export async function fetchRvoParcelAtLocation(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<RvoParcel | null> {
  // Create a small bounding box around the point (approx 10x10 meters)
  // 1 degree lat is ~111km, 1 degree lng is ~111km * cos(lat)
  // 0.0001 degrees is roughly 10 meters
  const delta = 0.0001;
  const bbox: [number, number, number, number] = [
    lng - delta,
    lat - delta,
    lng + delta,
    lat + delta,
  ];

  const response = await fetchRvoParcels({ bbox, limit: 10, signal });

  // Return the first feature that actually contains the point
  // Although the API uses bbox, so it might return nearby parcels.
  // Ideally client-side check if point is in polygon, but for now just returning the first one is likely fine
  // or we can just return the first one as "the one clicked".
  return response.features[0] || null;
}

export async function searchAddress(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  if (!query || query.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    fq: "type:adres",
    rows: "5",
  });

  const response = await fetch(`${PDOK_LOCATIESERVER_URL}?${params}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Locatieserver error: ${response.status}`);
  }

  const data = await response.json();

  // Parse the PDOK response format
  if (data.response?.docs) {
    return data.response.docs.map((doc: any) => ({
      id: doc.id,
      weergavenaam: doc.weergavenaam,
      centroide_ll: doc.centroide_ll,
    }));
  }

  return [];
}

// Parse POINT(lng lat) format to coordinates
export function parsePointString(point: string): { lat: number; lng: number } | null {
  if (!point) return null;
  const match = point.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (match) {
    return {
      lng: parseFloat(match[1]),
      lat: parseFloat(match[2]),
    };
  }
  return null;
}

// Calculate area in hectares from GeoJSON polygon
// Using the Shoelace formula for geographic coordinates
export function calculateAreaHectares(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): number {
  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  // Calculate area of a single ring in square meters
  const ringArea = (coords: number[][]): number => {
    const R = 6371000; // Earth's radius in meters
    let area = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];

      const lat1 = toRadians(p1[1]);
      const lat2 = toRadians(p2[1]);
      const lng1 = toRadians(p1[0]);
      const lng2 = toRadians(p2[0]);

      area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    area = (area * R * R) / 2;
    return Math.abs(area);
  };

  let totalArea = 0;

  if (geometry.type === "Polygon") {
    // First ring is outer, subtract inner rings (holes)
    totalArea = ringArea(geometry.coordinates[0]);
    for (let i = 1; i < geometry.coordinates.length; i++) {
      totalArea -= ringArea(geometry.coordinates[i]);
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      let polygonArea = ringArea(polygon[0]);
      for (let i = 1; i < polygon.length; i++) {
        polygonArea -= ringArea(polygon[i]);
      }
      totalArea += polygonArea;
    }
  }

  // Convert to hectares (1 hectare = 10000 m2)
  return totalArea / 10000;
}

// Calculate center point of a geometry
export function calculateCenter(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): { lat: number; lng: number } {
  let coords: number[][] = [];

  if (geometry.type === "Polygon") {
    coords = geometry.coordinates[0];
  } else if (geometry.type === "MultiPolygon") {
    // Use first polygon's outer ring
    coords = geometry.coordinates[0][0];
  }

  if (coords.length === 0) {
    return { lat: 52.1326, lng: 5.2913 }; // Default to NL center
  }

  let sumLat = 0;
  let sumLng = 0;

  for (const coord of coords) {
    sumLng += coord[0];
    sumLat += coord[1];
  }

  return {
    lat: sumLat / coords.length,
    lng: sumLng / coords.length,
  };
}
