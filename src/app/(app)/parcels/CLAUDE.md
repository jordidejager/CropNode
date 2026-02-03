# CLAUDE.md - Parcels (Percelen)

## Doel en Scope

Perceelbeheer voor fruitteeltbedrijven met een two-tier hiërarchie: hoofdpercelen (fysieke grenzen) en subpercelen/blokken (werkeenheden voor spuitregistraties). Integreert met RVO/PDOK voor externe parceldata.

**Kernfunctionaliteit:**
- CRUD operaties voor percelen en subpercelen
- RVO parcel import via PDOK API
- Interactieve kaart met Leaflet
- Gewogen compositie tracking (rassen, onderstammen, plantjaren)
- Bodemmonsters en productiehistorie per subperceel

---

## Componenten en Verantwoordelijkheden

### Page Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `page.tsx` | `/parcels/list/page.tsx` | Server wrapper met Suspense |
| `client-page.tsx` | `/parcels/list/client-page.tsx` | Main UI, state management, view switching |
| `page.tsx` | `/parcels/map/page.tsx` | Kaartweergave pagina |

### UI Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `ParcelCard` | `/src/components/parcel-card.tsx` | Compact kaart voor lijst view |
| `ParcelDetailView` | `/src/components/parcel-detail-view.tsx` | Gedetailleerde subperceel view (37KB) |
| `MainParcelView` | `/src/components/main-parcel-view.tsx` | Dashboard voor hoofdperceel (21KB) |
| `ParcelComposer` | `/src/components/parcel-composer.tsx` | Subperceel configuratie wizard |
| `ParcelFormDialog` | `/src/components/parcel-form-dialog.tsx` | Nieuw perceel formulier |
| `ParcelsTreeTable` | `/src/components/parcels-tree-table.tsx` | Hiërarchische lijst (20KB) |
| `EditParcels` | `/src/components/edit-parcels.tsx` | Inline edit functionaliteit |
| `WeightedInputGroup` | `/src/components/weighted-input-group.tsx` | Gewogen waarden invoer |

### Map Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `RvoMap` | `/src/components/rvo-map/rvo-map.tsx` | Interactieve Leaflet kaart |
| `RvoParcelSheet` | `/src/components/rvo-map/rvo-parcel-sheet.tsx` | Detail sheet voor geselecteerd RVO perceel |
| `RvoMultiSelectBar` | `/src/components/rvo-map/rvo-multi-select-bar.tsx` | Multi-select toolbar |
| `RvoMapControls` | `/src/components/rvo-map/rvo-map-controls.tsx` | Zoom, search, layer controls |

---

## Supabase Tabellen

### Primair

| Tabel | Gebruik |
|-------|---------|
| `parcels` | Hoofdpercelen met geometry en locatie |
| `sub_parcels` | Subpercelen met gewas, ras, compositie |
| `soil_samples` | Bodemmonsters per subperceel |
| `production_history` | Productiehistorie per subperceel |

### Views

| View | Gebruik |
|------|---------|
| `v_sprayable_parcels` | Flat view voor spuitregistraties |
| `v_active_parcels` | Percelen met eerste subperceel info |

### Schema Relaties

```
parcels (1) ──────────────< sub_parcels (N)
                                │
                    ┌───────────┼───────────┐
                    │           │           │
              soil_samples  production_  task_logs
                           history
```

---

## Business Rules

### Parcel Hiërarchie

**Parcels (Hoofdpercelen):**
- Fysieke/juridische grenzen van het bedrijf
- Heeft geometry (GeoJSON Polygon/MultiPolygon)
- Heeft locatie (lat/lng)
- Source: 'MANUAL' of 'RVO_IMPORT'

**Sub-Parcels (Blokken):**
- Werkeenheid voor spuitregistraties
- Specifieke gewas/ras combinatie
- Nauwkeurige oppervlakte voor dosering berekening
- Kan gewogen compositie hebben

### Gewogen Compositie

Subpercelen ondersteunen gewogen tracking:
```typescript
// Meerdere mutanten met percentages
mutants: [{ value: "Elstar", percentage: 60 }, { value: "Red Elstar", percentage: 40 }]

// Onderstam compositie
rootstocks: [{ value: "M9", percentage: 70 }, { value: "M26", percentage: 30 }]

// Plantjaren
plantingYears: [{ value: 2015, percentage: 50 }, { value: 2020, percentage: 50 }]

// Plantafstanden
plantingDistances: [{ value: { row: 3.5, tree: 1.0 }, percentage: 100 }]
```

**Bomen per hectare berekening:**
```
treesPerHa = Σ (10000 / (row × tree)) × (percentage / 100)
```

### ParcelComposer Validatie

1. **Totaal oppervlak moet kloppen:**
   ```typescript
   Math.abs(currentTotal - totalArea) < 0.001  // 0.001 ha tolerantie
   ```

2. **Geen over-allocatie:**
   ```typescript
   currentTotal <= totalArea + 0.0001
   ```

3. **Minimum vereisten per item:**
   - Gewas geselecteerd
   - Ras geselecteerd
   - Oppervlakte > 0

### Naamgeving View

`v_sprayable_parcels` genereert leesbare namen:
```sql
-- Met subperceel naam:
"Thuis V-haag (Elstar)"

-- Zonder subperceel naam:
"Thuis (Conference)"

-- Fallback:
"Thuis (Onbekend)"
```

---

## State Management

### Client Page State

```typescript
// View mode
viewMode: 'list' | 'map'
groupByMainParcel: boolean          // Groepeer of individueel

// Selection
selectedMainParcel: SprayableParcel | null
selectedGroupedParcel: GroupedParcel | null
selectedSubParcel: SprayableParcel | null

// Dialogs
isFormOpen: boolean                 // Nieuw perceel dialog
isComposerOpen: boolean             // Composer dialog

// RVO Integration
selectedRvoParcels: RvoParcel[]     // Multi-select op kaart
rvoDataForForm: RvoParcelData       // Pre-filled RVO data
pendingSubParcels: SubParcel[]      // Temp storage tijdens flow
```

### React Query

```typescript
// Hooks
useParcels() → SprayableParcel[]
useInvalidateQueries() → { invalidateParcels }

// Query Keys
parcels: ['sprayable-parcels']
```

---

## Data Flow

### Nieuw Perceel Aanmaken

```
ParcelFormDialog Open
    │
    ├─ User vult naam, oppervlakte in
    │  └─ Optioneel: selecteer RVO perceel voor geometry
    │
    └─ Submit
         │
         ├─ addParcel() → parcels tabel
         │
         └─ setIsComposerOpen(true)
              │
              ├─ ParcelComposer: verdeel in subpercelen
              │
              └─ Save
                   │
                   ├─ Promise.all(addSubParcel() × N)
                   │
                   └─ invalidateParcels()
```

### RVO Import Flow

```
Kaart Weergave
    │
    ├─ User klikt op RVO perceel
    │  └─ RvoParcelSheet toont details
    │
    ├─ OF: User selecteert meerdere
    │  └─ RvoMultiSelectBar toont opties
    │
    └─ "Toevoegen" klikt
         │
         ├─ Single: Pre-fill form met geometry
         │
         └─ Multiple: Merge geometries
              │
              ├─ MultiPolygon van alle selecties
              ├─ Som van oppervlaktes
              ├─ Gewogen center berekening
              └─ Voorgevulde subpercelen
```

---

## API Integraties

### PDOK Gewaspercelen API

**Endpoint:** `https://api.pdok.nl/rvo/gewaspercelen/ogc/v1/collections/brpgewas/items`

**Functie:** `fetchRvoParcels(options)`
```typescript
options: {
  bbox: [minLng, minLat, maxLng, maxLat],
  limit: number,
  signal?: AbortSignal
}
// Returns: GeoJSON FeatureCollection
```

### PDOK Locatieserver

**Endpoint:** `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest`

**Functie:** `searchAddress(query)`
```typescript
// Returns: Suggestions with coordinates (centroide_ll)
```

### Helper Functions

| Functie | Doel |
|---------|------|
| `fetchRvoParcelAtLocation(lat, lng)` | Perceel op exacte coördinaten |
| `calculateAreaHectares(geometry)` | Oppervlakte van polygon |
| `calculateCenter(geometry)` | Centroid van polygon |
| `parsePointString(point)` | Parse POINT(lng lat) WKT |

---

## Map Component Details

### Leaflet Configuratie

**Base Layer:** PDOK Luchtfoto (aerial imagery)
```
https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg
```

**Styling:**
| Type | Kleur | Stijl |
|------|-------|-------|
| User Parcel | Oranje (#f97316) | Solid fill |
| Appel (RVO) | Rood (#ef4444) | Solid fill |
| Peer (RVO) | Groen (#22c55e) | Solid fill |
| Selected | Blauw | Dashed border |

### Selection Modes

- **Single Select:** Klik op perceel → detail sheet
- **Multi Select:** Klik meerdere → toolbar met merge/add opties

---

## Design Decisions

### Two-Tier Hiërarchie
Percelen (main) → Subpercelen (blokken) omdat:
- Juridische grenzen ≠ landbouwkundige eenheden
- Spuitregistraties zijn per gewas/ras combinatie
- Dosering afhankelijk van nauwkeurige oppervlakte

### v_sprayable_parcels View
Database view voor performance:
- Flat data, geen N+1 queries
- Pre-generated leesbare namen
- Single SELECT voor alle data

### Gewogen Compositie
JSONB arrays met percentages voor:
- Gemengde beplantingen
- Gefaseerde aanplant
- Complexe onderstam situaties

### Geometry als JSONB
GeoJSON opslag in JSONB kolom:
- Flexibel voor Polygon en MultiPolygon
- Native Leaflet compatibiliteit
- Geen PostGIS extensie nodig

### RVO Merge Logic
Bij meerdere RVO percelen:
- Creëer MultiPolygon van alle geometries
- Som oppervlaktes
- Bereken gewogen center
- Maak subperceel per origineel RVO perceel

---

## Irrigatie & Vorstbescherming

**Irrigatie Types:**
- "Ja met fertigatie"
- "Ja"
- "Nee"
- "Deels" (toont percentage input)

**Vorstbescherming Types:**
- "Ja"
- "Nee"
- "Deels" (toont percentage input)

---

## View Hierarchy

```
Level 3: List/Map View (PercelenClientPage)
    │
    ├─ List Mode
    │   ├─ Grouped (Hoofdpercelen)
    │   │   └─ Click → Expand subpercelen
    │   └─ Individual (Subpercelen)
    │       └─ Click → Level 2
    │
    └─ Map Mode
        └─ Click perceel → Level 2

Level 2: Main Parcel Dashboard (MainParcelView)
    │
    └─ Click subperceel → Level 1

Level 1: Sub-Parcel Detail (ParcelDetailView)
    │
    ├─ Stamgegevens (edit mode)
    ├─ Bodemtrends
    └─ Productiehistorie
```
