# Parcels (Percelen)

Parcel management with a two-tier hierarchy: main parcels (physical/legal boundaries) → sub-parcels/blocks (work units for spray registrations).

## Key Business Rules

- **Main parcels** have geometry (GeoJSON Polygon/MultiPolygon), location, and source (`MANUAL` or `RVO_IMPORT`)
- **Sub-parcels** are the actual work unit — each has a specific crop/variety combo and precise area for dosage calculation
- Sub-parcels support **weighted composition** via JSONB arrays with percentages: mutants, rootstocks, interstocks, planting years, planting distances
- Trees per hectare: `Σ (10000 / (row × tree)) × (percentage / 100)`

## ParcelComposer Validation

- Total sub-parcel area must match main parcel area (0.001 ha tolerance)
- No over-allocation: `currentTotal <= totalArea + 0.0001`
- Each sub-parcel requires: crop, variety, area > 0

## RVO Import (Multi-Select Merge)

When importing multiple RVO parcels:
- Creates MultiPolygon from all geometries
- Sums areas
- Calculates weighted center
- Creates one sub-parcel per original RVO parcel

## View: `v_sprayable_parcels`

Generates readable names: `"Thuis V-haag (Elstar)"` or `"Thuis (Conference)"`. This flat view prevents N+1 queries.

## Navigation Hierarchy

Level 3 (List/Map) → Level 2 (Main Parcel Dashboard) → Level 1 (Sub-Parcel Detail with soil samples & production history)

## External APIs

- **PDOK Gewaspercelen**: `api.pdok.nl/rvo/gewaspercelen/ogc/v1/collections/brpgewas/items` — fetch parcels by bbox
- **PDOK Locatieserver**: `api.pdok.nl/bzk/locatieserver/search/v3_1/suggest` — address search
