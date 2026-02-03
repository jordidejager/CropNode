# CLAUDE.md - Crop Care (Gewasbescherming)

## Doel en Scope

Gewasbeschermingsbeheer met spuitregistraties, productdatabases, en voorraadtracking. Combineert AI-parsing met deterministische CTGB-validatie voor compliance.

**Kernfunctionaliteit:**
- Spuitlogboek (draft → bevestigd)
- CTGB product database (gewasbeschermingsmiddelen)
- Meststoffen database
- Voorraadtracking met transactiehistorie
- 6-staps CTGB validatie engine

---

## Subpagina's

| Route | Doel |
|-------|------|
| `/crop-care/logs` | Spuitregistratie logboek |
| `/crop-care/my-products` | Gebruikers producten (gefilterd op frequentie) |
| `/crop-care/inventory` | Voorraad beheer |
| `/crop-care/db-protection` | CTGB gewasbeschermingsmiddelen database |
| `/crop-care/db-fertilizer` | Meststoffen database |

---

## Componenten en Verantwoordelijkheden

### Logbook Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `LogbookTable` | `/src/components/logbook-table.tsx` | Spray log tabel met inline edit (15.6KB) |
| `RegistrationBottomSheet` | `/src/components/registration-bottom-sheet.tsx` | Mobile input sheet |
| `RegistrationGroupCard` | `/src/components/registration-group-card.tsx` | Grouped registraties (34.5KB) |
| `ConfirmationCard` | `/src/components/confirmation-card.tsx` | Bevestiging UI |

### Product Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `ProductCard` | `/src/components/product-card.tsx` | Generic product kaart |
| `ProductInfoCard` | `/src/components/product-info-card.tsx` | Gedetailleerde product info (18.3KB) |
| `FertilizerCard` | `/src/components/fertilizer-card.tsx` | Meststof display |
| `FertilizerDetailDialog` | `/src/components/fertilizer-detail-dialog.tsx` | Meststof detail modal |
| `CtgbCategoryBadge` | `/src/components/ctgb-category-badge.tsx` | Product categorie badge |

### Inventory Components

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|---------------------|
| `AddStockDialog` | `/src/components/add-stock-dialog.tsx` | Voorraad toevoegen modal |

---

## Supabase Tabellen

### Registratie Flow

| Tabel | Stage | Beschrijving |
|-------|-------|--------------|
| `logbook` | Draft | Conceptregistraties met parsing/validatie |
| `spuitschrift` | Final | Bevestigde, compliance-ready registraties |
| `parcel_history` | Audit | Historische spray data per perceel |

### Product Data

| Tabel | Beschrijving |
|-------|--------------|
| `ctgb_products` | Officiële CTGB database |
| `active_substances` | Werkzame stoffen met limieten |
| `product_aliases` | User aliassen naar officiële namen |
| `product_substances` | Junction: product ↔ substance |

### Voorraad

| Tabel | Beschrijving |
|-------|--------------|
| `inventory_movements` | Voorraad transacties (in/uit) |

---

## Business Rules

### Two-Tier Logging System

**Stage 1: Logbook (Draft)**
```typescript
LogbookEntry {
  id: string
  rawInput: string              // Originele tekst
  date: Date
  parsedData: {
    plots: string[]             // Perceel IDs
    products: [{product, dosage, unit}]
  }
  status: LogStatus
  validationMessage?: string
}
```

**Status Flow:**
```
Nieuw → Analyseren... → Te Controleren/Waarschuwing → Akkoord
                    └→ Fout → (retry)
                    └→ Afgekeurd → (edit required)
```

**Stage 2: Spuitschrift (Final)**
- Bevestigde registraties
- Niet meer editeerbaar
- Compliance audit trail

### CTGB Validatie (6 Prioriteiten)

| Prioriteit | Check | Implementatie |
|------------|-------|---------------|
| 1 | Gewas Autorisatie | Product moet gelicentieerd zijn voor gewas |
| 2 | Dosering Validatie | Dosering binnen toegestane limieten |
| 3 | Toepassingsinterval | Minimum dagen tussen toepassingen |
| 4 | Seizoens Maximum | Max toepassingen per teeltcyclus |
| 5 | Stof Cumulatie | Limiet op toepassingen met zelfde werkzame stof |
| 6 | Veiligheidstermijn (VGT) | Minimum dagen voor oogst |

**Crop Hierarchy System:**
```typescript
// Product geautoriseerd voor "pitvruchten" matcht automatisch "appel"
CROP_HIERARCHY = {
  'appel': ['appel', 'appels', 'pitvruchten', 'pitfruit', 'vruchtbomen'],
  'peer': ['peer', 'peren', 'pitvruchten', 'pitfruit', 'vruchtbomen']
}
```

### Validatie Flags

```typescript
type ValidationFlag = {
  type: 'error' | 'warning' | 'info'
  message: string
  field?: string    // 'plots', 'products', 'dosage', 'date'
  details?: Record<string, unknown>
}

// Result mapping:
errors (❌)   → Status = "Afgekeurd"
warnings (⚠️) → Status = "Waarschuwing"
info (ℹ️)     → Status = "Akkoord"
```

### Product vs Meststof Verschil

| Aspect | Gewasbeschermingsmiddelen | Meststoffen |
|--------|--------------------------|-------------|
| Regulatie | CTGB-gereguleerd | Niet gereguleerd |
| Validatie | 6-staps CTGB checks | Geen validatie |
| Gewas-specifiek | Ja (autorisatie per gewas) | Nee (generieke nutriënten) |
| Dosering limieten | Strikt per gewas | Informatief |
| Voorraad tracking | Ja, bij spray | Geen tracking |
| Logging | Verplicht voor compliance | Optioneel |

### Voorraad Berekening

```
Huidige Voorraad = Som(Leveringen) - Som(Bevestigde Bespuitingen)
```

**Transactie Types:**
- `delivery` - Voorraad toevoeging
- `spray` - Voorraad afname (bij spuitschrift bevestiging)

**Reversals:**
- Bij verwijderen spuitschrift → voorraad terugboeken

---

## State Management

### Data Hooks

```typescript
// Logbook & Spuitschrift
useLogbookEntries() → LogbookEntry[]
useSpuitschriftEntries() → SpuitschriftEntry[]

// Products
useCtgbProducts() → CtgbProduct[]
useFertilizers() → FertilizerProduct[]

// Inventory
useInventoryMovements() → InventoryMovement[]
```

### Debounced Auto-save

```typescript
// In LogbookTable
const debouncedState = useDebounce({ date, parcels, products }, 1500)

useEffect(() => {
  if (debouncedState.hasChanged) {
    updateAndConfirmEntry(updatedEntry)
  }
}, [debouncedState])
```

### Cache Invalidation

```typescript
const { invalidateSpuitschrift, invalidateLogbook, invalidateInventory } = useInvalidateQueries()

// Na delete:
invalidateSpuitschrift()
invalidateLogbook()
// Bij voorraad effect:
invalidateInventory()
```

---

## Data Flow

### Spray Registration Flow

```
Smart Input (Raw Text)
    │
    ├─1→ AI Parsing → parsedData
    │
    ├─2→ CTGB Validation → flags
    │
    └─3→ Create LogbookEntry (draft)
         │
         ├─ User reviews/edits inline
         │
         └─ Confirm
              │
              ├─ Create SpuitschriftEntry
              ├─ Create ParcelHistoryEntries (per perceel)
              └─ Create InventoryMovements (per product)
```

### Product Lookup Flow

```
User: "Captan"
    │
    ├─1→ Resolve Alias (product_aliases)
    │    └─ "captan" → "Captan 80 WDG"
    │
    ├─2→ Fetch CTGB Product (ctgb_products)
    │
    └─3→ Extract Gebruiksvoorschriften
         └─ Filter op gewas matching
```

---

## API Integraties

### /api/ctgb/search

**Endpoint:** `GET /api/ctgb/search?query=<product>`

**Response:**
```typescript
{
  success: boolean
  query: string
  total: number
  results: CtgbProduct[]
  error?: string
}
```

### /api/validate

**Endpoint:** `POST /api/validate`

**Input:**
```typescript
{
  parsedData: {
    plots: string[]
    products: ProductEntry[]
    date: string
  }
  parcelHistory: ParcelHistoryEntry[]
}
```

**Output:**
```typescript
{
  valid: boolean
  flags: ValidationFlag[]
  message: string
}
```

---

## CTGB Product Schema

```typescript
interface CtgbProduct {
  toelatingsnummer: string      // Primary key
  naam: string
  status: string                // 'Valid', 'Invalid'
  vervaldatum: string
  categorie: string             // 'Fungicide', 'Insecticide', etc.
  toelatingshouder: string
  werkzameStoffen: string[]
  samenstelling: object
  gebruiksvoorschriften: [{
    gewas?: string
    doelorganisme?: string
    dosering?: string           // "0.5-1.0 l/ha"
    toepassingsmethode?: string
    maxToepassingen?: number
    maxToepassingenPerTeeltcyclus?: number
    veiligheidstermijn?: string // "14 dagen"
    interval?: string           // "7 dagen"
    opmerkingen?: string
    wCodes?: string[]
  }]
  etikettering: {
    ghsSymbolen?: string[]
    signaalwoord?: string
    hZinnen?: string[]
  }
}
```

---

## Design Decisions

### Deterministische Validatie
Geen AI voor regelvalidatie. Pure TypeScript logica:
- Voorspelbaar gedrag
- Geen hallucinaties
- Auditeerbaar
- Offline capability

### Two-Stage Logging
Draft (logbook) → Final (spuitschrift):
- Gebruiker kan fouten corrigeren voor bevestiging
- Compliance vereist definitieve records
- Audit trail behouden

### Crop Hierarchy Matching
Fuzzy matching voor gewassen:
- CTGB gebruikt inconsistente naamgeving
- "pitvruchten" moet appel EN peer matchen
- Plural/singular variaties

### Target Organism Auto-detect
Als gebruiker geen doelorganisme specificeert:
- Selecteer voorschrift met hoogste dosering
- Markeer als "automatisch bepaald"
- Geeft breedste autorisatie

### Inventory Reversals
Bij verwijderen spuitschrift:
- Automatisch voorraad terugboeken
- Transactie referentie behouden
- Audit trail intact

---

## UI Patterns

### Logbook Table

**Inline Edit Fields:**
- Datum (date picker)
- Percelen (multi-select)
- Producten (list met dosering)

**Status Indicators:**
```
❌ Error (rood)     → Afgekeurd
⚠️ Warning (geel)   → Waarschuwing
ℹ️ Info (blauw)     → Akkoord
⏳ Loading (amber)  → Analyseren...
```

### Product Cards

**My Products View:**
- Gesorteerd op gebruiksfrequentie
- Alleen hard fruit gewassen
- Quick-add naar registratie

**Database View:**
- Volledige CTGB database
- Filter op categorie
- Zoeken op naam/stof

### Inventory View

**Stock Overview:**
- Alle producten met huidige voorraad
- Negatieve voorraad in rood
- Click voor transactiehistorie

**Add Delivery:**
- Product dropdown
- Hoeveelheid input
- Automatische cache invalidatie
