# Plan: Perceel-hiërarchie Herstructurering

## Probleem

De percelenlijst toont alles plat:
- "Jachthoek 4Rijen (Beurré Alexandre Lucas)"
- "Jachthoek 4Rijen (Conference)"
- "Jachthoek Oude (Conference)"
- etc.

De gebruiker wil **"Jachthoek"** als hoofdperceel met daaronder subpercelen. Dit moet ook in de database goed geregeld worden, niet alleen in de UI.

## Analyse: Huidige Architectuur

### Wat er al bestaat
Het 2-tier model is **al correct** in het schema:
- `parcels` → fysieke percelen (geometry, locatie)
- `sub_parcels` → werkblokken (gewas, ras, oppervlakte)
- `v_sprayable_parcels` → flat view die namen genereert

### Wat fout gaat
Het probleem zit **in de data, niet in het schema**. "Jachthoek 4Rijen" en "Jachthoek Oude" zijn nu **aparte hoofdpercelen** in de `parcels` tabel. Ze zouden **subpercelen** moeten zijn onder één "Jachthoek" hoofdperceel.

### Afhankelijke features (blast radius)

| Feature | Gebruikt | Impact |
|---------|----------|--------|
| **Slimme Invoer** | `SprayableParcel.name`, `parcelName`, `synonyms` | ✅ Geen wijziging nodig — matcht op subperceel-naam en synonymen |
| **CTGB Validatie** | `parcelIds[]`, `parcelName` voor foutmeldingen | ✅ Geen wijziging — werkt op sub_parcel.id level |
| **Spuitschrift** | `SprayableParcel` gegroepeerd op `crop` | ✅ Geen wijziging — unit of work blijft sub_parcel |
| **Parcel Filter** | `name.ilike`, `parcel_name.ilike` matching | ✅ Verbetert — "Jachthoek" matcht nu alle subpercelen |
| **BRP History** | `parcel.location` voor gewasrotatie queries | ✅ Geen wijziging — locatie blijft op hoofdperceel |
| **Kaart** | `parcels.geometry` op Leaflet map | ⚠️ Aandachtspunt: geometrie moet samengevoegd worden |
| **Parcel Groups** | `parcel_group_members.sub_parcel_id` | ✅ Geen wijziging — groups linken aan sub_parcels |
| **Inventory/Opslag** | `parcel_history` met `parcel_id` | ✅ Geen wijziging — refereert sub_parcel.id |

**Conclusie: Geen schema-wijzigingen nodig.** Het bestaande 2-tier model ondersteunt dit al. We moeten alleen:
1. De **data reorganiseren** (merge gerelateerde percelen)
2. De **UI verbeteren** (altijd gegroepeerd tonen)

## Plan van Aanpak

### Fase 1: UI — Altijd gegroepeerde weergave (client-page.tsx)

**Wijzigingen aan `src/app/(app)/parcels/list/client-page.tsx`:**

1. **Verwijder de toggle** — Maak de gegroepeerde weergave de standaard (en enige) lijstweergave
2. **Nieuwe UI-structuur**: Collapsible accordion per hoofdperceel
   - Header: hoofdperceel naam, totaal oppervlakte, gewas-badges, expand/collapse
   - Body: tabel met subpercelen (naam, ras, oppervlakte)
   - Click op subperceel → MainParcelView (bestaande detail view)
3. **Sortering**: Hoofdpercelen alphabetisch, subpercelen op naam
4. **Filtering**: Zoeken/filteren werkt door naar subpercelen, collapse hoofdperceel als geen matches
5. **Selectie**: Checkbox op hoofdperceel selecteert alle subpercelen, individuele selectie ook mogelijk

De `groupedParcels` useMemo (regel 139-166) groepeert al op `parcelName`. Dit blijft werken, maar we maken het de standaard weergave.

### Fase 2: Data Reorganisatie Tool

**Nieuw: "Percelen Reorganiseren" dialog** (`src/components/domain/parcel-reorganize-dialog.tsx`)

Biedt de gebruiker een interface om:
1. **Auto-detectie**: Percelen met dezelfde prefix herkennen (bijv. "Jachthoek *")
2. **Merge UI**: Selecteer welke percelen samengevoegd moeten worden
3. **Naamgeving**: Kies de naam van het nieuwe hoofdperceel ("Jachthoek")
4. **Preview**: Laat zien hoe het er uit komt te zien
5. **Uitvoeren**: API call die:
   - Nieuw hoofdperceel aanmaakt met samengevoegde geometrie (MultiPolygon)
   - Bestaande subpercelen verplaatst naar het nieuwe hoofdperceel (update `parcel_id`)
   - Oude lege hoofdpercelen opruimt
   - Subperceel namen aanpast (verwijder prefix, bijv. "Jachthoek 4Rijen" → "4Rijen")

**Nieuwe API route** (`src/app/api/parcels/reorganize/route.ts`):
- POST: ontvang merge-instructies, voer transactie uit
- Valideert dat alle percelen van dezelfde user zijn
- Voegt geometrieën samen
- Update sub_parcels.parcel_id
- Update sub_parcels.name (verwijder gemeenschappelijke prefix)
- Verwijdert lege oude parcels

### Fase 3: v_sprayable_parcels view verbeteren

De view genereert nu namen als `"Jachthoek 4Rijen (Conference)"`. Na reorganisatie wordt dit:
- Hoofdperceel: "Jachthoek"
- Subperceel naam: "4Rijen"
- Variety: "Conference"
- Generated name: `"Jachthoek 4Rijen (Conference)"` ← **identiek!**

De view hoeft **niet** te veranderen. De naamgeneratie werkt al correct met de bestaande structuur.

## Implementatievolgorde

1. **UI Fase 1** (~2-3 uur): Collapsible gegroepeerde percelenlijst
2. **API Route** (~1 uur): `/api/parcels/reorganize` endpoint
3. **Reorganisatie Dialog** (~2 uur): UI voor het samenvoegen van percelen
4. **Testen** (~1 uur): Verifieer dat alle afhankelijke features nog werken

## Wat NIET verandert

- Database schema (geen migratie nodig)
- `SprayableParcel` type
- `v_sprayable_parcels` view
- CTGB validatie engine
- Slimme Invoer parcel resolver
- Spuitschrift parcel multi-select
- Parcel Groups systeem
- BRP gewashistorie
